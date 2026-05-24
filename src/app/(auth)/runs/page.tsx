"use client";

import { EmptyState } from "@/components/ui/EmptyState";

export default function RunsPage() {
  return (
    <EmptyState
      icon={
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
      }
      title="No runs yet"
      description="Test run history will appear here once you trigger your first suite execution."
    />
  );
}
