"""FAQ 问答对解析与索引构建：从 cMedQA2 Markdown 数据构建 FAQ 问题向量索引。

数据格式（data/医疗知识库-cMedQA2.md）：
    ## <问题>

    <答案>

    （来源：cMedQA2，问题 <id> / 回答 <id>）

产出（data/faq/）：
    - faq_questions.npy   问题向量（N x D，text-embedding-v3）
    - faq_meta.json       [{question, answer}] 与配置信息

用法：
    & C:\\Users\\19174\\.conda\\envs\\EduRAG\\python.exe scripts/build_faq.py
"""
import json
import re
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import Config  # noqa: E402
from app.embeddings import build_embeddings  # noqa: E402


def parse_faq_pairs(md_path: str) -> list[dict]:
    """解析 Markdown 问答对。返回 [{question, answer}]。"""
    text = Path(md_path).read_text(encoding="utf-8")
    pairs: list[dict] = []
    # 按 "## " 标题切分
    blocks = re.split(r"\n## ", text)
    for block in blocks:
        lines = block.strip().splitlines()
        if not lines:
            continue
        question = lines[0].strip().lstrip("#").strip()
        # 答案 = 标题后到（来源：...）前的正文
        body_lines = []
        has_source = False
        for ln in lines[1:]:
            if ln.strip().startswith("（来源：") or ln.strip().startswith("(来源"):
                has_source = True
                break
            body_lines.append(ln)
        answer = "\n".join(body_lines).strip()
        # 真正的问答对必须有来源行（跳过文件头部说明等杂块）
        if has_source and question and answer and len(answer) > 10:
            pairs.append({"question": question, "answer": answer})
    return pairs


def main() -> None:
    cfg = Config()
    md_path = str(Path(cfg.data_dir) / "医疗知识库-cMedQA2.md")
    pairs = parse_faq_pairs(md_path)
    print(f"解析问答对: {len(pairs)} 条")

    # 批量 embedding（复用 embeddings 工厂，内部已分批 batch≤10）
    emb = build_embeddings(cfg)
    questions = [p["question"] for p in pairs]
    vectors = emb.embed_documents(questions)
    arr = np.array(vectors, dtype=np.float32)
    print(f"向量维度: {arr.shape}")

    out_dir = Path(cfg.data_dir) / "faq"
    out_dir.mkdir(parents=True, exist_ok=True)
    np.save(str(out_dir / "faq_questions.npy"), arr)
    meta = {
        "model": cfg.embedding_model,
        "count": len(pairs),
        "items": pairs,
    }
    (out_dir / "faq_meta.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8"
    )
    print(f"FAQ 索引已保存: {out_dir}")


if __name__ == "__main__":
    main()
