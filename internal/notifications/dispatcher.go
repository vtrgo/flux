package notifications

import (
	"context"
	"log/slog"
	"sync"
	"sync/atomic"
	"time"
)

// Dispatcher coordinates fan-out of issue notifications across active channels.
type Dispatcher struct {
	mu        sync.RWMutex
	channels  []Channel
	queue     chan IssueNotification
	wg        sync.WaitGroup
	ctx       context.Context
	cancel    context.CancelFunc
	isStopped atomic.Bool
}

var (
	defaultDispatcher     *Dispatcher
	defaultDispatcherOnce sync.Once
)

// NewDispatcher initializes a notification dispatcher with a buffered worker pool.
func NewDispatcher(bufferSize int, workers int) *Dispatcher {
	ctx, cancel := context.WithCancel(context.Background())
	d := &Dispatcher{
		channels: make([]Channel, 0),
		queue:    make(chan IssueNotification, bufferSize),
		ctx:      ctx,
		cancel:   cancel,
	}

	for i := 0; i < workers; i++ {
		d.wg.Add(1)
		go d.worker(i)
	}

	return d
}

// RegisterChannel registers a new notification transport.
func (d *Dispatcher) RegisterChannel(ch Channel) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.channels = append(d.channels, ch)
	slog.Info("Registered notification channel", "channel", ch.Name(), "enabled", ch.IsEnabled())
}

// Dispatch enqueues an issue notification for asynchronous delivery.
// If the buffer is full, it initiates a tracked fallback goroutine so the API response is never delayed.
func (d *Dispatcher) Dispatch(notif IssueNotification) {
	if d.isStopped.Load() {
		slog.Warn("Dispatcher is stopped; dropping notification", "defect_id", notif.DefectID)
		return
	}

	select {
	case d.queue <- notif:
		// Successfully queued
	default:
		slog.Warn("Notification queue is full; processing in transient goroutine", "defect_id", notif.DefectID)
		d.wg.Add(1)
		go func() {
			defer d.wg.Done()
			d.processNotification(notif)
		}()
	}
}

func (d *Dispatcher) worker(id int) {
	defer d.wg.Done()
	slog.Debug("Notification worker started", "worker_id", id)

	for {
		select {
		case <-d.ctx.Done():
			// Drain remaining queued items before terminating
			for {
				select {
				case notif := <-d.queue:
					d.processNotification(notif)
				default:
					return
				}
			}
		case notif, ok := <-d.queue:
			if !ok {
				return
			}
			d.processNotification(notif)
		}
	}
}

// processNotification fans out the notification to all active channels concurrently.
func (d *Dispatcher) processNotification(notif IssueNotification) {
	d.mu.RLock()
	channels := make([]Channel, len(d.channels))
	copy(channels, d.channels)
	d.mu.RUnlock()

	var channelWg sync.WaitGroup
	for _, ch := range channels {
		if !ch.IsEnabled() {
			continue
		}

		channelWg.Add(1)
		go func(channel Channel) {
			defer channelWg.Done()
			ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
			defer cancel()

			if err := channel.SendIssueNotification(ctx, notif); err != nil {
				slog.Error("Failed to deliver notification via channel",
					"channel", channel.Name(),
					"defect_id", notif.DefectID,
					"error", err,
				)
			}
		}(ch)
	}

	channelWg.Wait()
}

// Stop gracefully shuts down workers and waits for in-flight tasks to complete.
func (d *Dispatcher) Stop() {
	if d.isStopped.Swap(true) {
		return // Already stopped
	}
	d.cancel()
	d.wg.Wait()
	slog.Info("Notification dispatcher stopped successfully")
}

// GetDispatcher returns the site-wide default dispatcher singleton.
func GetDispatcher() *Dispatcher {
	defaultDispatcherOnce.Do(func() {
		cfg := LoadConfigFromEnv()
		defaultDispatcher = NewDispatcher(100, 2)

		// Register default Power Automate channel
		paChannel := NewPowerAutomateChannel(cfg, nil)
		defaultDispatcher.RegisterChannel(paChannel)
	})
	return defaultDispatcher
}

// Dispatch routes an issue notification using the global default dispatcher.
func Dispatch(notif IssueNotification) {
	GetDispatcher().Dispatch(notif)
}
