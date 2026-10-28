"""检索器（Agent 平台内置）：向量 + BM25 混合检索（RRF 融合）+ 术语归一化。

在平台中，检索能力被封装为"医疗知识子图"的工具（rag_search），
仅作为知识问答子图内部的工具存在，与平台编排逻辑解耦。
"""
from typing import List

from langchain_community.retrievers import BM25Retriever
from langchain_community.vectorstores import FAISS
from langchain_core.documents import Document


def _cn_bigram_tokenizer(text: str) -> List[str]:
    """中文无空格分词：字符二元组（bigram）。"""
    text = text.lower()
    return [text[i : i + 2] for i in range(max(0, len(text) - 1))]


# 医疗口语 → 术语归一化（检索前替换，提升召回）
SYNONYM_MAP = {
    "发烧": "发热",
    "血压高": "高血压",
    "血糖高": "高血糖",
    "拉肚子": "腹泻",
    "肚子疼": "腹痛",
    "胃疼": "胃痛",
    "睡不着": "失眠",
    "流鼻涕": "流涕",
    "打喷嚏": "喷嚏",
    "头晕": "眩晕",
}


def normalize_query(query: str) -> str:
    for colloquial, medical in SYNONYM_MAP.items():
        query = query.replace(colloquial, medical)
    return query


def _rrf_fuse(ranked_lists: List[List[Document]], k: int = 60) -> List[Document]:
    """RRF（Reciprocal Rank Fusion）融合多路召回。"""
    scores: dict = {}
    for docs in ranked_lists:
        for rank, doc in enumerate(docs):
            scores[id(doc)] = scores.get(id(doc), 0.0) + 1.0 / (k + rank + 1)
    seen = set()
    ordered: List[Document] = []
    for docs in ranked_lists:
        for doc in docs:
            if id(doc) not in seen:
                seen.add(id(doc))
                ordered.append(doc)
    ordered.sort(key=lambda d: scores[id(d)], reverse=True)
    return ordered


class VectorRetriever:
    """纯向量检索。"""

    def __init__(self, db: FAISS, top_k: int = 5) -> None:
        self._db = db
        self._top_k = top_k

    def retrieve(self, query: str) -> List[Document]:
        return self._db.similarity_search(normalize_query(query), k=self._top_k)


class LexicalRetriever:
    """纯 BM25 检索：未提供 Embedding Key 时的确定性降级路径。"""

    def __init__(self, corpus: List[Document], top_k: int = 5) -> None:
        self._bm25 = BM25Retriever.from_documents(
            corpus, k=top_k, preprocess_func=_cn_bigram_tokenizer
        )

    def retrieve(self, query: str) -> List[Document]:
        return self._bm25.invoke(normalize_query(query))


class HybridRetriever:
    """混合检索：向量 + BM25 → RRF 融合。"""

    def __init__(self, db: FAISS, corpus: List[Document], top_k: int = 5) -> None:
        self._db = db
        self._top_k = top_k
        self._bm25 = BM25Retriever.from_documents(
            corpus, k=top_k * 2, preprocess_func=_cn_bigram_tokenizer
        )

    def retrieve(self, query: str) -> List[Document]:
        query = normalize_query(query)
        vec = self._db.similarity_search(query, k=self._top_k * 2)
        bm = self._bm25.invoke(query)
        fused = _rrf_fuse([vec, bm])
        return fused[: self._top_k]
