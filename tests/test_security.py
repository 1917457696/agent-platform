"""不访问外部网络的凭据隔离与 API 契约测试。"""
import os
import unittest
from unittest.mock import patch

from fastapi import HTTPException
from pydantic import ValidationError

from app.cache import Cache
from app.config import Config
from app.graph import _build_retrieval_tool
from app import server


class _FakeService:
    cache_backend = "memory"
    runtime_count = 0
    session_count = 0

    def __init__(self) -> None:
        self.last_config = None

    def chat(self, question: str, session_id: str, cfg: Config) -> dict:
        self.last_config = cfg
        return {"answer": f"received:{question}", "channel": "agent"}

    def reset(self, session_id: str) -> None:
        return None


class _FailingService(_FakeService):
    def chat(self, question: str, session_id: str, cfg: Config) -> dict:
        raise RuntimeError("dummy-key-must-not-leak")


class ConfigSecurityTests(unittest.TestCase):
    def test_fingerprint_is_stable_isolated_and_never_plaintext(self):
        first = Config(llm_api_key="secret-one", embedding_api_key="embed-one")
        same = Config(llm_api_key="secret-one", embedding_api_key="embed-one")
        other = Config(llm_api_key="secret-two", embedding_api_key="embed-one")

        self.assertEqual(first.runtime_fingerprint(), same.runtime_fingerprint())
        self.assertNotEqual(first.runtime_fingerprint(), other.runtime_fingerprint())
        self.assertNotIn("secret", first.runtime_fingerprint())

    def test_cache_namespaces_do_not_share_answers(self):
        cache = Cache(port=6399)
        cache.set_answer("同一个问题", "A", namespace="user-a")
        cache.set_answer("同一个问题", "B", namespace="user-b")

        self.assertEqual(cache.get_answer("同一个问题", "user-a"), "A")
        self.assertEqual(cache.get_answer("同一个问题", "user-b"), "B")

    def test_default_retrieval_focuses_curated_tcm_demo_corpus(self):
        cfg = Config(llm_api_key="dummy-key")
        self.assertTrue(cfg.tcm_focus)
        tool = _build_retrieval_tool(cfg)
        result = tool.invoke({"query": "四诊合参在医案学习中怎么用"})

        self.assertIn("四诊", result)
        self.assertIn("tcm_demo.md", result)


class ServerSecurityTests(unittest.TestCase):
    def setUp(self):
        self.fake = _FakeService()
        self.service_patch = patch.object(server, "get_service", return_value=self.fake)
        self.service_patch.start()

    def tearDown(self):
        self.service_patch.stop()

    def test_chat_requires_user_key_even_when_server_has_one(self):
        # 即使服务端环境变量里有 Key，HTTP 使用者也必须提供自己的请求头 Key。
        with patch.dict(os.environ, {"LLM_API_KEY": "server-key"}, clear=False):
            with self.assertRaises(HTTPException) as raised:
                server.chat(server.ChatRequest(question="你好"), None, None)

        self.assertEqual(raised.exception.status_code, 401)
        self.assertEqual(raised.exception.detail["code"], "api_key_required")

    def test_key_is_forwarded_in_memory_but_never_returned(self):
        secret = "dummy-key-do-not-echo"
        with patch.dict(os.environ, {"EMBEDDING_API_KEY": "server-embedding-key"}):
            response = server.chat(
                server.ChatRequest(
                    question="什么是高血压？",
                    provider={
                        "llm_base_url": "https://api.deepseek.com",
                        "llm_model": "deepseek-chat",
                        "embedding_base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
                        "embedding_model": "text-embedding-v3",
                    },
                ),
                secret,
                None,
            )

        self.assertEqual(self.fake.last_config.llm_api_key, secret)
        self.assertEqual(self.fake.last_config.embedding_api_key, "")
        self.assertNotIn(secret, str(response))

    def test_external_plain_http_provider_is_rejected(self):
        with self.assertRaises(ValidationError):
            server.ChatRequest(
                question="test",
                provider={"llm_base_url": "http://example.com/v1"},
            )

    def test_runtime_error_is_sanitized(self):
        with patch.object(server, "get_service", return_value=_FailingService()):
            with self.assertRaises(HTTPException) as raised:
                server.chat(
                    server.ChatRequest(question="test"),
                    "dummy-key",
                    None,
                )

        self.assertEqual(raised.exception.status_code, 502)
        self.assertNotIn("dummy-key-must-not-leak", str(raised.exception.detail))
        self.assertEqual(raised.exception.detail["code"], "runtime_unavailable")

    def test_config_status_contains_no_secret_fields(self):
        with patch.dict(
            os.environ,
            {"LLM_API_KEY": "server-secret", "EMBEDDING_API_KEY": "embed-secret"},
            clear=False,
        ):
            response = server.config_status()

        body = str(response).lower()
        self.assertNotIn("server-secret", body)
        self.assertNotIn("embed-secret", body)
        self.assertNotIn("api_key", body)


if __name__ == "__main__":
    unittest.main()
