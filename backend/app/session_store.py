import json
import os
import tempfile
from pathlib import Path

from .models import (
    CommittedSegment,
    MindmapEdge,
    MindmapNode,
    PartialSegment,
    SessionSnapshot,
    SummaryBlock,
)


class SessionStore:
    def __init__(self, root_dir: str | Path = "data") -> None:
        self._root_dir = Path(root_dir)
        self._sessions_dir = self._root_dir / "sessions"
        self._snapshots: dict[str, SessionSnapshot] = {}
        self._snapshot_versions: dict[str, int | None] = {}

    def get_snapshot(self, session_id: str) -> SessionSnapshot:
        current_version = self._get_session_version(session_id)
        cached_version = self._snapshot_versions.get(session_id)

        if session_id not in self._snapshots or cached_version != current_version:
            self._snapshots[session_id] = self._load_snapshot(session_id)
            self._snapshot_versions[session_id] = current_version
        return self._snapshots[session_id]

    def has_snapshot(self, session_id: str) -> bool:
        return (self._sessions_dir / f"{session_id}.json").exists()

    def ensure_snapshot(self, session_id: str) -> SessionSnapshot:
        snapshot = self.get_snapshot(session_id)
        if not self.has_snapshot(session_id):
            self._persist(snapshot)
        return snapshot

    def append_partial_segment(
        self, session_id: str, segment: PartialSegment
    ) -> SessionSnapshot:
        snapshot = self.get_snapshot(session_id)
        snapshot.partial_segments = [
            existing
            for existing in snapshot.partial_segments
            if existing.id != segment.id
        ]
        snapshot.partial_segments.append(segment)
        self._persist(snapshot)
        return snapshot

    def append_committed_segment(
        self, session_id: str, segment: CommittedSegment
    ) -> SessionSnapshot:
        snapshot = self.get_snapshot(session_id)
        snapshot.partial_segments = [
            existing
            for existing in snapshot.partial_segments
            if existing.id != segment.id
        ]
        snapshot.committed_segments = [
            existing
            for existing in snapshot.committed_segments
            if existing.id != segment.id
        ]
        snapshot.committed_segments.append(segment)
        self._persist(snapshot)
        return snapshot

    def replace_summary_blocks(
        self, session_id: str, blocks: list[SummaryBlock]
    ) -> SessionSnapshot:
        snapshot = self.get_snapshot(session_id)
        snapshot.summary_blocks = list(blocks)
        self._persist(snapshot)
        return snapshot

    def replace_mindmap(
        self, session_id: str, nodes: list[MindmapNode], edges: list[MindmapEdge]
    ) -> SessionSnapshot:
        snapshot = self.get_snapshot(session_id)
        snapshot.mindmap_nodes = list(nodes)
        snapshot.mindmap_edges = list(edges)
        self._persist(snapshot)
        return snapshot

    def append_summary_block(
        self, session_id: str, block: SummaryBlock
    ) -> SessionSnapshot:
        snapshot = self.get_snapshot(session_id)
        snapshot.summary_blocks.append(block)
        self._persist(snapshot)
        return snapshot

    def append_mindmap_node(
        self, session_id: str, node: MindmapNode
    ) -> SessionSnapshot:
        snapshot = self.get_snapshot(session_id)
        snapshot.mindmap_nodes.append(node)
        self._persist(snapshot)
        return snapshot

    def append_mindmap_edge(
        self, session_id: str, edge: MindmapEdge
    ) -> SessionSnapshot:
        snapshot = self.get_snapshot(session_id)
        snapshot.mindmap_edges.append(edge)
        self._persist(snapshot)
        return snapshot

    def _persist(self, snapshot: SessionSnapshot) -> None:
        self._sessions_dir.mkdir(parents=True, exist_ok=True)
        session_file = self._sessions_dir / f"{snapshot.session_id}.json"
        with tempfile.NamedTemporaryFile(
            "w",
            encoding="utf-8",
            dir=self._sessions_dir,
            delete=False,
        ) as temp_file:
            json.dump(snapshot.model_dump(mode="json"), temp_file)
            temp_file.flush()
            os.fsync(temp_file.fileno())
            temp_path = Path(temp_file.name)

        temp_path.replace(session_file)
        self._snapshot_versions[snapshot.session_id] = self._get_session_version(
            snapshot.session_id
        )

    def _load_snapshot(self, session_id: str) -> SessionSnapshot:
        session_file = self._sessions_dir / f"{session_id}.json"
        if not session_file.exists():
            return SessionSnapshot(session_id=session_id)

        return SessionSnapshot.model_validate_json(
            session_file.read_text(encoding="utf-8")
        )

    def _get_session_version(self, session_id: str) -> int | None:
        session_file = self._sessions_dir / f"{session_id}.json"
        if not session_file.exists():
            return None

        return session_file.stat().st_mtime_ns
