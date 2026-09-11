"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { User } from '../types';
import { fetchApi } from '../lib/api';

export interface LoginCredentials {
  username: string;
  password?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (creds: LoginCredentials) => Promise<User>;
  setUserDirectly: (user: User | null) => void;
  logout: () => Promise<void>;
  hasRole: (roles: string | string[]) => boolean;
  hasDepartment: (departments: string | string[]) => boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  login: async () => { throw new Error("AuthProvider not mounted"); },
  setUserDirectly: () => {},
  logout: async () => {},
  hasRole: () => false,
  hasDepartment: () => false,
  isAdmin: false,
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user has an active session
    fetchApi<User>('auth/me')
      .then(data => {
        if (data && data.id) {
          setUser(data);
        }
      })
      .catch(() => {
        // Not logged in or error
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const login = useCallback(async (creds: LoginCredentials): Promise<User> => {
    const data = await fetchApi<User>('auth/login', {
      method: 'POST',
      body: JSON.stringify(creds),
    });
    if (!data || !data.id) {
      throw new Error('Authentication failed');
    }
    setUser(data);
    return data;
  }, []);

  const setUserDirectly = useCallback((newUser: User | null) => {
    setUser(newUser);
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetchApi('auth/logout', { method: 'POST' });
    } catch (e) {
      console.error('Logout error:', e);
    }
    setUser(null);
  }, []);

  const hasRole = useCallback((roles: string | string[]): boolean => {
    if (!user || !user.role) return false;
    const userRole = user.role.toLowerCase();
    if (Array.isArray(roles)) {
      return roles.map(r => r.toLowerCase()).includes(userRole);
    }
    return userRole === roles.toLowerCase();
  }, [user]);

  const hasDepartment = useCallback((departments: string | string[]): boolean => {
    if (!user || !user.department) return false;
    const userDept = user.department.toLowerCase();
    if (Array.isArray(departments)) {
      return departments.map(d => d.toLowerCase()).includes(userDept);
    }
    return userDept === departments.toLowerCase();
  }, [user]);

  const isAdmin = Boolean(user && user.role && user.role.toLowerCase() === 'admin');

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      login,
      setUserDirectly,
      logout,
      hasRole,
      hasDepartment,
      isAdmin,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
