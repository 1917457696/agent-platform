"""FastAPI 服务：多 Agent 咨询平台（会话隔离）+ 前端页面。

启动：
  & C:\\Users\\19174\\.conda\\envs\\EduRAG\\python.exe -m uvicorn app.server:app --host 127.0.0.1 --port 8001
访问：http://127.0.0.1:8001

接口：
  GET  /health          健康检查
  POST /api/chat        多 Agent 对话  {"question": "...", "session_id": "s1"}
  POST /api/reset       重置会话      {"session_id": "s1"}
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import FastAPI  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.responses import FileResponse  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402
from pydantic import BaseModel  # noqa: E402

from app.graph import AgentPlatform  # noqa: E402

app = FastAPI(title="多 Agent 医疗咨询平台", version="1.0.0")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)

_sessions: dict[str, AgentPlatform] = {}


def get_session(session_id: str) -> AgentPlatform:
    if session_id not in _sessions:
        _sessions[session_id] = AgentPlatform()
    return _sessions[session_id]


class ChatRequest(BaseModel):
    question: str
    session_id: str = "default"


class ResetRequest(BaseModel):
    session_id: str = "default"


@app.get("/health")
def health():
    return {"status": "ok", "sessions": len(_sessions)}


@app.post("/api/chat")
def chat(req: ChatRequest):
    """多 Agent 对话：意图路由 + 专家子图协作，session_id 隔离多会话。"""
    try:
        return get_session(req.session_id).ask(req.question)
    except Exception as e:
        return {"error": str(e), "hint": "请先运行 scripts/build_index.py --ingest data 建索引"}


@app.post("/api/reset")
def reset(req: ResetRequest):
    session = _sessions.pop(req.session_id, None)
    if session is not None:
        session.reset()
    return {"status": "ok", "reset": req.session_id}


# ---------- 前端静态页面 ----------
_STATIC = Path(__file__).resolve().parent.parent / "static"
app.mount("/static", StaticFiles(directory=str(_STATIC)), name="static")


@app.get("/")
def index():
    return FileResponse(str(_STATIC / "index.html"))
