"""三通道编排与按凭据隔离的运行时管理。

浏览器提供的 API Key 只保存在对应运行时对象的进程内存中；不会写入文件、
日志、缓存键或响应体。运行配置使用不可逆指纹隔离，避免不同使用者共享
Agent 历史或 FAQ 缓存。
"""
from collections import OrderedDict
from typing import Optional

from .cache import Cache
from .config import Config
from .faq import FaqMatcher
from .graph import EMERGENCY_ANSWER, AgentPlatform
from .tools import detect_emergency


class _RuntimeState:
    def __init__(self, cfg: Config) -> None:
        self.cfg = cfg
        self.faq: Optional[FaqMatcher] = None
        if cfg.has_embedding_credentials:
            try:
                self.faq = FaqMatcher(cfg)
            except Exception as exc:
                print(f"[warn] FAQ 初始化失败（{type(exc).__name__}），FAQ 通道降级")
        self.sessions: dict[str, AgentPlatform] = {}

    def get_agent(self, session_id: str) -> AgentPlatform:
        if session_id not in self.sessions:
            self.sessions[session_id] = AgentPlatform(self.cfg)
        return self.sessions[session_id]

    def reset(self, session_id: str) -> None:
        session = self.sessions.pop(session_id, None)
        if session is not None:
            session.reset()


class ChatService:
    def __init__(self, max_runtimes: int = 8) -> None:
        self._cache = Cache()
        self._max_runtimes = max_runtimes
        self._runtimes: "OrderedDict[str, _RuntimeState]" = OrderedDict()

    @property
    def cache_backend(self) -> str:
        return self._cache.backend

    @property
    def runtime_count(self) -> int:
        return len(self._runtimes)

    @property
    def session_count(self) -> int:
        return sum(len(runtime.sessions) for runtime in self._runtimes.values())

    def _get_runtime(self, cfg: Config) -> tuple[str, _RuntimeState]:
        key = cfg.runtime_fingerprint()
        runtime = self._runtimes.pop(key, None)
        if runtime is None:
            runtime = _RuntimeState(cfg)
        self._runtimes[key] = runtime
        while len(self._runtimes) > self._max_runtimes:
            self._runtimes.popitem(last=False)
        return key, runtime

    def reset(self, session_id: str) -> None:
        for runtime in self._runtimes.values():
            runtime.reset(session_id)

    def chat(self, question: str, session_id: str, cfg: Config) -> dict:
        q = question.strip()
        if not q:
            return {"answer": "请输入问题。", "channel": "empty"}

        # 急症护栏仍位于所有模型与检索通道之前。
        hit = detect_emergency(q)
        if hit:
            return {
                "answer": EMERGENCY_ANSWER,
                "channel": "guard",
                "emergency": hit,
            }

        runtime_key, runtime = self._get_runtime(cfg)

        cached = self._cache.get_answer(q, namespace=runtime_key)
        if cached:
            return {"answer": cached, "channel": "cache"}

        if runtime.faq is not None:
            faq = runtime.faq.match(q)
            if faq:
                self._cache.set_answer(
                    q,
                    faq["answer"],
                    channel="faq",
                    namespace=runtime_key,
                )
                return {
                    "answer": faq["answer"],
                    "channel": "faq",
                    "faq_question": faq["question"],
                    "score": faq["score"],
                }

        result = runtime.get_agent(session_id).ask(q)
        return {
            "answer": result["answer"],
            "channel": "agent",
            "route_trace": result["route_trace"],
        }
