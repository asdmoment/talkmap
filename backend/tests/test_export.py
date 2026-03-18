from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.models import CommittedSegment, MindmapEdge, MindmapNode, SummaryBlock
from app.session_store import SessionStore
from app.main import app
from app.routes.export import get_session_store


@pytest.fixture(autouse=True)
def clear_dependency_overrides() -> Iterator[None]:
    app.dependency_overrides.clear()
    yield
    app.dependency_overrides.clear()


def test_export_json_returns_structured_session_snapshot(tmp_path) -> None:
    store = SessionStore(root_dir=tmp_path)
    session_id = "session-export"
    store.append_committed_segment(
        session_id,
        CommittedSegment(
            id="committed-1",
            text="Capture the project goals.",
            start_ms=0,
            end_ms=1200,
        ),
    )
    store.append_summary_block(
        session_id,
        SummaryBlock(id="summary-1", text="Project goals captured."),
    )
    store.append_mindmap_node(
        session_id,
        MindmapNode(id="node-1", label="Goals"),
    )
    store.append_mindmap_edge(
        session_id,
        MindmapEdge(id="edge-1", source="node-1", target="node-2"),
    )

    app.dependency_overrides[get_session_store] = lambda: store
    client = TestClient(app)

    response = client.get(f"/api/session/{session_id}/export.json")

    assert response.status_code == 200
    assert response.json() == {
        "session_id": "session-export",
        "title": None,
        "partial_segments": [],
        "committed_segments": [
            {
                "id": "committed-1",
                "text": "Capture the project goals.",
                "start_ms": 0,
                "end_ms": 1200,
            }
        ],
        "summary_blocks": [{"id": "summary-1", "text": "Project goals captured."}],
        "mindmap_nodes": [{"id": "node-1", "label": "Goals"}],
        "mindmap_edges": [{"id": "edge-1", "source": "node-1", "target": "node-2"}],
    }


def test_export_markdown_returns_readable_snapshot(tmp_path) -> None:
    store = SessionStore(root_dir=tmp_path)
    session_id = "session-markdown"
    store.append_committed_segment(
        session_id,
        CommittedSegment(
            id="committed-1",
            text="First committed note.",
            start_ms=0,
            end_ms=1000,
        ),
    )
    store.append_committed_segment(
        session_id,
        CommittedSegment(
            id="committed-2",
            text="Second committed note.",
            start_ms=1000,
            end_ms=2000,
        ),
    )
    store.append_summary_block(
        session_id,
        SummaryBlock(id="summary-1", text="Two notes captured."),
    )
    store.append_mindmap_node(
        session_id,
        MindmapNode(id="node-1", label="Topic A"),
    )
    store.append_mindmap_node(
        session_id,
        MindmapNode(id="node-2", label="Topic B"),
    )
    store.append_mindmap_edge(
        session_id,
        MindmapEdge(id="edge-1", source="node-1", target="node-2"),
    )

    app.dependency_overrides[get_session_store] = lambda: store
    client = TestClient(app)

    response = client.get(f"/api/session/{session_id}/export.md")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/plain")
    assert (
        response.text
        == """# Session session-markdown

## Summary
- Two notes captured.

## Transcript
1. [0-1000 ms] First committed note.
2. [1000-2000 ms] Second committed note.

## Mind Map
Nodes:
- node-1: Topic A
- node-2: Topic B

Edges:
- node-1 -> node-2
"""
    )


def test_export_returns_404_for_missing_session(tmp_path) -> None:
    store = SessionStore(root_dir=tmp_path)

    app.dependency_overrides[get_session_store] = lambda: store
    client = TestClient(app)

    response = client.get("/api/session/missing-session/export.json")

    assert response.status_code == 404
    assert response.json() == {"detail": "Session not found"}


def test_export_markdown_normalizes_multiline_content_and_empty_sections(
    tmp_path,
) -> None:
    store = SessionStore(root_dir=tmp_path)
    session_id = "session-normalized"
    store.append_summary_block(
        session_id,
        SummaryBlock(id="summary-1", text="First line\nSecond line"),
    )

    app.dependency_overrides[get_session_store] = lambda: store
    client = TestClient(app)

    response = client.get(f"/api/session/{session_id}/export.md")

    assert response.status_code == 200
    assert (
        response.text
        == """# Session session-normalized

## Summary
- First line Second line

## Transcript
- None

## Mind Map
Nodes:
- None

Edges:
- None
"""
    )


def test_get_session_store_uses_configured_data_dir() -> None:
    store = get_session_store(Settings(data_dir="custom-data"))

    assert store._root_dir.name == "custom-data"
