import React from 'react';
import { User } from '../types';

interface NotificationRoutingCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  assignedUser?: User;
  defaultRecipientEmail?: string;
  disabled?: boolean;
}

export function NotificationRoutingCheckbox({
  checked,
  onChange,
  assignedUser,
  defaultRecipientEmail = 'justin@vtrfeedersolutions.com',
  disabled = false,
}: NotificationRoutingCheckboxProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', padding: '0.6rem 0.75rem', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-color)', borderRadius: '4px' }}>
      <label htmlFor="send_notification_checkbox" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-primary)', margin: 0 }}>
        <input 
          type="checkbox" 
          id="send_notification_checkbox"
          checked={checked} 
          onChange={e => onChange(e.target.checked)}
          disabled={disabled}
          style={{ width: '1rem', height: '1rem', accentColor: 'var(--vtr-theme-primary)', cursor: disabled ? 'not-allowed' : 'pointer' }}
        />
        <span>ROUTE TO NOTIFICATIONS (TEAMS / POWER AUTOMATE)</span>
      </label>
      {checked && (
        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', paddingLeft: '1.6rem' }}>
          {assignedUser ? (
            assignedUser.email ? (
              <span>Target Recipient: <strong style={{ color: 'var(--vtr-theme-primary)' }}>{assignedUser.first_name && assignedUser.last_name ? `${assignedUser.first_name} ${assignedUser.last_name}` : assignedUser.username} ({assignedUser.email})</strong></span>
            ) : (
              <span>Target Recipient: <strong style={{ color: '#eab308' }}>{assignedUser.username} has no email configured</strong> (falls back to default: {defaultRecipientEmail})</span>
            )
          ) : (
            <span>Target Recipient: <span style={{ color: 'var(--text-secondary)' }}>No assignee selected (falls back to default: {defaultRecipientEmail})</span></span>
          )}
        </div>
      )}
    </div>
  );
}
