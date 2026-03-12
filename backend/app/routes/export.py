from functools import lru_cache

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse, PlainTextResponse

from ..config import Settings, get_settings
from ..models import SessionSnapshot
from ..session_store import SessionStore

router = APIRouter()


@lru_cache(maxsize=None)
def _build_session_store(root_dir: str) -> SessionStore:
    return SessionStore(root_dir=root_dir)


def get_session_store(settings: Settings = Depends(get_settings)) -> SessionStore:
    return _build_session_store(settings.data_dir)


def _get_persisted_snapshot(store: SessionStore, session_id: str) -> SessionSnapshot:
    if not store.has_snapshot(session_id):
        raise HTTPException(status_code=404, detail="Session not found")

    return store.get_snapshot(session_id)


def _render_markdown(snapshot: SessionSnapshot) -> str:
    lines = [f"# Session {snapshot.session_id}", "", "## Summary"]

    if snapshot.summary_blocks:
        lines.extend(
            f"- {_normalize_markdown_text(block.text)}"
            for block in snapshot.summary_blocks
        )
    else:
        lines.append("- None")

    lines.extend(["", "## Transcript"])
    if snapshot.committed_segments:
        lines.extend(
            f"{index}. [{segment.start_ms}-{segment.end_ms} ms] {_normalize_markdown_text(segment.text)}"
            for index, segment in enumerate(snapshot.committed_segments, start=1)
        )
    else:
        lines.append("- None")

    lines.extend(["", "## Mind Map", "Nodes:"])
    if snapshot.mindmap_nodes:
        lines.extend(
            f"- {node.id}: {_normalize_markdown_text(node.label)}"
            for node in snapshot.mindmap_nodes
        )
    else:
        lines.append("- None")

    lines.extend(["", "Edges:"])
    if snapshot.mindmap_edges:
        lines.extend(
            f"- {_normalize_markdown_text(edge.source)} -> {_normalize_markdown_text(edge.target)}"
            for edge in snapshot.mindmap_edges
        )
    else:
        lines.append("- None")

    lines.append("")
    return "\n".join(lines)


def _normalize_markdown_text(value: str) -> str:
    return " ".join(value.splitlines())


@router.get("/api/session/{session_id}/export.json")
def export_session_json(
    session_id: str, store: SessionStore = Depends(get_session_store)
) -> JSONResponse:
    snapshot = _get_persisted_snapshot(store, session_id)
    return JSONResponse(snapshot.model_dump(mode="json"))


@router.get("/api/session/{session_id}/export.md")
def export_session_markdown(
    session_id: str, store: SessionStore = Depends(get_session_store)
) -> PlainTextResponse:
    snapshot = _get_persisted_snapshot(store, session_id)
    return PlainTextResponse(_render_markdown(snapshot))
