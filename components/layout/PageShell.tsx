"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ConnectButton from "@/components/ui/ConnectButton";
import NetworkBadge from "@/components/botchain/NetworkBadge";
import BuiltOnBotChain from "@/components/botchain/BuiltOnBotChain";
import { app } from "@/lib/app-config";

export type NavItem = { href: string; label: string };

export interface PageShellProps {
  children: React.ReactNode;
  nav?: NavItem[];
  title?: string;
  description?: string;
}

export const DEFAULT_NAV: NavItem[] = [
  { href: "/", label: "Propose Swap" },
  { href: "/inbox", label: "My Swaps" },
];

/**
 * Archetype O · Mirror PageShell
 *
 * Symmetrical bilateral canvas on amber-black (#1A1405).
 * Centred wordmark above the hinge, connect control at top-right,
 * and dual-accent amber/jade indicators.
 */
export default function PageShell({
  children,
  nav = DEFAULT_NAV,
  title,
  description,
}: PageShellProps) {
  const pathname = usePathname();

  return (
    <div className="mirror-canvas min-h-[100dvh] flex flex-col justify-between text-[#F3E9CF]">
      {/* Symmetrical Top Anchor */}
      <header className="w-full max-w-[1120px] mx-auto px-4 sm:px-6 pt-5 pb-3">
        <div className="relative flex flex-wrap items-center justify-between gap-4 border-b border-[#3A2F12] pb-4">
          {/* Left: Network Badge & Subtitle */}
          <div className="flex items-center gap-3">
            <NetworkBadge />
            <span className="text-[12px] text-[#B3A57E] hidden sm:inline">
              Bilateral Escrow Swap
            </span>
          </div>

          {/* Center: Wordmark above the Hinge */}
          <div className="sm:absolute sm:left-1/2 sm:-translate-x-1/2 flex items-center gap-2.5">
            <Link
              href="/"
              className="flex items-center gap-2 group no-underline text-inherit"
            >
              <span
                className="w-2.5 h-2.5 rounded-full bg-[#E0B341] shadow-[0_0_8px_rgba(224,179,65,0.6)]"
                aria-hidden="true"
              />
              <span className="text-[18px] font-bold tracking-tight text-[#F3E9CF] group-hover:text-white transition-colors">
                {app.name}
              </span>
              <span
                className="w-2.5 h-2.5 rounded-full bg-[#4FD1A1] shadow-[0_0_8px_rgba(79,209,161,0.6)]"
                aria-hidden="true"
              />
            </Link>
          </div>

          {/* Right: Nav & Connect Button */}
          <div className="flex items-center gap-3 sm:gap-4 ml-auto sm:ml-0">
            <nav className="flex items-center gap-1">
              {nav.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`text-[12px] px-2.5 py-1 rounded transition-colors no-underline ${
                      active
                        ? "bg-[#3A2F12] text-[#4FD1A1] font-medium"
                        : "text-[#B3A57E] hover:text-[#F3E9CF]"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <div className="w-[140px] sm:w-[165px] shrink-0">
              <ConnectButton />
            </div>
          </div>
        </div>

        {/* Optional Page Title Header */}
        {(title || description) && (
          <div className="text-center pt-6 pb-2 max-w-[680px] mx-auto">
            {title && (
              <h1 className="text-[22px] sm:text-[26px] font-semibold text-[#F3E9CF] tracking-tight">
                {title}
              </h1>
            )}
            {description && (
              <p className="text-[13px] text-[#B3A57E] mt-1.5 leading-relaxed">
                {description}
              </p>
            )}
          </div>
        )}
      </header>

      {/* Main Symmetrical Body */}
      <main className="w-full max-w-[1120px] mx-auto px-4 sm:px-6 py-6 flex-1">
        {children}
      </main>

      {/* Footer Colophon */}
      <footer className="w-full max-w-[1120px] mx-auto px-4 sm:px-6 py-8 border-t border-[#3A2F12]/60 text-center text-[12px] text-[#B3A57E]">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#E0B341]" />
            <span>Two assets move together or neither moves at all.</span>
            <span className="w-1.5 h-1.5 rounded-full bg-[#4FD1A1]" />
          </div>
          <BuiltOnBotChain />
        </div>
      </footer>
    </div>
  );
}
