"""多 Agent 医疗咨询平台（Supervisor-Worker + 任务型子图）。

架构（对齐企业 Agent 平台模式：1 个主控 + 多个任务型子图）：
- guard          急症护栏节点（规则检测，不调 LLM）——命中急症直接提示就医并终止
- supervisor     主控 Agent：意图识别与任务路由（LLM + handoff 工具）
- medical        医疗知识问答子图（工具：rag_search，内置混合检索底座）
- utility        通用工具子图（工具：get_today / calculator）
- 协作流程：guard → supervisor →（路由）medical/utility → 专家子图直接产出最终答案（终态）；
  主控只负责路由、不代答（专家隔离，保证答案保真）；MAX_STEPS 防循环，recursion_limit 兜底。

关键工程点（面试可深挖）：
1. 子图封装：每个 worker 是独立编译的 StateGraph 子图，独立 State、独立工具集
   （专家隔离），主图以子图作节点，子图内部与外部契约清晰；
2. 消息序列正确性：handoff 后必须回填 ToolMessage 配对，否则
   "带 tool_calls 的 assistant 消息无对应 tool 消息" 触发 LLM 400；
3. 工具异常降级：工具调用 try/except，失败时基于已知信息作答，不崩溃；
4. 安全护栏：急症规则前置，医疗场景安全优先。
"""
from functools import lru_cache
from typing import Annotated, Optional, TypedDict

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_core.tools import tool
from langchain_openai import ChatOpenAI
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages

from .config import Config
from .embeddings import build_embeddings
from .ingest import load_documents, load_index, split_documents
from .tools import (
    build_lexical_search_tool,
    build_rag_search_tool,
    calculator,
    detect_emergency,
    get_today,
)

EMERGENCY_ANSWER = (
    "⚠️ 检测到您描述的症状可能属于**急症**（持续胸痛/呼吸困难/大出血/意识不清等），"
    "请立即拨打 120 或前往急诊就医，不要自行等待。"
    "本助手仅提供健康知识参考，不构成医疗诊断。"
)

SUPERVISOR_PROMPT = (
    "你是医疗咨询平台的主管 Agent。判断用户问题类型并分派：\n"
    "健康/疾病/症状/用药/检查类问题 → 调用 handoff_to_medical；\n"
    "日期/时间/简单算术计算等工具类问题 → 调用 handoff_to_utility；\n"
    "问候、寒暄、与健康无关的问题 → 直接回答，不调用工具。\n"
    "一次只分派一个子图；子图执行后由其直接给出最终回答，你不需要再次回复。"
)

MEDICAL_PROMPT = (
    "你是中医教培知识助手，服务于中医继续教育与医案学习。优先使用 rag_search 检索中医经典、"
    "四诊、辨证论治和已审核医案资料，回答时标注【来源】并区分‘教学解释’与‘临床决策’。"
    "可以解释阴阳、五行、病机、证候、治则等概念，可以帮助整理医案和生成复习问题；"
    "不能仅凭单个症状判断证型，不能生成个人处方、剂量、疗程、针灸方案或停换药建议。"
    "遇到个人症状、孕产妇、儿童、慢病合并用药或高风险描述时，说明信息不足并建议咨询合资格医师；"
    "检索不到时如实说明，不要编造。仅提供健康知识参考，不构成医疗诊断或治疗建议。"
)

UTILITY_PROMPT = "你是通用工具助手。用 get_today / calculator 回答日期与计算类问题，简洁作答。"


class AgentState(TypedDict):
    messages: Annotated[list, add_messages]
    steps: int
    route_trace: list
    emergency: bool


class SubState(TypedDict):
    messages: Annotated[list, add_messages]


