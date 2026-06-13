"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import type { Doc } from "@/lib/convex";
import { ModuleSection } from "./ModuleSection";

type ModuleSummary = { _id: string; name: string };

type ModuleDetailProps = {
  module: Doc<"kb_modules">;
  projectId: string;
  moduleList: ModuleSummary[] | null | undefined;
};

type ApiItem = {
  path?: string;
  method?: string;
  description?: string;
  request_shape?: string;
  response_shape?: string;
};

type DataModelItem = {
  name?: string;
  type?: string;
  fields?: unknown;
  relationships?: unknown;
};

type UserFlowItem = {
  name?: string;
  route?: string;
  description?: string;
  components?: unknown;
};

function safeStr(val: unknown, fallback: string): string {
  return typeof val === "string" ? val : fallback;
}

function safeStrArray(val: unknown): string[] {
  if (!Array.isArray(val)) return [];
  return val.filter((e): e is string => typeof e === "string");
}

function isValidItem(item: unknown): item is Record<string, unknown> {
  return item != null && typeof item === "object";
}

function renderApiItem(item: unknown, idx: number): ReactNode {
  if (!isValidItem(item)) return null;
  const api = item as Partial<ApiItem>;
  const method = safeStr(api.method, "\u2014");
  return (
    <div key={`api-${idx}`} className="py-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center px-2 py-0.5 rounded-[var(--radius-sm)] bg-[var(--accent)]/10 text-[var(--accent)] font-[var(--font-mono)] text-xs font-semibold">
          {method}
        </span>
        <code className="text-sm text-[var(--fg)] font-[var(--font-mono)]">
          {safeStr(api.path, "Unknown path")}
        </code>
      </div>
      <p className="text-sm text-[var(--muted)] mt-1">
        {safeStr(api.description, "\u2014")}
      </p>
      <div className="text-xs mt-1">
        <span className="text-[var(--muted)]">Request: </span>
        <code className="font-[var(--font-mono)] text-[var(--fg)]">
          {safeStr(api.request_shape, "\u2014")}
        </code>
      </div>
      <div className="text-xs mt-1">
        <span className="text-[var(--muted)]">Response: </span>
        <code className="font-[var(--font-mono)] text-[var(--fg)]">
          {safeStr(api.response_shape, "\u2014")}
        </code>
      </div>
    </div>
  );
}

function renderDataModelItem(item: unknown, idx: number): ReactNode {
  if (!isValidItem(item)) return null;
  const model = item as Partial<DataModelItem>;
  const fields = safeStrArray(model.fields);
  const relationships = safeStrArray(model.relationships);
  return (
    <div key={`model-${idx}`} className="py-2">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-[var(--fg)]">
          {safeStr(model.name, "Unknown")}
        </span>
        <span className="inline-flex items-center px-2 py-0.5 rounded-[var(--radius-sm)] bg-[var(--border-soft)] text-[var(--muted)] font-[var(--font-mono)] text-xs">
          {safeStr(model.type, "\u2014")}
        </span>
      </div>
      <div className="text-xs mt-1">
        <span className="text-[var(--muted)]">Fields: </span>
        <code className="font-[var(--font-mono)] text-[var(--fg)]">
          {fields.length > 0 ? fields.join(", ") : "\u2014"}
        </code>
      </div>
      <div className="text-xs mt-1">
        <span className="text-[var(--muted)]">Relationships: </span>
        <code className="font-[var(--font-mono)] text-[var(--fg)]">
          {relationships.length > 0 ? relationships.join(", ") : "\u2014"}
        </code>
      </div>
    </div>
  );
}

