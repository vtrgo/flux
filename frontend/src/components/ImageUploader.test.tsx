import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ImageUploader } from './ImageUploader';

describe('ImageUploader Component', () => {
  it('renders add photo button', () => {
    render(<ImageUploader issueId="123" />);
    expect(screen.getByText('+ ADD PHOTO')).toBeDefined();
  });
});
