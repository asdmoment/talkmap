from fastapi.testclient import TestClient

from app.main import app
from app.models import CommittedSegment
from app.routes.export import get_session_store
from app.session_store import SessionStore
from app.services.summarizer import RollingSummaryResult
from app.ws import get_summarizer_service, get_transcribe_service


def test_session_websocket_emits_initial_session_started_event(tmp_path) -> None:
    class FakeTranscribeService:
        async def transcribe_utterance(
            self, *, audio: object, sample_rate: int, utterance_id: str
        ):
            return []

    class FakeSummarizerService:
        async def summarize(
            self, *, committed_segments: list[CommittedSegment]
        ) -> RollingSummaryResult:
            raise AssertionError("summarize should not be called during connect")

    store = SessionStore(root_dir=tmp_path)
    app.dependency_overrides[get_session_store] = lambda: store
    app.dependency_overrides[get_transcribe_service] = lambda: FakeTranscribeService()
    app.dependency_overrides[get_summarizer_service] = lambda: FakeSummarizerService()
    client = TestClient(app)

    try:
        with client.websocket_connect("/ws/session") as websocket:
            event = websocket.receive_json()
    finally:
        app.dependency_overrides.clear()

    assert event["type"] == "session_started"
    assert event["session_id"].startswith("session-")
    assert event["snapshot"] == {
        "session_id": event["session_id"],
        "partial_segments": [],
        "committed_segments": [],
        "summary_blocks": [],
        "mindmap_nodes": [],
        "mindmap_edges": [],
    }


def test_session_websocket_emits_committed_transcript_before_error_on_llm_failure(
    tmp_path,
) -> None:
    from app.ws import CommittedTranscriptEvent

    class FakeTranscribeService:
        async def transcribe_utterance(
            self, *, audio: object, sample_rate: int, utterance_id: str
        ):
            return [
                CommittedTranscriptEvent.model_validate(
                    {
                        "type": "committed_transcript",
                        "segment": {
                            "id": f"{utterance_id}:0",
                            "text": "final summary",
                            "start_ms": 0,
                            "end_ms": 900,
                        },
                    }
                )
            ]

    class BrokenSummarizerService:
        async def summarize(
            self, *, committed_segments: list[CommittedSegment]
        ) -> RollingSummaryResult:
            raise RuntimeError("LLM offline")

    store = SessionStore(root_dir=tmp_path)
    app.dependency_overrides[get_session_store] = lambda: store
    app.dependency_overrides[get_transcribe_service] = lambda: FakeTranscribeService()
    app.dependency_overrides[get_summarizer_service] = lambda: BrokenSummarizerService()
    client = TestClient(app)

    try:
        with client.websocket_connect("/ws/session") as websocket:
            websocket.receive_json()
            websocket.send_json(
                {
                    "type": "utterance",
                    "utterance_id": "utt-1",
                    "sample_rate": 16000,
                    "samples": [0.1, -0.1, 0.2],
                }
            )

            committed_event = websocket.receive_json()
            error_event = websocket.receive_json()
    finally:
        app.dependency_overrides.clear()

    assert committed_event == {
        "type": "committed_transcript",
        "segment": {
            "id": "utt-1:0",
            "text": "final summary",
            "start_ms": 0,
            "end_ms": 900,
        },
    }
    assert error_event == {
        "type": "error",
        "message": "Thought organization failed: LLM offline",
    }
