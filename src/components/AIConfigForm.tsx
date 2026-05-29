"use client";

import { useFormContext } from "react-hook-form";
import { PRESETS, MODELS } from "@/lib/ai-presets";
import { useState } from "react";
import type { AIConfigFormValues } from "@/lib/schemas";

type AIConfigFormProps = {
  maskedKey?: string;
  showPresets?: boolean;
  showModelDropdown?: boolean;
};

export function presetLabel(provider: string): string {
  if (provider === "z.ai") return "Z.AI";
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

export function AIConfigForm({
  maskedKey,
  showPresets = false,
  showModelDropdown = false,
}: AIConfigFormProps) {
  const { register, setValue, watch, formState: { errors } } = useFormContext<AIConfigFormValues>();
  const endpoint = watch("endpoint_url");
  const modelName = watch("model_name");

  const [activePreset, setActivePreset] = useState(
    endpoint ? Object.entries(PRESETS).find(([, p]) => p.url === endpoint)?.[0] ?? "openai" : "openai",
  );

  const handlePreset = (provider: string) => {
    setActivePreset(provider);
    const p = PRESETS[provider];
    if (p) {
      setValue("endpoint_url", p.url, { shouldValidate: true });
      setValue("model_name", p.model, { shouldValidate: true });
    }
  };

  const inputClass = (hasError: boolean) =>
    `w-full px-3 py-[9px] border rounded-[var(--radius-sm)] text-sm bg-[var(--surface)] text-[var(--fg)] outline-none focus:border-[var(--accent)] focus:shadow-[var(--focus-ring)] transition-all duration-[var(--motion-fast)] placeholder:text-[var(--muted)] ${
      hasError ? "border-[var(--danger)]" : "border-[var(--border)]"
    }`;

  return (
    <>
      {showPresets && (
        <div className="flex flex-wrap gap-2 mb-4">
          {Object.keys(PRESETS).map((provider) => (
            <button
              key={provider}
              type="button"
              onClick={() => handlePreset(provider)}
              className={`px-3 py-[5px] border rounded-[var(--radius-pill)] font-mono text-[11px] cursor-pointer transition-all duration-150 ${
                activePreset === provider
                  ? "bg-[var(--accent)] text-[var(--accent-on)] border-[var(--accent)]"
                  : "border-[var(--border)] text-[var(--fg-2)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
              }`}
            >
              {presetLabel(provider)}
            </button>
          ))}
        </div>
      )}

      <div className="mb-5">
        <label className="block text-sm font-semibold text-[var(--fg)] mb-2" htmlFor="endpoint">
          Endpoint URL{" "}
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--danger)] ml-1">
            ● Required
          </span>
        </label>
        <input
          id="endpoint"
          type="url"
          className={inputClass(!!errors.endpoint_url)}
          {...register("endpoint_url")}
        />
        <p className="font-mono text-xs text-[var(--muted)] mt-1">
          OpenAI-compatible base URL. Use the Z.AI Coding endpoint for GLM Coding Plan, or any other compatible provider.
        </p>
        {errors.endpoint_url && (
          <p className="text-xs text-[var(--danger)] mt-1">{errors.endpoint_url.message}</p>
        )}
      </div>

      {showModelDropdown && (
        <div className="flex items-center gap-3 p-3 border border-[var(--border)] rounded-[var(--radius-sm)] bg-[var(--bg)] mb-4">
          <label className="font-mono text-xs text-[var(--muted)] uppercase tracking-wider whitespace-nowrap" htmlFor="model">
            Model
          </label>
          <select
            id="model"
            value={modelName}
            className="flex-1 border-none bg-transparent font-inherit text-[var(--fg)] outline-none cursor-pointer"
            {...register("model_name")}
          >
            {MODELS.map((m) => (
              <option key={m} value={m}>{m === "custom" ? "Custom..." : m}</option>
            ))}
          </select>
        </div>
      )}

      {!showModelDropdown && (
        <div className="mb-5">
          <label className="block font-mono text-[11px] uppercase tracking-wider text-[var(--muted)] mb-2">
            Model Name
          </label>
          <input
            type="text"
            className={`w-full max-w-[480px] ${inputClass(!!errors.model_name)}`}
            {...register("model_name")}
          />
          {errors.model_name && (
            <p className="text-xs text-[var(--danger)] mt-1">{errors.model_name.message}</p>
          )}
        </div>
      )}

      <div className="mb-5">
        <label className="block text-sm font-semibold text-[var(--fg)] mb-2" htmlFor="api-key">
          API key{" "}
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--danger)] ml-1">
            ● Required
          </span>
        </label>
        <input
          id="api-key"
          type="password"
          placeholder={maskedKey ?? "sk-..."}
          autoComplete="off"
          className={inputClass(!!errors.api_key)}
          {...register("api_key")}
        />
        <p className="font-mono text-xs text-[var(--muted)] mt-1">
          {maskedKey
            ? "Leave blank to keep current key. Your API key is stored securely and never sent to the browser."
            : "Your API key is stored securely and never exposed to the browser."}
        </p>
        {errors.api_key && (
          <p className="text-xs text-[var(--danger)] mt-1">{errors.api_key.message}</p>
        )}
      </div>
    </>
  );
}
