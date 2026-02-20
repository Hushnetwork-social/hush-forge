import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Forge — Token Launcher",
  description: "Create and manage NEP-17 tokens on Neo N3",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {/* Pre-warm connection to NeoLine CDN for token icons */}
        <link rel="preconnect" href="https://cdn.neoline.io" />
        <link rel="dns-prefetch" href="https://cdn.neoline.io" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-forge-bg text-white`}
      >
        {children}
      </body>
    </html>
  );
}
