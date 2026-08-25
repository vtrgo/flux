package main

import (
	"bufio"
	"bytes"
	"context"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestHeaderForwarding(t *testing.T) {
	var receivedHost string
	var receivedXFHost string
	var receivedXFProto string
	var receivedXFFor string
	var receivedCustomHeader string
	var receivedCookie string
	var receivedBody string

	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedHost = r.Host
		receivedXFHost = r.Header.Get("X-Forwarded-Host")
		receivedXFProto = r.Header.Get("X-Forwarded-Proto")
		receivedXFFor = r.Header.Get("X-Forwarded-For")
		receivedCustomHeader = r.Header.Get("X-Custom-Header")
		receivedCookie = r.Header.Get("Cookie")

		bodyBytes, _ := io.ReadAll(r.Body)
		receivedBody = string(bodyBytes)

		w.Header().Set("X-Backend-Response", "flux-backend")
		w.Header().Set("Set-Cookie", "session_id=flux_xyz123; Path=/; HttpOnly")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("backend response ok"))
	}))
	defer backend.Close()

	backendURL, err := url.Parse(backend.URL)
	if err != nil {
		t.Fatalf("Failed to parse backend URL: %v", err)
	}

	proxyServer := httptest.NewServer(loggingMiddleware(NewReverseProxy(backendURL)))
	defer proxyServer.Close()

	t.Run("Standard Request - Auto Populates X-Forwarded Headers", func(t *testing.T) {
		req, err := http.NewRequest("POST", proxyServer.URL+"/api/test?query=param", strings.NewReader(`{"key":"value"}`))
		if err != nil {
			t.Fatalf("Failed to create request: %v", err)
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Custom-Header", "test-header-val")
		req.Header.Set("Cookie", "user_auth=token123")

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatalf("Proxy request failed: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			t.Errorf("Expected status 200, got %d", resp.StatusCode)
		}
		if resp.Header.Get("X-Backend-Response") != "flux-backend" {
			t.Errorf("Expected X-Backend-Response header to be preserved, got %q", resp.Header.Get("X-Backend-Response"))
		}
		if !strings.Contains(resp.Header.Get("Set-Cookie"), "session_id=flux_xyz123") {
			t.Errorf("Expected Set-Cookie header to be preserved, got %q", resp.Header.Get("Set-Cookie"))
		}

		respBody, _ := io.ReadAll(resp.Body)
		if string(respBody) != "backend response ok" {
			t.Errorf("Expected body 'backend response ok', got %q", string(respBody))
		}

		if receivedXFHost == "" {
			t.Errorf("Expected X-Forwarded-Host to be populated, got empty")
		}
		if receivedXFProto != "http" {
			t.Errorf("Expected X-Forwarded-Proto to be 'http', got %q", receivedXFProto)
		}
		if receivedXFFor == "" {
			t.Errorf("Expected X-Forwarded-For to be populated, got empty")
		}
		if receivedCustomHeader != "test-header-val" {
			t.Errorf("Expected X-Custom-Header 'test-header-val', got %q", receivedCustomHeader)
		}
		if receivedCookie != "user_auth=token123" {
			t.Errorf("Expected Cookie 'user_auth=token123', got %q", receivedCookie)
		}
		if receivedBody != `{"key":"value"}` {
			t.Errorf("Expected body '{\"key\":\"value\"}', got %q", receivedBody)
		}
	})

	t.Run("Existing X-Forwarded Headers - Preserved", func(t *testing.T) {
		req, err := http.NewRequest("GET", proxyServer.URL+"/preserve", nil)
		if err != nil {
			t.Fatalf("Failed to create request: %v", err)
		}
		req.Header.Set("X-Forwarded-Host", "custom-original-host.com")
		req.Header.Set("X-Forwarded-Proto", "https")

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatalf("Proxy request failed: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			t.Errorf("Expected status 200, got %d", resp.StatusCode)
		}
		if receivedXFHost != "custom-original-host.com" {
			t.Errorf("Expected preserved X-Forwarded-Host 'custom-original-host.com', got %q", receivedXFHost)
		}
		if receivedXFProto != "https" {
			t.Errorf("Expected preserved X-Forwarded-Proto 'https', got %q", receivedXFProto)
		}
	})

	_ = receivedHost
}

