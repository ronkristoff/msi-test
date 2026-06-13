"use client";

import { useQuery } from "convex/react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api, asId } from "@/lib/convex";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { useErrorLogger } from "@/lib/error-logger";
import { ModuleDetail } from "./ModuleDetail";

export default function ModuleDetailPage() {
  const params = useParams<{ id: string; moduleId: string }>();
  const projectId = params.id;
  const moduleId = asId(params.moduleId, "kb_modules");
  useErrorLogger();

  const moduleData = useQuery(api.knowledge.queries.getModule, {
    module_id: moduleId,
  });

  const moduleList = useQuery(
    api.knowledge.queries.getModules,
    moduleData ? { knowledge_base_id: moduleData.knowledge_base_id } : "skip",
  );

  if (moduleData === undefined) {
    return <PageSkeleton />;
  }

  if (moduleData === null) {
    return (
      <div className="max-w-[1080px]">
        <EmptyState
          icon={
            <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
          }
          title="Module not found"
          description="This module may have been removed during re-analysis."
          action={
            <Link href={`/projects/${projectId}/knowledge`}>
              <Button variant="secondary">Back to Knowledge</Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="max-w-[1080px]">
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <h2 className="font-[var(--font-display)] text-2xl font-bold text-[var(--fg)]">
            {moduleData.name}
          </h2>
          <Link href={`/projects/${projectId}/knowledge`} className="ml-auto">
            <Button variant="secondary" size="sm">
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
              </svg>
              Back to Knowledge
            </Button>
          </Link>
        </div>
      </div>

      <ModuleDetail
        module={moduleData}
        projectId={projectId}
        moduleList={moduleList}
      />
    </div>
  );
}
