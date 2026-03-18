import asyncio
import threading
import time

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import app
from app.models import CommittedSegment, MindmapEdge, MindmapNode, SummaryBlock
from app.routes.export import get_session_store
from app.session_store import SessionStore
from app.services.summarizer import RollingSummaryResult
from app.ws import get_summarizer_service, get_transcribe_service


class FakeTranscribeService:
    def __init__(self) -> None:
        self.calls: list[dict[str, object]] = []

    async def transcribe_utterance(
        self, *, audio: object, sample_rate: int, utterance_id: str
    ):
        from app.ws import CommittedTranscriptEvent, PartialTranscriptEvent

        self.calls.append(
            {
                "audio": audio,
                "sample_rate": sample_rate,
                "utterance_id": utterance_id,
            }
        )
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


def test_get_transcribe_service_selects_local_asr() -> None:
    settings = Settings(asr_provider="local")

    service = get_transcribe_service(settings)

    assert type(service._engine).__name__ == "FasterWhisperEngine"


def test_get_transcribe_service_selects_groq_asr() -> None:
    settings = Settings(
        asr_provider="groq",
        groq_api_key="test-key",
        groq_asr_model="whisper-large-v3",
        asr_language_code="zh-CN",
    )

    service = get_transcribe_service(settings)

    assert type(service._engine).__name__ == "GroqWhisperEngine"


def test_get_transcribe_service_selects_google_asr(monkeypatch) -> None:
    from app.asr.google_speech_engine import GoogleSpeechEngine

    captured: dict[str, object] = {}

    class FakeGoogleSpeechEngine:
        pass

    def fake_from_default_credentials(*, language_code: str, model: str):
        captured["language_code"] = language_code
        captured["model"] = model
        return FakeGoogleSpeechEngine()

    monkeypatch.setattr(
        GoogleSpeechEngine,
        "from_default_credentials",
        fake_from_default_credentials,
    )
    settings = Settings(
        asr_provider="google",
        asr_language_code="zh-CN",
        google_stt_model="latest_long",
    )

    service = get_transcribe_service(settings)

    assert type(service._engine).__name__ == "FakeGoogleSpeechEngine"
    assert captured == {"language_code": "zh-CN", "model": "latest_long"}


