"use client";

import { useState } from "react";
import { useFormContext } from "react-hook-form";
import { PRESETS, findPresetByUrl } from "@/lib/ai-presets";
import type { AIConfigFormValues } from "@/lib/schemas";

type AIConfigFormProps = {
  maskedKey?: string;
  showPresets?: boolean;
  showModelDropdown?: boolean;
};

export function AIConfigForm({
  maskedKey,
  showPresets = false,
  showModelDropdown = false,
}: AIConfigFormProps) {
  const { register, setValue, watch, formState: { errors } } = useFormContext<AIConfigFormValues>();
  const endpoint = watch("endpoint_url");
  const modelName = watch("model_name");
  const stagehandModelName = watch("stagehand_model_name");
  const [browserAiOpen, setBrowserAiOpen] = useState(!!stagehandModelName);

  const activePreset = findPresetByUrl(endpoint);

  const handlePreset = (provider: string) => {
    const p = PRESETS[provider];
    if (p) {
      setValue("endpoint_url", p.url, { shouldValidate: true });
      setValue("model_name", p.model, { shouldValidate: true });
      setValue("stagehand_model_name", p.fastModel);
    }
  };

  const inputClass = (hasError: boolean) =>
    `w-full px-3 py-[9px] border rounded-[var(--radius-sm)] text-sm bg-[var(--surface)] text-[var(--fg)] outline-none focus:border-[var(--accent)] focus:shadow-[var(--focus-ring)] transition-all duration-[var(--motion-fast)] placeholder:text-[var(--muted)] ${
      hasError ? "border-[var(--danger)]" : "border-[var(--border)]"
    }`;

  const presetModels = activePreset ? PRESETS[activePreset].models : [];
  const fastModel = activePreset ? PRESETS[activePreset].fastModel : null;

  return (
    <>
      {showPresets && (
        <div className="flex flex-wrap gap-2 mb-4">
          {Object.entries(PRESETS).map(([key, preset]) => (
            <button
              key={key}
              type="button"
              onClick={() => handlePreset(key)}
              className={`px-3 py-[5px] border rounded-[var(--radius-pill)] font-mono text-[11px] cursor-pointer transition-all duration-150 ${
                activePreset === key
                  ? "bg-[var(--accent)] text-[var(--accent-on)] border-[var(--accent)]"
                  : "border-[var(--border)] text-[var(--fg-2)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
              }`}
            >
              {preset.label}
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
            {presetModels.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
            <option value="__custom__">Custom...</option>
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

      <div className="border-t border-[var(--border-soft)] pt-4 mt-4">
        <button
          type="button"
          onClick={() => setBrowserAiOpen((v) => !v)}
          className="flex items-center gap-2 w-full text-left cursor-pointer group"
        >
          <svg
            className={`w-4 h-4 text-[var(--muted)] transition-transform duration-150 ${browserAiOpen ? "rotate-90" : ""}`}
            viewBox="0 0 16 16"
            fill="currentColor"
          >
            <path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-sm font-semibold text-[var(--fg)] group-hover:text-[var(--accent)] transition-colors">
            Browser AI
          </span>
          <span className="text-[11px] text-[var(--muted)] ml-1">optional</span>
        </button>

        {browserAiOpen && (
          <div className="mt-3 ml-6">
            <p className="text-xs text-[var(--muted)] mb-3">
              Separate model for browser reasoning (Stagehand). Defaults to your primary model if not set.
            </p>

            {showModelDropdown && activePreset ? (
              <div className="flex items-center gap-3 p-3 border border-[var(--border)] rounded-[var(--radius-sm)] bg-[var(--bg)] mb-3">
                <label className="font-mono text-xs text-[var(--muted)] uppercase tracking-wider whitespace-nowrap" htmlFor="stagehand-model">
                  Model
                </label>
                <select
                  id="stagehand-model"
                  value={stagehandModelName || ""}
                  className="flex-1 border-none bg-transparent font-inherit text-[var(--fg)] outline-none cursor-pointer"
                  {...register("stagehand_model_name")}
                >
                  <option value="">Use primary model</option>
                  {presetModels.map((m) => (
                    <option key={m} value={m}>{m}{m === fastModel ? " (recommended)" : ""}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="mb-3">
                <label className="block font-mono text-[11px] uppercase tracking-wider text-[var(--muted)] mb-2">
                  Stagehand Model
                </label>
                <input
                  type="text"
                  placeholder={fastModel ? `e.g. ${fastModel}` : "Defaults to primary model"}
                  className={`w-full max-w-[480px] ${inputClass(false)}`}
                  {...register("stagehand_model_name")}
                />
              </div>
            )}

            {fastModel && (
              <button
                type="button"
                onClick={() => setValue("stagehand_model_name", fastModel)}
                className="text-xs text-[var(--accent)] hover:underline cursor-pointer"
              >
                Use {fastModel} (fast default for {PRESETS[activePreset]?.label})
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}
