import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { IssueModal } from './IssueModal';
import { useUsers } from '../hooks/useUsers';
import { fetchApi } from '../lib/api';

vi.mock('../hooks/useUsers');
vi.mock('../lib/api');
vi.mock('./ImageUploader', () => ({
  ImageUploader: () => <div data-testid="image-uploader" />
}));
vi.mock('./AttachmentViewer', () => ({
  AttachmentViewer: () => <div data-testid="attachment-viewer" />
}));

describe('IssueModal Assignee Department Filtering', () => {
  const mockUsers = [
    { id: 'u1', username: 'alice_asm', first_name: 'Alice', last_name: 'Smith', department: 'assembly', email: 'alice@vtrfeedersolutions.com' },
    { id: 'u2', username: 'bob_asm', first_name: 'Bob', last_name: 'Jones', department: 'assembly' },
    { id: 'u3', username: 'charlie_ctrl', first_name: 'Charlie', last_name: 'Brown', department: 'electrical_controls' },
    { id: 'u4', username: 'diana_des', first_name: 'Diana', last_name: 'Prince', department: 'design' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    (useUsers as any).mockReturnValue({ users: mockUsers, loading: false });
    (fetchApi as any).mockResolvedValue([
      { id: 'mach-1', order_number: 'ORD-100', model_type: 'ModelA' }
    ]);
  });

  it('disables assignee selection and shows prompt when no routing department is selected', async () => {
    await act(async () => {
      render(
        <IssueModal
          isOpen={true}
          onClose={() => {}}
          editingDefect={null}
          defaultAssignedDept="quality"
        />
      );
    });

    const assigneeSelect = screen.getByLabelText(/ASSIGNEE/i) as HTMLSelectElement;
    expect(assigneeSelect.disabled).toBe(true);
    expect(screen.getByText(/Select routing department first/i)).toBeDefined();
  });

  it('filters assignees strictly to members of the selected routing department', async () => {
    await act(async () => {
      render(
        <IssueModal
          isOpen={true}
          onClose={() => {}}
          editingDefect={null}
          defaultAssignedDept="assembly"
        />
      );
    });

    const routingSelect = screen.getByLabelText(/ASSIGNED \/ ROUTING/i) as HTMLSelectElement;
    
    // Select 'assembly'
    await act(async () => {
      fireEvent.change(routingSelect, { target: { value: 'assembly' } });
    });

    expect(screen.getByText('Alice Smith')).toBeDefined();
    expect(screen.getByText('Bob Jones')).toBeDefined();
    expect(screen.queryByText('Charlie Brown')).toBeNull();
    expect(screen.queryByText('Diana Prince')).toBeNull();

    // Switch routing to 'electrical_controls'
    await act(async () => {
      fireEvent.change(routingSelect, { target: { value: 'electrical_controls' } });
    });

    expect(screen.getByText('Charlie Brown')).toBeDefined();
    expect(screen.queryByText('Alice Smith')).toBeNull();
    expect(screen.queryByText('Bob Jones')).toBeNull();
  });

  it('resets selected assignee when switching to a department where that assignee is not a member', async () => {
    await act(async () => {
      render(
        <IssueModal
          isOpen={true}
          onClose={() => {}}
          editingDefect={null}
          defaultAssignedDept="assembly"
        />
      );
    });

    const routingSelect = screen.getByLabelText(/ASSIGNED \/ ROUTING/i) as HTMLSelectElement;
    const assigneeSelect = screen.getByLabelText(/ASSIGNEE/i) as HTMLSelectElement;

    // Route to assembly and pick Alice
    await act(async () => {
      fireEvent.change(routingSelect, { target: { value: 'assembly' } });
    });
    await act(async () => {
      fireEvent.change(assigneeSelect, { target: { value: 'u1' } });
    });
    expect(assigneeSelect.value).toBe('u1');

    // Switch routing to electrical_controls -> assignee should reset to empty
    await act(async () => {
      fireEvent.change(routingSelect, { target: { value: 'electrical_controls' } });
    });
    expect(assigneeSelect.value).toBe('');
  });

  it('renders notification routing checkbox and displays target recipient preview', async () => {
    await act(async () => {
      render(
        <IssueModal
          isOpen={true}
          onClose={() => {}}
          editingDefect={null}
          defaultAssignedDept="assembly"
        />
      );
    });

    const checkbox = screen.getByLabelText(/ROUTE TO NOTIFICATIONS/i) as HTMLInputElement;
    expect(checkbox).toBeDefined();
    expect(checkbox.checked).toBe(false);

    // Toggle checkbox on
    await act(async () => {
      fireEvent.click(checkbox);
    });
    expect(checkbox.checked).toBe(true);

    // Without assignee selected, shows fallback to justin@vtrfeedersolutions.com
    expect(screen.getByText(/falls back to default: justin@vtrfeedersolutions.com/i)).toBeDefined();

    // Select routing department and assignee with email
    const routingSelect = screen.getByLabelText(/ASSIGNED \/ ROUTING/i) as HTMLSelectElement;
    const assigneeSelect = screen.getByLabelText(/ASSIGNEE/i) as HTMLSelectElement;

    await act(async () => {
      fireEvent.change(routingSelect, { target: { value: 'assembly' } });
    });
    await act(async () => {
      fireEvent.change(assigneeSelect, { target: { value: 'u1' } });
    });

    // Should now preview Alice Smith (alice@vtrfeedersolutions.com)
    expect(screen.getByText(/Alice Smith \(alice@vtrfeedersolutions.com\)/i)).toBeDefined();
  });

  it('submits send_notification: true in payload when checkbox is checked', async () => {
    (fetchApi as any).mockImplementation((url: string) => {
      if (url === 'machines') {
        return Promise.resolve([
          { id: 'mach-1', order_number: 'ORD-100', model_type: 'ModelA' }
        ]);
      }
      return Promise.resolve({ id: 'def-123' });
    });

    await act(async () => {
      render(
        <IssueModal
          isOpen={true}
          onClose={() => {}}
          editingDefect={null}
          defaultAssignedDept="assembly"
        />
      );
    });

    const routingSelect = screen.getByLabelText(/ASSIGNED \/ ROUTING/i) as HTMLSelectElement;
    const descInput = screen.getByPlaceholderText(/Brief summary of the issue/i);
    const checkbox = screen.getByLabelText(/ROUTE TO NOTIFICATIONS/i) as HTMLInputElement;

    await act(async () => {
      fireEvent.change(routingSelect, { target: { value: 'assembly' } });
      fireEvent.change(descInput, { target: { value: 'Critical defect notification test' } });
      fireEvent.click(checkbox);
    });

    const submitBtn = screen.getByRole('button', { name: /CREATE ISSUE/i });
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    expect(fetchApi).toHaveBeenCalledWith(
      expect.stringContaining('machines/'),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"send_notification":true')
      })
    );
  });

  it('does not display notification checkbox when editing an existing defect', async () => {
    const mockDefect = {
      id: 'def-1',
      machine_id: 'mach-1',
      order_number: 'ORD-100',
      source_department: 'assembly',
      assigned_department: 'assembly',
      severity: 'moderate',
      status: 'open',
      description: 'Existing defect',
      created_at: new Date().toISOString()
    };

    await act(async () => {
      render(
        <IssueModal
          isOpen={true}
          onClose={() => {}}
          editingDefect={mockDefect as any}
        />
      );
    });

    expect(screen.queryByLabelText(/ROUTE TO NOTIFICATIONS/i)).toBeNull();
  });
});
