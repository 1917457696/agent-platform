"""配置：从环境变量 / .env 读取（无第三方依赖的最小 .env 加载）。

与 rag-assistant 为同作者独立项目，但完全自包含：本项目的所有相对路径
均基于本项目根目录解析，不依赖任何外部项目。
"""
import os
from pathlib import Path

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

    def __init__(self) -> None:
        # LLM（OpenAI 兼容）
        self.llm_api_key = _get_str("LLM_API_KEY")
        self.llm_base_url = _get_str("LLM_BASE_URL", "https://api.deepseek.com")
        self.llm_model = _get_str("LLM_MODEL", "deepseek-chat")
        self.llm_temperature = float(_get_str("LLM_TEMPERATURE", "0.1"))
        # Embedding
        self.embedding_provider = _get_str("EMBEDDING_PROVIDER", "openai_compatible")
        self.embedding_base_url = _get_str(
            "EMBEDDING_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1"
        )
        self.embedding_api_key = _get_str("EMBEDDING_API_KEY")
        self.embedding_model = _get_str("EMBEDDING_MODEL", "text-embedding-v3")
        # 知识库与检索
        self.data_dir = _resolve_path(_get_str("DATA_DIR", "./data"))
        self.vector_store_dir = _resolve_path(_get_str("VECTOR_STORE_DIR", "./data/index"))
        self.chunk_size = int(_get_str("CHUNK_SIZE", "500"))
        self.chunk_overlap = int(_get_str("CHUNK_OVERLAP", "50"))
        self.top_k = int(_get_str("TOP_K", "5"))
        # Agent 平台
        self.max_steps = int(_get_str("MAX_STEPS", "6"))
        self.recursion_limit = int(_get_str("RECURSION_LIMIT", "40"))
