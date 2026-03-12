# Realtime Voice Map Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a local-first app that captures microphone audio, transcribes it in near real time, and continuously produces rolling summaries, bullets, action items, and a live mind map.

**Architecture:** A React frontend captures microphone audio and streams PCM frames to a localhost FastAPI backend over WebSocket. The backend performs VAD-aware streaming transcription with faster-whisper, batches committed transcript segments into an Ollama summarizer, validates structured JSON output, and pushes transcript, summary, and graph updates back to the UI.

**Tech Stack:** React, Vite, TypeScript, FastAPI, WebSocket, `@ricky0123/vad-web`, `faster-whisper`, Ollama, React Flow, pytest, Vitest

---

### Task 1: Bootstrap backend health API

**Files:**
- Create: `backend/pyproject.toml`
- Create: `backend/app/main.py`
- Create: `backend/app/config.py`
- Create: `backend/app/schemas.py`
- Test: `backend/tests/test_health.py`

**Step 1: Write the failing test**
- Add a test asserting `GET /api/health` returns `ok=true`, `asr_status`, and `llm_status`.

**Step 2: Run test to verify it fails**
- Run: `python -m pytest backend/tests/test_health.py -v`

**Step 3: Write minimal implementation**
- Create a FastAPI app with a health route and typed response schema.

**Step 4: Run test to verify it passes**
- Run: `python -m pytest backend/tests/test_health.py -v`

### Task 2: Define session domain and local persistence

**Files:**
- Create: `backend/app/session_store.py`
- Create: `backend/app/models.py`
- Test: `backend/tests/test_session_store.py`

**Step 1: Write the failing test**
- Add a test asserting a session can append `partial_segments`, `committed_segments`, `summary_blocks`, `mindmap_nodes`, and `mindmap_edges`.

**Step 2: Run test to verify it fails**
- Run: `python -m pytest backend/tests/test_session_store.py -v`

**Step 3: Write minimal implementation**
- Build an in-memory store that persists JSON snapshots under `data/sessions/<session_id>.json`.

**Step 4: Run test to verify it passes**
- Run: `python -m pytest backend/tests/test_session_store.py -v`

### Task 3: Build the frontend shell

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/tsconfig.json`
- Create: `frontend/vitest.config.ts`
- Create: `frontend/index.html`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/App.tsx`
- Create: `frontend/src/styles.css`
- Create: `frontend/src/components/RecorderBar.tsx`
- Create: `frontend/src/components/TranscriptPane.tsx`
- Create: `frontend/src/components/SummaryPane.tsx`
- Create: `frontend/src/components/MindMapPane.tsx`
- Test: `frontend/src/App.test.tsx`

**Step 1: Write the failing test**
- Add a frontend test asserting the page renders three panes and an idle recorder state.

**Step 2: Run test to verify it fails**
- Run: `npm --prefix frontend test -- App.test.tsx`

**Step 3: Write minimal implementation**
- Create the React app shell, distinctive layout, and placeholder copy for idle state.

**Step 4: Run test to verify it passes**
- Run: `npm --prefix frontend test -- App.test.tsx`

### Task 4: Add WebSocket event contract and client store

**Files:**
- Create: `backend/app/ws.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_ws_contract.py`
- Create: `frontend/src/lib/socket.ts`
- Create: `frontend/src/state/sessionStore.ts`
- Test: `frontend/src/state/sessionStore.test.ts`

**Step 1: Write the failing tests**
- Add a backend test asserting `GET /ws/session` accepts a WebSocket connection and sends a first JSON message with `type="session_started"`, a `session_id`, and an empty `snapshot` matching the existing session shape.
- Add frontend store tests asserting `applyEvent` updates state for `session_started`, `partial_transcript`, `committed_transcript`, `summary_updated`, `graph_updated`, and `error`.

**Step 2: Run tests to verify they fail**
- Run: `python -m pytest backend/tests/test_ws_contract.py -v`
- Run: `npm --prefix frontend test -- sessionStore.test.ts`

**Step 3: Write minimal implementation**
- Create a typed backend WebSocket event contract and route that emits the initial `session_started` event with an empty snapshot.
- Create typed frontend socket event unions and a dependency-free session store with `getState`, `subscribe`, and `applyEvent`.

**Step 4: Run tests to verify they pass**
- Run: `python -m pytest backend/tests/test_ws_contract.py -v`
- Run: `npm --prefix frontend test -- sessionStore.test.ts`

### Task 5: Add microphone capture and VAD

**Files:**
- Create: `frontend/src/hooks/useMicrophone.ts`
- Create: `frontend/src/hooks/useVadRecorder.ts`
- Test: `frontend/src/hooks/useMicrophone.test.ts`
- Test: `frontend/src/hooks/useVadRecorder.test.ts`
- Modify: `frontend/src/components/RecorderBar.tsx`
- Modify: `frontend/package.json`

