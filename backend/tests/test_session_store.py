import json

from app.models import (
    CommittedSegment,
    MindmapEdge,
    MindmapNode,
    PartialSegment,
    SummaryBlock,
)
from app.session_store import SessionStore


def test_session_store_appends_entities_and_persists_snapshot(tmp_path) -> None:
    store = SessionStore(root_dir=tmp_path)
    session_id = "session-123"

    partial_segment = PartialSegment(
        id="partial-1", text="hello", start_ms=0, end_ms=250
    )
    committed_segment = CommittedSegment(
        id="committed-1",
        text="hello world",
        start_ms=0,
        end_ms=500,
    )
    summary_block = SummaryBlock(id="summary-1", text="Greeting captured")
    mindmap_node = MindmapNode(id="node-1", label="Greeting")
    mindmap_edge = MindmapEdge(id="edge-1", source="node-1", target="node-2")

    store.append_partial_segment(session_id, partial_segment)
    store.append_committed_segment(session_id, committed_segment)
    store.append_summary_block(session_id, summary_block)
    store.append_mindmap_node(session_id, mindmap_node)
    store.append_mindmap_edge(session_id, mindmap_edge)

    snapshot = store.get_snapshot(session_id)
    session_file = tmp_path / "sessions" / f"{session_id}.json"

    assert snapshot.session_id == session_id
    assert snapshot.partial_segments == [partial_segment]
    assert snapshot.committed_segments == [committed_segment]
    assert snapshot.summary_blocks == [summary_block]
    assert snapshot.mindmap_nodes == [mindmap_node]
    assert snapshot.mindmap_edges == [mindmap_edge]

    assert session_file.exists()
    assert json.loads(session_file.read_text()) == snapshot.model_dump(mode="json")


def test_session_store_reloads_persisted_snapshot_for_new_instance(tmp_path) -> None:
    session_id = "session-456"
    first_store = SessionStore(root_dir=tmp_path)

    partial_segment = PartialSegment(
        id="partial-2", text="hi again", start_ms=500, end_ms=750
    )
    summary_block = SummaryBlock(id="summary-2", text="Follow-up captured")

    first_store.append_partial_segment(session_id, partial_segment)
    first_store.append_summary_block(session_id, summary_block)

    reloaded_store = SessionStore(root_dir=tmp_path)
    snapshot = reloaded_store.get_snapshot(session_id)

    assert snapshot.session_id == session_id
    assert snapshot.partial_segments == [partial_segment]
    assert snapshot.summary_blocks == [summary_block]
    assert snapshot.committed_segments == []
    assert snapshot.mindmap_nodes == []
    assert snapshot.mindmap_edges == []


def test_session_store_refreshes_stale_cached_snapshot_across_instances(
    tmp_path,
) -> None:
    session_id = "session-789"
    stale_store = SessionStore(root_dir=tmp_path)
    writer_store = SessionStore(root_dir=tmp_path)

    initial_snapshot = stale_store.get_snapshot(session_id)
    committed_segment = CommittedSegment(
        id="committed-2",
        text="new persisted text",
        start_ms=1000,
        end_ms=1500,
    )

    writer_store.append_committed_segment(session_id, committed_segment)

    refreshed_snapshot = stale_store.get_snapshot(session_id)

    assert initial_snapshot.committed_segments == []
    assert refreshed_snapshot.committed_segments == [committed_segment]
