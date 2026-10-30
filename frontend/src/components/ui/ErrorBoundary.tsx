'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  componentName?: string;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(
      `[ErrorBoundary caught in ${this.props.componentName || 'Component'}]:`,
      error,
      errorInfo
    );
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          role="alert"
          data-testid="error-boundary-fallback"
          style={{
            padding: '2rem',
            margin: '1rem',
            borderRadius: 'var(--radius-md, 8px)',
            background: 'var(--surface-base, #1a1a1a)',
            border: '1px solid var(--color-danger, #ff5252)',
            color: 'var(--text-primary, #ffffff)',
            fontFamily: 'var(--font-sans, sans-serif)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
            <span style={{ fontSize: '1.5rem' }}>⚠️</span>
            <h2 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--color-danger, #ff5252)' }}>
              Something went wrong in {this.props.componentName || 'this component'}
            </h2>
          </div>
          <p style={{ margin: '0 0 1rem 0', color: 'var(--text-secondary, #cccccc)', fontSize: '0.9rem' }}>
            An unexpected error occurred while rendering this section. You can try refreshing this component or reload the page.
          </p>
          {this.state.error && (
            <pre
              style={{
                padding: '0.75rem',
                borderRadius: 'var(--radius-sm, 4px)',
                background: '#121212',
                color: '#ff8a80',
                fontSize: '0.8rem',
                overflowX: 'auto',
                marginBottom: '1rem',
                fontFamily: 'var(--font-mono, monospace)',
              }}
            >
              {this.state.error.message}
            </pre>
          )}
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              type="button"
              className="vtr-btn"
              onClick={this.handleReset}
              data-testid="error-boundary-retry-btn"
            >
              Try Again
            </button>
            <button
              type="button"
              className="vtr-btn vtr-btn-secondary"
              onClick={() => window.location.reload()}
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
