"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation } from "convex/react";
import { api, asId } from "@/lib/convex";
import { Input } from "@/components/ui/FormField";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { projectStep1Schema, type ProjectStep1Values } from "@/lib/schemas";
import { useFileUpload, type PRDMode } from "@/lib/use-file-upload";
import { PRDInput } from "@/components/PRDInput";
import { normalizeAppUrl } from "@/lib/urls";

export default function NewProjectPage() {
  const router = useRouter();
  const workspace = useQuery(api.workspaces.queries.getWorkspaceForUser);
  const createProject = useMutation(api.projects.mutations.createProject);
  const { upload } = useFileUpload();

  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [prdMode, setPrdMode] = useState<PRDMode>("none");
  const [prdFile, setPrdFile] = useState<File | null>(null);
  const [prdText, setPrdText] = useState("");
  const [showPrd, setShowPrd] = useState(false);

  const form = useForm<ProjectStep1Values>({
    resolver: zodResolver(projectStep1Schema),
    defaultValues: { name: "", app_url: "" },
  });

  if (workspace === undefined) {
    return <div className="text-[var(--muted)] text-sm">Loading...</div>;
  }
  if (!workspace) {
    return <div className="text-[var(--muted)] text-sm">No workspace found</div>;
  }

  const handleCreate = form.handleSubmit(async () => {
    setError(null);
    setCreating(true);
    try {
      const name = form.getValues("name");
      const appUrl = normalizeAppUrl(form.getValues("app_url"));

      let prdTextValue: string | undefined;
      let prdFileId: string | undefined;

      if (prdMode === "text" && prdText.trim()) {
        prdTextValue = prdText.trim();
      } else if (prdMode === "file" && prdFile) {
        prdFileId = await upload(prdFile);
      }

      const projectId = await createProject({
        workspace_id: workspace._id,
        name,
        app_url: appUrl,
        prd_text: prdTextValue,
        prd_file_id: prdFileId ? asId(prdFileId, "_storage") : undefined,
      });

      router.push(`/projects/${projectId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project");
    } finally {
      setCreating(false);
    }
  });

  return (
    <div className="max-w-[680px] mx-auto">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] p-6 shadow-[var(--elev-raised)]">
        <h2 className="font-[var(--font-display)] text-xl font-bold text-[var(--fg)] mb-1">
          New Project
        </h2>
        <p className="text-sm text-[var(--muted)] mb-6">
          Define the application you want to test.
        </p>

        {error && <Alert variant="error" className="mb-5">{error}</Alert>}

        <div className="grid grid-cols-2 gap-4 max-[600px]:grid-cols-1">
          <Input
            label="Project Name"
            required
            placeholder="My App"
            error={form.formState.errors.name?.message}
            {...form.register("name")}
          />
          <Input
            label="App URL"
            required
            placeholder="example.com"
            hint="https:// will be added automatically if missing"
            error={form.formState.errors.app_url?.message}
            {...form.register("app_url")}
          />
        </div>

        <div className="border-t border-[var(--border-soft)] mt-2 pt-4">
          <button
            type="button"
            onClick={() => setShowPrd(!showPrd)}
            className="flex items-center gap-2 text-sm font-medium text-[var(--muted)] hover:text-[var(--fg)] transition-colors duration-[var(--motion-fast)] mb-4"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`transition-transform duration-[var(--motion-fast)] ${showPrd ? "rotate-90" : ""}`}
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
            Add a PRD (optional)
            {prdMode !== "none" && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-[var(--radius-pill)] bg-[var(--accent)]/10 text-[10px] font-medium text-[var(--accent)]">
                Added
              </span>
            )}
          </button>

          {showPrd && (
            <PRDInput
              mode={prdMode}
              onModeChange={setPrdMode}
              text={prdText}
              onTextChange={setPrdText}
              file={prdFile}
              onFileChange={setPrdFile}
              allowNone
            />
          )}
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-[var(--border-soft)]">
          <Button variant="secondary" onClick={() => router.push("/projects")}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={creating}>
            {creating ? "Creating..." : "Create Project"}
          </Button>
        </div>
      </div>
    </div>
  );
}
