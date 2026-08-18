"""Embedding 工厂：openai_compatible（API）与 local（sentence-transformers）两种模式。

独立实现（与 rag-assistant 同技术模式）：
DeepSeek 官方 API 不提供 embedding 接口，因此 embedding 单独走通义
text-embedding-v3（OpenAI 兼容端点）。绕过 langchain 封装直调原生 SDK，
规避兼容端点请求格式不兼容、batch 上限 10 两个坑。
"""
from typing import List

from langchain_core.embeddings import Embeddings

from .config import Config


class _LocalSentenceEmbeddings(Embeddings):
    """本地 sentence-transformers 封装。"""

    def __init__(self, model_name: str) -> None:
        from sentence_transformers import SentenceTransformer

        self._model = SentenceTransformer(model_name)

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        return self._model.encode(texts).tolist()

    def embed_query(self, text: str) -> List[float]:
        return self._model.encode([text])[0].tolist()


class _OpenAICompatibleEmbeddings(Embeddings):
    """原生 SDK 直调 OpenAI 兼容端点，自行分批（batch ≤ 10）。"""

    BATCH_SIZE = 10

    def __init__(self, model: str, base_url: str, api_key: str) -> None:
        from openai import OpenAI

        self._model = model
        self._client = OpenAI(api_key=api_key, base_url=base_url)

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        out: List[List[float]] = []
        for i in range(0, len(texts), self.BATCH_SIZE):
            batch = list(texts[i : i + self.BATCH_SIZE])
            r = self._client.embeddings.create(model=self._model, input=batch)
            out.extend(d.embedding for d in r.data)
        return out

    def embed_query(self, text: str) -> List[float]:
        r = self._client.embeddings.create(model=self._model, input=text)
        return r.data[0].embedding


def build_embeddings(cfg: Config) -> Embeddings:
    if cfg.embedding_provider == "local":
        return _LocalSentenceEmbeddings(cfg.embedding_model)
    return _OpenAICompatibleEmbeddings(
        model=cfg.embedding_model,
        base_url=cfg.embedding_base_url,
        api_key=cfg.embedding_api_key,
    )
