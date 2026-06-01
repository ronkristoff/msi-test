"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "convex/react";
import { api } from "@/lib/convex";
import { Logo } from "@/components/Logo";
import { AIConfigForm } from "@/components/AIConfigForm";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { workspaceNameSchema, aiConfigSchema, type WorkspaceNameValues, type AIConfigFormValues } from "@/lib/schemas";

type OnboardingStep = 0 | 1 | 2 | 3;
const CHOOSE = 0;

export default function OnboardingPage() {
  const router = useRouter();
  const createWorkspace = useMutation(api.workspaces.mutations.createWorkspace);
  const joinWorkspace = useMutation(api.members.mutations.joinWorkspace);

  const [step, setStep] = useState<OnboardingStep>(CHOOSE);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [savedName, setSavedName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [joinName, setJoinName] = useState("");

  const nameForm = useForm<WorkspaceNameValues>({
    resolver: zodResolver(workspaceNameSchema),
    defaultValues: { name: "" },
  });

  const aiForm = useForm<AIConfigFormValues>({
    resolver: zodResolver(aiConfigSchema),
    defaultValues: {
      endpoint_url: "https://api.openai.com/v1",
      api_key: "",
      model_name: "gpt-4o",
    },
  });

  const goStep2 = nameForm.handleSubmit((data) => {
    setSavedName(data.name);
    setStep(2);
  });

  const handleCreate = aiForm.handleSubmit(async (data) => {
    setLoading(true);
    setSubmitError(null);
    try {
      await createWorkspace({
        name: savedName,
        ai_config: {
          endpoint_url: data.endpoint_url,
          api_key: data.api_key,
          model_name: data.model_name,
          stagehand_model_name: data.stagehand_model_name || undefined,
        },
      });
      setStep(3);
    } catch (err) {
      const msg = err instanceof Error
        ? err.message.replace(/^Uncaught (ConvexError:\s*)?/, "")
        : "Failed to create workspace";
      setSubmitError(msg || "Failed to create workspace");
    } finally {
      setLoading(false);
    }
  });

  const chevronRight = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
  );

  const cardClass = "w-full max-w-[480px] bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] p-8 shadow-[var(--elev-raised)]";

  return (
    <div className="min-h-screen flex flex-col items-center px-6 py-8">
      <div className="flex items-center gap-3 font-[var(--font-display)] text-xl font-black mb-12">
        <Logo />
        MSITest
      </div>

      <div className="flex items-center gap-3 mb-8">
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className={`w-2 h-2 rounded-full transition-colors duration-[var(--motion-fast)] ${
              step === CHOOSE
                ? "bg-[var(--border)]"
                : step > s
                  ? "bg-[var(--success)]"
                  : step === s
                    ? "bg-[var(--accent)]"
                    : "bg-[var(--border)]"
            }`}
          />
        ))}
      </div>

      {step === CHOOSE && (
        <div className={cardClass}>
          <h1 className="font-[var(--font-display)] text-[32px] font-bold text-[var(--fg)] mb-2 leading-tight">
            Get started
          </h1>
          <p className="text-sm text-[var(--muted)] mb-8 leading-relaxed">
            Create a new workspace or join an existing team.
          </p>

          <div className="space-y-3">
            <Button
              onClick={() => setStep(1)}
              icon={chevronRight}
              className="w-full py-[13px] px-6 text-base font-medium justify-center"
            >
              Create new workspace
            </Button>

            <div className="border-t border-[var(--border-soft)] pt-3">
              <div className="text-sm font-semibold text-[var(--fg)] mb-3">Join existing workspace</div>
              <input
                type="text"
                placeholder="Your name"
                value={joinName}
                onChange={(e) => setJoinName(e.target.value)}
                className="w-full px-3 py-[9px] border border-[var(--border)] rounded-[var(--radius-sm)] text-sm bg-[var(--surface)] text-[var(--fg)] outline-none focus:border-[var(--accent)] mb-2"
              />
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Invite code"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  maxLength={8}
                  className="flex-1 px-3 py-[9px] border border-[var(--border)] rounded-[var(--radius-sm)] text-sm font-mono tracking-wider bg-[var(--surface)] text-[var(--fg)] outline-none focus:border-[var(--accent)]"
                />
                <Button
                  onClick={async () => {
                    if (!inviteCode.trim() || !joinName.trim()) return;
                    setLoading(true);
                    setSubmitError(null);
                    try {
                      await joinWorkspace({ invite_code: inviteCode.trim(), user_name: joinName.trim() });
                      router.push("/dashboard");
                    } catch (err) {
                      setSubmitError(err instanceof Error ? err.message : "Failed to join workspace");
                    } finally {
                      setLoading(false);
                    }
                  }}
                  disabled={loading || !inviteCode.trim() || !joinName.trim()}
                >
                  {loading ? "Joining..." : "Join"}
                </Button>
              </div>
              {submitError && step === CHOOSE && (
                <p className="text-xs text-[var(--danger)] mt-2">{submitError}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className={cardClass}>
          <h1 className="font-[var(--font-display)] text-[32px] font-bold text-[var(--fg)] mb-2 leading-tight">
            Name your workspace
          </h1>
          <p className="text-sm text-[var(--muted)] mb-8 leading-relaxed">
            Your workspace holds projects, test suites, and run history. You can add teammates later.
          </p>

          <div className="mb-5">
            <label className="block text-sm font-semibold text-[var(--fg)] mb-2" htmlFor="ws-name">
              Workspace name{" "}
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--danger)] ml-1">
                ● Required
              </span>
            </label>
            <input
              id="ws-name"
              type="text"
              placeholder="Acme Corp QA"
              autoComplete="organization"
              className={`w-full px-3 py-[9px] border rounded-[var(--radius-sm)] text-sm bg-[var(--surface)] text-[var(--fg)] outline-none focus:border-[var(--accent)] focus:shadow-[var(--focus-ring)] transition-all duration-[var(--motion-fast)] placeholder:text-[var(--muted)] ${
                nameForm.formState.errors.name ? "border-[var(--danger)]" : "border-[var(--border)]"
              }`}
              {...nameForm.register("name")}
            />
            {nameForm.formState.errors.name && (
              <p className="text-xs text-[var(--danger)] mt-1">{nameForm.formState.errors.name.message}</p>
            )}
          </div>

          <Button onClick={goStep2} icon={chevronRight} className="w-full py-[13px] px-6 text-base font-medium">
            Continue
          </Button>
        </div>
      )}

      {step === 2 && (
        <div className={cardClass}>
          <h1 className="font-[var(--font-display)] text-[32px] font-bold text-[var(--fg)] mb-2 leading-tight">
            Configure your AI provider
          </h1>
          <p className="text-sm text-[var(--muted)] mb-8 leading-relaxed">
            MSITest uses your LLM to generate tests, analyze failures, and identify flakiness clusters. Enter your OpenAI-compatible endpoint details below.
          </p>

          {submitError && (
            <Alert variant="error" className="mb-4">{submitError}</Alert>
          )}

          <FormProvider {...aiForm}>
            <AIConfigForm showPresets showModelDropdown />
          </FormProvider>

          <Button
            variant="ghost"
            onClick={() => setStep(1)}
            icon={
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
            }
            className="mb-3"
          >
            Back
          </Button>

          <Button
            onClick={handleCreate}
            disabled={loading}
            icon={loading ? undefined : chevronRight}
            className="w-full py-[13px] px-6 text-base font-medium"
          >
            {loading ? "Creating..." : "Create workspace"}
          </Button>
        </div>
      )}

      {step === 3 && (
        <div className={cardClass}>
          <div className="text-center py-8">
            <div className="w-14 h-14 rounded-full bg-[rgba(0,100,0,0.1)] border border-[var(--success)] grid place-items-center mx-auto mb-6">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
            </div>
            <h2 className="font-[var(--font-display)] text-2xl font-bold text-[var(--fg)] mb-2">
              Workspace ready
            </h2>
            <p className="text-sm text-[var(--muted)] mb-6">
              Your workspace is set up and connected to your AI provider. Create your first project to start generating tests.
            </p>
            <Button onClick={() => router.push("/dashboard")} icon={chevronRight} className="py-[13px] px-8 text-base font-medium">
              Go to dashboard
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
