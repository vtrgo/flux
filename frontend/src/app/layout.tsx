import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: '--font-inter' });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: '--font-mono' });

export const metadata: Metadata = {
  title: "vtrFlux - Manufacturing Execution System",
  description: "Digital Birth Certificate and Relational Machine Tracking",
};

import { ThemeProvider } from "../components/ThemeProvider";
import { SSEProvider } from "../components/SSEProvider";
import { CommandPalette } from "../components/CommandPalette";
import { Toaster } from 'sonner';
import { GlobalSystemToasts } from "../components/GlobalSystemToasts";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${jetbrainsMono.variable}`}>
        <ThemeProvider>
          <SSEProvider>
            <div id="vtr-global-focus-sink" tabIndex={-1} style={{ outline: 'none' }}></div>
            {children}
            <CommandPalette />
            <Toaster theme="dark" position="bottom-right" />
            <GlobalSystemToasts />
          </SSEProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
