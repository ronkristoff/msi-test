"use client";

import type { ImpactAnalysis, AffectedEntity, BmadConflict } from "../../../convex/chat/impactSchema";

type ImpactAnalysisCardProps = {
  analysis: ImpactAnalysis;
  grounded?: boolean;
};

function confidenceColor(score: number): string {
  if (score >= 0.8) return "text-[var(--success, #16a34a)]";
  if (score >= 0.5) return "text-[var(--warning, #ca8a04)]";
  return "text-[var(--error, #dc2626)]";
}

function ConfidenceBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  return (
    <span
      className={`text-xs font-mono font-semibold ${confidenceColor(score)}`}
      aria-label={`Confidence: ${pct} percent`}
    >
      {pct}%
    </span>
  );
}

const conflictBadgeColors: Record<BmadConflict["type"], string> = {
  adr: "bg-[var(--error-bg, rgba(220,38,38,0.1))] text-[var(--error, #dc2626)]",
  convention:
    "bg-[var(--warning-bg, rgba(202,138,4,0.1))] text-[var(--warning, #ca8a04)]",
  prd: "bg-[var(--info-bg, rgba(59,130,246,0.1))] text-[var(--info, #3b82f6)]",
  duplicate:
    "bg-[var(--accent-bg, rgba(99,102,241,0.1))] text-[var(--accent, #6366f1)]",
};

function ConflictBadge({ conflict }: { conflict: BmadConflict }) {
  return (
    <span
      className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${conflictBadgeColors[conflict.type]}`}
    >
      {conflict.type}
    </span>
  );
}

function AffectedList({
  title,
  entities,
  emptyLabel,
}: {
  title: string;
  entities: AffectedEntity[];
  emptyLabel: string;
}) {
  return (
    <section aria-label={title}>
      <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)] mb-1">
        {title}
      </h3>
      {entities.length === 0 ? (
        <p className="text-sm italic text-[var(--muted)]">{emptyLabel}</p>
      ) : (
        <ul className="space-y-1.5">
          {entities.map((e, i) => (
            <li
              key={`${e.name}-${i}`}
              className="text-sm border-l-2 border-[var(--border)] pl-3"
            >
              <dl className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <dt className="font-medium text-[var(--fg)]">{e.name}</dt>
                  <dd>
                    <ConfidenceBadge score={e.confidence_score} />
                  </dd>
                </div>
                <dd className="text-[var(--muted)]">{e.reason}</dd>
                {e.bmad_conflicts && e.bmad_conflicts.length > 0 && (
                  <dd>
                    <div className="mt-1 space-y-1">
                      {e.bmad_conflicts.map((c, ci) => (
                        <div
                          key={`${c.reference}-${ci}`}
                          className="flex items-start gap-2 text-xs"
                        >
                          <ConflictBadge conflict={c} />
                          <span className="font-mono font-semibold text-[var(--fg)]">
                            {c.reference}
                          </span>
                          <span className="text-[var(--muted)]">{c.note}</span>
                        </div>
                      ))}
                    </div>
                  </dd>
                )}
              </dl>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function collectConflicts(analysis: ImpactAnalysis): Array<{
  entity: string;
  conflict: BmadConflict;
}> {
  const all: AffectedEntity[] = [
    ...analysis.affected_modules,
    ...analysis.affected_apis,
    ...analysis.affected_data_models,
    ...analysis.affected_user_flows,
    ...analysis.hidden_dependencies,
  ];
  const collected: Array<{ entity: string; conflict: BmadConflict }> = [];
  for (const entity of all) {
    if (entity.bmad_conflicts) {
      for (const conflict of entity.bmad_conflicts) {
        collected.push({ entity: entity.name, conflict });
      }
    }
  }
  return collected;
}

export function ImpactAnalysisCard({
  analysis,
  grounded = true,
}: ImpactAnalysisCardProps) {
  const allConflicts = collectConflicts(analysis);
  const hasConflicts = allConflicts.length > 0;

  return (
    <div className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-4 space-y-4">
      <div
        role="region"
        aria-label="Impact analysis summary"
        className="text-sm text-[var(--fg)] leading-relaxed"
      >
        <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)] mb-1">
          Impact Analysis
        </div>
        {analysis.summary}
      </div>

      {grounded === false && (
        <div
          role="status"
          aria-live="polite"
          className="text-xs p-2 rounded-[var(--radius-sm)] bg-[var(--warning-bg, rgba(202,138,4,0.1))] text-[var(--warning, #ca8a04)] border border-[var(--warning, #ca8a04)]"
        >
          Codebase grounding unavailable for this analysis. Confidence scores
          may be lower than usual.
        </div>
      )}

      <AffectedList
        title="Affected Modules"
        entities={analysis.affected_modules}
        emptyLabel="No affected modules identified."
      />
      <AffectedList
        title="Affected APIs"
        entities={analysis.affected_apis}
        emptyLabel="No affected APIs identified."
      />
      <AffectedList
        title="Affected Data Models"
        entities={analysis.affected_data_models}
        emptyLabel="No affected data models identified."
      />
      <AffectedList
        title="Affected User Flows"
        entities={analysis.affected_user_flows}
        emptyLabel="No affected user flows identified."
      />
      <AffectedList
        title="Hidden Dependencies"
        entities={analysis.hidden_dependencies}
        emptyLabel="No hidden dependencies identified."
      />

      {hasConflicts && (
        <section
          role="alert"
          aria-live="polite"
          aria-label="BMAD Conflicts"
          className="mt-2 p-3 rounded-[var(--radius-sm)] bg-[var(--error-bg, rgba(220,38,38,0.05))] border border-[var(--error, #dc2626)]"
        >
          <h3 className="text-sm font-semibold text-[var(--error, #dc2626)] mb-2">
            BMAD Conflicts
          </h3>
          <ul className="space-y-2">
            {allConflicts.map(({ entity, conflict }, i) => (
              <li
                key={`${entity}-${conflict.reference}-${i}`}
                className="flex items-start gap-2 text-xs"
              >
                <ConflictBadge conflict={conflict} />
                <span className="font-medium text-[var(--fg)]">{entity}</span>
                <span className="font-mono font-semibold text-[var(--fg)]">
                  {conflict.reference}
                </span>
                <span className="text-[var(--muted)]">{conflict.note}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
