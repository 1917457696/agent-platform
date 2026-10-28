"""配置：从环境变量 / .env 读取（无第三方依赖的最小 .env 加载）。

与 rag-assistant 为同作者独立项目，但完全自包含：本项目的所有相对路径
均基于本项目根目录解析，不依赖任何外部项目。
"""
import hashlib
import os
from pathlib import Path
from typing import Optional

PROJECT_ROOT = Path(__file__).resolve().parent.parent
_ENV_PATH = PROJECT_ROOT / ".env"


def _resolve_path(value: str) -> str:
    """相对路径统一解析到项目根目录下（避免 CWD 依赖）。"""
    p = Path(value)
    if p.is_absolute():
        return str(p)
    return str(PROJECT_ROOT / p)


def _load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        k, v = k.strip(), v.strip().strip('"').strip("'")
        if k and k not in os.environ:
            os.environ[k] = v


_load_dotenv(_ENV_PATH)


def _get_str(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


class Config:
    """平台全部可调参数。"""

    def __init__(
        self,
        *,
        llm_api_key: Optional[str] = None,
        llm_base_url: Optional[str] = None,
        llm_model: Optional[str] = None,
        embedding_api_key: Optional[str] = None,
        embedding_base_url: Optional[str] = None,
        embedding_model: Optional[str] = None,
    ) -> None:
        def pick(value: Optional[str], env_name: str, default: str = "") -> str:
            return (value if value is not None else _get_str(env_name, default)).strip()

        # LLM（OpenAI 兼容）
        self.llm_api_key = pick(llm_api_key, "LLM_API_KEY")
        self.llm_base_url = pick(
            llm_base_url, "LLM_BASE_URL", "https://api.deepseek.com"
        )
        self.llm_model = pick(llm_model, "LLM_MODEL", "deepseek-chat")
        self.llm_temperature = float(_get_str("LLM_TEMPERATURE", "0.1"))
        # Embedding
        self.embedding_provider = _get_str("EMBEDDING_PROVIDER", "openai_compatible")
        self.embedding_base_url = pick(
            embedding_base_url,
            "EMBEDDING_BASE_URL",
            "https://dashscope.aliyuncs.com/compatible-mode/v1",
        )
        self.embedding_api_key = pick(embedding_api_key, "EMBEDDING_API_KEY")
        self.embedding_model = pick(
            embedding_model, "EMBEDDING_MODEL", "text-embedding-v3"
        )
        # 知识库与检索
        self.data_dir = _resolve_path(_get_str("DATA_DIR", "./data"))
        self.vector_store_dir = _resolve_path(_get_str("VECTOR_STORE_DIR", "./data/index"))
        self.chunk_size = int(_get_str("CHUNK_SIZE", "500"))
        self.chunk_overlap = int(_get_str("CHUNK_OVERLAP", "50"))
        self.top_k = int(_get_str("TOP_K", "5"))
        # Agent 平台
        self.max_steps = int(_get_str("MAX_STEPS", "6"))
        self.recursion_limit = int(_get_str("RECURSION_LIMIT", "40"))

    @property
    def has_llm_credentials(self) -> bool:
        return bool(self.llm_api_key)

    @property
    def has_embedding_credentials(self) -> bool:
        return self.embedding_provider == "local" or bool(self.embedding_api_key)

    def runtime_fingerprint(self) -> str:
        """返回不含明文密钥的运行配置指纹，用于隔离会话与缓存。"""
        payload = "\x1f".join(
            [
                self.llm_base_url,
                self.llm_model,
                hashlib.sha256(self.llm_api_key.encode("utf-8")).hexdigest(),
                self.embedding_provider,
                self.embedding_base_url,
                self.embedding_model,
                hashlib.sha256(self.embedding_api_key.encode("utf-8")).hexdigest(),
            ]
        )
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:20]
