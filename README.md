# Realtime Voice Map

Realtime Voice Map is a local-first prototype that captures live microphone audio in the browser, streams it to a FastAPI backend, and turns the session into transcript, summary, and mind-map data.

## Current scope

- Frontend shell with recorder controls, transcript pane, summary pane, and mind-map pane
- Backend health route, websocket session bootstrap, session snapshot persistence, summarizer service, and export endpoints
- Session exports at `/api/session/{id}/export.json` and `/api/session/{id}/export.md`
- Local-first architecture intended for browser + localhost development

## Local setup

### Backend

1. Create a Python 3.11+ environment.
2. Install backend dependencies:

```bash
pip install -e "backend[dev]"
pip install uvicorn
```

3. Copy `.env.example` to `.env` if you want local config placeholders and provider switching.

### Frontend

```bash
npm --prefix frontend install
```

## Run locally

### Backend

```bash
uvicorn app.main:app --app-dir backend --reload
```

Backend routes currently include:

- `GET /api/health`
- `GET /api/session/{id}/export.json`
- `GET /api/session/{id}/export.md`
- `WS /ws/session`

### Frontend

```bash
npm --prefix frontend run dev
```

During local development, Vite proxies `/api` and `/ws` traffic to the FastAPI server on `127.0.0.1:8000`, so keep the backend running while you use the frontend.

### Tests

```bash
python -m pytest backend/tests -v
npm --prefix frontend test
```

## LLM provider options

The backend summarizer supports four providers selected by `LLM_PROVIDER`:

- `ollama` - default local adapter, using `OLLAMA_BASE_URL` and `OLLAMA_MODEL`
- `lmstudio` - local OpenAI-compatible server, using `LMSTUDIO_BASE_URL` and `LMSTUDIO_MODEL`
- `openai` - hosted OpenAI API, using `OPENAI_BASE_URL`, `OPENAI_MODEL`, and `OPENAI_API_KEY`
- `openrouter` - hosted OpenRouter API, using `OPENROUTER_BASE_URL`, `OPENROUTER_MODEL`, and `OPENROUTER_API_KEY`

Example `.env` snippets:

```bash
# Ollama stays the default local setup
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=llama3.1:8b

# LM Studio
LLM_PROVIDER=lmstudio
LMSTUDIO_BASE_URL=http://127.0.0.1:1234/v1
LMSTUDIO_MODEL=local-model

# OpenAI
LLM_PROVIDER=openai
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
OPENAI_API_KEY=your-api-key

# OpenRouter
LLM_PROVIDER=openrouter
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_MODEL=openai/gpt-4o-mini
OPENROUTER_API_KEY=your-api-key
```

## LLM and ASR notes

- Ollama remains the default local-first LLM path.
- LM Studio uses the shared OpenAI-compatible client against a local `/v1` endpoint.
- ASR is intended to run locally through faster-whisper or a similar engine.
- `.env.example` lists the provider switch and matching variables for all four supported backends.

## MVP limitations

- The live loop now exists end to end, but it is still local-dev-first and lightly hardened.
- Export reads persisted backend session snapshots only; a session must exist on disk before export succeeds.
- Configuration loading is still minimal, but `VOICE_MAP_DATA_DIR` can already redirect persisted session exports.
- Frontend and backend integration is still in MVP form and should be treated as local development scaffolding rather than production-ready infrastructure.
