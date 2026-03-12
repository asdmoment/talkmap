from pydantic import BaseModel

from .config import Status


class HealthResponse(BaseModel):
    ok: bool
    asr_status: Status
    llm_status: Status
