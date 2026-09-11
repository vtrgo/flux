import React from 'react';
import { GlobalHeader } from "../../components/GlobalHeader";
import { AuthGuard } from "../../components/AuthGuard";

export default function MainLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <AuthGuard>
      <GlobalHeader />
      {children}
    </AuthGuard>
  );
}