func TestHTTPVerbsAndStatusPassthrough(t *testing.T) {
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case "GET":
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte("GET OK"))
		case "POST":
			w.WriteHeader(http.StatusCreated)
			_, _ = w.Write([]byte("POST CREATED"))
		case "PUT":
			w.WriteHeader(http.StatusAccepted)
			_, _ = w.Write([]byte("PUT ACCEPTED"))
		case "PATCH":
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte("PATCH OK"))
		case "DELETE":
			w.WriteHeader(http.StatusNoContent)
		case "HEAD":
			w.Header().Set("X-Custom-Head", "head-response")
			w.WriteHeader(http.StatusOK)
		case "OPTIONS":
			w.Header().Set("Allow", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			w.WriteHeader(http.StatusNoContent)
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
	}))
	defer backend.Close()

	backendURL, err := url.Parse(backend.URL)
	if err != nil {
		t.Fatalf("Failed to parse backend URL: %v", err)
	}

	proxyServer := httptest.NewServer(loggingMiddleware(NewReverseProxy(backendURL)))
	defer proxyServer.Close()

	tests := []struct {
		method         string
		expectedStatus int
		expectedBody   string
	}{
		{"GET", http.StatusOK, "GET OK"},
		{"POST", http.StatusCreated, "POST CREATED"},
		{"PUT", http.StatusAccepted, "PUT ACCEPTED"},
		{"PATCH", http.StatusOK, "PATCH OK"},
		{"DELETE", http.StatusNoContent, ""},
		{"HEAD", http.StatusOK, ""},
		{"OPTIONS", http.StatusNoContent, ""},
	}

	for _, tt := range tests {
		t.Run(tt.method, func(t *testing.T) {
			req, err := http.NewRequest(tt.method, proxyServer.URL+"/action", nil)
			if err != nil {
				t.Fatalf("Failed to create request: %v", err)
			}
			resp, err := http.DefaultClient.Do(req)
			if err != nil {
				t.Fatalf("Request failed: %v", err)
			}
			defer resp.Body.Close()

			if resp.StatusCode != tt.expectedStatus {
				t.Errorf("Expected status %d, got %d", tt.expectedStatus, resp.StatusCode)
			}
			body, _ := io.ReadAll(resp.Body)
			if string(body) != tt.expectedBody {
				t.Errorf("Expected body %q, got %q", tt.expectedBody, string(body))
			}
		})
	}
}

func TestURLPathsAndQueryParams(t *testing.T) {
	var receivedPath string
	var receivedQuery url.Values

	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedPath = r.URL.Path
		receivedQuery = r.URL.Query()
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	}))
	defer backend.Close()

	backendURL, err := url.Parse(backend.URL)
	if err != nil {
		t.Fatalf("Failed to parse backend URL: %v", err)
	}

	proxyServer := httptest.NewServer(loggingMiddleware(NewReverseProxy(backendURL)))
	defer proxyServer.Close()

	t.Run("Trailing slash preservation", func(t *testing.T) {
		resp, err := http.Get(proxyServer.URL + "/assembly/")
		if err != nil {
			t.Fatalf("Request failed: %v", err)
		}
		defer resp.Body.Close()

		if receivedPath != "/assembly/" {
			t.Errorf("Expected path '/assembly/', got %q", receivedPath)
		}
	})

	t.Run("Complex query parameters and deep paths", func(t *testing.T) {
		resp, err := http.Get(proxyServer.URL + "/api/v1/machines/42/defects?filter=active&priority=high&tag=electrical%20issue")
		if err != nil {
			t.Fatalf("Request failed: %v", err)
		}
		defer resp.Body.Close()

		if receivedPath != "/api/v1/machines/42/defects" {
			t.Errorf("Expected path '/api/v1/machines/42/defects', got %q", receivedPath)
		}
		if receivedQuery.Get("filter") != "active" {
			t.Errorf("Expected filter='active', got %q", receivedQuery.Get("filter"))
		}
		if receivedQuery.Get("priority") != "high" {
			t.Errorf("Expected priority='high', got %q", receivedQuery.Get("priority"))
		}
		if receivedQuery.Get("tag") != "electrical issue" {
			t.Errorf("Expected tag='electrical issue', got %q", receivedQuery.Get("tag"))
		}
	})
}

