# -*- coding: utf-8 -*-
"""测试急症护栏 + FAQ 命中 + 缓存回写（不依赖 LLM key）。"""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.service import ChatService

svc = ChatService()
print("缓存后端:", svc.cache_backend, "| FAQ 可用:", svc._faq.available)

# 急症护栏（不依赖 LLM）
r = svc.chat("我突然胸痛大汗，怎么办？", "x1")
print(f"急症: channel={r['channel']} 命中词={r.get('emergency')}")

# FAQ 真实问题命中 + 缓存回写
q = "月经第八天还不干净怎么办？以前一直都是七天后就来白带、这次第八天了依然是暗红色、而且量很少、和平时白带量差不多、怎么办？"
t0 = time.time()
r = svc.chat(q, "x2")
t1 = time.time()
print(f"FAQ通道: channel={r['channel']} score={r.get('score')} {(t1-t0)*1000:.0f}ms")

# 第二次同问 → 缓存命中
t0 = time.time()
r = svc.chat(q, "x3")
t1 = time.time()
print(f"缓存通道: channel={r['channel']} {(t1-t0)*1000:.0f}ms")

# 缓存通道读 Redis 原始 key 验证
from app.cache import Cache
c = Cache()
raw = c.get(f"faq:answer:{q}")
print("Redis 缓存内容存在:", raw is not None, "| 前缀:", (raw or "")[:30])
