"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation } from "convex/react";
import { api, asId } from "@/lib/convex";
import { Input } from "@/components/ui/FormField";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { PRDInput } from "@/components/PRDInput";
import { projectSettingsSchema, type ProjectSettingsValues } from "@/lib/schemas";
import { useFileUpload, type PRDMode } from "@/lib/use-file-upload";
import { normalizeAppUrl } from "@/lib/urls";
import Link from "next/link";

export default function ProjectSettingsPage() {
  const params = useParams<{ id: string }>();
  const projectId = asId(params.id, "projects");
  const project = useQuery(api.projects.queries.getProject, {
    project_id: projectId,
  });
  const updateProject = useMutation(api.projects.mutations.updateProject);
  const { upload } = useFileUpload();

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);
  const [prdMode, setPrdMode] = useState<PRDMode>("text");
  const [prdFile, setPrdFile] = useState<File | null>(null);
  const [prdText, setPrdText] = useState("");

  const form = useForm<ProjectSettingsValues>({
    resolver: zodResolver(projectSettingsSchema),
    defaultValues: { name: "", app_url: "" },
  });

  const isLoaded = project !== undefined;
  const notFound = isLoaded && !project;

  if (!isLoaded) {
    return <div className="text-[var(--muted)] text-sm">Loading...</div>;
  }

  if (notFound) {
    return (
      <EmptyState
        icon={
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />
          </svg>
        }
        title="Project not found"
        description="This project may have been deleted or you don't have access."
        action={
          <Link href="/projects">
            <Button variant="secondary">Back to Projects</Button>
          </Link>
        }
      />
    );
  }

  if (!form.formState.isDirty && form.getValues("name") === "" && project) {
    form.reset({ name: project.name, app_url: project.app_url });
    setPrdText(project.prd_text ?? "");
    setPrdMode(project.prd_file_id ? "file" : "text");
  }

  const handleSave = form.handleSubmit(async (data) => {
    setError(null);
    setSuccess(false);
    setSaving(true);
    try {
      const updates: Record<string, unknown> = {
        name: data.name,
        app_url: normalizeAppUrl(data.app_url),
      };

      if (prdMode === "text") {
        updates.prd_text = prdText;
        if (!prdText.trim()) updates.clear_prd = true;
      } else if (prdMode === "file" && prdFile) {
        const storageId = await upload(prdFile);
        updates.prd_file_id = asId(storageId, "_storage");
      }

      await updateProject({ project_id: project!._id, ...updates });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  });

  return (
    <div className="max-w-[720px]">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] p-5 shadow-[var(--elev-raised)] mb-5">
        <h2 className="font-[var(--font-display)] text-xl font-bold mb-5 pb-4 border-b border-[var(--border-soft)]">
          Project Settings
        </h2>

        {error && <Alert variant="error" className="mb-5">{error}</Alert>}
        {success && <Alert variant="success" className="mb-5">Project updated</Alert>}

        <Input
          label="Project Name"
          required
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

        <PRDInput
          mode={prdMode}
          onModeChange={setPrdMode}
          text={prdText}
          onTextChange={setPrdText}
          file={prdFile}
          onFileChange={setPrdFile}
          hasExistingFile={!!project?.prd_file_id}
        />

        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}
