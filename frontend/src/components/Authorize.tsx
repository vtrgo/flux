"use client";

import React from 'react';
import { useAuth } from '../contexts/AuthContext';

interface AuthorizeProps {
  children: React.ReactNode;
  roles?: string | string[];
  departments?: string | string[];
  fallback?: React.ReactNode;
}

/**
 * Authorize selectively renders children based on the current user's role and/or department.
 * If neither roles nor departments are specified, children will render as long as a user is authenticated.
 */
export function Authorize({ children, roles, departments, fallback = null }: AuthorizeProps) {
  const { user, hasRole, hasDepartment } = useAuth();

  if (!user) {
    return <>{fallback}</>;
  }

  if (roles && !hasRole(roles)) {
    return <>{fallback}</>;
  }

  if (departments && !hasDepartment(departments)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
