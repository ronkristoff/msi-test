"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "default" | "sm" | "icon";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--accent)] text-[var(--accent-on)] border-none hover:bg-[var(--accent-hover)] active:bg-[var(--accent-active)]",
  secondary:
    "bg-transparent text-[var(--fg)] border border-[var(--border)] hover:border-[var(--fg)] hover:bg-[var(--border-soft)]",
  ghost:
    "bg-transparent text-[var(--muted)] border-none hover:text-[var(--fg)] hover:bg-[var(--border-soft)]",
  danger:
    "bg-transparent text-[var(--danger)] border border-[var(--danger)] hover:bg-[rgba(220,38,38,0.08)]",
};

const sizeClasses: Record<ButtonSize, string> = {
  default: "py-[9px] px-4 text-sm font-semibold",
  sm: "py-[5px] px-3 text-xs font-semibold",
  icon: "p-2",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "default", icon, children, className = "", disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled}
        className={`inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-sm)] cursor-pointer transition-all duration-[var(--motion-fast)] active:translate-y-px focus-visible:shadow-[var(--focus-ring)] disabled:opacity-45 disabled:cursor-not-allowed disabled:active:translate-y-0 font-[var(--font-body)] ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
        {...props}
      >
        {icon}
        {children}
      </button>
    );
  },
);

Button.displayName = "Button";
