# -*- coding: utf-8 -*-
"""三通道 HTTP 端到端测试：health / 急症 / FAQ / 缓存 / Agent / 前端。"""
import json
import time
import urllib.request

BASE = "http://127.0.0.1:8001"


def post(path, payload):
    req = urllib.request.Request(
        BASE + path,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read().decode("utf-8"))


def get(path):
    with urllib.request.urlopen(BASE + path, timeout=10) as r:
        return r.status, r.read().decode("utf-8")


results = []

# health
try:
    h = get("/health")[1]
    results.append(("health", "✅", h[:90]))
except Exception as e:
    results.append(("health", "❌", str(e)))

# 急症护栏
r = post("/api/chat", {"question": "我爸爸突然胸痛大汗，怎么办？", "session_id": "e1"})
ok = r.get("channel") == "guard"
results.append(("急症护栏", "✅" if ok else "❌", f"channel={r.get('channel')} 命中={r.get('emergency')}"))

# FAQ 命中（真实库问题，用未缓存过的：前庭大腺囊肿）
q = "请问前庭大腺囊肿怎么治疗"
t0 = time.time()
r = post("/api/chat", {"question": q, "session_id": "e2"})
t1 = time.time()
ok = r.get("channel") == "faq"
results.append(("FAQ命中", "✅" if ok else "❌", f"channel={r.get('channel')} score={r.get('score')} {(t1-t0)*1000:.0f}ms"))

# 缓存命中（第二次同问 FAQ 问题）
t0 = time.time()
r = post("/api/chat", {"question": q, "session_id": "e3"})
t1 = time.time()
ok = r.get("channel") == "cache"
results.append(("缓存命中", "✅" if ok else "❌", f"channel={r.get('channel')} {(t1-t0)*1000:.0f}ms"))

# Agent 兜底（工具子图）
r = post("/api/chat", {"question": "帮我算一下 85*3+12", "session_id": "e4"})
ok = r.get("channel") == "agent" and "通用工具子图" in " ".join(r.get("route_trace", []))
results.append(("Agent工具子图", "✅" if ok else "❌", f"channel={r.get('channel')} trace={r.get('route_trace')}"))

# Agent 兜底（医疗问答，多轮）
r = post("/api/chat", {"question": "感冒了怎么办？", "session_id": "e5"})
ok = r.get("channel") == "agent" and "医疗知识子图" in " ".join(r.get("route_trace", []))
results.append(("Agent医疗子图", "✅" if ok else "❌", f"channel={r.get('channel')}"))

# reset
r = post("/api/reset", {"session_id": "e5"})
results.append(("reset", "✅" if r.get("status") == "ok" else "❌", ""))

# 前端
try:
    status, body = get("/")
    ok = status == 200 and "多 Agent" in body
    results.append(("前端页面", "✅" if ok else "❌", f"status={status}"))
except Exception as e:
    results.append(("前端页面", "❌", str(e)))

print(f"{'用例':<16} {'结果':<4} 说明")
print("-" * 88)
for name, mark, detail in results:
    print(f"{name:<16} {mark:<4} {detail}")
fails = [x for x in results if x[1] == "❌"]
print("-" * 88)
print(f"通过 {len(results) - len(fails)}/{len(results)}")
