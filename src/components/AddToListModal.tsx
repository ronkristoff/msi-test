"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/lib/convex";
import type { Id } from "@/lib/convex";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

type AddToListModalProps = {
  testId: string;
  onClose: () => void;
};

export function AddToListModal({ testId, onClose }: AddToListModalProps) {
  const [error, setError] = useState<string | null>(null);
  const testLists = useQuery(api.test_lists.queries.getTestListsForTest, {
    test_id: testId as Id<"tests">,
  });
  const addTestToList = useMutation(api.test_lists.mutations.addTestToList);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] p-6 max-w-[400px] w-full shadow-[var(--elev-raised)]" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-[var(--font-display)] text-lg font-bold text-[var(--fg)] mb-4">
          Add to Test List
        </h3>
        {error && <Alert variant="error" className="mb-3">{error}</Alert>}
        <div className="space-y-2 max-h-[300px] overflow-y-auto">
          {testLists === undefined ? (
            <p className="text-sm text-[var(--muted)]">Loading...</p>
          ) : testLists.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No test lists yet. Create one from the Test Lists page.</p>
          ) : (
            testLists.map((list) => (
              <Button
                key={list._id}
                variant="secondary"
                size="sm"
                className="w-full text-left"
                disabled={list.contains_test}
                onClick={async () => {
                  try {
                    await addTestToList({
                      test_list_id: list._id as Id<"test_lists">,
                      test_id: testId as Id<"tests">,
                    });
                    onClose();
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Failed to add");
                  }
                }}
              >
                {list.name} {list.contains_test ? "✓" : ""}
              </Button>
            ))
          )}
        </div>
        <div className="flex justify-end mt-4">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
