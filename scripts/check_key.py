# -*- coding: utf-8 -*-
"""验证 DeepSeek key 有效性。"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from openai import OpenAI

from app.config import Config

cfg = Config()
try:
    c = OpenAI(api_key=cfg.llm_api_key, base_url=cfg.llm_base_url)
    r = c.chat.completions.create(
        model=cfg.llm_model,
        messages=[{"role": "user", "content": "回复OK两个字母"}],
        max_tokens=10,
    )
    print("NEW LLM key: OK ->", r.choices[0].message.content[:30])
except Exception as e:
    print("NEW LLM key: FAIL ->", str(e)[:150])
