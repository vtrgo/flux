import { describe, it, expect, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import { AttachmentViewer } from './AttachmentViewer';

vi.mock('../lib/api', () => ({
  fetchApi: vi.fn().mockResolvedValue([])
}));

vi.mock('./SSEProvider', () => ({
  useSSE: vi.fn(),
  useSSEConnectionStatus: vi.fn().mockReturnValue(true)
}));

describe('AttachmentViewer Component', () => {
  it('renders nothing when no attachments', async () => {
    let container: any;
    await act(async () => {
      const result = render(<AttachmentViewer issueId="123" />);
      container = result.container;
    });
    expect(container.firstChild).toBeNull();
  });
});
