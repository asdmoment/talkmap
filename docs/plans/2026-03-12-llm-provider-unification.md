# LLM Provider Unification Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add configurable LLM providers so the backend summarizer can run through Ollama, LM Studio, OpenAI, or OpenRouter.

**Architecture:** Keep `OllamaClient` as a dedicated adapter and add one shared `OpenAiCompatibleClient` for `lmstudio`, `openai`, and `openrouter`. Select the provider in one backend factory based on environment configuration, while keeping `RollingSummarizerService` dependent only on the `JsonLlmClient` protocol.

**Tech Stack:** Python, FastAPI dependency wiring, stdlib HTTP, Pydantic, pytest

---

### Task 1: Expand backend configuration for provider selection

**Files:**
- Modify: `backend/app/config.py`
- Modify: `.env.example`
- Test: `backend/tests/test_config.py`

**Step 1: Write the failing test**

```python
def test_get_settings_reads_llm_provider_configuration(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "openrouter")
    monkeypatch.setenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
    monkeypatch.setenv("OPENROUTER_MODEL", "openai/gpt-4o-mini")
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")

    settings = get_settings()

    assert settings.llm_provider == "openrouter"
    assert settings.openrouter_base_url == "https://openrouter.ai/api/v1"
    assert settings.openrouter_model == "openai/gpt-4o-mini"
    assert settings.openrouter_api_key == "test-key"
```

**Step 2: Run test to verify it fails**

Run: `python -m pytest backend/tests/test_config.py -v`
Expected: FAIL because the provider fields do not exist yet.

**Step 3: Write minimal implementation**

```python
@dataclass(frozen=True)
class Settings:
    llm_provider: str = "ollama"
    lmstudio_base_url: str = "http://127.0.0.1:1234/v1"
    lmstudio_model: str = "local-model"
    openai_base_url: str = "https://api.openai.com/v1"
    openai_model: str = "gpt-4o-mini"
    openai_api_key: str | None = None
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    openrouter_model: str = "openai/gpt-4o-mini"
    openrouter_api_key: str | None = None
```

**Step 4: Run test to verify it passes**

Run: `python -m pytest backend/tests/test_config.py -v`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/app/config.py backend/tests/test_config.py .env.example
git commit -m "feat: add configurable llm provider settings"
```

### Task 2: Add the OpenAI-compatible JSON client

**Files:**
- Create: `backend/app/llm/openai_compatible_client.py`
- Test: `backend/tests/test_openai_compatible_client.py`

**Step 1: Write the failing test**

```python
def test_openai_compatible_client_parses_json_response():
    transport = FakeTransport({
        "choices": [
            {"message": {"content": '{"summary":"ok","bullets":[],"action_items":[],"nodes":[],"edges":[]}'}}
        ]
    })
    client = OpenAiCompatibleClient(
        model="test-model",
        base_url="https://example.test/v1",
        api_key="secret",
        transport=transport,
    )

    result = asyncio.run(client.complete_json(prompt="Prompt", transcript="Hello"))

    assert result == {
        "summary": "ok",
        "bullets": [],
        "action_items": [],
        "nodes": [],
        "edges": [],
    }
```

**Step 2: Run test to verify it fails**

Run: `python -m pytest backend/tests/test_openai_compatible_client.py -v`
Expected: FAIL because the client file does not exist yet.

**Step 3: Write minimal implementation**

```python
class OpenAiCompatibleClient:
    async def complete_json(self, *, prompt: str, transcript: str) -> object:
        ...
```

Implement only what is needed to:
- call a chat-completions style endpoint
- send a single user message containing prompt + transcript
- parse `choices[0].message.content`
- reject malformed envelopes and non-object JSON

**Step 4: Run test to verify it passes**

Run: `python -m pytest backend/tests/test_openai_compatible_client.py -v`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/app/llm/openai_compatible_client.py backend/tests/test_openai_compatible_client.py
git commit -m "feat: add openai-compatible llm client"
```

