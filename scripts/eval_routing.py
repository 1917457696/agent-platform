"""意图路由评估：构造多类测试问题，统计路由准确率与场景通过率。

用法：
  & C:\\Users\\19174\\.conda\\envs\\EduRAG\\python.exe scripts/eval_routing.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.graph import AgentPlatform  # noqa: E402

# (问题, 期望路由类别)
# route 类别: medical(医疗子图) / utility(工具子图) / direct(直接回答) / guard(急症护栏)
CASES = [
    # 医疗知识问答
    ("感冒了怎么办？", "medical"),
    ("高血压患者日常需要注意什么？", "medical"),
    ("怀孕初期饮食要注意什么？", "medical"),
    ("糖尿病能吃水果吗？", "medical"),
    ("发烧39度要不要去医院？", "medical"),
    # 工具类
    ("今天几号？", "utility"),
    ("帮我算一下 85*3+12 等于多少", "utility"),
    ("现在是几月几日？", "utility"),
    # 直接回答（非健康、非工具）
    ("你好，很高兴认识你", "direct"),
    ("今天天气怎么样？", "direct"),
    # 急症护栏
    ("我突然胸痛大汗，怎么办？", "guard"),
    ("宝宝发烧抽搐了，快帮帮我", "guard"),
]

def main() -> None:
    platform = AgentPlatform()
    total = len(CASES)
    correct = 0
    print(f"{'问题':<28} {'期望':<8} 结果")
    print("-" * 70)
    for q, expected in CASES:
        try:
            result = platform.ask(q)
            trace = result["route_trace"]
            if expected == "guard":
                ok = any(t.startswith("guard") for t in trace)
            elif expected == "medical":
                ok = any("医疗知识子图" in t for t in trace)
            elif expected == "utility":
                ok = any("通用工具子图" in t for t in trace)
            else:
                ok = (
                    not any(t.startswith("guard(急症") for t in trace)
                    and not any("医疗知识子图" in t for t in trace)
                    and not any("通用工具子图" in t for t in trace)
                )
            correct += 1 if ok else 0
            print(f"{q[:26]:<28} {expected:<8} {'✅' if ok else '❌'}")
            print(f"  轨迹: {' → '.join(trace)}")
        except Exception as e:
            print(f"{q[:26]:<28} {expected:<8} ❌ {e}")
    print("-" * 70)
    print(f"路由准确率: {correct}/{total} = {correct / total:.0%}")


if __name__ == "__main__":
    main()
