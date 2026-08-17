"use client";

import React, { useEffect, useState, useRef, useMemo } from 'react';
import { fetchApi } from '../../../lib/api';
import { useSSE } from '../../../components/SSEProvider';
import { Virtuoso } from 'react-virtuoso';

type LogEntry = {
  time: string;
  level: string;
  message: string;
  attrs: Record<string, any>;
};

export default function LogsViewerPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeLevels, setActiveLevels] = useState<Record<string, boolean>>({
    DEBUG: true,
    INFO: true,
    WARN: true,
    ERROR: true,
    SYSTEM: false
  });
  
  // Load initial logs
  useEffect(() => {
    fetchApi<{ logs: string }>('/logs')
      .then(res => {
        if (res.logs) {
          const lines = res.logs.split('\n').filter(Boolean);
          const parsedLogs: LogEntry[] = [];
          
          for (let i = 0; i < lines.length; i++) {
            try {
              const parsed = JSON.parse(lines[i]);
              const msg = parsed.message || parsed.msg;
              if (parsed && parsed.level && msg) {
                const attrs = parsed.attrs || {};
                if (!parsed.attrs) {
                  for (const key in parsed) {
                    if (key !== 'time' && key !== 'level' && key !== 'msg' && key !== 'message') {
                      attrs[key] = parsed[key];
                    }
                  }
                }
                parsedLogs.push({
                  time: parsed.time,
                  level: parsed.level,
                  message: msg,
                  attrs
                });
              }
            } catch (e) {
              // Ignore incomplete lines
            }
          }
          
          // Reverse to put newest at the top
          parsedLogs.reverse();
          setLogs(prev => {
            const seen = new Set(prev.map(l => l.time + l.message));
            const uniqueParsed = parsedLogs.filter(l => !seen.has(l.time + l.message));
            return [...prev, ...uniqueParsed];
          });
        }
      })
      .catch(err => console.error("Failed to fetch initial logs", err));
  }, []);

  // Listen for live SSE logs
  useSSE('server_log_entry', (data: LogEntry) => {
    setLogs(prev => {
      // Prepend newest at the top
      const newLogs = [data, ...prev];
      if (newLogs.length > 10000) {
        return newLogs.slice(0, 10000);
      }
      return newLogs;
    });
  });

  const handleClear = () => {
    setLogs([]);
  };

  const handleExport = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(logs, null, 2));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href", dataStr);
    dlAnchorElem.setAttribute("download", `flux-logs-${new Date().toISOString()}.json`);
    dlAnchorElem.click();
  };

  const toggleLevel = (level: string) => {
    setActiveLevels(prev => ({ ...prev, [level]: !prev[level] }));
  };

  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      if (!activeLevels[log.level]) return false;
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return log.message.toLowerCase().includes(query) || 
               JSON.stringify(log.attrs).toLowerCase().includes(query);
      }
      return true;
    });
  }, [logs, activeLevels, searchQuery]);

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'ERROR': return '#ff4444';
      case 'WARN': return '#ffbb33';
      case 'INFO': return '#33b5e5';
      case 'SYSTEM': return '#9b59b6'; // Purple for system routing
      case 'DEBUG': return '#00C851'; // Green for successful user actions
      default: return '#ffffff';
    }
  };

  const availableLevels = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'SYSTEM'];

  return (
    <main style={{ padding: '2rem', height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#1e1e1e' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <h1 style={{ fontFamily: 'monospace', color: '#fff', margin: 0, fontSize: '1.5rem' }}>
            &gt; SERVER LOGS
          </h1>
          <span style={{ 
            padding: '4px 8px', 
            borderRadius: '4px', 
            fontSize: '12px', 
            fontWeight: 'bold', 
            backgroundColor: '#28a745',
            color: '#fff',
            fontFamily: 'monospace'
          }}>
            LIVE VIEW
          </span>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <button onClick={handleClear} className="vtr-btn" style={{ padding: '4px 12px', fontSize: '0.9rem', backgroundColor: '#333', color: '#fff', border: '1px solid #555', borderRadius: '4px', cursor: 'pointer' }}>Clear</button>
          <button onClick={handleExport} className="vtr-btn" style={{ padding: '4px 12px', fontSize: '0.9rem', backgroundColor: '#333', color: '#fff', border: '1px solid #555', borderRadius: '4px', cursor: 'pointer' }}>Export</button>
        </div>
      </header>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', alignItems: 'center', backgroundColor: '#2a2a2a', padding: '1rem', borderRadius: '8px' }}>
        <input 
          type="text" 
          placeholder="Filter logs by keyword..." 
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          style={{ flex: 1, padding: '8px', borderRadius: '4px', border: '1px solid #444', backgroundColor: '#111', color: '#fff', fontFamily: 'monospace' }}
        />
        <div style={{ display: 'flex', gap: '1rem' }}>
          {availableLevels.map(level => (
            <label key={level} style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#ccc', fontFamily: 'monospace', cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={activeLevels[level] || false} 
                onChange={() => toggleLevel(level)} 
              />
              <span style={{ color: getLevelColor(level) }}>{level}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Virtualized Log Container */}
      <div style={{ flex: 1, backgroundColor: '#0a0a0a', border: '1px solid #333', borderRadius: '8px', overflow: 'hidden' }}>
        <Virtuoso
          style={{ height: '100%' }}
          data={filteredLogs}
          itemContent={(index, log) => (
            <div style={{ 
              padding: '4px 8px', 
              fontFamily: 'monospace', 
              fontSize: '13px',
              borderBottom: '1px solid #1a1a1a',
              display: 'flex',
              gap: '12px',
              color: '#d4d4d4'
            }}>
              <span style={{ color: '#888', minWidth: '160px' }}>
                {new Date(log.time).toISOString().replace('T', ' ').substring(0, 19)}
              </span>
              <span style={{ 
                color: getLevelColor(log.level), 
                fontWeight: 'bold', 
                minWidth: '50px' 
              }}>
                {log.level}
              </span>
              <span style={{ flex: 1 }}>
                <span style={{ color: '#fff' }}>{log.message}</span>
                {log.attrs && Object.keys(log.attrs).length > 0 && (
                  <span style={{ marginLeft: '12px', color: '#a6e22e' }}>
                    {Object.entries(log.attrs).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(' ')}
                  </span>
                )}
              </span>
            </div>
          )}
        />
      </div>
    </main>
  );
}
