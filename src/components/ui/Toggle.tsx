"use client";

type ToggleProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  size?: "sm" | "md";
};

const sizeClasses = {
  sm: { track: "h-5 w-9", thumb: "h-3.5 w-3.5", off: "translate-x-[3px]", on: "translate-x-[18px]" },
  md: { track: "h-6 w-11", thumb: "h-4 w-4", off: "translate-x-[4px]", on: "translate-x-[22px]" },
};

export function Toggle({ checked, onChange, size = "sm" }: ToggleProps) {
  const s = sizeClasses[size];
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex items-center rounded-full transition-colors ${
        checked ? "bg-[var(--accent)]" : "bg-[var(--border)]"
      } ${s.track}`}
    >
      <span
        className={`inline-block rounded-full bg-white transition-transform ${s.thumb} ${
          checked ? s.on : s.off
        }`}
      />
    </button>
  );
}