func TestLargePayloadStreaming(t *testing.T) {
	// 512KB random payload to simulate large multipart file uploads
	payloadSize := 512 * 1024
	payload := make([]byte, payloadSize)
	_, err := rand.Read(payload)
	if err != nil {
		t.Fatalf("Failed to generate random payload: %v", err)
	}

	var receivedLength int
	var payloadMatches bool

	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedData, readErr := io.ReadAll(r.Body)
		if readErr != nil {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		receivedLength = len(receivedData)
		payloadMatches = bytes.Equal(receivedData, payload)
		w.WriteHeader(http.StatusOK)
	}))
	defer backend.Close()

	backendURL, err := url.Parse(backend.URL)
	if err != nil {
		t.Fatalf("Failed to parse backend URL: %v", err)
	}

	proxyServer := httptest.NewServer(loggingMiddleware(NewReverseProxy(backendURL)))
	defer proxyServer.Close()

	resp, err := http.Post(proxyServer.URL+"/upload", "application/octet-stream", bytes.NewReader(payload))
	if err != nil {
		t.Fatalf("Large payload upload failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("Expected status 200, got %d", resp.StatusCode)
	}
	if receivedLength != payloadSize {
		t.Errorf("Expected %d bytes, backend received %d bytes", payloadSize, receivedLength)
	}
	if !payloadMatches {
		t.Errorf("Payload content corrupted during proxying")
	}
}

func TestSSEStreamingDeliveryWithoutBuffering(t *testing.T) {
	syncChan := make(chan string)
	doneChan := make(chan struct{})

	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "Flusher not supported", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")
		w.WriteHeader(http.StatusOK)
		flusher.Flush()

		for {
			select {
			case msg := <-syncChan:
				_, err := fmt.Fprintf(w, "data: %s\n\n", msg)
				if err != nil {
					return
				}
				flusher.Flush()
			case <-doneChan:
				return
			case <-r.Context().Done():
				return
			}
		}
	}))
	defer backend.Close()

	backendURL, err := url.Parse(backend.URL)
	if err != nil {
		t.Fatalf("Failed to parse backend URL: %v", err)
	}

	proxyServer := httptest.NewServer(loggingMiddleware(NewReverseProxy(backendURL)))
	defer proxyServer.Close()

	req, err := http.NewRequest("GET", proxyServer.URL+"/api/sse", nil)
	if err != nil {
		t.Fatalf("Failed to create request: %v", err)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("Failed to connect to proxy SSE: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("Expected status 200, got %d", resp.StatusCode)
	}
	if !strings.Contains(resp.Header.Get("Content-Type"), "text/event-stream") {
		t.Fatalf("Expected Content-Type text/event-stream, got %q", resp.Header.Get("Content-Type"))
	}

	reader := bufio.NewReader(resp.Body)

	// Send message 1 and verify it is received immediately before message 2 is sent
	testMessages := []string{"event-first-msg", "event-second-msg", "event-third-msg"}

	for i, expectedMsg := range testMessages {
		var wg sync.WaitGroup
		wg.Add(1)

		var receivedLine string
		var readErr error

		go func() {
			defer wg.Done()
			for {
				line, err := reader.ReadString('\n')
				if err != nil {
					readErr = err
					return
				}
				line = strings.TrimSpace(line)
				if strings.HasPrefix(line, "data: ") {
					receivedLine = strings.TrimPrefix(line, "data: ")
					return
				}
			}
		}()

		// Send event into stream
		syncChan <- expectedMsg

		// Wait for reader to receive event (with timeout)
		c := make(chan struct{})
		go func() {
			wg.Wait()
			close(c)
		}()

		select {
		case <-c:
			if readErr != nil {
				t.Fatalf("Error reading SSE event [%d]: %v", i, readErr)
			}
			if receivedLine != expectedMsg {
				t.Fatalf("Expected SSE message %q, got %q", expectedMsg, receivedLine)
			}
		case <-time.After(2 * time.Second):
			t.Fatalf("Timeout waiting for SSE event [%d] - buffering detected!", i)
		}
	}

	close(doneChan)
}

