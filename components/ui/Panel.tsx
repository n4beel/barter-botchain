"use client";

import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

export type PanelSide = "give" | "get" | "neutral";

export interface PanelProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  children: ReactNode;
  side?: PanelSide;
  title?: ReactNode;
  eyebrow?: string;
  badge?: ReactNode;
  footer?: ReactNode;
}

/**
 * Mirror Archetype Panel.
 *
 * Supports bilateral sides:
 * - "give": left wing styled with amber accents (#E0B341).
 * - "get": right wing styled with jade accents (#4FD1A1).
 * - "neutral": balanced dark amber-slate panel.
 */
const Panel = forwardRef<HTMLDivElement, PanelProps>(function Panel(
  {
    children,
    side = "neutral",
    title,
    eyebrow,
    badge,
    footer,
    className = "",
    style,
    ...rest
  },
  ref
) {
  let borderClasses = "border-[#3A2F12]";
  let aura = "";
  let sideTag = null;

  if (side === "give") {
    borderClasses = "border-[#E0B341]/40 hover:border-[#E0B341]/70";
    aura = "shadow-[0_0_24px_rgba(224,179,65,0.06)]";
    sideTag = (
      <span className="text-[11px] font-bold tracking-wider uppercase text-[#E0B341] bg-[#E0B341]/10 px-2.5 py-0.5 rounded border border-[#E0B341]/30">
        You Give
      </span>
    );
  } else if (side === "get") {
    borderClasses = "border-[#4FD1A1]/40 hover:border-[#4FD1A1]/70";
    aura = "shadow-[0_0_24px_rgba(79,209,161,0.06)]";
    sideTag = (
      <span className="text-[11px] font-bold tracking-wider uppercase text-[#4FD1A1] bg-[#4FD1A1]/10 px-2.5 py-0.5 rounded border border-[#4FD1A1]/30">
        You Get
      </span>
    );
  }

  return (
    <div
      ref={ref}
      className={`relative bg-[#241C09] border rounded-md transition-colors ${borderClasses} ${aura} ${className}`}
      style={style}
      {...rest}
    >
      {(eyebrow || title || badge || sideTag) && (
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[#3A2F12]/60">
          <div>
            {eyebrow && (
              <div className="text-[11px] uppercase tracking-wider text-[#B3A57E] mb-1">
                {eyebrow}
              </div>
            )}
            {title && (
              <div className="text-[16px] font-semibold text-[#F3E9CF] tracking-tight">
                {title}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {badge}
            {sideTag}
          </div>
        </div>
      )}

      <div className="p-5">{children}</div>

      {footer && (
        <div className="px-5 py-3 border-t border-[#3A2F12]/60 bg-[#1A1405]/40 text-[12px] text-[#B3A57E]">
          {footer}
        </div>
      )}
    </div>
  );
});

export default Panel;
