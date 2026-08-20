"""FastAPI 服务：多 Agent 咨询平台（三通道：缓存/FAQ/Agent）+ 前端页面。

启动：
  & C:\\Users\\19174\\.conda\\envs\\EduRAG\\python.exe -m uvicorn app.server:app --host 127.0.0.1 --port 8001
访问：http://127.0.0.1:8001

接口：
  GET  /health          健康检查
  POST /api/chat        三通道问答  {"question": "...", "session_id": "s1"}
  POST /api/reset       重置会话    {"session_id": "s1"}
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import FastAPI  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.responses import FileResponse  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402
from pydantic import BaseModel  # noqa: E402

from app.service import ChatService  # noqa: E402

app = FastAPI(title="多 Agent 医疗咨询平台（三通道）", version="1.1.0")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)

_service: ChatService | None = None


def get_service() -> ChatService:
    global _service
    if _service is None:
        _service = ChatService()
    return _service


class ChatRequest(BaseModel):
    question: str
    session_id: str = "default"


class ResetRequest(BaseModel):
    session_id: str = "default"


@app.get("/health")
def health():
    svc = get_service()
    return {"status": "ok", "sessions": len(svc._sessions), "cache_backend": svc.cache_backend}


@app.post("/api/chat")
def chat(req: ChatRequest):
    """三通道问答：缓存/FAQ 秒回（零 LLM 成本），Agent 兜底（session 隔离）。"""
    try:
        return get_service().chat(req.question, req.session_id)
    except Exception as e:
        return {"error": str(e), "hint": "请先运行 scripts/build_faq.py 与 scripts/build_index.py"}


@app.post("/api/reset")
def reset(req: ResetRequest):
    get_service().reset(req.session_id)
    return {"status": "ok", "reset": req.session_id}


# ---------- 前端静态页面 ----------
_STATIC = Path(__file__).resolve().parent.parent / "static"
app.mount("/static", StaticFiles(directory=str(_STATIC)), name="static")


@app.get("/")
def index():
    return FileResponse(str(_STATIC / "index.html"))
