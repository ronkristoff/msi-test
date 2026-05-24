"use client";

import { forwardRef, useState, type ReactNode, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

type FieldBase = {
  label: string;
  hint?: string;
  required?: boolean;
  error?: string;
  className?: string;
};

type InputFieldProps = FieldBase & InputHTMLAttributes<HTMLInputElement> & {
  children?: never;
  togglePassword?: boolean;
};
type SelectFieldProps = FieldBase & SelectHTMLAttributes<HTMLSelectElement> & { children?: ReactNode };
type TextareaFieldProps = FieldBase & TextareaHTMLAttributes<HTMLTextAreaElement> & { children?: never };

const fieldWrapper = "mb-5";
const labelClass = "block font-[var(--font-mono)] text-[11px] uppercase tracking-[0.05em] text-[var(--muted)] mb-2";
const inputBase = "w-full px-3 py-[9px] border rounded-[var(--radius-sm)] text-sm bg-[var(--surface)] text-[var(--fg)] outline-none focus:border-[var(--accent)] focus:shadow-[var(--focus-ring)] transition-all duration-[var(--motion-fast)] placeholder:text-[var(--muted)]";
const errorBorder = "border-[var(--danger)]";
const normalBorder = "border-[var(--border)]";

function LabelTag({ label, required }: { label: string; required?: boolean }) {
  return (
    <>
      {label}
      {required && (
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--danger)] ml-1">
          ● Required
        </span>
      )}
    </>
  );
}

function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
        <line x1="1" y1="1" x2="23" y2="23" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export const Input = forwardRef<HTMLInputElement, InputFieldProps>(
  ({ label, hint, required, error, className = "", togglePassword, type, ...props }, ref) => {
    const [showPassword, setShowPassword] = useState(false);
    const isPassword = togglePassword || type === "password";

    return (
      <div className={`${fieldWrapper} ${className}`}>
        <label className={labelClass} htmlFor={props.id}>
          <LabelTag label={label} required={required} />
        </label>
        <div className="relative">
          <input
            ref={ref}
            type={isPassword ? (showPassword ? "text" : "password") : type}
            className={`${inputBase} ${isPassword ? "pr-10" : ""} ${error ? errorBorder : normalBorder}`}
            {...props}
          />
          {isPassword && (
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--fg)] transition-colors duration-[var(--motion-fast)]"
              tabIndex={-1}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              <EyeIcon open={showPassword} />
            </button>
          )}
        </div>
        {hint && <p className="font-[var(--font-mono)] text-xs text-[var(--muted)] mt-1.5">{hint}</p>}
        {error && <p className="text-xs text-[var(--danger)] mt-1">{error}</p>}
      </div>
    );
  },
);
Input.displayName = "Input";

export const Select = forwardRef<HTMLSelectElement, SelectFieldProps>(
  ({ label, hint, required, error, className = "", children, ...props }, ref) => (
    <div className={`${fieldWrapper} ${className}`}>
      <label className={labelClass} htmlFor={props.id}>
        <LabelTag label={label} required={required} />
      </label>
      <select
        ref={ref}
        className={`${inputBase} cursor-pointer ${error ? errorBorder : normalBorder}`}
        {...props}
      >
        {children}
      </select>
      {hint && <p className="font-[var(--font-mono)] text-xs text-[var(--muted)] mt-1.5">{hint}</p>}
      {error && <p className="text-xs text-[var(--danger)] mt-1">{error}</p>}
    </div>
  ),
);
Select.displayName = "Select";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaFieldProps>(
  ({ label, hint, required, error, className = "", ...props }, ref) => (
    <div className={`${fieldWrapper} ${className}`}>
      <label className={labelClass} htmlFor={props.id}>
        <LabelTag label={label} required={required} />
      </label>
      <textarea
        ref={ref}
        className={`${inputBase} resize-none ${error ? errorBorder : normalBorder}`}
        {...props}
      />
      {hint && <p className="font-[var(--font-mono)] text-xs text-[var(--muted)] mt-1.5">{hint}</p>}
      {error && <p className="text-xs text-[var(--danger)] mt-1">{error}</p>}
    </div>
  ),
);
Textarea.displayName = "Textarea";
