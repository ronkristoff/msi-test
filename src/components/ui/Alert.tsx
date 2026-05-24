"use client";

import type { ReactNode } from "react";

type AlertVariant = "success" | "error";

type AlertProps = {
  variant: AlertVariant;
  children: ReactNode;
  className?: string;
};

const variantClasses: Record<AlertVariant, string> = {
  success: "bg-[rgba(0,100,0,0.06)] border-[rgba(0,100,0,0.2)] text-[var(--success-text)]",
  error: "bg-[rgba(220,38,38,0.06)] border-[rgba(220,38,38,0.2)] text-[var(--danger)]",
};

export function Alert({ variant, children, className = "" }: AlertProps) {
  return (
    <div
      role="alert"
      className={`p-3 rounded-[var(--radius-sm)] border text-sm ${variantClasses[variant]} ${className}`}
    >
      {children}
    </div>
  );
}
