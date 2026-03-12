from fastapi.testclient import TestClient

from app.main import app


def test_session_websocket_emits_initial_session_started_event() -> None:
    client = TestClient(app)

    with client.websocket_connect("/ws/session") as websocket:
        event = websocket.receive_json()

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
