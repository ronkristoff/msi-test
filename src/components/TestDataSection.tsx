"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/lib/convex";
import { Input } from "@/components/ui/FormField";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { testDataSchema, type TestDataEntryValues } from "@/lib/schemas";
import type { Id } from "@/lib/convex";

interface TestDataSectionProps {
  projectId: Id<"projects">;
  initialEntries?: Record<string, string>;
}

export function TestDataSection({ projectId, initialEntries }: TestDataSectionProps) {
  const updateProject = useMutation(api.projects.mutations.updateProject);

  const [entries, setEntries] = useState<TestDataEntryValues[]>(() =>
    initialEntries
      ? Object.entries(initialEntries).map(([key, value]) => ({ key, value }))
      : [],
  );
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setError(null);
    setSuccess(false);
    setSaving(true);
    try {
      const filtered = entries.filter((e) => e.key.trim() && e.value.trim());

      if (filtered.length > 0) {
        const result = testDataSchema.safeParse(filtered);
        if (!result.success) {
          setError(result.error.issues[0]?.message ?? "Invalid test data");
          return;
        }

        const test_data: Record<string, string> = {};
        for (const entry of filtered) {
          test_data[entry.key.trim()] = entry.value.trim();
        }
        await updateProject({ project_id: projectId, test_data });
      } else {
        await updateProject({ project_id: projectId, test_data: {} });
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save test data");
    } finally {
      setSaving(false);
    }
  };

  const addEntry = () => {
    setEntries([...entries, { key: "", value: "" }]);
  };

  const removeEntry = (index: number) => {
    setEntries(entries.filter((_, i) => i !== index));
  };

  const updateEntry = (index: number, field: "key" | "value", val: string) => {
    setEntries(
      entries.map((entry, i) =>
        i === index ? { ...entry, [field]: val } : entry,
      ),
    );
  };

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] p-5 shadow-[var(--elev-raised)] mb-5">
      <h2 className="font-[var(--font-display)] text-xl font-bold mb-1 pb-4 border-b border-[var(--border-soft)]">
        Test Data
      </h2>
      <p className="text-sm text-[var(--muted)] mb-5">
        Define key-value pairs to use as variables in test execution. Reference them in test code as <code className="font-[var(--font-mono)] bg-[var(--surface-hover)] px-1 py-0.5 rounded">%variable_name%</code>.
      </p>

      {error && <Alert variant="error" className="mb-5">{error}</Alert>}
      {success && <Alert variant="success" className="mb-5">Test data saved</Alert>}

      {entries.length === 0 ? (
        <p className="text-sm text-[var(--muted)] mb-5">
          No test data configured. The AI will generate plausible data during test runs.
        </p>
      ) : (
        <div className="space-y-3 mb-5">
          {entries.map((entry, index) => (
            <div key={index} className="flex gap-3 items-start">
              <Input
                label={`Key ${index + 1}`}
                placeholder="e.g. employee_name"
                value={entry.key}
                onChange={(e) => updateEntry(index, "key", e.target.value)}
                className="flex-1"
              />
              <Input
                label={`Value ${index + 1}`}
                placeholder="e.g. John Doe"
                value={entry.value}
                onChange={(e) => updateEntry(index, "value", e.target.value)}
                className="flex-1"
              />
              <button
                type="button"
                onClick={() => removeEntry(index)}
                className="mt-1 p-1.5 text-[var(--muted)] hover:text-[var(--danger)] transition-colors"
                aria-label="Remove entry"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M4 4l8 8M12 4l-8 8" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-3">
        <Button variant="secondary" onClick={addEntry}>
          Add Entry
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Test Data"}
        </Button>
      </div>
    </div>
  );
}
