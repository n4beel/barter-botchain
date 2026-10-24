"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

export type ButtonVariant = "split" | "give" | "get" | "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  splitLeftText?: string;
  splitRightText?: string;
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-[12px]",
  md: "px-5 py-2.5 text-[13px]",
  lg: "px-6 py-3.5 text-[14px]",
};

/**
 * Mirror Archetype Button.
 *
 * Supports bilateral split variant where amber and jade meet in a hard-split center seam,
 * plus individual give (amber), get (jade), and standard actions.
 */
const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    loading = false,
    disabled = false,
    children,
    className = "",
    splitLeftText = "YOU GIVE",
    splitRightText = "YOU GET",
    ...rest
  },
  ref
) {
  const isDisabled = disabled || loading;

  // Bilateral hard-split button spanning across mirror panels
  if (variant === "split") {
    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={`split-btn relative group cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
        {...rest}
      >
        <span className="split-btn-left flex items-center justify-center gap-2">
          {loading ? (
            <span className="w-3.5 h-3.5 border-2 border-[#211702] border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <span className="w-2 h-2 rounded-full bg-[#211702]/40" />
              <span>{splitLeftText}</span>
            </>
          )}
        </span>
        <span className="split-btn-right flex items-center justify-center gap-2">
          {loading ? (
            <span className="text-[12px] opacity-80">Processing…</span>
          ) : (
            <>
              <span>{splitRightText}</span>
              <span className="w-2 h-2 rounded-full bg-[#0C1F18]/40" />
            </>
          )}
        </span>
      </button>
    );
  }

  // Standard styling variants
  let variantClasses = "";
  switch (variant) {
    case "give":
      variantClasses =
        "bg-[#E0B341] text-[#211702] font-semibold hover:bg-[#EDB944] shadow-sm";
      break;
    case "get":
    case "primary":
      variantClasses =
        "bg-[#4FD1A1] text-[#0C1F18] font-semibold hover:bg-[#58E0AE] shadow-sm";
      break;
    case "secondary":
      variantClasses =
        "bg-[#241C09] text-[#F3E9CF] border border-[#3A2F12] hover:border-[#4E3F19] hover:bg-[#2E240D]";
      break;
    case "ghost":
      variantClasses =
        "bg-transparent text-[#B3A57E] hover:text-[#F3E9CF] hover:bg-[#241C09]";
      break;
    case "danger":
      variantClasses =
        "bg-[#E05D52]/15 text-[#E05D52] border border-[#E05D52]/40 hover:bg-[#E05D52]/25 font-medium";
      break;
  }

  return (
    <button
      ref={ref}
      disabled={isDisabled}
      className={`inline-flex items-center justify-center gap-2 rounded transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${sizeClasses[size]} ${variantClasses} ${className}`}
      {...rest}
    >
      {loading && (
        <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
      )}
      {children}
    </button>
  );
});

export default Button;
