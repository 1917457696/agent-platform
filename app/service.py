"""三通道编排与按凭据隔离的运行时管理。

浏览器提供的 API Key 只保存在对应运行时对象的进程内存中；不会写入文件、
日志、缓存键或响应体。运行配置使用不可逆指纹隔离，避免不同使用者共享
Agent 历史或 FAQ 缓存。
"""
from collections import OrderedDict
from time import perf_counter
from uuid import uuid4
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

    @staticmethod
    def _observation(*, started: float, question: str, answer: str, channel: str, nodes: list[dict]) -> dict:
        estimated_tokens = max(1, round((len(question) + len(answer)) / 2.6))
        return {
            "trace_id": uuid4().hex,
            "latency_ms": round((perf_counter() - started) * 1000),
            "channel": channel,
            "token_usage": {"total_tokens": estimated_tokens, "estimated": True},
            "nodes": nodes,
            "exporter": "本地 Trace",
        }

    def chat(self, question: str, session_id: str, cfg: Config) -> dict:
        started = perf_counter()
        q = question.strip()
        if not q:
            answer = "请输入问题。"
            return {"answer": answer, "channel": "empty", "observability": self._observation(started=started, question=q, answer=answer, channel="empty", nodes=[])}

        # 急症护栏仍位于所有模型与检索通道之前。
        hit = detect_emergency(q)
        if hit:
            answer = EMERGENCY_ANSWER
            return {
                "answer": answer,
                "channel": "guard",
                "emergency": hit,
                "observability": self._observation(started=started, question=q, answer=answer, channel="guard", nodes=[{"name": "guard", "label": "安全护栏", "status": "completed", "detail": "命中急症信号，跳过模型", "duration_ms": round((perf_counter() - started) * 1000)}]),
            }

        runtime_key, runtime = self._get_runtime(cfg)

        cached = self._cache.get_answer(q, namespace=runtime_key)
        if cached:
            return {"answer": cached, "channel": "cache", "observability": self._observation(started=started, question=q, answer=cached, channel="cache", nodes=[{"name": "cache", "label": "缓存命中", "status": "completed", "detail": "复用已验证答案"}])}

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
                    "observability": self._observation(started=started, question=q, answer=faq["answer"], channel="faq", nodes=[{"name": "faq", "label": "FAQ 命中", "status": "completed", "detail": "复用已审核高频答案"}]),
                }

        result = runtime.get_agent(session_id).ask(q)
        return {
            "answer": result["answer"],
            "channel": "agent",
            "route_trace": result["route_trace"],
            "observability": result.get("observability"),
        }
