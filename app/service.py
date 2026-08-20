"""三通道编排：急症护栏 → Redis 缓存 → FAQ 相似度 → Agent 兜底。

请求链路（从便宜到昂贵，企业"分层拦截"思想的落地）：
  ① guard   急症规则检测（零成本）→ 命中直接提示就医
  ② cache   Redis 缓存命中（秒回，零 LLM 成本）→ 未命中继续
  ③ faq     FAQ 语义相似度命中（零 LLM 成本，写缓存）→ 未命中继续
  ④ agent   主控路由 + 专家子图兜底（带来源/路由轨迹）

收益：高频问题（缓存+FAQ）零 LLM 成本毫秒级返回，只有复杂问题消耗 LLM——
对应企业里"FAQ 命中率 60-80% = 60-80% 请求不打 LLM"的成本控制思想。
"""
from typing import Optional

from .cache import Cache
from .faq import FaqMatcher
from .graph import EMERGENCY_ANSWER, AgentPlatform
from .tools import detect_emergency


class ChatService:
    def __init__(self) -> None:
        self._cache = Cache()
        self._faq = FaqMatcher()
        self._sessions: dict = {}

    @property
    def cache_backend(self) -> str:
        return self._cache.backend

    def _get_agent(self, session_id: str) -> AgentPlatform:
        if session_id not in self._sessions:
            self._sessions[session_id] = AgentPlatform()
        return self._sessions[session_id]

    def reset(self, session_id: str) -> None:
        session = self._sessions.pop(session_id, None)
        if session is not None:
            session.reset()

    def chat(self, question: str, session_id: str = "default") -> dict:
        q = question.strip()
        if not q:
            return {"answer": "请输入问题。", "channel": "empty"}

        # ① 急症护栏（规则前置，任何通道命中急症都直接提示就医）
        hit = detect_emergency(q)
        if hit:
            return {
                "answer": EMERGENCY_ANSWER,
                "channel": "guard",
                "emergency": hit,
            }

        # ② Redis 缓存（完全相同的问法秒回）
        cached = self._cache.get_answer(q)
        if cached:
            return {"answer": cached, "channel": "cache"}

        # ③ FAQ 语义相似度（改写问法也能命中，零 LLM 成本）
        faq = self._faq.match(q)
        if faq:
            self._cache.set_answer(q, faq["answer"], channel="faq")
            return {
                "answer": faq["answer"],
                "channel": "faq",
                "faq_question": faq["question"],
                "score": faq["score"],
            }

        # ④ Agent 兜底（主控路由 + 专家子图）
        result = self._get_agent(session_id).ask(q)
        return {
            "answer": result["answer"],
            "channel": "agent",
            "route_trace": result["route_trace"],
        }
