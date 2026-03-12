from fastapi import FastAPI

from .config import get_settings
from .routes.export import router as export_router
from .schemas import HealthResponse
from .ws import router as ws_router


app = FastAPI()
app.include_router(ws_router)
app.include_router(export_router)


@app.get("/api/health", response_model=HealthResponse)
def health() -> HealthResponse:
    settings = get_settings()
    return HealthResponse(
        ok=True,
        asr_status=settings.asr_status,
        llm_status=settings.llm_status,
    )