class _ToolRunner:
    """子图 worker 执行器：LLM 规划 → 工具执行（异常降级）→ 最终作答。"""

    def __init__(self, system_prompt: str, llm, tool_map: dict) -> None:
        self._prompt = system_prompt
        self._llm = llm
        self._tool_map = tool_map

    def __call__(self, state: SubState) -> dict:
        # 取最后一条（主管的 handoff AIMessage）
        last = state["messages"][-1]
        tc = last.tool_calls[0] if (
            isinstance(last, AIMessage) and last.tool_calls
        ) else None
        # 关键：先回填 handoff 的 ToolMessage，保证整体消息序列配对（否则 LLM 400）。
        # 注意：ack 只回写状态（与主管的 handoff 调用配对），
        # 收尾 LLM 调用只携带 worker 自己的消息序列，避免孤立 tool 消息。
        ack = ToolMessage(content="已分派。", tool_call_id=tc["id"]) if tc else None
        query = tc["args"].get("query", "") if tc else ""

        msgs: list = []
        if ack:
            msgs.append(ack)
        if not query:
            msgs.append(AIMessage(content="（分派参数缺失，请重新表述问题）"))
            return {"messages": msgs}

        # 第一轮：LLM 决定是否调用业务工具
        resp = self._llm.invoke(
            [SystemMessage(content=self._prompt), HumanMessage(content=query)]
        )
        msgs.append(resp)
        # 执行工具（最多一轮工具调用 + 一轮收尾）
        if getattr(resp, "tool_calls", None):
            tool_msgs: list = []
            for tcall in resp.tool_calls:
                try:
                    result = self._tool_map[tcall["name"]].invoke(tcall["args"])
                except Exception as e:  # 工具异常降级
                    result = f"工具调用失败（{e}），请直接基于已知信息回答。"
                tool_msgs.append(
                    ToolMessage(content=str(result), tool_call_id=tcall["id"])
                )
            final = self._llm.invoke(
                [SystemMessage(content=self._prompt), HumanMessage(content=query), resp]
                + tool_msgs
            )
            msgs.extend(tool_msgs)  # 工具结果必须回写状态，否则后续调用配对失败（400）
            msgs.append(final)
        return {"messages": msgs}


@tool
def handoff_to_medical(query: str = "") -> str:
    """把健康/医疗问题分派给医疗知识专家处理。"""
    return "已分派给医疗专家。"


@tool
def handoff_to_utility(query: str = "") -> str:
    """把日期/计算等工具类问题分派给通用工具助手处理。"""
    return "已分派给通用工具助手。"


@lru_cache(maxsize=4)
def _load_corpus(data_dir: str, chunk_size: int, chunk_overlap: int):
    docs = load_documents(data_dir)
    return split_documents(docs, chunk_size, chunk_overlap)


def _build_retrieval_tool(cfg: Config):
    """优先向量+BM25；缺少 Key/索引时降级到纯 BM25。"""
    corpus = _load_corpus(cfg.data_dir, cfg.chunk_size, cfg.chunk_overlap)
    if not corpus:
        raise RuntimeError("知识库为空，请先在 data 目录放入 txt/md/pdf 资料")

    # 演示默认只把经过项目整理的中医教学资料交给 Agent，避免旧版混合社区问答
    # 中未经审核的处方性内容抢占检索结果；生产环境可通过 TCM_FOCUS=false 恢复全库。
    if cfg.tcm_focus:
        tcm_corpus = [
            doc
            for doc in corpus
            if str(doc.metadata.get("source", "")).lower().endswith("tcm_demo.md")
        ]
        if tcm_corpus:
            corpus = tcm_corpus

    if cfg.has_embedding_credentials:
        try:
            db = load_index(build_embeddings(cfg), cfg.vector_store_dir)
            if db is not None:
                indexed_corpus = [d for d in db.docstore._dict.values()]  # noqa: SLF001
                return build_rag_search_tool(db, indexed_corpus, top_k=cfg.top_k)
        except Exception as exc:
            print(f"[warn] 向量检索初始化失败（{type(exc).__name__}），降级为 BM25")

    print("[info] 使用本地 BM25 检索；配置 Embedding Key 并构建索引后可启用混合检索")
    return build_lexical_search_tool(corpus, top_k=cfg.top_k)


