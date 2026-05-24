"use client";

import { Textarea } from "@/components/ui/FormField";
import type { PRDMode } from "@/lib/use-file-upload";

const ACCEPTED_TYPES = [".md", ".pdf", ".txt"];
const MAX_FILE_SIZE = 10 * 1024 * 1024;

export type { PRDMode };

type PRDInputProps = {
  mode: PRDMode;
  onModeChange: (mode: PRDMode) => void;
  text: string;
  onTextChange: (text: string) => void;
  file: File | null;
  onFileChange: (file: File | null) => void;
  hasExistingFile?: boolean;
  allowNone?: boolean;
};

export function PRDInput({
  mode,
  onModeChange,
  text,
  onTextChange,
  file,
  onFileChange,
  hasExistingFile,
  allowNone = false,
}: PRDInputProps) {
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;

    const ext = "." + f.name.split(".").pop()?.toLowerCase();
    if (!ACCEPTED_TYPES.includes(ext)) {
      return;
    }
    if (f.size > MAX_FILE_SIZE) {
      return;
    }
    onFileChange(f);
  };

  return (
    <div className="mb-4">
      <div className="font-[var(--font-mono)] text-[11px] uppercase tracking-[0.05em] text-[var(--muted)] mb-3">
        PRD Source
      </div>
      <div className="flex gap-2 mb-4">
        {allowNone && (
          <button
            type="button"
            onClick={() => { onModeChange("none"); onFileChange(null); onTextChange(""); }}
            className={`px-3 py-1.5 text-xs font-semibold rounded-[var(--radius-sm)] border transition-colors duration-[var(--motion-fast)] ${
              mode === "none"
                ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--fg)]"
            }`}
          >
            None
          </button>
        )}
        <button
          type="button"
          onClick={() => { onModeChange("text"); onFileChange(null); }}
          className={`px-3 py-1.5 text-xs font-semibold rounded-[var(--radius-sm)] border transition-colors duration-[var(--motion-fast)] ${
            mode === "text"
              ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
              : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--fg)]"
          }`}
        >
          Paste Text
        </button>
        <button
          type="button"
          onClick={() => { onModeChange("file"); onTextChange(""); }}
          className={`px-3 py-1.5 text-xs font-semibold rounded-[var(--radius-sm)] border transition-colors duration-[var(--motion-fast)] ${
            mode === "file"
              ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
              : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--fg)]"
          }`}
        >
          Upload File
        </button>
      </div>

      {mode === "text" && (
        <Textarea
          label="PRD Text"
          rows={6}
          placeholder="Paste your PRD here..."
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
        />
      )}

      {mode === "file" && (
        <label className={`flex flex-col items-center justify-center border-2 border-dashed rounded-[var(--radius-md)] p-8 cursor-pointer transition-colors duration-[var(--motion-fast)] ${
          file ? "border-[var(--accent)] bg-[var(--accent)]/5" : "border-[var(--border)] hover:border-[var(--accent)]"
        }`}>
          <input
            type="file"
            accept=".md,.pdf,.txt"
            className="hidden"
            onChange={handleFileChange}
          />
          {file ? (
            <div className="text-center">
              <div className="text-sm font-semibold text-[var(--fg)]">{file.name}</div>
              <div className="text-xs text-[var(--muted)] mt-1">
                {(file.size / 1024).toFixed(1)} KB — click to change
              </div>
            </div>
          ) : hasExistingFile ? (
            <div className="text-center">
              <div className="text-sm text-[var(--muted)]">A PRD file is uploaded — click to replace</div>
            </div>
          ) : (
            <div className="text-center">
              <div className="text-sm text-[var(--muted)]">Click to upload .md, .pdf, or .txt</div>
              <div className="text-xs text-[var(--muted)] mt-1">Max 10MB</div>
            </div>
          )}
        </label>
      )}
    </div>
  );
}
