"use client";

type KnowledgeBuildingProps = {
  progressMessage: string | null;
};

export function KnowledgeBuilding({ progressMessage }: KnowledgeBuildingProps) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <svg
        aria-hidden="true"
        className="animate-spin h-8 w-8 text-[var(--accent)] mb-4"
        viewBox="0 0 24 24"
        fill="none"
      >
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      <p className="text-sm text-[var(--fg)] font-medium">
        {progressMessage ?? "Building knowledge base..."}
      </p>
    </div>
  );
}
