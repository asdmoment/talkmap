from pathlib import Path

import pytest
from pydantic import ValidationError

from app.llm.base import JsonLlmClient
from app.llm.openai_compatible_client import OpenAiCompatibleClient
from app.models import CommittedSegment
from app.services.summarizer import RollingSummarizerService


class FakeLlmClient:
    def __init__(self, response: object) -> None:
        self.response = response
        self.calls: list[dict[str, str]] = []

    async def complete_json(self, *, prompt: str, transcript: str) -> object:
        self.calls.append({"prompt": prompt, "transcript": transcript})
        return self.response


class FakeOpenAiTransport:
    def __init__(self, payload: object) -> None:
        self.payload = payload

    def post_json(
        self,
        *,
        url: str,
        headers: dict[str, str],
        payload: object,
        timeout_s: float,
    ) -> object:
        return self.payload


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.mark.anyio
async def test_summarizer_returns_validated_result_and_events() -> None:
    client = FakeLlmClient(
        {
            "title": "Launch Discussion",
            "summary": "Discussed launch scope and owners.",
            "bullets": ["Finalize timeline", "Review open risks"],
            "action_items": ["Sam sends recap"],
            "nodes": [
                {"id": "launch", "label": "Launch"},
                {"id": "risks", "label": "Risks"},
            ],
            "edges": [{"id": "launch-risks", "source": "launch", "target": "risks"}],
        }
    )
    service = RollingSummarizerService(client=client)

    result = await service.summarize(
        committed_segments=[
            CommittedSegment(
                id="utt-1:0",
                text="We should finalize the launch timeline.",
                start_ms=0,
                end_ms=1000,
            ),
            CommittedSegment(
                id="utt-1:1",
                text="Sam will send a recap and we need to review the risks.",
                start_ms=1000,
                end_ms=2000,
            ),
        ]
    )

    assert client.calls == [
        {
            "prompt": (Path(__file__).resolve().parent.parent / "app" / "prompts" / "rolling_summary.txt").read_text(),
            "transcript": (
                "[utt-1:0] We should finalize the launch timeline.\n"
                "[utt-1:1] Sam will send a recap and we need to review the risks."
            ),
        }
    ]
    assert result.summary == "Discussed launch scope and owners."
    assert result.bullets == ["Finalize timeline", "Review open risks"]
    assert result.action_items == ["Sam sends recap"]
    assert [block.model_dump() for block in result.summary_blocks] == [
        {"id": "summary:0", "text": "Discussed launch scope and owners."},
        {"id": "bullet:0", "text": "Finalize timeline"},
        {"id": "bullet:1", "text": "Review open risks"},
        {"id": "action:0", "text": "Sam sends recap"},
    ]
    assert result.to_summary_event().model_dump() == {
        "type": "summary_updated",
        "blocks": [
            {"id": "summary:0", "text": "Discussed launch scope and owners."},
            {"id": "bullet:0", "text": "Finalize timeline"},
            {"id": "bullet:1", "text": "Review open risks"},
            {"id": "action:0", "text": "Sam sends recap"},
        ],
    }
    assert result.to_graph_event().model_dump() == {
        "type": "graph_updated",
        "nodes": [
            {"id": "launch", "label": "Launch"},
            {"id": "risks", "label": "Risks"},
        ],
        "edges": [{"id": "launch-risks", "source": "launch", "target": "risks"}],
    }


@pytest.mark.anyio
async def test_summarizer_rejects_invalid_llm_payload() -> None:
    client = FakeLlmClient(
        {
            "title": "Test Title",
            "summary": "Missing graph edges field.",
            "bullets": [],
            "action_items": [],
            "nodes": [],
        }
    )
    service = RollingSummarizerService(client=client)

    with pytest.raises(ValidationError):
        await service.summarize(
            committed_segments=[
                CommittedSegment(
                    id="utt-2:0",
                    text="Please summarize this.",
                    start_ms=0,
                    end_ms=500,
                )
            ]
        )


@pytest.mark.anyio
async def test_summarizer_rejects_extra_top_level_keys() -> None:
    client = FakeLlmClient(
        {
            "title": "Test Title",
            "summary": "Good summary.",
            "bullets": [],
            "action_items": [],
            "nodes": [],
            "edges": [],
            "extra": "not allowed",
        }
    )

    with pytest.raises(ValidationError):
        await RollingSummarizerService(client=client).summarize(
            committed_segments=[
                CommittedSegment(
                    id="utt-3:0",
                    text="Hello world.",
                    start_ms=0,
                    end_ms=100,
                )
            ]
        )


@pytest.mark.anyio
async def test_summarizer_rejects_extra_nested_node_and_edge_keys() -> None:
    client = FakeLlmClient(
        {
            "title": "Test Title",
            "summary": "Good summary.",
            "bullets": [],
            "action_items": [],
            "nodes": [{"id": "topic", "label": "Topic", "kind": "extra"}],
            "edges": [
                {
                    "id": "topic-next",
                    "source": "topic",
                    "target": "next",
                    "weight": 0.5,
                }
            ],
        }
    )

    with pytest.raises(ValidationError):
        await RollingSummarizerService(client=client).summarize(
            committed_segments=[
                CommittedSegment(
                    id="utt-4:0",
                    text="Hello world.",
                    start_ms=0,
                    end_ms=100,
                )
            ]
        )


@pytest.mark.anyio
async def test_summarizer_caches_prompt_at_construction_time(tmp_path: Path) -> None:
    prompt_path = tmp_path / "rolling_summary.txt"
    prompt_path.write_text("first prompt", encoding="utf-8")
    client = FakeLlmClient(
        {
            "title": "Test Title",
            "summary": "Good summary.",
            "bullets": [],
            "action_items": [],
            "nodes": [],
            "edges": [],
        }
    )
    service = RollingSummarizerService(client=client, prompt_path=prompt_path)

    prompt_path.write_text("second prompt", encoding="utf-8")

    await service.summarize(
        committed_segments=[
            CommittedSegment(id="utt-5:0", text="One.", start_ms=0, end_ms=1)
        ]
    )
    await service.summarize(
        committed_segments=[
            CommittedSegment(id="utt-5:1", text="Two.", start_ms=1, end_ms=2)
        ]
    )

    assert [call["prompt"] for call in client.calls] == ["first prompt", "first prompt"]


@pytest.mark.anyio
async def test_summarizer_accepts_openai_compatible_json_client() -> None:
    client: JsonLlmClient = OpenAiCompatibleClient(
        model="test-model",
        base_url="https://example.test/v1",
        transport=FakeOpenAiTransport(
            {
                "choices": [
                    {
                        "message": {
                            "content": '{"title":"Test","summary":"ok","bullets":[],"action_items":[],"nodes":[],"edges":[]}'
                        }
                    }
                ]
            }
        ),
    )

    result = await RollingSummarizerService(client=client).summarize(
        committed_segments=[
            CommittedSegment(id="c1", text="hello", start_ms=0, end_ms=10)
        ]
    )

    assert result.summary == "ok"
