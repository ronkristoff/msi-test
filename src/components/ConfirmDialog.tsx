"use client";

import { Button } from "@/components/ui/Button";

type ConfirmDialogProps = {
  title: string;
  message: string;
  confirmLabel?: string;
  variant?: "danger" | "primary";
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Delete",
  variant = "danger",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onCancel}>
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] p-6 max-w-[400px] w-full shadow-[var(--elev-raised)]" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-[var(--font-display)] text-lg font-bold text-[var(--fg)] mb-2">{title}</h3>
        <p className="text-sm text-[var(--muted)] mb-5">{message}</p>
        <div className="flex gap-3 justify-end">
          <Button variant="secondary" size="sm" onClick={onCancel}>Cancel</Button>
          <Button variant={variant} size="sm" onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}
