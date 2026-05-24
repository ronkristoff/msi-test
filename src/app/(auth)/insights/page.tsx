"use client";

import { EmptyState } from "@/components/ui/EmptyState";

export default function InsightsPage() {
  return (
    <EmptyState
      icon={
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />
        </svg>
      }
      title="No AI insights yet"
      description="AI root cause analysis and flakiness clusters will appear here after test runs complete with failures."
    />
  );
}