def test_get_transcribe_service_rejects_unknown_provider() -> None:
    settings = Settings(asr_provider="local")
    object.__setattr__(settings, "asr_provider", "unknown")

    try:
        get_transcribe_service(settings)
    except ValueError as exc:
        assert str(exc) == "Unsupported ASR provider: unknown"
    else:
        raise AssertionError("Expected ValueError for unsupported ASR provider")


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
        {
            "audio": [0.1, -0.1, 0.2],
            "sample_rate": 16000,
            "utterance_id": "utt-1",
        }
    ]
    assert [segment.model_dump() for segment in summarizer_service.calls[0]] == [
        {"id": "utt-1:0", "text": "final summary", "start_ms": 0, "end_ms": 900}
    ]
    assert store.get_snapshot(session_id).model_dump(mode="json") == {
        "session_id": session_id,
        "title": None,
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
        async def transcribe_utterance(
            self, *, audio: object, sample_rate: int, utterance_id: str
        ):
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

    assert error_event == {
        "type": "error",
        "message": "Speech recognition failed: ASR offline",
    }


def test_session_websocket_keeps_committed_transcript_when_llm_fails(tmp_path) -> None:
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
            session_started = websocket.receive_json()
            session_id = session_started["session_id"]
            websocket.send_json(
                {
                    "type": "utterance",
                    "utterance_id": "utt-1",
                    "sample_rate": 16000,
                    "samples": [0.1, -0.1, 0.2],
                }
            )

            websocket.receive_json()
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
    assert store.get_snapshot(session_id).committed_segments[0].text == "final summary"


def test_session_websocket_continues_transcribing_while_summary_is_in_flight(
    tmp_path,
) -> None:
    class BlockingSummarizerService:
        def __init__(self) -> None:
            self.calls: list[list[CommittedSegment]] = []
            self.release_first_call = threading.Event()

        async def summarize(
            self, *, committed_segments: list[CommittedSegment]
        ) -> RollingSummaryResult:
            self.calls.append(committed_segments)
            if len(self.calls) == 1:
                await asyncio.to_thread(self.release_first_call.wait, 5)

            return RollingSummaryResult(
                summary="Overview text",
                bullets=["Bullet one"],
                action_items=["Action one"],
                nodes=[MindmapNode(id="topic", label="Topic")],
                edges=[MindmapEdge(id="topic-action", source="topic", target="action")],
                summary_blocks=[
                    SummaryBlock(id="summary:0", text="Overview text"),
                ],
            )

    store = SessionStore(root_dir=tmp_path)
    transcribe_service = FakeTranscribeService()
    summarizer_service = BlockingSummarizerService()
    app.dependency_overrides[get_session_store] = lambda: store
    app.dependency_overrides[get_transcribe_service] = lambda: transcribe_service
    app.dependency_overrides[get_summarizer_service] = lambda: summarizer_service
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

            websocket.receive_json()
            websocket.receive_json()

            websocket.send_json(
                {
                    "type": "utterance",
                    "utterance_id": "utt-2",
                    "sample_rate": 16000,
                    "samples": [0.2, -0.2, 0.3],
                }
            )

            deadline = time.monotonic() + 0.3
            while time.monotonic() < deadline and len(transcribe_service.calls) < 2:
                time.sleep(0.01)

            summarizer_service.release_first_call.set()
    finally:
        app.dependency_overrides.clear()

    assert len(transcribe_service.calls) == 2


def test_session_websocket_keeps_latest_summary_when_tasks_finish_out_of_order(
    tmp_path,
) -> None:
    from app.ws import CommittedTranscriptEvent

    class DistinctTranscribeService:
        async def transcribe_utterance(
            self, *, audio: object, sample_rate: int, utterance_id: str
        ):
            return [
                CommittedTranscriptEvent.model_validate(
                    {
                        "type": "committed_transcript",
                        "segment": {
                            "id": f"{utterance_id}:0",
                            "text": f"{utterance_id} committed",
                            "start_ms": 0,
                            "end_ms": 900,
                        },
                    }
                )
            ]

    class OutOfOrderSummarizerService:
        def __init__(self) -> None:
            self.release_first_call = threading.Event()

        async def summarize(
            self, *, committed_segments: list[CommittedSegment]
        ) -> RollingSummaryResult:
            last_segment = committed_segments[-1]
            if last_segment.id.startswith("utt-1"):
                await asyncio.to_thread(self.release_first_call.wait, 5)
                label = "first summary"
            else:
                label = "second summary"

            return RollingSummaryResult(
                summary=label,
                bullets=[],
                action_items=[],
                nodes=[MindmapNode(id=label, label=label)],
                edges=[],
                summary_blocks=[SummaryBlock(id="summary:0", text=label)],
            )

    store = SessionStore(root_dir=tmp_path)
    summarizer_service = OutOfOrderSummarizerService()
    app.dependency_overrides[get_session_store] = lambda: store
    app.dependency_overrides[get_transcribe_service] = (
        lambda: DistinctTranscribeService()
    )
    app.dependency_overrides[get_summarizer_service] = lambda: summarizer_service
    client = TestClient(app)

    try:
        with client.websocket_connect("/ws/session") as websocket:
            session_started = websocket.receive_json()
            session_id = session_started["session_id"]

            websocket.send_json(
                {
                    "type": "utterance",
                    "utterance_id": "utt-1",
                    "sample_rate": 16000,
                    "samples": [0.1, -0.1, 0.2],
                }
            )
            websocket.receive_json()

            websocket.send_json(
                {
                    "type": "utterance",
                    "utterance_id": "utt-2",
                    "sample_rate": 16000,
                    "samples": [0.2, -0.2, 0.3],
                }
            )
            websocket.receive_json()

            deadline = time.monotonic() + 0.3
            while time.monotonic() < deadline:
                summary_blocks = store.get_snapshot(session_id).summary_blocks
                if summary_blocks and summary_blocks[0].text == "second summary":
                    break
                time.sleep(0.01)

            summarizer_service.release_first_call.set()
            time.sleep(0.1)
    finally:
        app.dependency_overrides.clear()

    assert store.get_snapshot(session_id).summary_blocks[0].text == "second summary"
