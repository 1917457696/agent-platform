# -*- coding: utf-8 -*-
"""agent-platform HTTP 端到端测试：health / chat（多轮+会话隔离）/ reset / 前端。"""
import time
import urllib.request

BASE = "http://127.0.0.1:8001"


def post(path: str, payload: dict):
    req = urllib.request.Request(
        BASE + path,
        data=__import__("json").dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        return __import__("json").loads(r.read().decode("utf-8"))


def get(path: str):
    with urllib.request.urlopen(BASE + path, timeout=10) as r:
        return r.status, r.read().decode("utf-8")


results = []

# 1. health
try:
    h = get("/health")[1]
    results.append(("health", "✅", h[:80]))
except Exception as e:
    results.append(("health", "❌", str(e)))

# 2. 医疗问答（会话 s1）
try:
    r = post("/api/chat", {"question": "感冒了怎么办？", "session_id": "s1"})
    ok = "医疗知识子图" in " ".join(r.get("route_trace", [])) and len(r.get("answer", "")) > 50
    results.append(("医疗问答+路由", "✅" if ok else "❌", f"trace={r.get('route_trace')} ans_len={len(r.get('answer',''))}"))
except Exception as e:
    results.append(("医疗问答", "❌", str(e)))

# 3. 多轮承接（同会话 s1）
try:
    r = post("/api/chat", {"question": "那糖尿病呢？", "session_id": "s1"})
    ok = "糖尿病" in r.get("answer", "")
    results.append(("多轮承接", "✅" if ok else "❌", f"ans_head={r.get('answer','')[:40]}"))
except Exception as e:
    results.append(("多轮承接", "❌", str(e)))

# 4. 会话隔离：新会话 s2 不知道 s1 上下文（问"那糖尿病呢"应独立处理）
try:
    r = post("/api/chat", {"question": "那糖尿病呢？", "session_id": "s2"})
    ok = "糖尿病" in r.get("answer", "") and "医疗知识子图" in " ".join(r.get("route_trace", []))
    results.append(("会话隔离(s2独立路由)", "✅" if ok else "❌", f"trace={r.get('route_trace')}"))
except Exception as e:
    results.append(("会话隔离", "❌", str(e)))

# 5. 急症护栏
try:
    r = post("/api/chat", {"question": "我爸爸突然胸痛大汗，怎么办？", "session_id": "s3"})
    trace = " ".join(r.get("route_trace", []))
    ok = "急症" in trace and "120" in r.get("answer", "")
    results.append(("急症护栏", "✅" if ok else "❌", f"trace={r.get('route_trace')}"))
except Exception as e:
    results.append(("急症护栏", "❌", str(e)))

# 6. 工具子图
try:
    r = post("/api/chat", {"question": "帮我算一下 85*3+12", "session_id": "s4"})
    ok = "通用工具子图" in " ".join(r.get("route_trace", [])) and "267" in r.get("answer", "")
    results.append(("计算器工具", "✅" if ok else "❌", f"ans={r.get('answer','')[:40]}"))
except Exception as e:
    results.append(("计算器工具", "❌", str(e)))

# 7. reset
try:
    r = post("/api/reset", {"session_id": "s1"})
    results.append(("reset", "✅" if r.get("status") == "ok" else "❌", str(r)))
except Exception as e:
    results.append(("reset", "❌", str(e)))

# 8. 前端页面
try:
    status, body = get("/")
    ok = status == 200 and "多 Agent" in body
    results.append(("前端页面", "✅" if ok else "❌", f"status={status} len={len(body)}"))
except Exception as e:
    results.append(("前端页面", "❌", str(e)))

print(f"{'用例':<22} {'结果':<4} 说明")
print("-" * 90)
for name, mark, detail in results:
    print(f"{name:<22} {mark:<4} {detail}")
fails = [x for x in results if x[1] == "❌"]
print("-" * 90)
print(f"通过 {len(results) - len(fails)}/{len(results)}")
