package logger

import (
	"context"
	"io"
	"log/slog"
	"os"

	"gopkg.in/natefinch/lumberjack.v2"
)

var (
	LogBroadcaster func(data interface{})
	LogFilePath    = "logs/flux.log"
)

const LevelSystem = slog.Level(-8)

// ReplaceAttr ensures custom levels are correctly named in the output
func ReplaceAttr(groups []string, a slog.Attr) slog.Attr {
	if a.Key == slog.LevelKey {
		level := a.Value.Any().(slog.Level)
		if level == LevelSystem {
			a.Value = slog.StringValue("SYSTEM")
		}
	}
	return a
}

// System is a helper function to log at the SYSTEM level
func System(msg string, args ...any) {
	slog.Default().Log(context.Background(), LevelSystem, msg, args...)
}

// InitLogger sets up the dual-handler slog configuration
func InitLogger() {
	// 1. File Handler (JSON, Debug Level)
	fileWriter := &lumberjack.Logger{
		Filename:   LogFilePath,
		MaxSize:    100, // megabytes
		MaxBackups: 30,
		MaxAge:     30, // days
		Compress:   true,
	}

	fileHandler := slog.NewJSONHandler(fileWriter, &slog.HandlerOptions{
		Level:       LevelSystem, // Allow everything from System level and up
		ReplaceAttr: ReplaceAttr,
	})

	// 2. Terminal Handler (Text, Info Level)
	termHandler := slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
		Level:       slog.LevelInfo,
		ReplaceAttr: ReplaceAttr,
	})

	// 3. Multi-Handler
	multiHandler := &MultiHandler{
		handlers: []slog.Handler{termHandler, fileHandler},
	}

	// Set as global logger
	logger := slog.New(multiHandler)
	slog.SetDefault(logger)
}

// MultiHandler multiplexes log records to multiple handlers
type MultiHandler struct {
	handlers []slog.Handler
}

func (m *MultiHandler) Enabled(ctx context.Context, level slog.Level) bool {
	for _, h := range m.handlers {
		if h.Enabled(ctx, level) {
			return true
		}
	}
	return false
}

func (m *MultiHandler) Handle(ctx context.Context, record slog.Record) error {
	// Broadcast the log entry if a broadcaster is registered
	if LogBroadcaster != nil {
		attrs := make(map[string]interface{})
		record.Attrs(func(a slog.Attr) bool {
			attrs[a.Key] = a.Value.Any()
			return true
		})
		
		levelStr := record.Level.String()
		if record.Level == LevelSystem {
			levelStr = "SYSTEM"
		}

		entry := map[string]interface{}{
			"time":    record.Time,
			"level":   levelStr,
			"message": record.Message,
			"attrs":   attrs,
		}
		
		// Run broadcast async to avoid blocking the logger
		go LogBroadcaster(entry)
	}

	for _, h := range m.handlers {
		if h.Enabled(ctx, record.Level) {
			_ = h.Handle(ctx, record)
		}
	}
	return nil
}

func (m *MultiHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	var newHandlers []slog.Handler
	for _, h := range m.handlers {
		newHandlers = append(newHandlers, h.WithAttrs(attrs))
	}
	return &MultiHandler{handlers: newHandlers}
}

func (m *MultiHandler) WithGroup(name string) slog.Handler {
	var newHandlers []slog.Handler
	for _, h := range m.handlers {
		newHandlers = append(newHandlers, h.WithGroup(name))
	}
	return &MultiHandler{handlers: newHandlers}
}

// ReadLastLogLines reads the last N bytes of the log file for initial load
func ReadLastLogLines(bytes int64) (string, error) {
	file, err := os.Open(LogFilePath)
	if err != nil {
		if os.IsNotExist(err) {
			return "", nil
		}
		return "", err
	}
	defer file.Close()

	stat, err := file.Stat()
	if err != nil {
		return "", err
	}

	size := stat.Size()
	start := size - bytes
	if start < 0 {
		start = 0
	}

	_, err = file.Seek(start, 0)
	if err != nil {
		return "", err
	}

	data, err := io.ReadAll(file)
	if err != nil {
		return "", err
	}

	return string(data), nil
}
