import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { CoNCWidget } from './CoNCWidget';
import { fetchApi } from '../lib/api';
import { CoNCSummaryResponse } from '../types';

vi.mock('../lib/api', () => ({
  fetchApi: vi.fn(),
}));

vi.mock('./SSEProvider', () => ({
  useSSE: vi.fn(),
  useSSEConnectionStatus: vi.fn().mockReturnValue(true),
}));

describe('CoNCWidget Component', () => {
  const mockSummary: CoNCSummaryResponse = {
    hourly_rate: 85.00,
    total_production_hours: 80.0,
    total_rework_hours: 12.0,
    total_defect_hours: 5.0,
    total_ncr_hours: 4.0,
    total_conc_hours: 17.0,
    total_conc_cost: 1445.00,
    rework_cost: 1020.00,
    defect_cost: 425.00,
    ncr_cost: 340.00,
    conc_percentage_of_labor: 17.5,
    department_breakdown: [
      {
        department: 'assembly',
        total_hours: 62.0,
        production_hours: 50.0,
        rework_hours: 10.0,
        defect_hours: 2.0,
        ncr_hours: 0.0,
        conc_hours: 12.0,
        conc_cost: 1020.00,
        conc_percentage: 19.4,
      },
      {
        department: 'machining',
        total_hours: 35.0,
        production_hours: 30.0,
        rework_hours: 2.0,
        defect_hours: 3.0,
        ncr_hours: 0.0,
        conc_hours: 5.0,
        conc_cost: 425.00,
        conc_percentage: 14.3,
      },
    ],
    machine_breakdown: [
      {
        machine_id: 'm-1',
        order_number: 'M-5000',
        model_type: 'Rotary Dial',
        project_name: 'Alpha Line',
        customer_name: 'Acme Corp',
        total_hours: 50.0,
        production_hours: 40.0,
        rework_hours: 8.0,
        defect_hours: 2.0,
        ncr_hours: 2.0,
        conc_hours: 10.0,
        conc_cost: 850.00,
        conc_percentage: 20.0,
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (fetchApi as any).mockResolvedValue(mockSummary);
  });

  it('renders executive summary cards correctly', async () => {
    await act(async () => {
      render(<CoNCWidget />);
    });

    expect(screen.getByTestId('total-conc-cost').textContent).toContain('$1,445');
    expect(screen.getByTestId('total-conc-hours').textContent).toBe('17.0h');
    expect(screen.getByTestId('conc-percentage').textContent).toBe('17.5%');
    expect(screen.getByTestId('rework-cost').textContent).toContain('$1,020');
    expect(screen.getByTestId('defect-cost').textContent).toContain('$425');
    expect(screen.getByTestId('ncr-cost').textContent).toContain('$340');
  });

  it('allows changing burden rate and triggers fetchApi with new rate', async () => {
    await act(async () => {
      render(<CoNCWidget defaultHourlyRate={85} />);
    });

    const rateInput = screen.getByTestId('hourly-rate-input');
    expect(rateInput).toHaveValue(85);

    await act(async () => {
      fireEvent.change(rateInput, { target: { value: '95' } });
    });

    expect(fetchApi).toHaveBeenCalledWith('analytics/conc', {
      params: { hourly_rate: '95' },
    });
  });

  it('switches between Department and Machine breakdown tabs', async () => {
    await act(async () => {
      render(<CoNCWidget />);
    });

    // Default tab is Department
    expect(screen.getByTestId('department-table')).toBeInTheDocument();
    expect(screen.getByText('assembly')).toBeInTheDocument();
    expect(screen.getByText('machining')).toBeInTheDocument();

    // Switch to Machine tab
    const machineTabBtn = screen.getByTestId('tab-machine');
    await act(async () => {
      fireEvent.click(machineTabBtn);
    });

    expect(screen.getByTestId('machine-table')).toBeInTheDocument();
    expect(screen.getByText('M-5000')).toBeInTheDocument();
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
  });
});