### Task 3: Wire provider selection into runtime dependencies

**Files:**
- Modify: `backend/app/ws.py`
- Test: `backend/tests/test_llm_provider_factory.py`

**Step 1: Write the failing test**

```python
def test_get_summarizer_service_uses_openrouter_client():
    settings = Settings(
        llm_provider="openrouter",
        openrouter_base_url="https://openrouter.ai/api/v1",
        openrouter_model="openai/gpt-4o-mini",
        openrouter_api_key="secret",
    )

    service = get_summarizer_service(settings)

    assert isinstance(service._client, OpenAiCompatibleClient)
```

**Step 2: Run test to verify it fails**

Run: `python -m pytest backend/tests/test_llm_provider_factory.py -v`
Expected: FAIL because provider selection is still Ollama-only.

**Step 3: Write minimal implementation**

```python
def get_summarizer_service(settings: Settings = Depends(get_settings)) -> Any:
    if settings.llm_provider == "ollama":
        ...
    if settings.llm_provider == "lmstudio":
        ...
    if settings.llm_provider == "openai":
        ...
    if settings.llm_provider == "openrouter":
        ...
    raise ValueError("Unsupported LLM provider")
```

**Step 4: Run test to verify it passes**

Run: `python -m pytest backend/tests/test_llm_provider_factory.py -v`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/app/ws.py backend/tests/test_llm_provider_factory.py
git commit -m "feat: add llm provider factory"
```

### Task 4: Prove the summarizer still works through provider abstraction

**Files:**
- Modify: `backend/tests/test_summarizer.py`
- Modify: `backend/tests/test_ollama_client.py`
- Test: `backend/tests/test_openai_compatible_client.py`

**Step 1: Write the failing test**

```python
def test_summarizer_accepts_openai_compatible_json_client():
    class FakeClient:
        async def complete_json(self, *, prompt: str, transcript: str):
            return {
                "summary": "ok",
                "bullets": [],
                "action_items": [],
                "nodes": [],
                "edges": [],
            }

    result = asyncio.run(
        RollingSummarizerService(client=FakeClient()).summarize(
            committed_segments=[CommittedSegment(id="c1", text="hello", start_ms=0, end_ms=10)]
        )
    )

    assert result.summary == "ok"
```

**Step 2: Run test to verify it fails**

Run: `python -m pytest backend/tests/test_summarizer.py -v`
Expected: FAIL only if the abstraction still assumes Ollama-specific behavior.

**Step 3: Write minimal implementation**

Adjust only what is necessary so summarizer tests remain provider-agnostic and both client families validate envelopes cleanly.

**Step 4: Run test to verify it passes**

Run: `python -m pytest backend/tests/test_summarizer.py backend/tests/test_ollama_client.py backend/tests/test_openai_compatible_client.py -v`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/tests/test_summarizer.py backend/tests/test_ollama_client.py backend/tests/test_openai_compatible_client.py
git commit -m "test: verify summarizer across llm providers"
```

### Task 5: Update project docs for LM Studio, OpenAI, and OpenRouter

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `.env.example`

**Step 1: Write the failing test**

There is no automated doc test for this task. Instead, define a manual checklist:

```text
- README mentions Ollama, LM Studio, OpenAI, and OpenRouter
- README.zh-CN.md mentions the same four providers in Chinese
- .env.example contains provider switch and matching variables
```

**Step 2: Run the check to verify it fails**

Read the files and confirm the provider guidance is incomplete.

**Step 3: Write minimal implementation**

Add:
- provider selection docs
- example LM Studio base URL
- example OpenAI / OpenRouter env usage
- a short note that Ollama remains the local default

**Step 4: Run the check to verify it passes**

Read `README.md`, `README.zh-CN.md`, and `.env.example` and confirm the checklist is satisfied.

**Step 5: Commit**

```bash
git add README.md README.zh-CN.md .env.example
git commit -m "docs: add llm provider setup options"
```
