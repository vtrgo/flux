import { useState, useEffect } from 'react';
import { fetchApi } from '../lib/api';
import { User } from '../types';

export function useUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    fetchApi<User[]>('/users')
      .then((data) => {
        setUsers(data || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to fetch users:', err);
        setError(err);
        setLoading(false);
      });
  }, []);

  return { users, loading, error };
}