func TestConcurrentSSEStreams(t *testing.T) {
	numClients := 5
	broadcastCh := make(chan string)
	doneCh := make(chan struct{})

	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "Flusher not supported", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.WriteHeader(http.StatusOK)
		flusher.Flush()

		for {
			select {
			case msg := <-broadcastCh:
				_, err := fmt.Fprintf(w, "data: %s\n\n", msg)
				if err != nil {
					return
				}
				flusher.Flush()
			case <-doneCh:
				return
			case <-r.Context().Done():
				return
			}
		}
	}))
	defer backend.Close()

	backendURL, _ := url.Parse(backend.URL)
	proxyServer := httptest.NewServer(loggingMiddleware(NewReverseProxy(backendURL)))
	defer proxyServer.Close()

	var clientWg sync.WaitGroup
	var clientErrors []error
	var mu sync.Mutex

	expectedEvents := []string{"msg-alpha", "msg-beta", "msg-gamma"}

	for clientID := 0; clientID < numClients; clientID++ {
		clientWg.Add(1)
		go func(id int) {
			defer clientWg.Done()

			resp, err := http.Get(proxyServer.URL + "/sse")
			if err != nil {
				mu.Lock()
				clientErrors = append(clientErrors, fmt.Errorf("client %d connect error: %w", id, err))
				mu.Unlock()
				return
			}
			defer resp.Body.Close()

			reader := bufio.NewReader(resp.Body)
			for _, expectedMsg := range expectedEvents {
				for {
					line, err := reader.ReadString('\n')
					if err != nil {
						mu.Lock()
						clientErrors = append(clientErrors, fmt.Errorf("client %d read error: %w", id, err))
						mu.Unlock()
						return
					}
					line = strings.TrimSpace(line)
					if strings.HasPrefix(line, "data: ") {
						val := strings.TrimPrefix(line, "data: ")
						if val == expectedMsg {
							break
						}
					}
				}
			}
		}(clientID)
	}

	// Wait briefly for clients to establish connection
	time.Sleep(100 * time.Millisecond)

	// Broadcast events
	for _, event := range expectedEvents {
		for i := 0; i < numClients; i++ {
			broadcastCh <- event
		}
		time.Sleep(20 * time.Millisecond)
	}

	close(doneCh)

	waitDone := make(chan struct{})
	go func() {
		clientWg.Wait()
		close(waitDone)
	}()

	select {
	case <-waitDone:
		if len(clientErrors) > 0 {
			t.Fatalf("Concurrent SSE client errors: %v", clientErrors)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("Timeout waiting for concurrent SSE clients to receive all events")
	}
}

