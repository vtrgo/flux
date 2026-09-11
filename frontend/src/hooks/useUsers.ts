import { useState, useEffect } from 'react';
import { fetchApi } from '../lib/api';
import { User } from '../types';

export function useUsers(department?: string) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    setLoading(true);
    const options = department ? { params: { department } } : undefined;
    fetchApi<User[]>('/users', options)
      .then((data) => {
        setUsers(data || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to fetch users:', err);
        setError(err);
        setLoading(false);
      });
  }, [department]);

  return { users, loading, error };
}
