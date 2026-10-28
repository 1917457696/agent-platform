"""平台工具集：医疗检索 / 日期 / 计算器，以及急症规则检测。

设计：工具与 Agent 解耦——子图按职责绑定不同工具集（专家隔离），
主控只持有 handoff 工具做路由，不直接执行业务工具。
"""
import datetime
import re
from typing import List, Optional

from langchain_community.vectorstores import FAISS
from langchain_core.documents import Document
from langchain_core.tools import tool

from .retriever import HybridRetriever, LexicalRetriever, VectorRetriever


# ---------------- 急症护栏规则（医疗安全） ----------------
# 命中任一关键词 → 立即提示就医，不进入检索/生成链路（规则优先于 LLM，低成本高可靠）
EMERGENCY_KEYWORDS = [
    "胸痛", "胸闷", "呼吸困难", "大出血", "意识不清", "昏迷", "抽搐",
    "休克", "心梗", "脑梗", "中风", "剧痛", "窒息", "高烧不退", "持续高热",
]


def detect_emergency(text: str) -> Optional[str]:
    """返回命中的急症关键词；未命中返回 None。"""
    for kw in EMERGENCY_KEYWORDS:
        if kw in text:
            return kw
    return None


# ---------------- 业务工具 ----------------
def build_rag_search_tool(db: FAISS, corpus: List[Document], top_k: int = 5):
    """医疗知识检索工具（医疗子图专用）。混合检索提升中文专有名词召回。"""
    hybrid = HybridRetriever(db, corpus, top_k=top_k)

    @tool
    def rag_search(query: str) -> str:
        """检索医疗健康知识库，返回相关知识条目（带编号），用于回答健康/疾病/用药类问题。"""
        docs = hybrid.retrieve(query)
        if not docs:
            return "未检索到相关资料。"
        return "\n\n".join(f"[{i + 1}] {d.page_content}" for i, d in enumerate(docs))

    return rag_search


def build_lexical_search_tool(corpus: List[Document], top_k: int = 5):
    """无向量凭据或索引时使用 BM25；仍保留来源与拒绝编造约束。"""
    lexical = LexicalRetriever(corpus, top_k=top_k)

    @tool
    def rag_search(query: str) -> str:
        """使用本地词法索引检索医疗健康知识库，返回带来源编号的相关条目。"""
        docs = lexical.retrieve(query)
        if not docs:
            return "未检索到相关资料。"
        return "\n\n".join(
            f"[{i + 1}] {d.page_content}\n来源：{d.metadata.get('source', '本地知识库')}"
            for i, d in enumerate(docs)
        )

    return rag_search


@tool
def get_today() -> str:
    """返回今天的日期（年-月-日）。"""
    return datetime.date.today().isoformat()


@tool
def calculator(expression: str) -> str:
    """计算简单算术表达式（仅支持 + - * / 与括号、数字、小数点）。"""
    expr = expression.strip()
    if not re.fullmatch(r"[0-9+\-*/().\s]+", expr):
        return "表达式包含非法字符，仅支持数字与 + - * / ( )"
    try:
        # 安全求值：白名单字符校验后 eval
        result = eval(expr, {"__builtins__": {}}, {})  # noqa: S307
        return str(result)
    except Exception as e:
        return f"计算失败：{e}"
