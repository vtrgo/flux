"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { fetchApi } from '../../../../lib/api';
import { User } from '../../../../types';
import { ACTIVE_DEPARTMENTS, formatDepartmentName } from '../../../../lib/departments';
import { toast } from 'sonner';
import styles from '../admin.module.css';

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState({ username: '', email: '', first_name: '', last_name: '', department: '', role: '', password: '' });

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
    setFormData({ username: '', email: '', first_name: '', last_name: '', department: '', role: '', password: '' });
    setEditingUser(null);
    setIsCreating(true);
  };

  const startEdit = (user: User) => {
    setFormData({
      username: user.username,
      email: user.email || '',
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      department: user.department || '',
      role: user.role || '', password: ''
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
    <main className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>User Management</h1>
          <p className={styles.subtitle}>Manage system users and department assignments</p>
        </div>
        <Link href="/admin" className="vtr-btn vtr-btn-secondary">
          ← Back to Admin
        </Link>
      </header>

      <div className={styles.splitView}>
        <section className={styles.card} style={{ flex: 2, marginBottom: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h2 className={styles.cardTitle} style={{ margin: 0 }}>System Users</h2>
            <button onClick={startCreate} className="vtr-btn">
              + New User
            </button>
          </div>

          {loading ? (
            <div style={{ padding: '2rem 0', color: 'var(--text-secondary)' }}>Loading users...</div>
          ) : (
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Username</th>
                    <th>Email</th>
                    <th>Name</th>
                    <th>Department</th>
                    <th>Role</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id}>
                      <td>{u.username}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: u.email ? 'var(--vtr-theme-primary)' : 'var(--text-secondary)' }}>
                        {u.email || '—'}
                      </td>
                      <td>{u.first_name} {u.last_name}</td>
                      <td>
                        {u.department ? formatDepartmentName(u.department) : 'None'}
                      </td>
                      <td>{u.role || 'None'}</td>
                      <td style={{ textAlign: 'right' }}>
                        <button onClick={() => startEdit(u)} className="vtr-btn vtr-btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', marginRight: '0.5rem' }}>Edit</button>
                        <button onClick={() => handleDelete(u.id)} className="vtr-btn" style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', background: 'var(--color-danger, #ff5252)', borderColor: 'var(--color-danger, #ff5252)' }}>Delete</button>
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ padding: '2rem 0', textAlign: 'center', color: 'var(--text-secondary)' }}>No users found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {(editingUser || isCreating) && (
          <section className={styles.card} style={{ flex: 1, position: 'sticky', top: '2rem', marginBottom: 0 }}>
            <h2 className={styles.cardTitle}>
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
                <label style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>EMAIL ADDRESS</label>
                <input 
                  type="email" 
                  value={formData.email} 
                  onChange={e => setFormData({...formData, email: e.target.value})} 
                  className="vtr-input" 
                  placeholder="e.g. user@vtrfeedersolutions.com"
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
                  {ACTIVE_DEPARTMENTS.map(d => (
                    <option key={d.key} value={d.key}>{d.label}</option>
                  ))}
                  <option value="project_management">Project Management</option>
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>PASSWORD</label>
                <input 
                  type="password" 
                  value={formData.password} 
                  onChange={e => setFormData({...formData, password: e.target.value})} 
                  className="vtr-input"
                  placeholder={editingUser ? "Leave blank to keep unchanged" : ""}
                />
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
