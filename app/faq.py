"""FAQ 匹配器：语义相似度命中判定（三通道中的第二通道）。

设计：
- FAQ 索引构建时批量 embedding（scripts/build_faq.py），查询时只 embed 一次 query；
- 余弦相似度 top1 ≥ 阈值 → 命中（返回 FAQ 答案，零 LLM 成本）；
- 索引缺失 / embedding 失败 → 返回 None（降级走 Agent，不阻塞服务）。
"""
import json
from pathlib import Path
from typing import Optional

import numpy as np

from .config import Config
from .embeddings import build_embeddings
from .retriever import normalize_query


class FaqMatcher:
    def __init__(self, cfg: Optional[Config] = None, threshold: float = 0.85) -> None:
        cfg = cfg or Config()
        self._cfg = cfg
        self._threshold = threshold
        self._embeddings = build_embeddings(cfg)
        self._vectors: Optional[np.ndarray] = None
        self._items: list = []
        self._load()

    def _load(self) -> None:
        faq_dir = Path(self._cfg.data_dir) / "faq"
        npy = faq_dir / "faq_questions.npy"
        meta = faq_dir / "faq_meta.json"
        if npy.exists() and meta.exists():
            try:
                self._vectors = np.load(str(npy))
                self._items = json.loads(meta.read_text(encoding="utf-8"))["items"]
                print(f"[faq] 加载 FAQ 索引: {len(self._items)} 条, 维度 {self._vectors.shape}")
            except Exception as e:
                print(f"[warn] FAQ 索引加载失败（{e}），FAQ 通道降级")
                self._vectors = None
        else:
            print("[warn] FAQ 索引不存在（运行 scripts/build_faq.py 构建），FAQ 通道降级")

    @property
    def available(self) -> bool:
        return self._vectors is not None and len(self._items) > 0

    def match(self, query: str) -> Optional[dict]:
        """返回 {answer, question, score} 或 None（未命中/通道不可用）。"""
        if not self.available:
            return None
        try:
            q_vec = self._embeddings.embed_query(normalize_query(query))
        except Exception as e:
            print(f"[warn] FAQ query embedding 失败（{e}），降级走 Agent")
            return None
        q = np.array(q_vec, dtype=np.float32)
        # 余弦相似度
        qn = q / (np.linalg.norm(q) + 1e-9)
        mat = self._vectors / (np.linalg.norm(self._vectors, axis=1, keepdims=True) + 1e-9)
        scores = mat @ qn
        best = int(scores.argmax())
        score = float(scores[best])
        if score >= self._threshold:
            item = self._items[best]
            return {
                "answer": item["answer"],
                "question": item["question"],
                "score": round(score, 4),
            }
        return None
