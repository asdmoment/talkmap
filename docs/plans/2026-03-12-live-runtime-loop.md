# Live Runtime Loop Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Connect the existing recorder, websocket, ASR, summarizer, and store layers so a spoken utterance can flow through to transcript, summary, and mind-map updates in the running app.

**Architecture:** The frontend opens a websocket session on mount, stores the returned `session_started` snapshot, and sends finalized VAD utterances as JSON messages. The backend websocket route assigns a real session id, runs the utterance through `TranscribeStreamService`, persists transcript updates to `SessionStore`, optionally runs `RollingSummarizerService`, and emits Task 4-compatible events back to the client.

**Tech Stack:** FastAPI WebSocket, existing `SessionStore`, `TranscribeStreamService`, `RollingSummarizerService`, React, existing socket parser/store/runtime, VAD hook callbacks

---

### Task 10: Backend WebSocket Runtime Pipeline

**Files:**
- Modify: `backend/app/ws.py`
- Modify: `backend/app/session_store.py`
- Test: `backend/tests/test_ws_contract.py`
- Create: `backend/tests/test_ws_runtime.py`

**Step 1: Write the failing test**
- Add a websocket runtime test asserting the backend accepts an utterance payload, emits transcript events, persists the session snapshot, and emits summary/graph events when a fake summarizer is injected.

**Step 2: Run test to verify it fails**
- Run: `python -m pytest backend/tests/test_ws_runtime.py -v`

**Step 3: Write minimal implementation**
- Add dependency-injected websocket runtime services, real session id generation, utterance message handling, transcript event emission, summary/graph emission, and snapshot persistence updates.

**Step 4: Run test to verify it passes**
- Run: `python -m pytest backend/tests/test_ws_runtime.py -v`

### Task 11: Frontend Socket Session Bridge

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/state/sessionRuntime.ts`
- Modify: `frontend/src/App.test.tsx`

**Step 1: Write the failing test**
- Add an app test asserting mount opens the websocket, `session_started` / transcript / summary / graph events flow into the runtime store, and panes rerender from live websocket messages.

**Step 2: Run test to verify it fails**
- Run: `npm --prefix frontend test -- App.test.tsx`

**Step 3: Write minimal implementation**
- Open `createSessionSocket()` on app mount, route every parsed event into `applySessionEvent()`, and clean up the socket on unmount.

**Step 4: Run test to verify it passes**
- Run: `npm --prefix frontend test -- App.test.tsx`

### Task 12: Recorder-to-Backend Utterance Delivery

**Files:**
- Modify: `frontend/src/components/RecorderBar.tsx`
- Modify: `frontend/src/lib/socket.ts`
- Modify: `frontend/src/hooks/useVadRecorder.ts`
- Test: `frontend/src/hooks/useVadRecorder.test.ts`
- Test: `frontend/src/App.test.tsx`

**Step 1: Write the failing test**
- Add tests asserting `onSpeechEnd` utterances are forwarded through the active session socket and backend transcript updates appear in the panes.

**Step 2: Run test to verify it fails**
- Run: `npm --prefix frontend test -- App.test.tsx useVadRecorder.test.ts`

**Step 3: Write minimal implementation**
- Add a websocket send helper for utterance payloads, pass `onSpeechEnd` from `RecorderBar`, and send VAD Float32Array audio to the backend session socket in a JSON-safe format.

**Step 4: Run test to verify it passes**
- Run: `npm --prefix frontend test -- App.test.tsx useVadRecorder.test.ts`
