import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
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
    const { container } = render(<AttachmentViewer issueId="123" />);
    expect(container.firstChild).toBeNull();
  });
});
