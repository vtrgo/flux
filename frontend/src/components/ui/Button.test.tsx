import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { Button } from './Button';

describe('Button Primitive Component', () => {
  it('renders button with children and primary variant by default', () => {
    render(<Button>Submit Issue</Button>);
    const btn = screen.getByRole('button', { name: 'Submit Issue' });
    expect(btn).toBeInTheDocument();
  });

  it('triggers onClick handler when clicked', () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click Me</Button>);
    fireEvent.click(screen.getByRole('button', { name: 'Click Me' }));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('renders loading spinner and disables button when isLoading is true', () => {
    const handleClick = vi.fn();
    render(<Button isLoading onClick={handleClick}>Saving...</Button>);
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('Loading...')).toBeInTheDocument();
    fireEvent.click(btn);
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('supports variants like danger and sizes like lg', () => {
    render(<Button variant="danger" size="lg">Delete</Button>);
    const btn = screen.getByRole('button', { name: 'Delete' });
    expect(btn).toBeInTheDocument();
  });
});
