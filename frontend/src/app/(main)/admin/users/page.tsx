"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { fetchApi } from '../../../../lib/api';
import { User } from '../../../../types';
import { ACTIVE_DEPARTMENTS } from '../../../../lib/departments';
import { toast } from 'sonner';

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState({ username: '', first_name: '', last_name: '', department: '', role: '' });

  const loadUsers = async () => {
    setLoading(true);
    try {
      const data = await fetchApi<User[]>('users');
      setUsers(data || []);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load users');
    }
    setLoading(false);
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const startCreate = () => {
    setFormData({ username: '', first_name: '', last_name: '', department: '', role: '' });
    setEditingUser(null);
    setIsCreating(true);
  };

  const startEdit = (user: User) => {
    setFormData({
      username: user.username,
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      department: user.department || '',
      role: user.role || ''
    });
    setEditingUser(user);
    setIsCreating(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingUser) {
        await fetchApi(`users/${editingUser.id}`, {
          method: 'PUT',
          body: JSON.stringify(formData)
        });
        toast.success('User updated');
      } else {
        await fetchApi('users', {
          method: 'POST',
          body: JSON.stringify(formData)
        });
        toast.success('User created');
      }
      setEditingUser(null);
      setIsCreating(false);
      loadUsers();
    } catch (err) {
      console.error(err);
      toast.error('Failed to save user');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this user?')) return;
    try {
      await fetchApi(`users/${id}`, { method: 'DELETE' });
      toast.success('User deleted');
      loadUsers();
    } catch (err) {
      console.error(err);
      toast.error('Failed to delete user');
    }
  };

  return (
    <main style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', borderBottom: '1px solid var(--vtr-card-border, var(--border-color))', paddingBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-mono)', fontSize: '2rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--vtr-theme-primary, var(--text-primary))', margin: 0 }}>
            User Management
          </h1>
          <p style={{ color: 'var(--vtr-theme-accent, var(--text-secondary))', fontFamily: 'var(--font-mono)', fontSize: '1rem', marginTop: '0.5rem' }}>
            Manage system users and department assignments
          </p>
        </div>
        <Link href="/admin" className="vtr-btn vtr-btn-secondary">
          ← Back to Admin
        </Link>
      </header>

      <div style={{ display: 'flex', gap: '2rem', alignItems: 'flex-start' }}>
        <section style={{ 
          flex: 2,
          backgroundColor: 'var(--vtr-card-bg, var(--bg-secondary))',
          border: '1px solid var(--vtr-card-border, var(--border-color))',
          borderRadius: '12px',
          padding: '2rem',
          backdropFilter: 'blur(8px)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
            <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: '1.5rem', color: 'var(--vtr-theme-primary, var(--text-primary))', margin: 0 }}>
              System Users
            </h2>
            <button onClick={startCreate} className="vtr-btn">
              + New User
            </button>
          </div>

          {loading ? (
            <div>Loading users...</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--vtr-card-border, var(--border-color))', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
                  <th style={{ padding: '1rem 0' }}>Username</th>
                  <th style={{ padding: '1rem 0' }}>Name</th>
                  <th style={{ padding: '1rem 0' }}>Department</th>
                  <th style={{ padding: '1rem 0' }}>Role</th>
                  <th style={{ padding: '1rem 0', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} style={{ borderBottom: '1px solid var(--vtr-card-border, var(--border-color))' }}>
                    <td style={{ padding: '1rem 0' }}>{u.username}</td>
                    <td style={{ padding: '1rem 0' }}>{u.first_name} {u.last_name}</td>
                    <td style={{ padding: '1rem 0' }}>
                      {ACTIVE_DEPARTMENTS.find(d => d.key === u.department)?.label || u.department || 'None'}
                    </td>
                    <td style={{ padding: '1rem 0' }}>{u.role || 'None'}</td>
                    <td style={{ padding: '1rem 0', textAlign: 'right' }}>
                      <button onClick={() => startEdit(u)} className="vtr-btn vtr-btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', marginRight: '0.5rem' }}>Edit</button>
                      <button onClick={() => handleDelete(u.id)} className="vtr-btn" style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', background: 'var(--accent-red)', borderColor: 'var(--accent-red)' }}>Delete</button>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ padding: '2rem 0', textAlign: 'center', color: 'var(--text-secondary)' }}>No users found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </section>

        {(editingUser || isCreating) && (
          <section style={{ 
            flex: 1,
            backgroundColor: 'var(--vtr-card-bg, var(--bg-secondary))',
            border: '1px solid var(--vtr-card-border, var(--border-color))',
            borderRadius: '12px',
            padding: '2rem',
            backdropFilter: 'blur(8px)',
            position: 'sticky',
            top: '2rem'
          }}>
            <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: '1.25rem', color: 'var(--vtr-theme-primary, var(--text-primary))', marginBottom: '1.5rem', textTransform: 'uppercase' }}>
              {isCreating ? 'Create User' : 'Edit User'}
            </h2>
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>USERNAME</label>
                <input 
                  type="text" 
                  value={formData.username} 
                  onChange={e => setFormData({...formData, username: e.target.value})} 
                  className="vtr-input" 
                  required 
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>FIRST NAME</label>
                <input 
                  type="text" 
                  value={formData.first_name} 
                  onChange={e => setFormData({...formData, first_name: e.target.value})} 
                  className="vtr-input" 
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>LAST NAME</label>
                <input 
                  type="text" 
                  value={formData.last_name} 
                  onChange={e => setFormData({...formData, last_name: e.target.value})} 
                  className="vtr-input" 
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>DEPARTMENT ASSIGNMENT</label>
                <select 
                  value={formData.department} 
                  onChange={e => setFormData({...formData, department: e.target.value})} 
                  className="vtr-input"
                >
                  <option value="">None</option>
                  <option value="quality">Quality</option>
                  {ACTIVE_DEPARTMENTS.map(d => (
                    <option key={d.key} value={d.key}>{d.label}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>ROLE</label>
                <select 
                  value={formData.role} 
                  onChange={e => setFormData({...formData, role: e.target.value})} 
                  className="vtr-input"
                >
                  <option value="">None</option>
                  <option value="operator">Operator</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Administrator</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                <button type="submit" className="vtr-btn" style={{ flex: 1 }}>Save</button>
                <button type="button" onClick={() => { setIsCreating(false); setEditingUser(null); }} className="vtr-btn vtr-btn-secondary">Cancel</button>
              </div>
            </form>
          </section>
        )}
      </div>
    </main>
  );
}