**Step 1: Write the failing tests**
- Add `frontend/src/hooks/useMicrophone.test.ts` covering lazy microphone permission, active stream reuse, error state, and track cleanup on stop and unmount.
- Add `frontend/src/hooks/useVadRecorder.test.ts` covering VAD creation with `stream`, callback wiring, and `start()` / `pause()` behavior through an injected factory.

**Step 2: Run tests to verify they fail**
- Run: `npm --prefix frontend test -- useMicrophone.test.ts`
- Run: `npm --prefix frontend test -- useVadRecorder.test.ts`

**Step 3: Write minimal implementation**
- Create `useMicrophone` with injected `getUserMedia`, a small status model, lazy stream acquisition, and deterministic track teardown.
- Create `useVadRecorder` with injected `createVad`, `stream` reuse, and thin state transitions for idle, listening, speaking, and error.
- Update `RecorderBar` to compose both hooks into a manual start/stop control with meaningful recorder copy and state pills.
- Add `@ricky0123/vad-web` only if required by the hook implementation.

**Step 4: Run tests to verify they pass**
- Run: `npm --prefix frontend test -- useMicrophone.test.ts`
- Run: `npm --prefix frontend test -- useVadRecorder.test.ts`
- Run: `npm --prefix frontend run build`

### Task 6: Add streaming transcription service

### Task 7: Add rolling summarizer and structured mind-map output

**Files:**
- Create: `backend/app/llm/ollama_client.py`
- Create: `backend/app/services/summarizer.py`
- Create: `backend/app/prompts/rolling_summary.txt`
- Test: `backend/tests/test_summarizer.py`
- Modify: `backend/pyproject.toml` only if stdlib HTTP proves insufficient

**Step 1: Write the failing test**
- Add a fake-client-driven test asserting a summarizer service accepts committed transcript segments, loads the prompt template, validates strict JSON with `summary`, `bullets`, `action_items`, `nodes`, and `edges`, and returns a typed result plus derived `SummaryUpdatedEvent` and `GraphUpdatedEvent`.
- Add a validation test asserting malformed or incomplete JSON-like payloads are rejected before websocket artifacts are derived.

**Step 2: Run test to verify it fails**
- Run: `python -m pytest backend/tests/test_summarizer.py -v`

**Step 3: Write minimal implementation**
- Create a small Ollama client adapter in `backend/app/llm/ollama_client.py` using stdlib HTTP and a narrow async interface that returns parsed JSON-like data.
- Create `backend/app/services/summarizer.py` with a typed validated result model, prompt loading from `backend/app/prompts/rolling_summary.txt`, deterministic `SummaryBlock` ids, and derivation of `SummaryUpdatedEvent` and `GraphUpdatedEvent` using existing Task 4 websocket and session models.
- Add a minimal prompt in `backend/app/prompts/rolling_summary.txt` that instructs the model to return strict JSON only.

**Step 4: Run test to verify it passes**
- Run: `python -m pytest backend/tests/test_summarizer.py -v`

### Task 8: Render live summary and mind map

**Files:**
- Create: `frontend/src/lib/graph.ts`
- Create: `frontend/src/components/MindMapPane.test.tsx`
- Modify: `frontend/src/components/MindMapPane.tsx`
- Modify: `frontend/src/components/TranscriptPane.tsx`
- Modify: `frontend/src/components/SummaryPane.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/styles.css`
- Modify: `frontend/src/App.test.tsx`
- Modify: `frontend/src/state/sessionStore.ts` only if a small UI subscription helper is needed

**Step 1: Write the failing tests**
- Add `frontend/src/components/MindMapPane.test.tsx` asserting the pane shows an editorial empty state, then renders nodes and edges from store-backed state using deterministic layout output.
- Extend `frontend/src/App.test.tsx` with a store-driven rendering test asserting committed transcript rows, partial transcript tail, and summary hierarchy render from the existing session state.

**Step 2: Run tests to verify they fail**
- Run: `npm --prefix frontend test -- MindMapPane.test.tsx`
- Run: `npm --prefix frontend test -- App.test.tsx`

**Step 3: Write minimal implementation**
- Add a tiny dependency-free graph layout helper in `frontend/src/lib/graph.ts` that maps existing `mindmapNodes` and `mindmapEdges` into deterministic SVG positions and visible edge paths.
- Add a thin React subscription path to the existing session store so panes render directly from current client state without adding transport scope.
- Update transcript, summary, and mind-map panes to render live store data while preserving the current signal-desk aesthetic and keeping mobile output readable.

**Step 4: Run tests to verify they pass**
- Run: `npm --prefix frontend test -- MindMapPane.test.tsx`
- Run: `npm --prefix frontend test -- App.test.tsx`
- Run: `npm --prefix frontend test -- App.test.tsx socket.test.ts sessionStore.test.ts MindMapPane.test.tsx`
- Run: `npm --prefix frontend run build`

### Task 9: Add export and developer docs
