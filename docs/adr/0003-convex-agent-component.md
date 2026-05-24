# ADR 0003: Use Convex Agent Component for AI Interactions

## Status

Accepted

## Context

The PRD's AI Provider Module described hand-rolling HTTP requests to OpenAI-compatible endpoints. Convex provides `@convex-dev/agent`, a first-party component built on the Vercel AI SDK (`ai` package) that handles thread/message persistence, streaming, usage tracking, rate limiting, and tool calling.

BYOK support (custom endpoint, API key, model) is needed. The AI SDK's `createOpenAI({ baseURL, apiKey })` from `@ai-sdk/openai` supports any OpenAI-compatible endpoint.

## Decision

Use `@convex-dev/agent` with the Vercel AI SDK for all AI interactions. The AI Provider Module configures Agent instances with the workspace's model settings and delegates to the Agent component.

BYOK is handled by creating an AI SDK OpenAI provider instance with the workspace's custom `baseURL` and `apiKey`. This supports GLM, OpenAI, DeepSeek, Mistral, Ollama, and any OpenAI-compatible provider.

## Consequences

- Thread/message persistence comes for free (exploration history, generation history).
- Streaming AI responses to the frontend via Convex subscriptions — no custom wiring.
- Built-in usage tracking per workspace (token counting).
- Built-in rate limiting to prevent API abuse.
- The agent playground is available for prompt debugging during development.
- The AI Provider Module becomes thinner — it configures Agents, not HTTP calls.
- We depend on `@convex-dev/agent` (v0.6.x), `ai` (v6.x), and `@ai-sdk/openai` (v3.x).
- Non-OpenAI-compatible providers (e.g., Anthropic native API) are not supported without additional provider packages. MVP scope is OpenAI-compatible only.
