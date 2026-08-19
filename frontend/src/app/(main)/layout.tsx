import React from 'react';
import { GlobalHeader } from "../../components/GlobalHeader";

export default function MainLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <GlobalHeader />
      {children}
    </>
  );
}
