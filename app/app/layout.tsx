import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const sans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  title: "Staffless",
  description: "A translation shop run by an AI. A NEAR contract holds the money and enforces the owner's rules.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-[100dvh] font-sans">
        <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:px-8">
          <Link href="/" className="flex items-center gap-2.5 text-lg font-semibold tracking-tight">
            {/* eslint-disable-next-line @next/next/no-img-element -- tiny static SVG, next/image adds nothing */}
            <img src="/icon.svg" alt="" width={28} height={28} />
            Staffless
          </Link>
          <nav className="flex items-center gap-6 text-sm text-zinc-600 dark:text-zinc-400">
            <Link href="/" className="hover:text-zinc-900 dark:hover:text-zinc-100">
              Shop
            </Link>
            <Link href="/books" className="hover:text-zinc-900 dark:hover:text-zinc-100">
              Books
            </Link>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