func TestBadGatewayOnError(t *testing.T) {
	// Start a backend server and immediately close it to simulate an unreachable backend
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	backendURL, err := url.Parse(backend.URL)
	if err != nil {
		t.Fatalf("Failed to parse backend URL: %v", err)
	}
	backend.Close() // Backend is now unreachable

	proxyServer := httptest.NewServer(loggingMiddleware(NewReverseProxy(backendURL)))
	defer proxyServer.Close()

	resp, err := http.Get(proxyServer.URL + "/unreachable")
	if err != nil {
		t.Fatalf("Failed to send request to proxy: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusBadGateway {
		t.Errorf("Expected status 502 Bad Gateway, got %d", resp.StatusCode)
	}

	contentType := resp.Header.Get("Content-Type")
	if !strings.HasPrefix(contentType, "application/json") {
		t.Errorf("Expected application/json Content-Type, got %q", contentType)
	}

	var jsonBody map[string]string
	if err := json.NewDecoder(resp.Body).Decode(&jsonBody); err != nil {
		t.Fatalf("Failed to decode JSON error response: %v", err)
	}

	if errVal, ok := jsonBody["error"]; !ok || !strings.Contains(errVal, "Bad Gateway") {
		t.Errorf("Expected JSON error containing 'Bad Gateway', got %v", jsonBody)
	}
}

func TestClientCancellationHandling(t *testing.T) {
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(500 * time.Millisecond)
		w.WriteHeader(http.StatusOK)
	}))
	defer backend.Close()

	backendURL, _ := url.Parse(backend.URL)
	proxyServer := httptest.NewServer(loggingMiddleware(NewReverseProxy(backendURL)))
	defer proxyServer.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()

	req, _ := http.NewRequestWithContext(ctx, "GET", proxyServer.URL+"/slow", nil)
	_, _ = http.DefaultClient.Do(req)
	// Request was canceled by client; proxy should handle this cleanly without panicking.
}

func TestGetConfig(t *testing.T) {
	t.Run("Default Configuration", func(t *testing.T) {
		os.Unsetenv("PROXY_PORT")
		os.Unsetenv("TARGET_BACKEND")

		config, err := GetConfig()
		if err != nil {
			t.Fatalf("GetConfig returned unexpected error: %v", err)
		}
		if config.ListenAddr != ":80" {
			t.Errorf("Expected default ListenAddr ':80', got %q", config.ListenAddr)
		}
		if config.TargetURL.String() != "http://127.0.0.1:8080" {
			t.Errorf("Expected default TargetURL 'http://127.0.0.1:8080', got %q", config.TargetURL.String())
		}
	})

	t.Run("Custom Environment Configuration with port without colon", func(t *testing.T) {
		os.Setenv("PROXY_PORT", "9090")
		os.Setenv("TARGET_BACKEND", "http://10.0.0.5:8000")
		defer func() {
			os.Unsetenv("PROXY_PORT")
			os.Unsetenv("TARGET_BACKEND")
		}()

		config, err := GetConfig()
		if err != nil {
			t.Fatalf("GetConfig returned unexpected error: %v", err)
		}
		if config.ListenAddr != ":9090" {
			t.Errorf("Expected ListenAddr ':9090', got %q", config.ListenAddr)
		}
		if config.TargetURL.String() != "http://10.0.0.5:8000" {
			t.Errorf("Expected TargetURL 'http://10.0.0.5:8000', got %q", config.TargetURL.String())
		}
	})

	t.Run("Custom Backend without http:// scheme auto-resolved", func(t *testing.T) {
		os.Setenv("PROXY_PORT", ":80")
		os.Setenv("TARGET_BACKEND", "127.0.0.1:8080")
		defer func() {
			os.Unsetenv("PROXY_PORT")
			os.Unsetenv("TARGET_BACKEND")
		}()

		config, err := GetConfig()
		if err != nil {
			t.Fatalf("GetConfig returned unexpected error: %v", err)
		}
		if config.TargetURL.String() != "http://127.0.0.1:8080" {
			t.Errorf("Expected auto-prefixed TargetURL 'http://127.0.0.1:8080', got %q", config.TargetURL.String())
		}
	})

	t.Run("Custom Host IP with Port", func(t *testing.T) {
		os.Setenv("PROXY_PORT", "0.0.0.0:80")
		os.Setenv("TARGET_BACKEND", "https://flux.internal:8443")
		defer func() {
			os.Unsetenv("PROXY_PORT")
			os.Unsetenv("TARGET_BACKEND")
		}()

		config, err := GetConfig()
		if err != nil {
			t.Fatalf("GetConfig returned unexpected error: %v", err)
		}
		if config.ListenAddr != "0.0.0.0:80" {
			t.Errorf("Expected ListenAddr '0.0.0.0:80', got %q", config.ListenAddr)
		}
		if config.TargetURL.String() != "https://flux.internal:8443" {
			t.Errorf("Expected TargetURL 'https://flux.internal:8443', got %q", config.TargetURL.String())
		}
	})

	t.Run("Invalid Target URL missing host", func(t *testing.T) {
		os.Setenv("TARGET_BACKEND", "http://")
		defer os.Unsetenv("TARGET_BACKEND")

		_, err := GetConfig()
		if err == nil {
			t.Error("Expected error for TARGET_BACKEND with missing host, got nil")
		}
	})
}

