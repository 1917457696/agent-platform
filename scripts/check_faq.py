# -*- coding: utf-8 -*-
"""检查 FAQ 库问题样本 + 相似度分数，验证阈值设置。"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.faq import FaqMatcher

m = FaqMatcher()
print("--- FAQ 库问题样本（前 8 条）---")
for it in m._items[:8]:
    print(" *", it["question"][:55])
print()
print("--- 相似度测试 ---")
for q in [
    "感冒了怎么办？",
    "高血压患者日常需要注意什么？",
    "月经第八天还不干净怎么办？",
    "发烧了怎么办？",
    "得了痔疮，医生说是混合痔，但是只有上厕所才脱出",
]:
    r = m.match(q)
    if r:
        print(f"✅ 命中: {q[:20]:<22} -> {r['question'][:35]} (score={r['score']})")
    else:
        print(f"❌ 未命中: {q[:30]}")