function renderUserFlowItem(item: unknown, idx: number): ReactNode {
  if (!isValidItem(item)) return null;
  const flow = item as Partial<UserFlowItem>;
  const components = safeStrArray(flow.components);
  return (
    <div key={`flow-${idx}`} className="py-2">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-[var(--fg)]">
          {safeStr(flow.name, "Unknown")}
        </span>
        <code className="text-xs font-[var(--font-mono)] text-[var(--accent)]">
          {safeStr(flow.route, "\u2014")}
        </code>
      </div>
      <p className="text-sm text-[var(--muted)] mt-1">
        {safeStr(flow.description, "\u2014")}
      </p>
      <div className="text-xs mt-1">
        <span className="text-[var(--muted)]">Components: </span>
        <code className="font-[var(--font-mono)] text-[var(--fg)]">
          {components.length > 0 ? components.join(", ") : "\u2014"}
        </code>
      </div>
    </div>
  );
}

export function ModuleDetail({ module, projectId, moduleList }: ModuleDetailProps) {
  const apis = Array.isArray(module.apis) ? module.apis : [];
  const dataModels = Array.isArray(module.data_models) ? module.data_models : [];
  const userFlows = Array.isArray(module.user_flows) ? module.user_flows : [];
  const files = Array.isArray(module.files) ? module.files : [];
  const dependencies = Array.isArray(module.dependencies) ? module.dependencies : [];

  const moduleNameToId = new Map<string, string>();
  if (moduleList) {
    for (const m of moduleList) {
      moduleNameToId.set(m.name, m._id);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] p-5 shadow-[var(--elev-raised)]">
        {module.description && (
          <p className="text-sm text-[var(--fg)] leading-relaxed mb-4">
            {module.description}
          </p>
        )}
        <div className="flex gap-6">
          <div>
            <div className="font-[var(--font-mono)] text-[11px] uppercase tracking-[0.05em] text-[var(--muted)]">
              Files
            </div>
            <div className="text-lg font-bold text-[var(--fg)]">
              {module.file_count ?? files.length}
            </div>
          </div>
          <div>
            <div className="font-[var(--font-mono)] text-[11px] uppercase tracking-[0.05em] text-[var(--muted)]">
              Dependencies
            </div>
            <div className="text-lg font-bold text-[var(--fg)]">
              {dependencies.length}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] p-5 shadow-[var(--elev-raised)]">
        <h3 className="font-[var(--font-display)] text-lg font-bold text-[var(--fg)] mb-3">
          Dependencies
        </h3>
        {dependencies.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {dependencies.map((dep, idx) => {
              const depModuleId = moduleNameToId.get(dep);
              const className = "inline-flex items-center px-2.5 py-1 rounded-[var(--radius-pill)] bg-[var(--border-soft)] text-[var(--fg)] font-[var(--font-mono)] text-xs font-medium transition-colors duration-[var(--motion-fast)]";
              if (depModuleId) {
                return (
                  <Link
                    key={`dep-${idx}`}
                    href={`/projects/${projectId}/knowledge/modules/${depModuleId}`}
                    className={`${className} hover:bg-[var(--accent)]/10 hover:text-[var(--accent)]`}
                  >
                    {dep}
                  </Link>
                );
              }
              return (
                <span key={`dep-${idx}`} className={className}>
                  {dep}
                </span>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-[var(--muted)]">No dependencies</p>
        )}
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] p-5 shadow-[var(--elev-raised)]">
        <h3 className="font-[var(--font-display)] text-lg font-bold text-[var(--fg)] mb-3">
          Files
        </h3>
        {files.length > 0 ? (
          <div className="max-h-[300px] overflow-y-auto flex flex-col gap-1">
            {files.map((file, idx) => (
              <code
                key={`file-${idx}`}
                className="text-xs font-[var(--font-mono)] text-[var(--fg)] block truncate"
                title={file}
              >
                {file}
              </code>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[var(--muted)]">No file paths recorded</p>
        )}
      </div>

      <ModuleSection
        title="APIs"
        items={apis}
        renderItem={renderApiItem}
        emptyMessage="No APIs detected"
      />

      <ModuleSection
        title="Data Models"
        items={dataModels}
        renderItem={renderDataModelItem}
        emptyMessage="No data models detected"
      />

      <ModuleSection
        title="User Flows"
        items={userFlows}
        renderItem={renderUserFlowItem}
        emptyMessage="No user flows detected"
      />
    </div>
  );
}
