import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { ErrorBoundary } from './ErrorBoundary';

function BuggyComponent({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('Crashing test component error');
  }
  return <div data-testid="buggy-normal">Healthy Component Content</div>;
}

describe('ErrorBoundary Component', () => {
  let consoleErrorSpy: any;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('renders children when no error occurs', () => {
    render(
      <ErrorBoundary componentName="TestView">
        <BuggyComponent shouldThrow={false} />
      </ErrorBoundary>
    );

    expect(screen.getByTestId('buggy-normal')).toBeInTheDocument();
    expect(screen.queryByTestId('error-boundary-fallback')).toBeNull();
  });

  it('catches render error and displays the fallback UI with retry button', () => {
    render(
      <ErrorBoundary componentName="Assembly Tree">
        <BuggyComponent shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByTestId('error-boundary-fallback')).toBeInTheDocument();
    expect(screen.getByText(/Something went wrong in Assembly Tree/i)).toBeInTheDocument();
    expect(screen.getByText(/Crashing test component error/i)).toBeInTheDocument();
    expect(screen.getByTestId('error-boundary-retry-btn')).toBeInTheDocument();
  });

  it('renders custom fallback if provided', () => {
    render(
      <ErrorBoundary
        componentName="CustomView"
        fallback={<div data-testid="custom-fallback">Custom Error Message</div>}
      >
        <BuggyComponent shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByTestId('custom-fallback')).toBeInTheDocument();
    expect(screen.queryByTestId('error-boundary-fallback')).toBeNull();
  });

  it('invokes onReset callback when Try Again is clicked', () => {
    const handleReset = vi.fn();
    render(
      <ErrorBoundary componentName="ResetView" onReset={handleReset}>
        <BuggyComponent shouldThrow={true} />
      </ErrorBoundary>
    );

    fireEvent.click(screen.getByTestId('error-boundary-retry-btn'));
    expect(handleReset).toHaveBeenCalledTimes(1);
  });
});
