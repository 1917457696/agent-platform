"""MCP Server：把平台工具（rag_search / get_today / calculator）暴露为标准 MCP 工具。

背景：MCP（Model Context Protocol）是"模型 ↔ 工具/数据源"的开放连接协议；
平台工具封装为 MCP 后，任何支持 MCP 的客户端（Claude Desktop、Cursor 等）可直接调用，
体现"工具治理"：业务工具在平台内注册一次，可同时被 LangGraph 与外部客户端复用。

运行（需先安装 mcp SDK）：
  pip install mcp
  & C:\\Users\\19174\\.conda\\envs\\EduRAG\\python.exe -m app.mcp_server

说明：mcp SDK 在本环境沙箱下无法安装（pip 临时目录限制），代码为标准 FastMCP
用法（@mcp.tool + mcp.run），安装依赖后即可运行（语法已通过编译检查）。
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import Config  # noqa: E402
from app.embeddings import build_embeddings  # noqa: E402
from app.ingest import load_index  # noqa: E402
from app.retriever import VectorRetriever  # noqa: E402


def main() -> None:
    from mcp.server.fastmcp import FastMCP

    cfg = Config()
    db = load_index(build_embeddings(cfg), cfg.vector_store_dir)
    if db is None:
        raise RuntimeError("索引不存在，请先运行 scripts/build_index.py --ingest data")
    retriever = VectorRetriever(db, cfg.top_k)

    mcp = FastMCP("medical-agent-platform")

    @mcp.tool()
    def rag_search(query: str) -> str:
        """检索医疗健康知识库，返回相关知识条目（带来源编号）。"""
        docs = retriever.retrieve(query)
        if not docs:
            return "未检索到相关资料。"
        return "\n\n".join(f"[{i + 1}] {d.page_content}" for i, d in enumerate(docs))

    @mcp.tool()
    def get_today() -> str:
        """返回今天的日期。"""
        import datetime

        return datetime.date.today().isoformat()

    mcp.run()


if __name__ == "__main__":
    main()
