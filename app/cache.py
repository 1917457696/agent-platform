"""缓存层：Redis 优先，故障自动降级为进程内内存缓存（不宕机）。

设计（面试可讲的降级策略）：
- 正常：Redis 缓存（多实例共享、TTL 过期）
- Redis 不可用（连接失败/超时）：自动降级为内存 dict，服务不中断；
  恢复后自动切回 Redis——"缓存层降级"是三级降级中的第二级。
"""
import json
import threading
import time
from typing import Optional

try:
    import redis as _redis
except ImportError:  # 无 redis 依赖时直接使用内存模式
    _redis = None


class Cache:
    """统一缓存接口：get / set，Redis → 内存自动降级。"""

    def __init__(
        self,
        host: str = "127.0.0.1",
        port: int = 6379,
        db: int = 0,
        password: Optional[str] = None,
        default_ttl: int = 7 * 24 * 3600,
    ) -> None:
        self._default_ttl = default_ttl
        self._memory: dict = {}
        self._mem_ttl: dict = {}
        self._lock = threading.Lock()
        self._redis_ok = False
        self._client = None
        if _redis is not None:
            try:
                self._client = _redis.Redis(
                    host=host, port=port, db=db, password=password or None,
                    decode_responses=True, socket_timeout=2, socket_connect_timeout=2,
                )
                self._redis_ok = bool(self._client.ping())
            except Exception:
                self._redis_ok = False
        if not self._redis_ok:
            print("[warn] Redis 不可用，降级为内存缓存模式")

    @property
    def backend(self) -> str:
        return "redis" if self._redis_ok else "memory"

    def _mem_get(self, key: str) -> Optional[str]:
        with self._lock:
            exp = self._mem_ttl.get(key)
            if exp is not None and exp < time.time():
                self._memory.pop(key, None)
                self._mem_ttl.pop(key, None)
                return None
            return self._memory.get(key)

    def _mem_set(self, key: str, value: str, ttl: int) -> None:
        with self._lock:
            self._memory[key] = value
            self._mem_ttl[key] = time.time() + (ttl or self._default_ttl)

    def get(self, key: str) -> Optional[str]:
        if self._redis_ok:
            try:
                return self._client.get(key)
            except Exception:
                self._redis_ok = False  # 故障降级
                print("[warn] Redis 故障，降级为内存缓存模式")
        return self._mem_get(key)

    def set(self, key: str, value: str, ttl: Optional[int] = None) -> None:
        ttl = ttl or self._default_ttl
        if self._redis_ok:
            try:
                self._client.set(key, value, ex=ttl)
                return
            except Exception:
                self._redis_ok = False
        self._mem_set(key, value, ttl)

    # ---- FAQ 答案的便捷方法 ----
    def get_answer(self, query: str) -> Optional[str]:
        data = self.get(f"faq:answer:{query}")
        if data:
            try:
                return json.loads(data)["answer"]
            except Exception:
                return None
        return None

    def set_answer(self, query: str, answer: str, channel: str = "faq") -> None:
        self.set(
            f"faq:answer:{query}",
            json.dumps({"answer": answer, "channel": channel}, ensure_ascii=False),
        )