def build_agent_platform(cfg: Optional[Config] = None):
    cfg = cfg or Config()

    if not cfg.has_llm_credentials:
        raise ValueError("未配置模型 API Key")
    rag_search = _build_retrieval_tool(cfg)

    llm = ChatOpenAI(
        model=cfg.llm_model,
        base_url=cfg.llm_base_url,
        api_key=cfg.llm_api_key,
        temperature=cfg.llm_temperature,
    )
    supervisor_llm = llm.bind_tools([handoff_to_medical, handoff_to_utility])

    # ---- 任务型子图（独立 State、独立工具集）----
    def _build_subgraph(system_prompt: str, worker_llm, tool_map: dict):
        runner = _ToolRunner(system_prompt, worker_llm, tool_map)
        g = StateGraph(SubState)
        g.add_node("worker", runner)
        g.add_edge(START, "worker")
        g.add_edge("worker", END)
        return g.compile()

    medical_sub = _build_subgraph(
        MEDICAL_PROMPT, llm.bind_tools([rag_search]), {"rag_search": rag_search}
    )
    utility_sub = _build_subgraph(
        UTILITY_PROMPT,
        llm.bind_tools([get_today, calculator]),
        {"get_today": get_today, "calculator": calculator},
    )

    # ---- 节点 ----
    def guard(state: AgentState) -> dict:
        last_human = next(
            (m for m in reversed(state["messages"]) if isinstance(m, HumanMessage)),
            None,
        )
        text = last_human.content if last_human else ""
        hit = detect_emergency(text) if isinstance(text, str) else None
        if hit:
            return {
                "messages": [AIMessage(content=EMERGENCY_ANSWER)],
                "emergency": True,
                "route_trace": state["route_trace"] + [f"guard(急症:{hit})"],
            }
        return {"route_trace": state["route_trace"] + ["guard(通过)"]}

    def supervisor(state: AgentState) -> dict:
        resp = supervisor_llm.invoke(
            [SystemMessage(content=SUPERVISOR_PROMPT)] + state["messages"]
        )
        return {
            "messages": [resp],
            "steps": state.get("steps", 0) + 1,
            "route_trace": state["route_trace"] + ["supervisor"],
        }

    def route(state: AgentState) -> str:
        if state.get("steps", 0) >= cfg.max_steps:
            return END
        last = state["messages"][-1]
        if isinstance(last, AIMessage) and last.tool_calls:
            name = last.tool_calls[0]["name"]
            if name == "handoff_to_medical":
                return "medical"
            if name == "handoff_to_utility":
                return "utility"
        return END

    # ---- 主图 ----
    graph = StateGraph(AgentState)

    def to_medical(state: AgentState) -> dict:
        return {"route_trace": state["route_trace"] + ["→ 医疗知识子图"]}

    def to_utility(state: AgentState) -> dict:
        return {"route_trace": state["route_trace"] + ["→ 通用工具子图"]}

    graph.add_node("guard", guard)
    graph.add_node("supervisor", supervisor)
    graph.add_node("to_medical", to_medical)
    graph.add_node("to_utility", to_utility)
    graph.add_node("medical", medical_sub)
    graph.add_node("utility", utility_sub)

    graph.add_edge(START, "guard")
    graph.add_conditional_edges(
        "guard",
        lambda s: END if s.get("emergency") else "supervisor",
        {"supervisor": "supervisor", END: END},
    )
    graph.add_conditional_edges(
        "supervisor",
        route,
        {"medical": "to_medical", "utility": "to_utility", END: END},
    )
    graph.add_edge("to_medical", "medical")
    graph.add_edge("to_utility", "utility")
    # 专家子图即终态：主控只负责路由，专家回答直接作为最终答案（专家隔离，避免二次改写丢内容）
    graph.add_edge("medical", END)
    graph.add_edge("utility", END)
    return graph.compile()


class AgentPlatform:
    """平台门面：多轮会话，内部保留历史与路由轨迹。"""

    def __init__(self, cfg: Optional[Config] = None) -> None:
        self.cfg = cfg or Config()
        self._graph = build_agent_platform(self.cfg)
        self._history: list = []
        self._trace: list = []

    def reset(self) -> None:
        self._history = []
        self._trace = []

    def ask(self, question: str) -> dict:
        self._history.append(HumanMessage(content=question))
        result = self._graph.invoke(
            {"messages": self._history, "steps": 0, "route_trace": [], "emergency": False},
            {"recursion_limit": self.cfg.recursion_limit},
        )
        answer = result["messages"][-1].content
        self._history = result["messages"]
        self._trace = result["route_trace"]
        return {"answer": str(answer), "route_trace": self._trace}
