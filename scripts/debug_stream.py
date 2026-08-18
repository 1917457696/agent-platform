# -*- coding: utf-8 -*-
"""调试：逐步运行图，打印每个节点的消息序列，定位 ToolMessage 配对问题。"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from langchain_core.messages import HumanMessage

from app.graph import AgentPlatform

p = AgentPlatform()
q = "感冒了怎么办？"
p._history.append(HumanMessage(content=q))
try:
    for step in p._graph.stream(
        {"messages": p._history, "steps": 0, "route_trace": [], "emergency": False},
        {"recursion_limit": 40},
    ):
        for k, v in step.items():
            msgs = v.get("messages", [])
            print(f"--- node: {k} (messages={len(msgs)}) ---")
            for m in msgs:
                extra = ""
                if hasattr(m, "tool_calls") and m.tool_calls:
                    extra = f" tool_calls={[t['name'] for t in m.tool_calls]} id={m.tool_call_id if hasattr(m,'tool_call_id') else m.tool_calls[0]['id']}"
                if m.type == "tool":
                    extra = f" tool_call_id={m.tool_call_id}"
                print(f"  [{m.type}] {str(m.content)[:60]}{extra}")
except Exception as e:
    print(f"ERROR: {type(e).__name__}: {e}")
