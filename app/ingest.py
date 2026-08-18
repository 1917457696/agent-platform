"""知识库摄入：加载 → 切分 → 向量化 → 入库（Agent 平台内置检索底座）。"""
from pathlib import Path
from typing import List, Optional

from langchain_community.document_loaders import PyPDFLoader, TextLoader
from langchain_community.vectorstores import FAISS
from langchain_core.documents import Document
from langchain_core.embeddings import Embeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter


def load_documents(data_dir: str) -> List[Document]:
    """递归加载 data_dir 下的 txt/md/pdf（跳过 README 等说明文件）。"""
    docs: List[Document] = []
    base = Path(data_dir)
    if not base.exists():
        return docs
    for p in sorted(base.rglob("*")):
        if not p.is_file() or p.name.startswith("."):
            continue
        if p.name.lower() in {"readme.md", "readme.txt", "说明.txt", "说明.md"}:
            continue
        suffix = p.suffix.lower()
        try:
            if suffix == ".pdf":
                docs += PyPDFLoader(str(p)).load()
            elif suffix in {".txt", ".md"}:
                try:
                    docs += TextLoader(str(p), encoding="utf-8").load()
                except UnicodeDecodeError:
                    docs += TextLoader(str(p), encoding="gbk").load()
        except Exception as e:
            print(f"[warn] 跳过 {p.name}: {e}")
    return docs


def split_documents(
    docs: List[Document], chunk_size: int, chunk_overlap: int
) -> List[Document]:
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size, chunk_overlap=chunk_overlap
    )
    return splitter.split_documents(docs)


def build_index(
    docs: List[Document], embeddings: Embeddings, store_dir: str
) -> FAISS:
    Path(store_dir).mkdir(parents=True, exist_ok=True)
    db = FAISS.from_documents(docs, embeddings)
    db.save_local(store_dir)
    return db


def load_index(embeddings: Embeddings, store_dir: str) -> Optional[FAISS]:
    if (Path(store_dir) / "index.faiss").exists():
        return FAISS.load_local(
            store_dir, embeddings, allow_dangerous_deserialization=True
        )
    return None
