package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
)

type SSEHub struct {
	clients    map[chan []byte]bool
	broadcast  chan []byte
	register   chan chan []byte
	unregister chan chan []byte
	mutex      sync.RWMutex
}

var Hub *SSEHub

func InitHub() {
	Hub = &SSEHub{
		clients:    make(map[chan []byte]bool),
		broadcast:  make(chan []byte),
		register:   make(chan chan []byte),
		unregister: make(chan chan []byte),
	}
	go Hub.run()
}

func (h *SSEHub) run() {
	for {
		select {
		case client := <-h.register:
			h.mutex.Lock()
			h.clients[client] = true
			h.mutex.Unlock()
		case client := <-h.unregister:
			h.mutex.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client)
			}
			h.mutex.Unlock()
		case message := <-h.broadcast:
			h.mutex.RLock()
			for client := range h.clients {
				select {
				case client <- message:
				default:
					close(client)
					delete(h.clients, client)
				}
			}
			h.mutex.RUnlock()
		}
	}
}

func BroadcastEvent(eventType string, data interface{}) {
	if Hub == nil { return }
	payload, err := json.Marshal(data)
	if err != nil {
		fmt.Printf("Error marshalling SSE event data: %v\n", err)
		return
	}
	message := []byte(fmt.Sprintf("event: %s\ndata: %s\n\n", eventType, payload))
	Hub.broadcast <- message
}

func SSEHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	clientChan := make(chan []byte, 10)
	Hub.register <- clientChan
	notify := r.Context().Done()
	w.Write([]byte("event: connected\ndata: {\"status\": \"ok\"}\n\n"))
	w.(http.Flusher).Flush()

	for {
		select {
		case <-notify:
			Hub.unregister <- clientChan
			return
		case msg := <-clientChan:
			w.Write(msg)
			w.(http.Flusher).Flush()
		}
	}
}
