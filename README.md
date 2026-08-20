# 🩺 多 Agent 医疗咨询平台（三通道：缓存 / FAQ / Agent）

> 简历项目③：LangGraph 主控路由 + 专家子图 + **Redis 缓存 + FAQ 语义命中 + Agent 兜底**三通道架构。
> 定位：把被动 RAG 升级为主动多 Agent 协作平台，高频问题零 LLM 成本秒回，复杂问题走 Agent。
> 开发环境：conda `EduRAG`（Python 3.10.18，LangChain 1.2.10，LangGraph）。
> ⚠️ **合规声明**：健康知识参考系统，不构成医疗诊断/治疗建议；急症场景提示就医。

> 关联项目：RAG 检索问答链路见独立仓库 `rag-assistant/`（本项目为独立自包含的 Agent 平台，检索底座内置）。

## 零、三通道架构（核心亮点）

```
用户问题
  → ① 急症护栏（规则检测，0ms，不调 LLM，命中直接提示就医）
  → ② Redis 缓存命中（1ms 秒回，零 LLM 成本）
  → ③ FAQ 语义相似度命中（~300ms，零 LLM 成本，命中后写缓存）
  → ④ Agent 兜底（主控路由 + 专家子图，带来源/路由轨迹，3-5s）
```

- **实测耗时**（scripts/test_faq.py + e2e_three_channel.py）：guard **0ms** / cache **1ms** / FAQ **282-699ms** / Agent 3-5s——**缓存比 Agent 快约 5000 倍**
- **FAQ 库**：cMedQA2 **3000 问答对**语义索引（scripts/build_faq.py 构建，余弦相似度 ≥0.85 命中）
- **缓存降级**：Redis 不可用自动降级为内存缓存，服务不中断（app/cache.py）
- **成本控制**：高频问题（缓存+FAQ）零 LLM 成本，只有复杂问题消耗大模型——企业"分层拦截"思想：FAQ 命中率 60-80% = 60-80% 请求不打 LLM

## 一、快速开始

```bash
# 1. 准备 .env（LLM/Embedding API Key，参考 .env.example）
cp .env.example .env

# 2. 构建 FAQ 索引 + 知识库索引（一次）
python scripts/build_faq.py
python scripts/build_index.py --ingest data

# 3. 启动服务
python -m uvicorn app.server:app --host 127.0.0.1 --port 8001
# 浏览器 http://127.0.0.1:8001（前端显示通道标识：缓存/FAQ/Agent/急症）

# 4. 测试
python scripts/test_faq.py          # 三通道测试
python scripts/e2e_three_channel.py # HTTP E2E（8/8）
python scripts/eval_routing.py      # 意图路由评估（12/12）
```

## 二、目录结构

```
agent-platform/
├── app/
│   ├── config.py       # 配置（.env 读取、路径统一解析）
│   ├── embeddings.py   # Embedding 工厂（通义 text-embedding-v3 / 本地）
│   ├── ingest.py       # 知识库加载→切分→建索引
│   ├── retriever.py    # 混合检索（BM25+向量 RRF）
│   ├── cache.py        # 缓存层（Redis 优先，故障降级内存）
│   ├── faq.py          # FAQ 语义匹配器（余弦相似度阈值命中）
│   ├── tools.py        # 工具集：rag_search / get_today / calculator + 急症规则
│   ├── graph.py        # 多 Agent 平台：主控 + 子图 + 路由 + 护栏
│   ├── service.py      # 三通道编排（急症→缓存→FAQ→Agent）
│   ├── server.py       # FastAPI（/api/chat + 前端）
│   └── mcp_server.py   # MCP 工具暴露（需 pip install mcp）
├── static/index.html   # 聊天前端（通道标识 + 路由轨迹）
├── scripts/
│   ├── build_faq.py    # FAQ 索引构建（3000 问答对）
│   ├── build_index.py  # 知识库索引构建 / 提问
│   ├── test_faq.py     # 三通道测试（guard/cache/faq/agent）
│   ├── e2e_three_channel.py  # HTTP 三通道 E2E（8/8）
│   ├── eval_routing.py # 意图路由评估（12/12）
│   └── demo.py         # CLI 演示
└── data/               # 知识库与 FAQ 索引（构建产物，gitignore）
```

## 三、API 接口

| 接口 | 说明 |
|------|------|
| `GET /health` | 健康检查（含缓存后端状态） |
| `POST /api/chat` | 三通道问答 `{"question": "...", "session_id": "s1"}`，返回 `{answer, channel, route_trace?}` |
| `POST /api/reset` | 重置会话 |

## 四、Agent 架构（Supervisor-Worker）

```
用户问题 → guard（急症护栏，规则）
        → supervisor（主控路由：LLM 意图识别 + handoff 工具）
            → medical 子图（rag_search 医疗检索）
            → utility 子图（get_today / calculator）
        → 专家子图直接产出最终答案（主控只路由不代答，答案保真）
```

- **专家隔离**：每个子图独立 System Prompt + 独立工具集
- **意图路由**：四类意图（医疗/工具/闲聊/急症）自动分发，**实测 12/12 = 100%**
- **消息序列正确性**：handoff 后回填 ToolMessage 配对（规避 LLM 400）
- **护栏**：MAX_STEPS=6 防循环 + 工具异常降级 + 急症规则前置
- **会话管理**：/api/chat 按 session_id 隔离，多轮记忆

## 五、Docker 部署

```bash
docker compose up -d --build   # CPU 版；API key 走环境变量；索引 volume 挂载
```

> API key 通过环境变量传入（不进镜像）；索引（data/index、data/faq）为构建产物，通过 volume 持久化。
