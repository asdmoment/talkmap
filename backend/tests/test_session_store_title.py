import tempfile
from app.session_store import SessionStore


def test_set_title_persists():
    with tempfile.TemporaryDirectory() as tmp_dir:
        store = SessionStore(root_dir=tmp_dir)
        store.ensure_snapshot("session-t1")
        store.set_title("session-t1", "测试标题")
        store.flush("session-t1")

        store2 = SessionStore(root_dir=tmp_dir)
        snapshot = store2.get_snapshot("session-t1")
        assert snapshot.title == "测试标题"


def test_title_defaults_to_none():
    with tempfile.TemporaryDirectory() as tmp_dir:
        store = SessionStore(root_dir=tmp_dir)
        snapshot = store.ensure_snapshot("session-t2")
        assert snapshot.title is None
