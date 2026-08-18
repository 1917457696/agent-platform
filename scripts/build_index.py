"""建索引 / 演示：从 data 目录构建医疗知识库向量索引。

用法：
  & C:\\Users\\19174\\.conda\\envs\\EduRAG\\python.exe scripts/build_index.py --ingest data
  & C:\\Users\\19174\\.conda\\envs\\EduRAG\\python.exe scripts/build_index.py --ask "感冒怎么办"
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import Config  # noqa: E402
from app.embeddings import build_embeddings  # noqa: E402
from app.graph import AgentPlatform  # noqa: E402
from app.ingest import build_index, load_documents, load_index, split_documents  # noqa: E402


def main() -> None:
    cfg = Config()
    parser = argparse.ArgumentParser()
    parser.add_argument("--ingest", metavar="DATA_DIR", help="从目录构建索引")
    parser.add_argument("--ask", metavar="QUESTION", help="向平台提问")
    args = parser.parse_args()

    if args.ingest:
        docs = load_documents(args.ingest)
        chunks = split_documents(docs, cfg.chunk_size, cfg.chunk_overlap)
        print(f"加载 {len(docs)} 文档 → 切分 {len(chunks)} chunk，构建索引...")
        build_index(chunks, build_embeddings(cfg), cfg.vector_store_dir)
        print(f"索引已保存: {cfg.vector_store_dir}")

    if args.ask:
        platform = AgentPlatform(cfg)
        result = platform.ask(args.ask)
        print(f"【路由】{' → '.join(result['route_trace'])}")
        print(f"【回答】\n{result['answer']}")


if __name__ == "__main__":
    main()
