"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation } from "convex/react";
import { useParams } from "next/navigation";
import { api, asId } from "@/lib/convex";
import { Input } from "@/components/ui/FormField";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { environmentSchema, type EnvironmentValues } from "@/lib/schemas";
import { useErrorLogger } from "@/lib/error-logger";

type EditingState =
  | { mode: "idle" }
  | { mode: "create" }
  | { mode: "edit"; id: string; name: string; base_url: string };

export default function EnvironmentsPage() {
  const params = useParams<{ id: string }>();
  const projectId = asId(params.id, "projects");
  const { logError } = useErrorLogger();

  const environments = useQuery(api.environments.queries.getEnvironments, {
    project_id: projectId,
  });
  const createEnv = useMutation(api.environments.mutations.createEnvironment);
  const updateEnv = useMutation(api.environments.mutations.updateEnvironment);
  const deleteEnv = useMutation(api.environments.mutations.deleteEnvironment);

  const [editing, setEditing] = useState<EditingState>({ mode: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const form = useForm<EnvironmentValues>({
    resolver: zodResolver(environmentSchema),
    defaultValues: { name: "", base_url: "" },
  });

  const startCreate = () => {
    setEditing({ mode: "create" });
    form.reset({ name: "", base_url: "" });
    setError(null);
  };

  const startEdit = (env: { _id: string; name: string; base_url: string }) => {
    setEditing({ mode: "edit", id: env._id, name: env.name, base_url: env.base_url });
    form.reset({ name: env.name, base_url: env.base_url });
    setError(null);
  };

  const cancel = () => {
    setEditing({ mode: "idle" });
    setError(null);
  };

  const handleSubmit = form.handleSubmit(async (data) => {
    setError(null);
    try {
      if (editing.mode === "create") {
        await createEnv({ project_id: projectId, name: data.name, base_url: data.base_url });
      } else if (editing.mode === "edit") {
        await updateEnv({
          environment_id: asId(editing.id, "environments"),
          name: data.name,
          base_url: data.base_url,
        });
      }
      setEditing({ mode: "idle" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save";
      setError(msg);
      logError(msg, { severity: "error", context: { source: "EnvironmentsPage.handleSubmit" } });
    }
  });

  const handleDelete = async (envId: string) => {
    setError(null);
    setDeleting(envId);
    try {
      await deleteEnv({ environment_id: asId(envId, "environments") });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to delete";
      setError(msg);
      logError(msg, { severity: "error", context: { source: "EnvironmentsPage.handleDelete" } });
    } finally {
      setDeleting(null);
    }
  };

  if (environments === undefined) {
    return <div className="text-[var(--muted)] text-sm">Loading...</div>;
  }

  return (
    <div className="max-w-[720px]">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] p-5 shadow-[var(--elev-raised)]">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-[var(--border-soft)]">
          <h3 className="font-[var(--font-display)] text-lg font-bold text-[var(--fg)]">
            Environments
          </h3>
          {editing.mode === "idle" && (
            <Button
              variant="secondary"
              size="sm"
              onClick={startCreate}
              icon={
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              }
            >
              Add Environment
            </Button>
          )}
        </div>

        {error && <Alert variant="error" className="mb-4">{error}</Alert>}

        {editing.mode !== "idle" && (
          <form onSubmit={handleSubmit} className="mb-4 pb-4 border-b border-[var(--border-soft)]">
            <div className="grid grid-cols-2 gap-4 max-[600px]:grid-cols-1">
              <Input
                label="Name"
                required
                placeholder="e.g. Staging"
                error={form.formState.errors.name?.message}
                {...form.register("name")}
              />
              <Input
                label="Base URL"
                required
                placeholder="e.g. staging.myapp.com"
                hint="https:// will be added automatically if missing"
                error={form.formState.errors.base_url?.message}
                {...form.register("base_url")}
              />
            </div>
            <div className="flex gap-2 mt-2">
              <Button type="submit" size="sm">
                {editing.mode === "create" ? "Create" : "Save"}
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={cancel}>
                Cancel
              </Button>
            </div>
          </form>
        )}

        {environments.length === 0 && editing.mode === "idle" ? (
          <EmptyState
            icon={
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
              </svg>
            }
            title="No environments"
            description="Add deployment targets like staging or production to run tests against."
          />
        ) : (
          <div className="divide-y divide-[var(--border-soft)]">
            {environments.map((env) => (
              <div
                key={env._id}
                className="flex items-center justify-between py-3 px-1 -mx-1 rounded-[var(--radius-sm)] hover:bg-[var(--border-soft)] transition-colors duration-[var(--motion-fast)]"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-[var(--fg)]">{env.name}</div>
                  <a
                    href={env.base_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[var(--accent)] hover:underline"
                  >
                    {env.base_url}
                  </a>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => startEdit(env)}
                    disabled={editing.mode !== "idle"}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleDelete(env._id)}
                    disabled={deleting === env._id}
                  >
                    {deleting === env._id ? "Deleting..." : "Delete"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
