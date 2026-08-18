# -*- coding: utf-8 -*-
"""多轮会话验证：同一会话连续提问，验证记忆承接 + 工具子图。"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.graph import AgentPlatform

p = AgentPlatform()
questions = [
    "感冒了怎么办？",
    "那糖尿病呢？",          # 多轮承接
    "今天几号？",            # 工具子图
    "帮我算一下 (85+15)*3 等于多少",  # 计算器
]
for q in questions:
    r = p.ask(q)
    print(f"问: {q}")
    print(f"路由: {' → '.join(r['route_trace'])}")
    print(f"答: {r['answer'][:120]}...\n")
print("会话内历史消息数:", len(p._history))