func TestNewServerTimeouts(t *testing.T) {
	u, _ := url.Parse("http://127.0.0.1:8080")
	server := NewServer(":80", u)

	if server.ReadTimeout != 0 {
		t.Errorf("Expected ReadTimeout 0, got %v", server.ReadTimeout)
	}
	if server.WriteTimeout != 0 {
		t.Errorf("Expected WriteTimeout 0, got %v", server.WriteTimeout)
	}
	if server.IdleTimeout != 120*time.Second {
		t.Errorf("Expected IdleTimeout 120s, got %v", server.IdleTimeout)
	}
	if server.Addr != ":80" {
		t.Errorf("Expected Addr ':80', got %q", server.Addr)
	}
}

func TestResponseLoggerInterfaces(t *testing.T) {
	rec := httptest.NewRecorder()
	logger := &responseLogger{ResponseWriter: rec, statusCode: http.StatusOK}

	// Test Unwrap
	if unwrapped := logger.Unwrap(); unwrapped != rec {
		t.Errorf("Expected Unwrap() to return underlying recorder, got %v", unwrapped)
	}

	// Test WriteHeader & Write
	logger.WriteHeader(http.StatusCreated)
	if logger.statusCode != http.StatusCreated {
		t.Errorf("Expected statusCode 201, got %d", logger.statusCode)
	}

	_, _ = logger.Write([]byte("test data"))
	logger.Flush()

	if rec.Code != http.StatusCreated {
		t.Errorf("Expected recorder code 201, got %d", rec.Code)
	}
	if rec.Body.String() != "test data" {
		t.Errorf("Expected body 'test data', got %q", rec.Body.String())
	}

	// Test Hijack unsupported on standard recorder
	conn, rw, err := logger.Hijack()
	if err == nil || conn != nil || rw != nil {
		t.Errorf("Expected Hijack to return error on recorder, got conn=%v, rw=%v, err=%v", conn, rw, err)
	}
}

type mockHijackableRecorder struct {
	*httptest.ResponseRecorder
	hijacked bool
}

func (m *mockHijackableRecorder) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	m.hijacked = true
	return nil, nil, nil
}

func TestResponseLoggerHijackSupported(t *testing.T) {
	mock := &mockHijackableRecorder{ResponseRecorder: httptest.NewRecorder()}
	logger := &responseLogger{ResponseWriter: mock, statusCode: http.StatusOK}

	_, _, err := logger.Hijack()
	if err != nil {
		t.Errorf("Expected Hijack() to succeed on mock, got err %v", err)
	}
	if !mock.hijacked {
		t.Errorf("Expected mock.hijacked to be true")
	}
}

func TestGracefulShutdown(t *testing.T) {
	u, _ := url.Parse("http://127.0.0.1:8080")
	server := NewServer("127.0.0.1:0", u)

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("Failed to listen: %v", err)
	}

	go func() {
		_ = server.Serve(listener)
	}()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		t.Fatalf("Shutdown failed: %v", err)
	}
}
