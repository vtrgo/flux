import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Share_Tech_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: '--font-inter' });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: '--font-mono' });
const shareTechMono = Share_Tech_Mono({ subsets: ["latin"], weight: "400", variable: '--font-digital' });

export const metadata: Metadata = {
  title: "vtrFlux - Manufacturing Execution System",
  description: "Digital Birth Certificate and Relational Machine Tracking",
};

import { ThemeProvider } from "../components/ThemeProvider";
import { SSEProvider } from "../components/SSEProvider";
import { CommandPalette } from "../components/CommandPalette";
import { Toaster } from 'sonner';
import { GlobalSystemToasts } from "../components/GlobalSystemToasts";
import { AuthProvider } from "../contexts/AuthContext";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${jetbrainsMono.variable} ${shareTechMono.variable}`}>
        <ThemeProvider>
          <AuthProvider>
            <SSEProvider>
              <div id="vtr-global-focus-sink" tabIndex={-1} style={{ outline: 'none' }}></div>
              {children}
              <CommandPalette />
              <Toaster theme="dark" position="bottom-right" />
              <GlobalSystemToasts />
            </SSEProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
