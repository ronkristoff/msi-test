"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useForm, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/lib/convex";
import type { Doc } from "@/lib/convex";
import { AIConfigForm } from "@/components/AIConfigForm";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Input } from "@/components/ui/FormField";
import {
  aiConfigSchema,
  workspaceSettingsSchema,
  accountSchema,
  type AIConfigFormValues,
  type WorkspaceSettingsValues,
  type AccountValues,
} from "@/lib/schemas";

type WorkspaceMasked = Omit<Doc<"workspaces">, "ai_config"> & {
  ai_config: Omit<Doc<"workspaces">["ai_config"], "api_key"> & {
    api_key_masked: string;
  };
};

function useAutoDismissMessage(ms: number) {
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const show = useCallback((type: "success" | "error", text: string) => {
    setMessage({ type, text });
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setMessage(null), ms);
  }, [ms]);

  return { message, show };
}

function SettingsForm({
  user,
  workspace,
}: {
  user: { name: string; email: string };
  workspace: WorkspaceMasked;
}) {
  const updateWorkspace = useMutation(api.workspaces.mutations.updateWorkspace);
  const updateUserName = useMutation(api.users.mutations.updateUserName);
  const updateUserPassword = useMutation(api.users.mutations.updateUserPassword);

  const [saving, setSaving] = useState<string | null>(null);
  const { message, show: showMsg } = useAutoDismissMessage(3000);

  const aiForm = useForm<AIConfigFormValues>({
    resolver: zodResolver(aiConfigSchema),
    defaultValues: {
      endpoint_url: workspace.ai_config.endpoint_url,
      api_key: "",
      model_name: workspace.ai_config.model_name,
    },
  });

  const wsForm = useForm<WorkspaceSettingsValues>({
    resolver: zodResolver(workspaceSettingsSchema),
    defaultValues: { name: workspace.name },
  });

  const accountForm = useForm<AccountValues>({
    resolver: zodResolver(accountSchema),
    defaultValues: {
      name: user.name ?? "",
      email: user.email ?? "",
      currentPassword: "",
      newPassword: "",
    },
  });

  const handleSaveAI = aiForm.handleSubmit(async (data) => {
    setSaving("ai");
    try {
      const resolvedKey = data.api_key || "___KEEP___";
      await updateWorkspace({
        ai_config: { endpoint_url: data.endpoint_url, api_key: resolvedKey, model_name: data.model_name },
      });
      aiForm.reset({ ...data, api_key: "" });
      showMsg("success", "AI config saved");
    } catch (err) {
      showMsg("error", err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(null);
    }
  });

  const handleSaveWorkspace = wsForm.handleSubmit(async (data) => {
    setSaving("ws");
    try {
      await updateWorkspace({ name: data.name });
      showMsg("success", "Workspace updated");
    } catch (err) {
      showMsg("error", err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(null);
    }
  });

  const handleSaveAccount = accountForm.handleSubmit(async (data) => {
    setSaving("account");
    try {
      if (data.name.trim() !== (user.name ?? "")) {
        await updateUserName({ name: data.name });
      }
      if (data.currentPassword && data.newPassword) {
        await updateUserPassword({ currentPassword: data.currentPassword, newPassword: data.newPassword });
        accountForm.reset({ ...accountForm.getValues(), currentPassword: "", newPassword: "" });
      }
      showMsg("success", "Account updated");
    } catch (err) {
      showMsg("error", err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(null);
    }
  });

  const maskedKey = workspace.ai_config.api_key_masked ?? "••••••••";

  return (
    <div className="max-w-[720px]">
      {message && (
        <Alert variant={message.type} className="mb-5">{message.text}</Alert>
      )}

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] p-5 shadow-[var(--elev-raised)] mb-5">
        <h2 className="font-[var(--font-display)] text-xl font-bold mb-5 pb-4 border-b border-[var(--border-soft)]">
          AI Provider
        </h2>
        <FormProvider {...aiForm}>
          <AIConfigForm maskedKey={maskedKey} />
        </FormProvider>
        <Button onClick={handleSaveAI} disabled={saving === "ai"}>
          Save AI Config
        </Button>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] p-5 shadow-[var(--elev-raised)] mb-5">
        <h2 className="font-[var(--font-display)] text-xl font-bold mb-5 pb-4 border-b border-[var(--border-soft)]">
          Workspace
        </h2>
        <Input
          label="Workspace Name"
          error={wsForm.formState.errors.name?.message}
          className="max-w-[480px]"
          {...wsForm.register("name")}
        />
        <Button variant="secondary" onClick={handleSaveWorkspace} disabled={saving === "ws"}>
          Update Workspace
        </Button>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] p-5 shadow-[var(--elev-raised)] mb-5">
        <h2 className="font-[var(--font-display)] text-xl font-bold mb-5 pb-4 border-b border-[var(--border-soft)]">
          Account
        </h2>
        <div className="grid grid-cols-2 gap-4 mb-4 max-[600px]:grid-cols-1">
          <Input
            label="Full Name"
            error={accountForm.formState.errors.name?.message}
            {...accountForm.register("name")}
          />
          <Input
            label="Email"
            type="email"
            disabled
            className="[&_input]:opacity-60"
            {...accountForm.register("email")}
          />
        </div>
        <Input
          label="Current Password"
          type="password"
          placeholder="Enter current password to change"
          error={accountForm.formState.errors.currentPassword?.message}
          className="max-w-[480px]"
          {...accountForm.register("currentPassword")}
        />
        <Input
          label="New Password"
          type="password"
          placeholder="Min 8 characters"
          error={accountForm.formState.errors.newPassword?.message}
          className="max-w-[480px]"
          {...accountForm.register("newPassword")}
        />
        <Button variant="secondary" onClick={handleSaveAccount} disabled={saving === "account"}>
          Update Account
        </Button>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--danger)]/20 rounded-[var(--radius-md)] p-5 mb-5">
        <h2 className="font-[var(--font-display)] text-xl font-bold text-[var(--danger)] mb-2 pb-4 border-b border-[var(--danger)]/10">
          Danger Zone
        </h2>
        <p className="text-sm text-[var(--muted)] mb-4">
          Irreversible actions that affect your entire workspace and all associated data.
        </p>
        <div className="flex items-center justify-between p-4 border border-[var(--border)] rounded-[var(--radius-sm)] mb-3">
          <div>
            <div className="text-sm font-semibold text-[var(--fg)]">Delete workspace</div>
            <div className="text-xs text-[var(--muted)]">Permanently remove this workspace, all projects, suites, runs, and test data.</div>
          </div>
          <Button variant="danger" disabled>
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const user = useQuery(api.workspaces.queries.getCurrentUser);
  const workspace = useQuery(api.workspaces.queries.getWorkspaceForUser);

  if (user === undefined || workspace === undefined) {
    return <div className="text-[var(--muted)] text-sm">Loading...</div>;
  }
  if (!user || !workspace) {
    return <div className="text-[var(--muted)] text-sm">Not found</div>;
  }

  return <SettingsForm user={user} workspace={workspace} />;
}
