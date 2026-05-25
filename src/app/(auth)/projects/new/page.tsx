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

  const [step, setStep] = useState<1 | 2>(1);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [prdMode, setPrdMode] = useState<PRDMode>("none");
  const [prdFile, setPrdFile] = useState<File | null>(null);
  const [prdText, setPrdText] = useState("");

  const step1Form = useForm<ProjectStep1Values>({
    resolver: zodResolver(projectStep1Schema),
    defaultValues: { name: "", app_url: "" },
  });

  if (workspace === undefined) {
    return <div className="text-[var(--muted)] text-sm">Loading...</div>;
  }
  if (!workspace) {
    return <div className="text-[var(--muted)] text-sm">No workspace found</div>;
  }

  const handleStep1 = step1Form.handleSubmit(() => {
    setError(null);
    setStep(2);
  });

  const handleCreate = async () => {
    setError(null);
    setCreating(true);
    try {
      const name = step1Form.getValues("name");
      const appUrl = normalizeAppUrl(step1Form.getValues("app_url"));

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
  };

  return (
    <div className="max-w-[560px] mx-auto">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] p-6 shadow-[var(--elev-raised)]">
        <div className="flex items-center gap-3 mb-6 pb-4 border-b border-[var(--border-soft)]">
          <div className="flex items-center gap-2">
            <span className={`w-7 h-7 rounded-full text-xs font-bold grid place-items-center ${
              step >= 1 ? "bg-[var(--accent)] text-[var(--accent-on)]" : "bg-[var(--border-soft)] text-[var(--muted)]"
            }`}>1</span>
            <span className="text-sm font-semibold text-[var(--fg)]">Project Details</span>
          </div>
          <div className="w-8 h-px bg-[var(--border)]" />
          <div className="flex items-center gap-2">
            <span className={`w-7 h-7 rounded-full text-xs font-bold grid place-items-center ${
              step >= 2 ? "bg-[var(--accent)] text-[var(--accent-on)]" : "bg-[var(--border-soft)] text-[var(--muted)]"
            }`}>2</span>
            <span className="text-sm font-semibold text-[var(--fg)]">PRD (Optional)</span>
          </div>
        </div>

        {error && <Alert variant="error" className="mb-5">{error}</Alert>}

        {step === 1 && (
          <>
            <Input
              label="Project Name"
              required
              placeholder="My App"
              error={step1Form.formState.errors.name?.message}
              {...step1Form.register("name")}
            />
            <Input
              label="App URL"
              required
              placeholder="example.com"
              hint="https:// will be added automatically if missing"
              error={step1Form.formState.errors.app_url?.message}
              {...step1Form.register("app_url")}
            />
            <div className="flex justify-end">
              <Button onClick={handleStep1}>Continue</Button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <PRDInput
              mode={prdMode}
              onModeChange={setPrdMode}
              text={prdText}
              onTextChange={setPrdText}
              file={prdFile}
              onFileChange={setPrdFile}
              allowNone
            />

            <div className="flex items-center justify-between pt-4 border-t border-[var(--border-soft)]">
              <Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
              <Button onClick={handleCreate} disabled={creating}>
                {creating ? "Creating..." : "Create Project"}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
