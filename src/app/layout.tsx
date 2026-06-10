import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "FirstCut — part drawing to blank quote",
  description:
    "Demo: LLM extracts a part envelope from a drawing; deterministic code converts, validates, and prices the stock blank.",
};

const DISCLAIMER =
  "FirstCut is an independent, unaffiliated demonstration project inspired by publicly available information about Nox Metals. It is not built by, endorsed by, or connected to Nox Metals in any way. All prices, formulas, inventory, and lead times are fictitious demo data and do not represent real offers, real pricing, or Nox Metals' actual systems.";

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-screen flex flex-col">
        <header className="border-b border-neutral-800 bg-neutral-900/60">
          <div className="mx-auto max-w-5xl px-6 py-4 flex items-baseline justify-between">
            <Link href="/" className="text-lg font-semibold tracking-tight">
              <span className="text-orange-500">First</span>Cut
              <span className="ml-3 text-xs font-normal uppercase tracking-widest text-neutral-500">
                drawing → blank → quote
              </span>
            </Link>
            <nav className="flex gap-6 text-sm text-neutral-400">
              <Link href="/" className="hover:text-neutral-100">New quote</Link>
              <Link href="/quotes" className="hover:text-neutral-100">Quotes</Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">{children}</main>
        <footer className="border-t border-neutral-800 mt-12">
          <div className="mx-auto max-w-5xl px-6 py-6 text-xs leading-relaxed text-neutral-500 space-y-2">
            <p>{DISCLAIMER}</p>
            <p className="text-neutral-600">Quote is demo data — not a real offer.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
