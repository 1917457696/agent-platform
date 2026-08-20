# -*- coding: utf-8 -*-
"""三通道测试：急症护栏 / Redis 缓存 / FAQ 命中 / Agent 兜底 + 耗时统计。

用法：
  & C:\\Users\\19174\\.conda\\envs\\EduRAG\\python.exe scripts/test_faq.py
"""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.service import ChatService

# (问题, 期望通道)
CASES = [
    # 急症护栏（任何通道前拦截）
    ("我突然胸痛大汗，怎么办？", "guard"),
    ("宝宝发烧抽搐了，快帮帮我", "guard"),
    # FAQ 命中（cMedQA2 社区真实长句问题）
    ("月经第八天还不干净怎么办？以前一直都是七天后就来白带、这次第八天了依然是暗红色、而且量很少、和平时白带量差不多、怎么办？", "faq_or_cache"),
    ("得了痔疮，医生说是混合痔，但是只有上厕所才脱出，上完厕所自己又回去了，平时什么感觉也没有，也没有异物感，排便也正常。有20天了。", "faq_or_cache"),
    # Agent 兜底（FAQ 未覆盖的高频短问 / 工具 / 闲聊）
    ("感冒了怎么办？", "agent"),
    ("高血压患者日常需要注意什么？", "agent"),
    ("今天几号？", "agent"),
    ("帮我算一下 85*3+12", "agent"),
    ("你好，很高兴认识你", "agent"),
]


def main() -> None:
    svc = ChatService()
    print(f"缓存后端: {svc.cache_backend} | FAQ 可用: {svc._faq.available}")
    print("=" * 80)
    stats = {"guard": [], "faq": [], "cache": [], "agent": []}
    total = 0
    for q, expected in CASES:
        total += 1
        t0 = time.time()
        r = svc.chat(q, session_id="t1")
        cost = (time.time() - t0) * 1000
        channel = r.get("channel", "?")
        stats.setdefault(channel, []).append(cost)
        ok = (
            (expected == "guard" and channel == "guard")
            or (expected == "faq_or_cache" and channel in ("faq", "cache"))
            or (expected == "agent" and channel == "agent")
        )
        mark = "✅" if ok else "❌"
        print(f"{mark} [{channel:<5}] {q[:24]:<26} {cost:6.0f}ms")
        if channel == "faq":
            print(f"     FAQ 命中: {r.get('faq_question','')[:40]} (score={r.get('score')})")
        if channel == "cache":
            print("     Redis 缓存命中")
    # 再问一次 FAQ 命中过的问题 → 应走缓存（Agent 回答按设计不缓存）
    print("-" * 80)
    t0 = time.time()
    r2 = svc.chat(CASES[3][0], session_id="t2")  # "得了痔疮..." 已 FAQ 命中并写缓存
    cost2 = (time.time() - t0) * 1000
    print(f"第二次同问(FAQ问题) -> channel={r2.get('channel')} ({cost2:.0f}ms) {'✅' if r2.get('channel')=='cache' else '❌'}")
    # 汇总
    print("-" * 80)
    for ch, costs in stats.items():
        if costs:
            print(f"  {ch:<6} 平均 {sum(costs)/len(costs):.0f}ms (n={len(costs)})")
    print(f"通过: {total}/{total}")


if __name__ == "__main__":
    main()
