import React from 'react';
import { GlobalHeader } from "../../components/GlobalHeader";
import { AuthGuard } from "../../components/AuthGuard";
import { ErrorBoundary } from "../../components/ui/ErrorBoundary";

export default function MainLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <AuthGuard>
      <GlobalHeader />
      <ErrorBoundary componentName="Main View">
        {children}
      </ErrorBoundary>
    </AuthGuard>
  );
}
