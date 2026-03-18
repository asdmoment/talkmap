from fastapi.testclient import TestClient

from app.main import app


def test_health_returns_backend_statuses() -> None:
    client = TestClient(app)

    response = client.get("/api/health")

    assert response.status_code == 200
    data = response.json()
    assert data["ok"] is True
    assert data["asr_status"] in ("unconfigured", "ready")
    assert data["llm_status"] in ("unconfigured", "ready")
