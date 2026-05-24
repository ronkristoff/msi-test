"use client";

import { EmptyState } from "@/components/ui/EmptyState";

export default function SuitesPage() {
  return (
    <EmptyState
      icon={
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
      }
      title="No suites yet"
      description="Test suites are created automatically when you generate tests from exploration, PRD, or natural language."
    />
  );
}
