from unittest.mock import AsyncMock

import pytest

from app.models import CommittedSegment
from app.services.summarizer import RollingSummarizerService


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.mark.anyio
async def test_summarizer_returns_title():
    mock_client = AsyncMock()
    mock_client.complete_json.return_value = {
        "title": "项目进度讨论",
        "summary": "讨论了项目进度",
        "bullets": ["进度正常"],
        "action_items": ["继续推进"],
        "nodes": [{"id": "n1", "label": "项目"}],
        "edges": [],
    }
    service = RollingSummarizerService(client=mock_client)
    result = await service.summarize(
        committed_segments=[
            CommittedSegment(id="s1", text="我们来讨论一下项目进度", start_ms=0, end_ms=1000)
        ]
    )
    assert result.title == "项目进度讨论"
