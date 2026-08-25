package main

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"
)

// ProxyConfig encapsulates proxy configuration parsed from environment variables.
type ProxyConfig struct {
	ListenAddr string
	TargetURL  *url.URL
}

// GetConfig reads PROXY_PORT and TARGET_BACKEND from the environment with defaults.
func GetConfig() (*ProxyConfig, error) {
	port := os.Getenv("PROXY_PORT")
	if port == "" {
		port = ":80"
	} else if !strings.Contains(port, ":") {
		port = ":" + port
	}

	target := os.Getenv("TARGET_BACKEND")
	if target == "" {
		target = "http://127.0.0.1:8080"
	}

	// Auto-prepend http:// scheme if omitted (e.g. TARGET_BACKEND=127.0.0.1:8080 or localhost:8080)
	if !strings.Contains(target, "://") {
		target = "http://" + target
	}

	targetURL, err := url.Parse(target)
	if err != nil {
		return nil, fmt.Errorf("invalid TARGET_BACKEND URL %q: %w", target, err)
	}

	if targetURL.Host == "" {
		return nil, fmt.Errorf("invalid TARGET_BACKEND URL %q: missing host", target)
	}

	return &ProxyConfig{
		ListenAddr: port,
		TargetURL:  targetURL,
	}, nil
}

// responseLogger wraps http.ResponseWriter to capture status code while supporting http.Flusher and http.Hijacker.
type responseLogger struct {
	http.ResponseWriter
	statusCode  int
	wroteHeader bool
}

func (rw *responseLogger) WriteHeader(code int) {
	if !rw.wroteHeader {
		rw.statusCode = code
		rw.wroteHeader = true
		rw.ResponseWriter.WriteHeader(code)
	}
}

func (rw *responseLogger) Write(b []byte) (int, error) {
	if !rw.wroteHeader {
		rw.WriteHeader(http.StatusOK)
	}
	return rw.ResponseWriter.Write(b)
}

// Flush implements http.Flusher to ensure streaming/SSE responses are flushed immediately.
func (rw *responseLogger) Flush() {
	if flusher, ok := rw.ResponseWriter.(http.Flusher); ok {
		flusher.Flush()
	}
}

// Hijack implements http.Hijacker to support connection hijacking (e.g., WebSockets).
func (rw *responseLogger) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	if hijacker, ok := rw.ResponseWriter.(http.Hijacker); ok {
		return hijacker.Hijack()
	}
	return nil, nil, fmt.Errorf("underlying ResponseWriter does not implement http.Hijacker")
}

// Unwrap returns the underlying ResponseWriter for Go 1.20+ http.ResponseController support.
func (rw *responseLogger) Unwrap() http.ResponseWriter {
	return rw.ResponseWriter
}

// loggingMiddleware logs incoming HTTP requests using slog.
func loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rw := &responseLogger{ResponseWriter: w, statusCode: http.StatusOK}
		next.ServeHTTP(rw, r)
		slog.Info("Proxy request",
			"method", r.Method,
			"path", r.URL.Path,
			"remote_addr", r.RemoteAddr,
			"status", rw.statusCode,
			"duration_ms", time.Since(start).Milliseconds(),
		)
	})
}

// NewReverseProxy creates and configures a reverse proxy with zero SSE buffering and header preservation.
func NewReverseProxy(targetURL *url.URL) *httputil.ReverseProxy {
	proxy := httputil.NewSingleHostReverseProxy(targetURL)

	// FlushInterval = -1 flushes to client immediately after each write (essential for SSE)
	proxy.FlushInterval = -1

	originalDirector := proxy.Director
	proxy.Director = func(req *http.Request) {
		origHost := req.Host
		if origHost == "" && req.URL != nil {
			origHost = req.URL.Host
		}

		originalDirector(req)

		// Preserve or set X-Forwarded-Host
		if req.Header.Get("X-Forwarded-Host") == "" && origHost != "" {
			req.Header.Set("X-Forwarded-Host", origHost)
		}

		// Preserve or set X-Forwarded-Proto
		if req.Header.Get("X-Forwarded-Proto") == "" {
			if req.TLS != nil {
				req.Header.Set("X-Forwarded-Proto", "https")
			} else {
				req.Header.Set("X-Forwarded-Proto", "http")
			}
		}
	}

	// Custom ErrorHandler returns a clean JSON 502 Bad Gateway response when backend is unreachable
	proxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		// Ignore client cancellations (e.g. browser navigation/closing tab) without error log spam
		if errors.Is(err, context.Canceled) || (r.Context() != nil && errors.Is(r.Context().Err(), context.Canceled)) {
			slog.Debug("Client disconnected before backend response",
				"url", r.URL.String(),
				"method", r.Method,
			)
			return
		}

		slog.Error("Reverse proxy backend error",
			"url", r.URL.String(),
			"method", r.Method,
			"error", err,
		)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadGateway)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"error": "Bad Gateway: unable to connect to upstream backend",
		})
	}

	return proxy
}

// NewServer creates the configured http.Server with timeouts disabled for SSE.
func NewServer(listenAddr string, targetURL *url.URL) *http.Server {
	proxy := NewReverseProxy(targetURL)
	handler := loggingMiddleware(proxy)

	return &http.Server{
		Addr:         listenAddr,
		Handler:      handler,
		ReadTimeout:  0, // Disable ReadTimeout to prevent dropping persistent connections
		WriteTimeout: 0, // Disable WriteTimeout to support long-lived SSE streams
		IdleTimeout:  120 * time.Second,
	}
}

func main() {
	// Initialize structured logger writing to stdout
	textHandler := slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	})
	slog.SetDefault(slog.New(textHandler))

	config, err := GetConfig()
	if err != nil {
		slog.Error("Failed to load proxy configuration", "error", err)
		os.Exit(1)
	}

	slog.Info("Starting vtrFlux Reverse Proxy...",
		"listen_addr", config.ListenAddr,
		"target_backend", config.TargetURL.String(),
	)

	server := NewServer(config.ListenAddr, config.TargetURL)

	go func() {
		slog.Info("Reverse proxy listening", "addr", config.ListenAddr)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("Reverse proxy server failed", "error", err)
			os.Exit(1)
		}
	}()

	// Graceful shutdown on SIGINT or SIGTERM
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, os.Interrupt, syscall.SIGTERM)
	<-quit
	slog.Info("Shutting down reverse proxy server...")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		slog.Error("Reverse proxy forced to shutdown", "error", err)
		os.Exit(1)
	}

	slog.Info("Reverse proxy stopped cleanly")
}
