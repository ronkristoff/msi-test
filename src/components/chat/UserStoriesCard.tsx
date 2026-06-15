"use client";

import type { UserStory } from "../../../convex/chat/storySchema";

type UserStoriesCardProps = {
  stories: UserStory[];
  generationNote?: string;
  grounded?: boolean;
};

function ChipList({
  label,
  values,
  emptyLabel,
}: {
  label: string;
  values: string[];
  emptyLabel: string;
}) {
  return (
    <section aria-label={label}>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)] mb-1">
        {label}
      </h4>
      {values.length === 0 ? (
        <p className="text-sm italic text-[var(--muted)]">{emptyLabel}</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {values.map((v, i) => (
            <li
              key={`${v}-${i}`}
              className="inline-block text-xs font-mono px-2 py-0.5 rounded-full bg-[var(--accent-bg, rgba(99,102,241,0.1))] text-[var(--accent, #6366f1)]"
            >
              {v}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function StoryCard({ story, index }: { story: UserStory; index: number }) {
  return (
    <section
      aria-label={`User story ${index + 1}: ${story.title}`}
      className="border border-[var(--border)] rounded-[var(--radius-sm)] p-3 space-y-3"
    >
      <h3 className="text-base font-semibold text-[var(--fg)]">
        {story.title}
      </h3>

      <dl className="space-y-1 text-sm">
        <div className="flex gap-1.5">
          <dt className="font-medium text-[var(--muted)]">As a</dt>
          <dd className="text-[var(--fg)]">{story.user_story.as_a}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="font-medium text-[var(--muted)]">I want</dt>
          <dd className="text-[var(--fg)]">{story.user_story.i_want}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="font-medium text-[var(--muted)]">So that</dt>
          <dd className="text-[var(--fg)]">{story.user_story.so_that}</dd>
        </div>
      </dl>

      <section aria-label="Acceptance criteria">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)] mb-1">
          Acceptance Criteria
        </h4>
        <ol className="list-decimal list-inside space-y-1 text-sm text-[var(--fg)]">
          {story.acceptance_criteria.map((c, i) => (
            <li key={`ac-${i}`}>{c}</li>
          ))}
        </ol>
      </section>

      <ChipList
        label="Affected Modules"
        values={story.affected_components.modules}
        emptyLabel="No affected modules identified."
      />
      <ChipList
        label="Affected APIs"
        values={story.affected_components.apis}
        emptyLabel="No affected APIs identified."
      />
      <ChipList
        label="Affected Data Models"
        values={story.affected_components.data_models}
        emptyLabel="No affected data models identified."
      />

      {story.technical_context && (
        <section
          aria-label="Technical context"
          className="text-xs p-2 rounded-[var(--radius-sm)] bg-[var(--info-bg, rgba(59,130,246,0.1))] text-[var(--info, #3b82f6)] border border-[var(--info, #3b82f6)]"
        >
          {story.technical_context}
        </section>
      )}
    </section>
  );
}

export function UserStoriesCard({
  stories,
  generationNote,
  grounded = true,
}: UserStoriesCardProps) {
  return (
    <div className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-4 space-y-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
        Generated User Stories
      </div>

      {grounded === false && (
        <div
          role="status"
          aria-live="polite"
          className="text-xs p-2 rounded-[var(--radius-sm)] bg-[var(--warning-bg, rgba(202,138,4,0.1))] text-[var(--warning, #ca8a04)] border border-[var(--warning, #ca8a04)]"
        >
          Codebase grounding unavailable for this generation. Affected
          components may be incomplete.
        </div>
      )}

      {stories.map((story, i) => (
        <StoryCard key={`story-${i}`} story={story} index={i} />
      ))}

      {generationNote && (
        <div className="text-sm italic text-[var(--muted)]">
          {generationNote}
        </div>
      )}
    </div>
  );
}
