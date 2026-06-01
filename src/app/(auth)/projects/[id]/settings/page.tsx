"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation } from "convex/react";
import { api, asId, type Id } from "@/lib/convex";
import { Input, Select } from "@/components/ui/FormField";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { PRDInput } from "@/components/PRDInput";
import { projectSettingsSchema, type ProjectSettingsValues } from "@/lib/schemas";
import { TestDataSection } from "@/components/TestDataSection";
import { useFileUpload, type PRDMode } from "@/lib/use-file-upload";
import { normalizeAppUrl } from "@/lib/urls";
import Link from "next/link";

const KEEP_SENTINEL = "___KEEP___";

interface ProjectWithAuth {
  _id: string;
  name: string;
  app_url: string;
  prd_text?: string;
  prd_file_id?: string;
  explore_auth_mode?: "none" | "form" | "cookie";
  explore_login_url?: string;
  explore_username?: string;
  explore_password?: string;
  explore_cookie_name?: string;
  explore_cookie_value?: string;
  test_data?: Record<string, string>;
}

function asProjectWithAuth(p: unknown): ProjectWithAuth {
  return p as ProjectWithAuth;
}

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

  const [authMode, setAuthMode] = useState<"none" | "form" | "cookie">("none");
  const [authSaving, setAuthSaving] = useState(false);
  const [authSuccess, setAuthSuccess] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

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
    const p = asProjectWithAuth(project);
    form.reset({ name: p.name, app_url: p.app_url });
    setPrdText(p.prd_text ?? "");
    setPrdMode(p.prd_file_id ? "file" : "text");
    if (p.explore_auth_mode === "form" || p.explore_auth_mode === "cookie") {
      setAuthMode(p.explore_auth_mode);
    }
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

      await updateProject({ project_id: asProjectWithAuth(project)._id as Parameters<typeof updateProject>[0]["project_id"], ...updates });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  });

  const handleSaveAuth = async () => {
    setAuthError(null);
    setAuthSuccess(false);
    setAuthSaving(true);
    try {
      const updates: Record<string, unknown> = {
        project_id: asProjectWithAuth(project)._id,
        explore_auth_mode: authMode,
      };

      if (authMode === "form") {
        const loginUrl = (document.getElementById("explore_login_url") as HTMLInputElement)?.value ?? "";
        const username = (document.getElementById("explore_username") as HTMLInputElement)?.value ?? "";
        const password = (document.getElementById("explore_password") as HTMLInputElement)?.value ?? "";
        updates.explore_login_url = loginUrl;
        updates.explore_username = username;
        updates.explore_password = password || KEEP_SENTINEL;
      } else if (authMode === "cookie") {
        const cookieName = (document.getElementById("explore_cookie_name") as HTMLInputElement)?.value ?? "";
        const cookieValue = (document.getElementById("explore_cookie_value") as HTMLInputElement)?.value ?? "";
        updates.explore_cookie_name = cookieName;
        updates.explore_cookie_value = cookieValue || KEEP_SENTINEL;
      }

      await updateProject(updates as Parameters<typeof updateProject>[0]);
      setAuthSuccess(true);
      setTimeout(() => setAuthSuccess(false), 3000);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Failed to save auth config");
    } finally {
      setAuthSaving(false);
    }
  };

  const p = asProjectWithAuth(project);
  const maskedPassword = p.explore_password;
  const maskedCookieValue = p.explore_cookie_value;
  const storedLoginUrl = p.explore_login_url;
  const storedUsername = p.explore_username;
  const storedCookieName = p.explore_cookie_name;

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
          hasExistingFile={!!asProjectWithAuth(project).prd_file_id}
        />

        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] p-5 shadow-[var(--elev-raised)] mb-5">
        <h2 className="font-[var(--font-display)] text-xl font-bold mb-1 pb-4 border-b border-[var(--border-soft)]">
          Exploration Authentication
        </h2>
        <p className="text-sm text-[var(--muted)] mb-5">
          Configure how the explorer authenticates to reach inner pages behind login.
        </p>

        {authError && <Alert variant="error" className="mb-5">{authError}</Alert>}
        {authSuccess && <Alert variant="success" className="mb-5">Auth config saved</Alert>}

        <Select
          label="Authentication Mode"
          value={authMode}
          onChange={(e) => setAuthMode(e.target.value as "none" | "form" | "cookie")}
        >
          <option value="none">None — public pages only</option>
          <option value="form">Form Fill — auto-fill login form</option>
          <option value="cookie">Cookie Injection — inject session cookie</option>
        </Select>

        {authMode === "form" && (
          <>
            <Input
              id="explore_login_url"
              label="Login Page URL"
              placeholder="/login"
              hint="Defaults to the app URL if not set"
              defaultValue={storedLoginUrl ?? ""}
            />
            <Input
              id="explore_username"
              label="Username / Email"
              required
              defaultValue={storedUsername ?? ""}
            />
            <Input
              id="explore_password"
              label="Password"
              type="password"
              togglePassword
              required
              placeholder={maskedPassword ? "Leave blank to keep current" : undefined}
              defaultValue=""
            />
            {maskedPassword && (
              <p className="text-xs text-[var(--muted)] -mt-3 mb-5">
                Current: <span className="font-[var(--font-mono)]">{maskedPassword}</span>
              </p>
            )}
          </>
        )}

        {authMode === "cookie" && (
          <>
            <Input
              id="explore_cookie_name"
              label="Cookie Name"
              required
              placeholder="session_id"
              defaultValue={storedCookieName ?? ""}
            />
            <Input
              id="explore_cookie_value"
              label="Cookie Value"
              type="password"
              togglePassword
              required
              placeholder={maskedCookieValue ? "Leave blank to keep current" : undefined}
              defaultValue=""
            />
            {maskedCookieValue && (
              <p className="text-xs text-[var(--muted)] -mt-3 mb-5">
                Current: <span className="font-[var(--font-mono)]">{maskedCookieValue}</span>
              </p>
            )}
          </>
        )}

        <Button onClick={handleSaveAuth} disabled={authSaving}>
          {authSaving ? "Saving..." : "Save Auth Config"}
        </Button>
      </div>

      <TestDataSection
        projectId={asProjectWithAuth(project)._id as Id<"projects">}
        initialEntries={asProjectWithAuth(project).test_data}
      />
    </div>
  );
}
