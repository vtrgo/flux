"use client";
import { API_BASE } from "../lib/api";

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';

export type SSECallback = (data: any) => void;

type SSEContextType = {
  subscribe: (event: string, callback: SSECallback) => () => void;
  isConnected: boolean;
};

const SSEContext = createContext<SSEContextType | null>(null);

export function SSEProvider({ children }: { children: React.ReactNode }) {
  const [isConnected, setIsConnected] = useState(false);
  const listenersRef = useRef<Map<string, Set<SSECallback>>>(new Map());
  const eventSourceRef = useRef<EventSource | null>(null);
  
  const handleEvent = useRef((e: Event) => {
    const msgEvent = e as MessageEvent;
    try {
      const data = JSON.parse(msgEvent.data);
      listenersRef.current.get(e.type)?.forEach(cb => cb(data));
    } catch (err) {
      listenersRef.current.get(e.type)?.forEach(cb => cb(null));
    }
  });

  useEffect(() => {
    let reconnectTimeout: NodeJS.Timeout;

    const connect = () => {
      const url = `${API_BASE.replace(/\/api$/, '')}/api/sse`;
      const es = new EventSource(url);
      eventSourceRef.current = es;

      es.onopen = () => {
        setIsConnected(true);
      };

      es.onerror = () => {
        setIsConnected(false);
        es.close();
        reconnectTimeout = setTimeout(connect, 3000);
      };
      
      listenersRef.current.forEach((_, eventName) => {
        es.addEventListener(eventName, handleEvent.current);
      });
    };

    connect();

    return () => {
      clearTimeout(reconnectTimeout);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  const subscribe = (event: string, callback: (data: any) => void) => {
    if (!listenersRef.current.has(event)) {
      listenersRef.current.set(event, new Set());
      if (eventSourceRef.current) {
        eventSourceRef.current.addEventListener(event, handleEvent.current);
      }
    }
    
    listenersRef.current.get(event)?.add(callback);

    return () => {
      const set = listenersRef.current.get(event);
      if (set) {
        set.delete(callback);
      }
    };
  };

  return (
    <SSEContext.Provider value={{ subscribe, isConnected }}>
      {children}
    </SSEContext.Provider>
  );
}

export function useSSE(event: string, callback: (data: any) => void) {
  const context = useContext(SSEContext);
  if (!context) {
    throw new Error("useSSE must be used within an SSEProvider");
  }

  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    const unsubscribe = context.subscribe(event, (data: any) => callbackRef.current(data));
    return () => unsubscribe();
  }, [event, context]);
}

export function useSSEConnectionStatus() {
  const context = useContext(SSEContext);
  if (!context) {
    throw new Error("useSSEConnectionStatus must be used within an SSEProvider");
  }
  return context.isConnected;
}
