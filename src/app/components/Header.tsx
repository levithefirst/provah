"use client";

import { useState } from "react";
import Logo from "./Logo";
import ThemeToggle from "./ThemeToggle";

const NAV_LINKS = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#app", label: "Campaigns" },
  { href: "https://github.com/levithefirst/provah#readme", label: "Docs" },
  { href: "https://github.com/levithefirst/provah", label: "GitHub" },
];

export default function Header() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-neutral-200/80 bg-white/80 backdrop-blur-md dark:border-neutral-800/80 dark:bg-neutral-950/80">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <a href="#top" className="text-neutral-900 dark:text-neutral-50">
          <Logo />
        </a>

        <nav className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((l) => (
            <a
              key={l.label}
              href={l.href}
              className="text-sm font-medium text-neutral-600 transition-colors hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-50"
              target={l.href.startsWith("http") ? "_blank" : undefined}
              rel={l.href.startsWith("http") ? "noreferrer" : undefined}
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <div className="hidden sm:block">
            <ThemeToggle />
          </div>
          <a
            href="#app"
            className="hidden rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-neutral-900 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:brightness-95 active:translate-y-0 active:scale-[0.97] sm:inline-block"
          >
            Launch app
          </a>
          <button
            onClick={() => setOpen((v) => !v)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200 text-neutral-700 transition-colors md:hidden dark:border-neutral-800 dark:text-neutral-300"
            aria-label="Toggle menu"
          >
            {open ? (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M1 1L15 15M15 1L1 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M1 3H15M1 8H15M1 13H15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-neutral-200 bg-white px-6 py-4 md:hidden dark:border-neutral-800 dark:bg-neutral-950">
          <div className="flex flex-col gap-4">
            {NAV_LINKS.map((l) => (
              <a
                key={l.label}
                href={l.href}
                onClick={() => setOpen(false)}
                className="text-sm font-medium text-neutral-700 dark:text-neutral-300"
                target={l.href.startsWith("http") ? "_blank" : undefined}
                rel={l.href.startsWith("http") ? "noreferrer" : undefined}
              >
                {l.label}
              </a>
            ))}
            <div className="flex items-center justify-between gap-3 border-t border-neutral-200 pt-4 dark:border-neutral-800">
              <span className="text-sm font-medium text-neutral-500 dark:text-neutral-400">Theme</span>
              <ThemeToggle />
            </div>
            <a
              href="#app"
              onClick={() => setOpen(false)}
              className="rounded-full bg-accent px-5 py-2.5 text-center text-sm font-semibold text-neutral-900"
            >
              Launch app
            </a>
          </div>
        </div>
      )}
    </header>
  );
}
