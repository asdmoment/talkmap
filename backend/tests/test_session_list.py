import tempfile

from fastapi.testclient import TestClient

from app.main import app
from app.routes.export import get_session_store
from app.session_store import SessionStore


def test_list_sessions_empty():
    with tempfile.TemporaryDirectory() as tmp_dir:
        store = SessionStore(root_dir=tmp_dir)
        app.dependency_overrides[get_session_store] = lambda: store
        try:
            client = TestClient(app)
            response = client.get("/api/sessions")
            assert response.status_code == 200
            assert response.json() == []
        finally:
            app.dependency_overrides.pop(get_session_store, None)


def test_list_sessions_returns_items():
    with tempfile.TemporaryDirectory() as tmp_dir:
        store = SessionStore(root_dir=tmp_dir)
        store.ensure_snapshot("session-aaa")
        store.ensure_snapshot("session-bbb")
        app.dependency_overrides[get_session_store] = lambda: store
        try:
            client = TestClient(app)
            response = client.get("/api/sessions")
            assert response.status_code == 200
            data = response.json()
            assert len(data) == 2
            ids = {item["session_id"] for item in data}
            assert ids == {"session-aaa", "session-bbb"}
            for item in data:
                assert "created_at" in item
                assert isinstance(item["segment_count"], int)
        finally:
            app.dependency_overrides.pop(get_session_store, None)


def test_list_sessions_includes_title():
    with tempfile.TemporaryDirectory() as tmp_dir:
        store = SessionStore(root_dir=tmp_dir)
        store.ensure_snapshot("session-titled")
        store.set_title("session-titled", "我的会话")
        store.flush("session-titled")
        app.dependency_overrides[get_session_store] = lambda: store
        try:
            client = TestClient(app)
            response = client.get("/api/sessions")
            assert response.status_code == 200
            data = response.json()
            assert len(data) == 1
            assert data[0]["title"] == "我的会话"
        finally:
            app.dependency_overrides.pop(get_session_store, None)


def test_delete_session_success():
    with tempfile.TemporaryDirectory() as tmp_dir:
        store = SessionStore(root_dir=tmp_dir)
        store.ensure_snapshot("session-del")
        app.dependency_overrides[get_session_store] = lambda: store
        try:
            client = TestClient(app)
            resp = client.delete("/api/session/session-del")
            assert resp.status_code == 200
            assert resp.json()["status"] == "deleted"
            resp2 = client.get("/api/session/session-del/export.json")
            assert resp2.status_code == 404
        finally:
            app.dependency_overrides.pop(get_session_store, None)


def test_delete_session_not_found():
    with tempfile.TemporaryDirectory() as tmp_dir:
        store = SessionStore(root_dir=tmp_dir)
        app.dependency_overrides[get_session_store] = lambda: store
        try:
            client = TestClient(app)
            resp = client.delete("/api/session/nonexistent")
            assert resp.status_code == 404
        finally:
            app.dependency_overrides.pop(get_session_store, None)
