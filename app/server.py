"""FastAPI 服务：按请求接收用户密钥，并托管 React 前端。

密钥只从请求头读取，传入进程内运行时；不会写入文件、数据库、日志或响应体。
"""
import ipaddress
import sys
from pathlib import Path
from typing import Annotated, Optional
from urllib.parse import urlparse

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import FastAPI, Header, HTTPException  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.responses import FileResponse  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402
from pydantic import BaseModel, ConfigDict, Field, field_validator  # noqa: E402

from app.config import Config  # noqa: E402
from app.service import ChatService  # noqa: E402

app = FastAPI(title="岐序中医教培智能助教", version="2.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "X-LLM-API-Key", "X-Embedding-API-Key"],
)

_service: ChatService | None = None


def get_service() -> ChatService:
    global _service
    if _service is None:
        _service = ChatService()
    return _service


def _validate_provider_url(value: str) -> str:
    """仅允许 HTTPS；本机开发地址可使用 HTTP。"""
    value = value.strip().rstrip("/")
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("服务地址必须是有效的 HTTP(S) URL")
    if parsed.username or parsed.password:
        raise ValueError("服务地址不能包含用户名或密码")
    if parsed.scheme == "http":
        host = parsed.hostname.lower()
        local = host == "localhost"
        if not local:
            try:
                local = ipaddress.ip_address(host).is_loopback
            except ValueError:
                local = False
        if not local:
            raise ValueError("非本机服务地址必须使用 HTTPS")
    return value


def _clean_key(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    key = value.strip()
    if not key:
        return None
    if len(key) > 4096 or "\n" in key or "\r" in key:
        raise HTTPException(status_code=400, detail={"code": "invalid_api_key"})
    return key


class ProviderConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    llm_base_url: str = Field("https://api.deepseek.com", max_length=500)
    llm_model: str = Field("deepseek-chat", min_length=1, max_length=120)
    embedding_base_url: str = Field(
        "https://dashscope.aliyuncs.com/compatible-mode/v1", max_length=500
    )
    embedding_model: str = Field("text-embedding-v3", min_length=1, max_length=120)

    @field_validator("llm_base_url", "embedding_base_url")
    @classmethod
    def validate_url(cls, value: str) -> str:
        return _validate_provider_url(value)

    @field_validator("llm_model", "embedding_model")
    @classmethod
    def validate_model(cls, value: str) -> str:
        value = value.strip()
        if not value or any(char in value for char in "\r\n"):
            raise ValueError("模型名称无效")
        return value


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    question: str = Field(min_length=1, max_length=8000)
    session_id: str = Field("default", min_length=1, max_length=120)
    provider: ProviderConfig = Field(default_factory=ProviderConfig)


class ResetRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    session_id: str = Field("default", min_length=1, max_length=120)


@app.get("/health")
def health():
    """不初始化模型或向量服务的轻量健康检查。"""
    svc = get_service()
    return {
        "status": "ok",
        "cache_backend": svc.cache_backend,
        "runtimes": svc.runtime_count,
        "sessions": svc.session_count,
    }


@app.get("/api/config/status")
def config_status():
    """仅返回是否已配置及公开默认值，绝不返回密钥。"""
    cfg = Config()
    return {
        "server_has_llm_key": cfg.has_llm_credentials,
        "server_has_embedding_key": cfg.has_embedding_credentials,
        "defaults": {
            "llm_base_url": cfg.llm_base_url,
            "llm_model": cfg.llm_model,
            "embedding_base_url": cfg.embedding_base_url,
            "embedding_model": cfg.embedding_model,
            "knowledge_focus": "tcm" if cfg.tcm_focus else "mixed-medical",
        },
    }


@app.post("/api/chat")
def chat(
    req: ChatRequest,
    llm_api_key: Annotated[Optional[str], Header(alias="X-LLM-API-Key")] = None,
    embedding_api_key: Annotated[
        Optional[str], Header(alias="X-Embedding-API-Key")
    ] = None,
):
    """执行问答；请求头密钥只进入当前进程的隔离运行时。"""
    request_llm_key = _clean_key(llm_api_key)
    request_embedding_key = _clean_key(embedding_api_key)
    if not request_llm_key:
        raise HTTPException(
            status_code=401,
            detail={
                "code": "api_key_required",
                "message": "请先在页面中配置模型 API Key。",
            },
        )
    cfg = Config(
        llm_api_key=request_llm_key,
        llm_base_url=req.provider.llm_base_url,
        llm_model=req.provider.llm_model,
        # 明确传入空串，避免 HTTP 请求意外借用服务端环境变量中的 Key。
        embedding_api_key=request_embedding_key or "",
        embedding_base_url=req.provider.embedding_base_url,
        embedding_model=req.provider.embedding_model,
    )
    try:
        return get_service().chat(req.question, req.session_id, cfg)
    except HTTPException:
        raise
    except Exception as exc:
        # 仅暴露异常类型与可行动提示，不回显 SDK 错误中的 URL/Key/请求内容。
        raise HTTPException(
            status_code=502,
            detail={
                "code": "runtime_unavailable",
                "message": "模型服务暂时不可用，请检查服务地址、模型名称和密钥权限。",
                "type": type(exc).__name__,
            },
        ) from None


@app.post("/api/reset")
def reset(req: ResetRequest):
    get_service().reset(req.session_id)
    return {"status": "ok", "reset": req.session_id}


# ---------- React 构建产物 ----------
_STATIC = Path(__file__).resolve().parent.parent / "static"
app.mount(
    "/assets",
    StaticFiles(directory=str(_STATIC / "assets"), check_dir=False),
    name="assets",
)


@app.get("/")
def index():
    index_file = _STATIC / "index.html"
    if not index_file.exists():
        raise HTTPException(status_code=503, detail={"code": "frontend_not_built"})
    return FileResponse(str(index_file))
