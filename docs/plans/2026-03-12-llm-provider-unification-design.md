# LLM Provider Unification Design

## Goal

Add configurable LLM backends for `lmstudio`, `openai`, and `openrouter` without breaking the existing `ollama` path.

## Recommended approach

Keep `ollama` as a dedicated adapter and introduce one shared `openai-compatible` adapter for the other three providers:

- `ollama` -> existing `OllamaClient`
- `lmstudio` -> new `OpenAiCompatibleClient`
- `openai` -> new `OpenAiCompatibleClient`
- `openrouter` -> new `OpenAiCompatibleClient`

This keeps the stable Ollama implementation intact while avoiding three nearly identical HTTP clients.

## Configuration

Add a provider switch:

- `LLM_PROVIDER=ollama|lmstudio|openai|openrouter`

Keep existing Ollama settings:

- `OLLAMA_BASE_URL`
- `OLLAMA_MODEL`
- `OLLAMA_TIMEOUT_SECONDS`

Add OpenAI-compatible settings:

- `LMSTUDIO_BASE_URL`
- `LMSTUDIO_MODEL`
- `OPENAI_BASE_URL`
- `OPENAI_MODEL`
- `OPENAI_API_KEY`
- `OPENROUTER_BASE_URL`
- `OPENROUTER_MODEL`
- `OPENROUTER_API_KEY`

The backend config layer should expose all of them through `Settings`.

## Runtime behavior

`RollingSummarizerService` should continue depending only on `JsonLlmClient`.

Provider selection should happen in one factory function near the websocket/runtime dependency wiring. That factory should:

- return `OllamaClient` for `ollama`
- return `OpenAiCompatibleClient` for `lmstudio`
- return `OpenAiCompatibleClient` for `openai`
- return `OpenAiCompatibleClient` for `openrouter`
- raise a clear startup error for unknown providers

The summarizer should stay provider-agnostic.

## OpenAI-compatible client contract

The new client should:

- call a chat-completions style endpoint
- send the prompt and transcript in a single user message
- request JSON-only output from the model
- parse the response text into JSON
- reject malformed envelopes and non-object JSON payloads

The client should allow provider-specific headers through configuration. In practice:

- `openai` uses Bearer auth
- `openrouter` uses Bearer auth and may add `HTTP-Referer` / `X-Title` later, but that can stay out of the first pass
- `lmstudio` usually works with a local base URL and may not require an API key

## Error handling

Provider failures should still surface through the existing websocket error event path.

The new client should raise clear errors for:

- missing API key when one is required
- malformed HTTP response envelope
- empty content
- invalid JSON content

## Testing

Add targeted backend tests for:

- OpenAI-compatible response parsing success
- malformed envelope rejection
- non-JSON text rejection
- non-object JSON rejection
- provider factory selecting the right client for `ollama`, `lmstudio`, `openai`, and `openrouter`

No real network calls should be used in tests.

## Documentation impact

Update:

- `README.md`
- `README.zh-CN.md`
- `.env.example`

The docs should show example local setup for LM Studio and example hosted setup for OpenAI / OpenRouter.

## Scope guardrails

This change does not include:

- frontend provider switching UI
- Codex OAuth
- provider health probing beyond existing error behavior
- automatic fallback between providers
