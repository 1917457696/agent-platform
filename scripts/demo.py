"""CLI 演示：多轮对话，展示路由轨迹与专家子图协作。

用法：
  & C:\\Users\\19174\\.conda\\envs\\EduRAG\\python.exe scripts/demo.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.graph import AgentPlatform  # noqa: E402


def main() -> None:
    platform = AgentPlatform()
    print("🩺 多 Agent 医疗咨询平台（输入 exit 退出）\n")
    while True:
        q = input("你> ").strip()
        if q.lower() in {"exit", "quit", "退出"}:
            break
        result = platform.ask(q)
        print(f"路由> {' → '.join(result['route_trace'])}")
        print(f"助手> {result['answer']}\n")


if __name__ == "__main__":
    main()
