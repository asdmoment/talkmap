from fastapi.testclient import TestClient

from app.main import app
from app.models import CommittedSegment, MindmapEdge, MindmapNode, SummaryBlock
from app.routes.export import get_session_store
from app.session_store import SessionStore
from app.services.summarizer import RollingSummaryResult
from app.ws import get_summarizer_service, get_transcribe_service


class FakeTranscribeService:
    def __init__(self) -> None:
        self.calls: list[dict[str, object]] = []

    def transcribe_utterance(self, *, audio: object, utterance_id: str):
        from app.ws import CommittedTranscriptEvent, PartialTranscriptEvent

        self.calls.append({"audio": audio, "utterance_id": utterance_id})
        return [
            PartialTranscriptEvent.model_validate(
                {
                    "type": "partial_transcript",
                    "segment": {
                        "id": f"{utterance_id}:0",
                        "text": "draft summary",
                        "start_ms": 0,
                        "end_ms": 800,
                    },
                }
            ),
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
            ),
        ]


class FakeSummarizerService:
    def __init__(self) -> None:
        self.calls: list[list[CommittedSegment]] = []

    async def summarize(
        self, *, committed_segments: list[CommittedSegment]
    ) -> RollingSummaryResult:
        self.calls.append(committed_segments)
        return RollingSummaryResult(
            summary="Overview text",
            bullets=["Bullet one"],
            action_items=["Action one"],
            nodes=[MindmapNode(id="topic", label="Topic")],
            edges=[MindmapEdge(id="topic-action", source="topic", target="action")],
            summary_blocks=[
                SummaryBlock(id="summary:0", text="Overview text"),
                SummaryBlock(id="bullet:0", text="Bullet one"),
                SummaryBlock(id="action:0", text="Action one"),
            ],
        )


def test_session_websocket_processes_utterances_and_persists_runtime_updates(
    tmp_path,
) -> None:
    store = SessionStore(root_dir=tmp_path)
    transcribe_service = FakeTranscribeService()
    summarizer_service = FakeSummarizerService()
    app.dependency_overrides[get_session_store] = lambda: store
    app.dependency_overrides[get_transcribe_service] = lambda: transcribe_service
    app.dependency_overrides[get_summarizer_service] = lambda: summarizer_service
    client = TestClient(app)

    try:
        with client.websocket_connect("/ws/session") as websocket:
            session_started = websocket.receive_json()
            session_id = session_started["session_id"]

            assert store.has_snapshot(session_id) is True

            websocket.send_json(
                {
                    "type": "utterance",
                    "utterance_id": "utt-1",
                    "sample_rate": 16000,
                    "samples": [0.1, -0.1, 0.2],
                }
            )

            partial_event = websocket.receive_json()
            committed_event = websocket.receive_json()
            summary_event = websocket.receive_json()
            graph_event = websocket.receive_json()
    finally:
        app.dependency_overrides.clear()

    assert partial_event == {
        "type": "partial_transcript",
        "segment": {
            "id": "utt-1:0",
            "text": "draft summary",
            "start_ms": 0,
            "end_ms": 800,
        },
    }
    assert committed_event == {
        "type": "committed_transcript",
        "segment": {
            "id": "utt-1:0",
            "text": "final summary",
            "start_ms": 0,
            "end_ms": 900,
        },
    }
    assert summary_event == {
        "type": "summary_updated",
        "blocks": [
            {"id": "summary:0", "text": "Overview text"},
            {"id": "bullet:0", "text": "Bullet one"},
            {"id": "action:0", "text": "Action one"},
        ],
    }
    assert graph_event == {
        "type": "graph_updated",
        "nodes": [{"id": "topic", "label": "Topic"}],
        "edges": [{"id": "topic-action", "source": "topic", "target": "action"}],
    }
    assert transcribe_service.calls == [
        {"audio": [0.1, -0.1, 0.2], "utterance_id": "utt-1"}
    ]
    assert [segment.model_dump() for segment in summarizer_service.calls[0]] == [
        {"id": "utt-1:0", "text": "final summary", "start_ms": 0, "end_ms": 900}
    ]
    assert store.get_snapshot(session_id).model_dump(mode="json") == {
        "session_id": session_id,
        "partial_segments": [],
        "committed_segments": [
            {"id": "utt-1:0", "text": "final summary", "start_ms": 0, "end_ms": 900}
        ],
        "summary_blocks": [
            {"id": "summary:0", "text": "Overview text"},
            {"id": "bullet:0", "text": "Bullet one"},
            {"id": "action:0", "text": "Action one"},
        ],
        "mindmap_nodes": [{"id": "topic", "label": "Topic"}],
        "mindmap_edges": [
            {"id": "topic-action", "source": "topic", "target": "action"}
        ],
    }


def test_session_websocket_emits_error_event_when_runtime_processing_fails(
    tmp_path,
) -> None:
    class BrokenTranscribeService:
        def transcribe_utterance(self, *, audio: object, utterance_id: str):
            raise RuntimeError("ASR offline")

    store = SessionStore(root_dir=tmp_path)
    app.dependency_overrides[get_session_store] = lambda: store
    app.dependency_overrides[get_transcribe_service] = lambda: BrokenTranscribeService()
    app.dependency_overrides[get_summarizer_service] = lambda: FakeSummarizerService()
    client = TestClient(app)

    try:
        with client.websocket_connect("/ws/session") as websocket:
            websocket.receive_json()
            websocket.send_json(
                {
                    "type": "utterance",
                    "utterance_id": "utt-bad",
                    "sample_rate": 16000,
                    "samples": [0.1],
                }
            )

            error_event = websocket.receive_json()
    finally:
        app.dependency_overrides.clear()

    assert error_event == {"type": "error", "message": "ASR offline"}
