# 多 Agent 医疗咨询平台 —— Docker 一键部署

## 一、构建与启动

```bash
# 1. 准备 .env（LLM/Embedding API Key，参考 .env.example）
cp .env.example .env

# 2. 构建镜像并启动（CPU 版 PyTorch，内置索引挂载卷）
docker compose up -d --build

# 3. 访问
#    http://127.0.0.1:8001
```

## 二、目录结构

```
agent-platform/
├── app/
│   ├── config.py       # 配置（.env 读取、路径统一解析）
│   ├── embeddings.py   # Embedding 工厂（通义 text-embedding-v3 / 本地）
│   ├── ingest.py       # 知识库加载→切分→建索引
│   ├── retriever.py    # 混合检索（BM25+向量 RRF）
│   ├── tools.py        # 工具集：rag_search / get_today / calculator + 急症规则
│   ├── graph.py        # 多 Agent 平台：主控 + 子图 + 路由 + 护栏
│   ├── server.py       # FastAPI（/api/chat 会话隔离 + 前端）
│   └── mcp_server.py   # MCP 工具暴露（需 pip install mcp）
├── static/index.html   # 聊天前端（路由轨迹展示）
├── scripts/
│   ├── build_index.py  # 建索引 / 提问
│   ├── demo.py         # CLI 演示
│   └── eval_routing.py # 意图路由评估
└── data/               # 知识库（cMedQA2 真实医疗问答）与索引（构建产物）
```

## 三、API 接口

| 接口 | 说明 |
|------|------|
| `GET /health` | 健康检查 |
| `POST /api/chat` | 多 Agent 对话 `{"question": "...", "session_id": "s1"}`，返回 `{answer, route_trace}` |
| `POST /api/reset` | 重置会话 |

## 四、架构

```
用户问题
  │
  ▼
┌─────────┐   规则命中急症   ┌──────────────────────┐
│  guard  │ ──────────────▶ │ 立即就医提示（不调 LLM）│
│ 急症护栏 │                └──────────────────────┘
└────┬────┘
     ▼ 通过
┌──────────┐  handoff 工具   ┌────────────────────────────┐
│supervisor│ ──────────────▶ │ medical 子图（rag_search）   │
│ 主控路由  │                │ utility 子图（日期/计算器）   │
└──────────┘                └────────────────────────────┘
     │ 直接回答（终态）
     ▼
   回答
```

- **专家隔离**：每个子图独立 System Prompt + 独立工具集
- **消息序列正确性**：handoff 后回填 ToolMessage 配对（规避 LLM 400）
- **护栏**：MAX_STEPS 防循环 + 工具异常降级 + 急症规则前置

## 五、本地运行（不使用 Docker）

```powershell
conda activate EduRAG
cd F:\docker_project\deepseek_harness_workespace\agent-platform
python scripts/build_index.py --ingest data   # 首次建索引
python -m uvicorn app.server:app --port 8001
# 浏览器 http://127.0.0.1:8001
```
