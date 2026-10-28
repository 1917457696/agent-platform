# 岐序 · 多 Agent 医疗协理平台

一个可运行的垂直领域 Agent 应用：React 首页与问答工作台负责交互，FastAPI 接收用户自己的 OpenAI 兼容 API Key，LangGraph 负责主控分流和专家子图，知识问答支持混合检索与本地 BM25 降级。

> 本项目使用公开资料或合成数据演示，不代表真实医院生产接入；回答仅供健康知识参考，不构成诊断或治疗建议。

## 当前能力

- **多 Agent 编排**：Supervisor 只做意图识别与 handoff，医疗知识、日期/计算分别进入独立子图。
- **检索降级**：有 Embedding Key 且已构建索引时使用向量 + BM25；否则自动使用本地 BM25，不因缺少第二个 Key 停摆。
- **安全护栏**：急症关键词在模型链路之前执行；工具调用失败时受控降级。
- **凭据隔离**：浏览器使用 `sessionStorage` 暂存 Key，经请求头发送；服务端只保存在进程内存，缓存与会话按不可逆配置指纹隔离。
- **React 首页**：全屏轮播、自动播放与暂停、鼠标/触控切换、滚动显现、移动端布局、`prefers-reduced-motion` 适配。
- **运行可观察**：问答响应展示通道与 Agent 路由轨迹。

## API Key 安全边界

前端设置抽屉会要求模型 API Key，Embedding Key 是可选项。

1. Key 不写入请求体、URL、仓库、数据库或服务端日志。
2. 浏览器仅写入当前标签页的 `sessionStorage`，关闭标签页后由浏览器清除。
3. Key 通过 `X-LLM-API-Key` / `X-Embedding-API-Key` 请求头发送。
4. 服务端错误响应不回显 SDK 原始异常，避免泄露请求内容或凭据。
5. 不同模型配置使用 SHA-256 指纹隔离运行时、会话与问答缓存；指纹不含明文 Key。
6. 生产部署必须使用 HTTPS。服务端只允许非本机供应商地址使用 HTTPS，本机调试可用 `http://localhost` 或 `127.0.0.1`。

`sessionStorage` 可以防止 Key 跨标签页长期保留，但不能抵御同源 XSS。生产环境还应启用严格 CSP、HTTPS、依赖审计和访问日志脱敏。

## 本地启动

要求 Python 3.10+、Node.js 22+。

```powershell
python -m pip install -r requirements.txt
npm install
npm run build
python -m uvicorn app.server:app --host 127.0.0.1 --port 8001
```

打开 `http://127.0.0.1:8001`，在右上角配置你的模型 Key。只配置模型 Key 即可运行，本地知识检索会走 BM25。

前端开发时可分别启动：

```powershell
# 终端 1
python -m uvicorn app.server:app --host 127.0.0.1 --port 8001

# 终端 2（Vite 会代理 /api 和 /health）
npm run dev
```

### 可选：启用混合检索

在页面设置中填写 Embedding Key，并先构建索引：

```powershell
python scripts/build_index.py --ingest data
```

FAQ 语义通道同样依赖 Embedding Key；缺失时会跳过 FAQ 语义匹配，继续走本地检索与 Agent。

## 验证

```powershell
npm run typecheck
npm run build
python -m compileall -q app tests
python -m unittest discover -s tests -v
# 启动服务后，复用本机 Chrome 做桌面/移动端/动效回归
npm run verify:ui
```

测试覆盖：运行配置指纹隔离、缓存命名空间隔离、缺少 Key 拒绝、Key 不回显、运行时异常脱敏、外部 HTTP 地址拒绝、配置状态接口脱敏。浏览器回归还会验证全屏轮播、触摸滑动、卡片悬停、滚动显现、390px 移动端、Key 请求头和 reduced-motion。测试不访问真实模型服务。

## HTTP 接口

| 接口 | 说明 |
| --- | --- |
| `GET /health` | 轻量健康检查，不初始化模型或向量服务 |
| `GET /api/config/status` | 返回公开默认值与“是否配置”布尔值，不返回 Key |
| `POST /api/chat` | 问答；Key 通过请求头，供应商信息放在 `provider` 对象 |
| `POST /api/reset` | 清理指定会话在所有运行时中的状态 |

示例（请使用测试 Key，不要把真实 Key 写入脚本或 Shell 历史）：

```json
{
  "question": "高血压日常需要注意什么？",
  "session_id": "demo-session",
  "provider": {
    "llm_base_url": "https://api.deepseek.com",
    "llm_model": "deepseek-chat",
    "embedding_base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
    "embedding_model": "text-embedding-v3"
  }
}
```

## 架构

```text
React 工作台
  └─ 请求头 API Key + provider 元数据
       └─ FastAPI 校验与脱敏边界
            └─ 凭据指纹隔离的 Runtime
                 ├─ 急症规则护栏
                 ├─ Redis / 内存缓存
                 ├─ 可选 FAQ 语义匹配
                 └─ LangGraph Supervisor
                      ├─ medical 子图 → 向量+BM25 / 本地 BM25
                      └─ utility 子图 → 日期 / 计算器
```

主要目录：

```text
app/                    FastAPI、运行时隔离、LangGraph 与检索
frontend/src/           React + TypeScript 源码
static/                 Vite 生产构建产物，由 FastAPI 托管
tests/                  无外部网络的安全契约测试
data/                   演示知识资料与可重建索引
scripts/                索引构建、评测与 CLI 脚本
```

## Docker

```powershell
docker compose up --build
```

Dockerfile 使用 Node 多阶段构建 React，再将静态产物复制进 Python 运行镜像。环境变量 Key 可供 CLI 与索引构建脚本使用；HTTP 问答端点仍强制要求每位使用者通过请求头提供自己的模型 Key，不会回退使用服务器 Key。
