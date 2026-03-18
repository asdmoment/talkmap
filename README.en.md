# TalkMap

Chinese default entry: [README.md](README.md)

***Intelligent Thought Mapper:*** *Forget the keyboard and messy notes. Pour your chaotic thoughts into TalkMap, and the AI engine will instantly listen, distill, and weave a structured mind map while you speak.*

## What TalkMap does

- **Original Thought Canon**: Retains every spark of inspiration; your unpolished raw thoughts simply settle here.
- **AI Distillation Engine**: Extracts core arguments, key highlights, and next-step action guides refined by AI context in real time.
- **Dynamic Mind Network**: AI accurately captures hidden connections between complex concepts, weaving a divergent structured map graph.
- **Session Export**: Safely saves sessions locally and seamlessly exports them as JSON or Markdown.

The app is built as a minimalist, focus-first canvas. You speak to the mic button, the frontend sends audio utterances to a FastAPI backend over WebSocket, and the backend orchestrates ASR alongside intelligent LLM summarization.

## Stack

- Frontend: React, Vite, `@ricky0123/vad-web`
- Backend: FastAPI, WebSocket, Pydantic
- ASR: local `faster-whisper`, Google Speech-to-Text, or Groq Whisper
- LLM: Ollama, LM Studio, OpenAI, or OpenRouter

## Requirements

- Python 3.11+
- Node.js 18+
- One ASR path:
  - local `faster-whisper`
  - Google Speech-to-Text credentials
  - Groq API key
- One LLM path:
  - Ollama
  - LM Studio
  - OpenAI
  - OpenRouter

## Quick start

### 1. Install backend dependencies

```bash
pip install -e "backend[dev,asr]"
pip install uvicorn
```

If you only plan to use hosted ASR providers such as Google Speech-to-Text or Groq, `backend[dev]` is enough. The `asr` extra is only needed for local `faster-whisper`.

### 2. Install frontend dependencies

```bash
npm --prefix frontend install
```

### 3. Create your config

```bash
cp .env.example .env
```

The template assumes:

- local ASR with `faster-whisper`
- OpenRouter for summaries

If you already downloaded a Whisper model, `ASR_MODEL` can point to an absolute local path.

Example local setup:

```bash
ASR_PROVIDER=local
ASR_MODEL=large-v3
ASR_DEVICE=auto
ASR_COMPUTE_TYPE=float16

LLM_PROVIDER=openrouter
OPENROUTER_MODEL=google/gemini-2.0-flash-001
OPENROUTER_API_KEY=your-key-from-openrouter.ai
```

If you use Google Speech-to-Text, set `ASR_PROVIDER=google` and export your credentials before starting the backend:

```bash
export GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json
```

### 4. Run the app

Use two terminals:

```bash
# Terminal 1: backend
uvicorn app.main:app --app-dir backend --reload

# Terminal 2: frontend
npm --prefix frontend run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173), click `开始梳理`, allow microphone access, and start talking.

If you use local Whisper and the model is not cached yet, the first run downloads it once. If you use OpenRouter free models, expect occasional upstream rate limits and switch `OPENROUTER_MODEL` if a model becomes flaky.

## ASR providers

Set `ASR_PROVIDER` in `.env`:

| Provider | Hosted? | What you need | Config |
| --- | --- | --- | --- |
| `local` | No | `faster-whisper` installed locally | `ASR_MODEL`, `ASR_DEVICE`, `ASR_COMPUTE_TYPE` |
| `google` | Yes | Google Application Default Credentials | `ASR_LANGUAGE_CODE`, `GOOGLE_STT_MODEL` |
| `groq` | Yes | Groq API key | `ASR_LANGUAGE_CODE`, `GROQ_ASR_MODEL`, `GROQ_API_KEY` |

### Local Whisper

```bash
ASR_PROVIDER=local
ASR_MODEL=large-v3
ASR_DEVICE=auto
ASR_COMPUTE_TYPE=float16
```

### Google Speech-to-Text

```bash
ASR_PROVIDER=google
ASR_LANGUAGE_CODE=zh-CN
GOOGLE_STT_MODEL=latest_long
```

### Groq Whisper

```bash
ASR_PROVIDER=groq
ASR_LANGUAGE_CODE=zh-CN
GROQ_ASR_MODEL=whisper-large-v3
GROQ_API_KEY=your-groq-key
```

## LLM providers

Set `LLM_PROVIDER` in `.env`:

| Provider | Local? | API key needed? | Config |
| --- | --- | --- | --- |
| `ollama` | Yes | No | `OLLAMA_BASE_URL`, `OLLAMA_MODEL` |
| `lmstudio` | Yes | No | `LMSTUDIO_BASE_URL`, `LMSTUDIO_MODEL` |
| `openai` | No | Yes | `OPENAI_API_KEY`, `OPENAI_MODEL` |
| `openrouter` | No | Yes | `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` |

### OpenRouter

```bash
LLM_PROVIDER=openrouter
OPENROUTER_MODEL=google/gemini-2.0-flash-001
OPENROUTER_API_KEY=your-key-from-openrouter.ai
```

Get a key from [openrouter.ai/keys](https://openrouter.ai/keys).

### Ollama

```bash
ollama pull llama3.1:8b
ollama serve
```

```bash
LLM_PROVIDER=ollama
OLLAMA_MODEL=llama3.1:8b
```

## API routes

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/health` | Backend status for ASR and LLM readiness |
| GET | `/api/sessions` | List saved sessions |
| GET | `/api/session/{id}/export.json` | Export a session as JSON |
| GET | `/api/session/{id}/export.md` | Export a session as Markdown |
| DELETE | `/api/session/{id}` | Delete a saved session |
| WS | `/ws/session` | Real-time session WebSocket |

## Development checks

```bash
python -m pytest backend/tests -q
npm --prefix frontend test
npm --prefix frontend run build
```

## Project structure

```text
backend/
  app/
    asr/                 # ASR engines: local, Google, Groq
    llm/                 # LLM clients and provider factory
    prompts/             # Prompt templates for structured summary output
    routes/              # Export and session list endpoints
    services/            # Summarizer and transcription services
    config.py            # Settings from env vars
    main.py              # FastAPI app
    models.py            # Pydantic data models
    session_store.py     # JSON persistence with batched writes
    ws.py                # WebSocket session loop
  tests/
frontend/
  src/
    components/          # Recorder bar, transcript, summary, and graph panes
    hooks/               # Microphone and VAD logic
    lib/                 # WebSocket client and graph layout helpers
    state/               # Session state management
```

## Current limitations

- VAD sends audio for transcription after a pause, not as a word-by-word stream
- WebSocket auth and rate limiting are not implemented
- Long sessions still re-summarize the full committed transcript each time
- This repo is aimed at local development, not production deployment
