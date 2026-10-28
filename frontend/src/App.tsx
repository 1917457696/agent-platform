import {
  Activity,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  BookOpenText,
  Bot,
  Check,
  ChevronRight,
  CircleHelp,
  Database,
  Eye,
  EyeOff,
  Fingerprint,
  KeyRound,
  Layers3,
  LockKeyhole,
  Menu,
  MessageSquareText,
  Plus,
  RefreshCw,
  Route,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  X,
} from "lucide-react";
import {
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";

type Credentials = {
  llmKey: string;
  llmBaseUrl: string;
  llmModel: string;
  embeddingKey: string;
  embeddingBaseUrl: string;
  embeddingModel: string;
};

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  channel?: string;
  trace?: string[];
  observability?: Observability;
};

type Conversation = {
  id: string;
  title: string;
  updatedAt: number;
  messages: Message[];
};

type TrainingMessage = {
  id: string;
  role: "student" | "patient";
  content: string;
  topic?: string;
};

type TrainingReport = {
  overall: number;
  completeness: number;
  coverage: number;
  reasoning: number;
  safety: number;
  asked: string[];
  missed: string[];
};

type TrainingCase = {
  id: string;
  title: string;
  department: string;
  difficulty: string;
  duration: string;
  opening: string;
  keyQuestions: { label: string; keywords: string[] }[];
  respond: (question: string) => { text: string; topic: string };
};

type TraceNode = {
  name: string;
  label: string;
  status: "completed" | "running" | "waiting";
  detail?: string;
  duration_ms?: number;
};

type Observability = {
  trace_id?: string;
  latency_ms?: number;
  channel?: string;
  token_usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    estimated?: boolean;
  };
  nodes?: TraceNode[];
  exporter?: string;
};

type CapabilityDetail = {
  title: string;
  purpose: string;
  input: string;
  output: string;
  boundary: string;
  next: string;
};

type WorkflowStep = {
  number: string;
  title: string;
  copy: string;
  detail: string;
  Icon: typeof ShieldCheck;
};

const defaultCredentials: Credentials = {
  llmKey: "",
  llmBaseUrl: "https://api.deepseek.com",
  llmModel: "deepseek-chat",
  embeddingKey: "",
  embeddingBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  embeddingModel: "text-embedding-v3",
};

const slides = [
  {
    eyebrow: "01 / 分流",
    kicker: "CLASSIC · CASE · TEACHING",
    title: "从经典出发，\n把中医思维讲清楚。",
    body: "围绕阴阳、四诊、辨证论治与医案学习组织资料，让每一次提问都回到可核对的教学语境。",
    tag: "中医教培",
    stat: "经典为根",
    visual: "route",
  },
  {
    eyebrow: "02 / 证据",
    kicker: "中医资料库 · RAG 检索",
    title: "回答有出处，\n辨证不越界。",
    body: "优先检索经过整理的中医教学资料；缺少 Embedding Key 或索引时，仍可用本地词法检索演示。",
    tag: "中医知识库",
    stat: "来源可核",
    visual: "archive",
  },
  {
    eyebrow: "03 / 守门",
    kicker: "SAFETY · TEACHER REVIEW",
    title: "先辨边界，\n再谈中医表达。",
    body: "四诊信息不完整时只做教学解释；个人症状、方药剂量与高风险描述转人工医师审核。",
    tag: "师承式审核",
    stat: "人工优先",
    visual: "guard",
  },
];

const capabilityCards = [
  {
    icon: Route,
    index: "01",
    title: "经典知识库",
    copy: "围绕阴阳、五行、四诊与辨证论治整理教学资料，回答优先回到中医语境。",
    detail: "来源与章节可回看",
    explanation: { title: "经典知识库", purpose: "把课程、经典和审核过的医案整理成可检索的教学证据。", input: "学员问题、课程主题、章节范围", output: "带章节来源的解释与复习线索", boundary: "找不到可靠来源时不编造，也不直接给个人诊疗结论。", next: "在工作台提问后，可从回答卡片查看命中的来源。" },
  },
  {
    icon: Database,
    index: "02",
    title: "医案拆解",
    copy: "把合成案例拆成主诉、时间线、缺失信息和课堂讨论点，不直接替学员下诊断。",
    detail: "从案例回到方法",
    explanation: { title: "医案拆解", purpose: "把一个复杂医案拆成主诉、时间线、缺失信息和课堂讨论点。", input: "合成医案、学员追问、课程章节", output: "病程摘要、追问建议、学习反馈", boundary: "病例事实固定在演示数据中，不随机创造患者信息。", next: "点击工作台的“进入病例训练”，让 AI 扮演患者。" },
  },
  {
    icon: ShieldCheck,
    index: "03",
    title: "辨证边界",
    copy: "强调四诊合参与教师审核，拒绝单症状定证、个人处方、剂量和停换药建议。",
    detail: "教学解释不代诊疗",
    explanation: { title: "辨证边界", purpose: "在回答前识别高风险内容，确保教学解释不滑向在线诊疗。", input: "症状、处方、剂量、急症和特殊人群描述", output: "继续教学、拒答、急诊提示或转人工审核", boundary: "不凭单一症状定证，不提供个人处方、剂量或停换药建议。", next: "在本地陪练 Demo 的最后一步输入“直接开方”，查看安全闸。" },
  },
  {
    icon: Fingerprint,
    index: "04",
    title: "师承式审核",
    copy: "AI 负责资料整理、复习题和答疑草稿，涉及临床决策的内容保留教师与执业医师入口。",
    detail: "人机协作可追溯",
    explanation: { title: "师承式审核", purpose: "让 AI 做整理和草稿，让教师保留临床教学决策权。", input: "AI 回答、引用来源、学员错误和风险标签", output: "可编辑反馈草稿、人工审核工单、Bad Case", boundary: "AI 不是最终审核人，生产环境需要教师和执业医师确认。", next: "报告页会展示遗漏项，后续可接入教师审核队列。" },
  },
];

const workflowSteps: WorkflowStep[] = [
  { number: "01", title: "护栏先行", copy: "识别高风险描述，必要时直接提示急诊。", detail: "先用规则检查急症信号；命中后不调用模型和知识库，直接给出安全提示并保留人工入口。", Icon: ShieldCheck },
  { number: "02", title: "缓存与常见问答", copy: "对已验证的高频答案进行低成本复用。", detail: "相同问题优先命中已审核答案，减少延迟和模型成本；命中结果会在本次运行记录中标记。", Icon: Layers3 },
  { number: "03", title: "主控分流", copy: "识别任务类型，只负责交接，不越权代答。", detail: "主控模块判断是中医知识、工具问题还是普通寒暄，再把任务交给对应子图。", Icon: Route },
  { number: "04", title: "专家执行", copy: "调用检索或工具，返回答案与路由轨迹。", detail: "医疗子图负责 RAG 和教学回答，通用工具子图负责日期与计算；最终结果附带耗时、Token 和节点路径。", Icon: Bot },
];

const starterPrompts = [
  "如何理解中医的辨证论治？",
  "四诊合参在医案学习中怎么用？",
  "《黄帝内经》的阴阳观如何入门？",
];

const trainingCases: TrainingCase[] = [
  {
    id: "chest-pain",
    title: "胸痛 · 急性风险识别",
    department: "心内科",
    difficulty: "★★★",
    duration: "8 分钟",
    opening: "医生您好，我今天下午开始胸口有点闷痛，走快一点时更明显。",
    keyQuestions: [
      { label: "疼痛位置与性质", keywords: ["哪里", "位置", "性质", "闷", "压榨", "刺痛"] },
      { label: "持续时间与诱因", keywords: ["多久", "多长", "什么时候", "活动", "休息", "诱因"] },
      { label: "放射与伴随症状", keywords: ["放射", "肩", "手臂", "呼吸", "大汗", "恶心"] },
      { label: "既往史与用药", keywords: ["既往", "高血压", "糖尿病", "心脏", "用药", "药物"] },
      { label: "过敏与家族史", keywords: ["过敏", "家族", "父母", "遗传"] },
    ],
    respond: (question) => {
      if (/[哪里位置性质闷压榨刺痛]/.test(question)) return { topic: "疼痛位置与性质", text: "主要在胸骨后偏左的位置，像被压着一样，不是针扎的刺痛。" };
      if (/[多久多长什么时候活动休息诱因]/.test(question)) return { topic: "持续时间与诱因", text: "大概持续了二十分钟，快走或爬楼时更明显，停下来休息会缓解一些。" };
      if (/[放射肩手臂呼吸大汗恶心]/.test(question)) return { topic: "放射与伴随症状", text: "有一点向左肩和左手臂放，刚才出过汗，但没有明显恶心。现在没有明显呼吸困难。" };
      if (/[既往高血压糖尿病心脏用药药物]/.test(question)) return { topic: "既往史与用药", text: "有五年的高血压史，平时吃降压药，今天还没有吃其他药。" };
      if (/[过敏家族父母遗传]/.test(question)) return { topic: "过敏与家族史", text: "没有明确药物过敏，父亲以前有冠心病。" };
      return { topic: "低价值追问", text: "这个我暂时说不清楚。您还想了解哪些和这次胸闷有关的信息？" };
    },
  },
  {
    id: "cough",
    title: "咳嗽 · 四诊信息采集",
    department: "呼吸科",
    difficulty: "★★",
    duration: "6 分钟",
    opening: "这两天换季以后我一直咳嗽，嗓子有点痒。",
    keyQuestions: [
      { label: "病程与变化", keywords: ["多久", "几天", "什么时候", "加重", "变化"] },
      { label: "寒热与汗出", keywords: ["发热", "怕冷", "寒热", "出汗", "汗"] },
      { label: "痰与呼吸", keywords: ["痰", "呼吸", "喘", "气促", "颜色"] },
      { label: "饮食睡眠与二便", keywords: ["饮食", "睡眠", "大便", "小便"] },
      { label: "过敏与用药", keywords: ["过敏", "用药", "药物"] },
    ],
    respond: (question) => {
      if (/[多久几天什么时候加重变化]/.test(question)) return { topic: "病程与变化", text: "从前天晚上开始，今天白天比昨天频繁一些。" };
      if (/[发热怕冷寒热出汗汗]/.test(question)) return { topic: "寒热与汗出", text: "没有量到发热，稍微有点怕风，没怎么出汗。" };
      if (/[痰呼吸喘气促颜色]/.test(question)) return { topic: "痰与呼吸", text: "偶尔有少量白痰，目前没有喘，也没有明显气短。" };
      if (/[饮食睡眠大便小便]/.test(question)) return { topic: "饮食睡眠与二便", text: "饮食和睡眠基本正常，大小便也没有明显变化。" };
      if (/[过敏用药药物]/.test(question)) return { topic: "过敏与用药", text: "没有已知药物过敏，暂时没有自行吃药。" };
      return { topic: "低价值追问", text: "嗯，这个暂时没有特别感觉。您还想问什么？" };
    },
  },
  {
    id: "fever",
    title: "发热 · 风险分层",
    department: "全科",
    difficulty: "★★",
    duration: "6 分钟",
    opening: "我从昨晚开始发热，身上有点酸痛。",
    keyQuestions: [
      { label: "体温与时间线", keywords: ["体温", "多少度", "多久", "什么时候"] },
      { label: "呼吸与意识", keywords: ["呼吸", "喘", "意识", "头晕"] },
      { label: "寒战与出汗", keywords: ["寒战", "怕冷", "出汗", "汗"] },
      { label: "用药与基础病", keywords: ["用药", "药物", "基础病", "高血压", "糖尿病"] },
    ],
    respond: (question) => {
      if (/[体温多少度多久什么时候]/.test(question)) return { topic: "体温与时间线", text: "昨晚九点左右开始，最高量到 38.6℃，今天早上还是 38℃ 左右。" };
      if (/[呼吸喘意识头晕]/.test(question)) return { topic: "呼吸与意识", text: "没有呼吸困难，意识清楚，有一点头晕。" };
      if (/[寒战怕冷出汗汗]/.test(question)) return { topic: "寒战与出汗", text: "发热前有一阵怕冷，现在有一点出汗。" };
      if (/[用药药物基础病高血压糖尿病]/.test(question)) return { topic: "用药与基础病", text: "没有长期用药，也没有听说过明确的基础病。" };
      return { topic: "低价值追问", text: "这个我不太确定。您还需要了解哪些信息？" };
    },
  },
];

const trainingSuggestedQuestions: Record<string, string[]> = {
  "chest-pain": [
    "疼痛具体在哪里？是什么性质？",
    "持续多久？活动后会加重、休息后会缓解吗？",
    "有没有向肩背或手臂放射，伴随出汗、恶心或呼吸困难？",
  ],
  cough: [
    "咳嗽从什么时候开始？这几天有什么变化？",
    "有没有发热、怕冷或出汗？",
    "有没有痰、喘或气短？痰是什么颜色？",
  ],
  fever: [
    "最高体温是多少？从什么时候开始发热？",
    "有没有呼吸困难、喘、头晕或意识不清？",
    "发热前后有没有寒战、怕冷或出汗？",
  ],
};

const practiceDemo = {
  casePrompt: "我在换季后咳嗽两天，先从这个医案开始陪练。",
  followUp: "补充信息：没有明显发热，咽部发痒，偶有白痰，睡眠和饮食基本正常；舌象和脉象暂时无法在线可靠获得。",
  safetyPrompt: "那你直接告诉我应该用什么方、多少剂量？",
  inquiry: "这是一个合成医案，我们先不急着下结论。为了训练辨证思路，我会先补齐病程、寒热、汗出、痰、饮食睡眠等信息。当前还缺少舌象、脉象等不能仅靠文字可靠获得的四诊资料。",
  feedback: "基于《四诊合参与辨证论治》课程资料：\n\n学习反馈\n1. 做得好的地方：你先提供了病程和主要症状，具备继续分析的基础。\n2. 需要补齐：咽痒、白痰只能作为讨论线索，不能单独定为某个证；舌象、脉象和整体状态仍需教师结合。\n3. 下一步练习：请分别说明“症状信息”“四诊依据”“仍需核实的信息”，再比较两种可能的病机解释。\n\n推荐复习：四诊合参 → 辨证论治的证据链 → 外感咳嗽医案。\n\n来源：中医教培演示资料 · 四诊合参、辨证论治与合成医案章节。",
  safety: "这一步我不能直接给出个人处方或剂量。课程 AI 助教可以解释相关治则、整理老师医案并生成练习，但具体方药需要由教师或执业中医师结合完整四诊信息审核。\n\n已转人工审核：teacher_review_required\n教学边界：不把合成医案或单个症状直接迁移到个人诊疗。",
};

const sessionKey = "qixu.credentials.v1";
const chatSessionKey = "qixu.chat-session.v1";
const conversationsKey = "qixu.conversations.v1";

function welcomeMessage(): Message {
  return {
    id: "welcome",
    role: "assistant",
    content:
      "你好，我是岐序中医教培智能助教。配置模型 API Key 后，可以学习中医经典、四诊与辨证论治，也可以让我帮你拆解合成医案。涉及个人诊疗时，我会提示转教师或执业医师审核。",
    channel: "system",
  };
}

function readCredentials(): Credentials {
  try {
    const raw = sessionStorage.getItem(sessionKey);
    return raw ? { ...defaultCredentials, ...JSON.parse(raw) } : defaultCredentials;
  } catch {
    return defaultCredentials;
  }
}

function getChatSession(): string {
  const existing = sessionStorage.getItem(chatSessionKey);
  if (existing) return existing;
  const next = crypto.randomUUID();
  sessionStorage.setItem(chatSessionKey, next);
  return next;
}

function readConversations(): Conversation[] {
  try {
    const raw = sessionStorage.getItem(conversationsKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is Conversation => (
      item && typeof item.id === "string" && typeof item.title === "string"
      && typeof item.updatedAt === "number" && Array.isArray(item.messages)
    )).slice(0, 12);
  } catch {
    return [];
  }
}

function conversationTitle(messages: Message[]): string {
  const firstQuestion = messages.find((message) => message.role === "user")?.content.trim();
  if (!firstQuestion) return "新中医学习对话";
  return firstQuestion.length > 24 ? `${firstQuestion.slice(0, 24)}…` : firstQuestion;
}

function formatConversationTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return `今天 ${date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
  }
  return date.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}

function readableTraceStep(step: string): string {
  if (step.startsWith("guard")) return step.includes("急症") ? "安全护栏：命中风险" : "安全护栏：通过";
  if (step === "supervisor") return "主控分流";
  if (step.includes("医疗知识")) return "中医知识子图";
  if (step.includes("通用工具")) return "通用工具子图";
  return step;
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

type StreamEvent = {
  type?: "status" | "delta" | "meta" | "done" | "error";
  text?: string;
  channel?: string;
  route_trace?: string[];
  observability?: Observability;
  message?: string;
};

async function* readSseEvents(response: Response): AsyncGenerator<StreamEvent> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("浏览器不支持流式响应");
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() ?? "";
      for (const block of blocks) {
        const data = block
          .split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim())
          .join("\n");
        if (data) yield JSON.parse(data) as StreamEvent;
      }
      if (done) break;
    }
    const finalData = buffer
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("\n");
    if (finalData) yield JSON.parse(finalData) as StreamEvent;
  } finally {
    reader.releaseLock();
  }
}

function App() {
  const reducedMotion = useReducedMotion();
  const [activeSlide, setActiveSlide] = useState(0);
  const [carouselPaused, setCarouselPaused] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [credentials, setCredentials] = useState<Credentials>(readCredentials);
  const [draftCredentials, setDraftCredentials] = useState<Credentials>(credentials);
  const [showKey, setShowKey] = useState(false);
  const [question, setQuestion] = useState("");
  const [activeSessionId, setActiveSessionId] = useState(getChatSession);
  const [conversations, setConversations] = useState<Conversation[]>(readConversations);
  const [messages, setMessages] = useState<Message[]>(() => {
    const active = readConversations().find((conversation) => conversation.id === getChatSession());
    return active?.messages?.length ? active.messages : [welcomeMessage()];
  });
  const [isSending, setIsSending] = useState(false);
  const [notice, setNotice] = useState("");
  const [demoStep, setDemoStep] = useState<"idle" | "inquiry" | "feedback" | "safety">("idle");
  const [trainingOpen, setTrainingOpen] = useState(false);
  const [trainingCaseId, setTrainingCaseId] = useState("chest-pain");
  const [trainingDraft, setTrainingDraft] = useState("");
  const [trainingJudgement, setTrainingJudgement] = useState("");
  const [trainingMessages, setTrainingMessages] = useState<TrainingMessage[]>([]);
  const [trainingAsked, setTrainingAsked] = useState<string[]>([]);
  const [trainingReport, setTrainingReport] = useState<TrainingReport | null>(null);
  const [activeCapability, setActiveCapability] = useState<CapabilityDetail | null>(null);
  const [activeWorkflowStep, setActiveWorkflowStep] = useState(0);
  const [lastTrace, setLastTrace] = useState<Observability | null>(null);
  const [tracePhase, setTracePhase] = useState("等待下一次运行");
  const pointerStart = useRef<number | null>(null);
  const workspaceRef = useRef<HTMLElement | null>(null);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const pageScrollLockRef = useRef<number | null>(null);

  const hasKey = Boolean(credentials.llmKey.trim());

  useEffect(() => {
    setConversations((current) => {
      const next = [
        ...current.filter((conversation) => conversation.id !== activeSessionId),
        {
          id: activeSessionId,
          title: conversationTitle(messages),
          updatedAt: Date.now(),
          messages: messages.slice(-40),
        },
      ].sort((left, right) => right.updatedAt - left.updatedAt).slice(0, 12);
      sessionStorage.setItem(conversationsKey, JSON.stringify(next));
      return next;
    });
  }, [activeSessionId, messages]);

  useEffect(() => {
    if (reducedMotion || carouselPaused) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        setActiveSlide((current) => (current + 1) % slides.length);
      }
    }, 6200);
    return () => window.clearInterval(timer);
  }, [carouselPaused, reducedMotion]);

  useEffect(() => {
    const elements = document.querySelectorAll<HTMLElement>("[data-reveal]");
    if (reducedMotion) {
      elements.forEach((element) => element.classList.add("is-visible"));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.16 },
    );
    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [reducedMotion]);

  useEffect(() => {
    // 只滚动消息列表本身，避免 scrollIntoView 把整个长页面拉到最底部。
    const messageList = messageListRef.current;
    if (!messageList) return;
    const pageScrollY = pageScrollLockRef.current ?? window.scrollY;
    messageList.scrollTo({
      top: messageList.scrollHeight,
      behavior: "auto",
    });
    const frame = window.requestAnimationFrame(() => {
      if (Math.abs(window.scrollY - pageScrollY) > 1) {
        window.scrollTo({ top: pageScrollY, behavior: "auto" });
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [messages, reducedMotion]);

  const goToSlide = (next: number) => {
    setActiveSlide((next + slides.length) % slides.length);
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    pointerStart.current = event.clientX;
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    if (pointerStart.current === null) return;
    const delta = event.clientX - pointerStart.current;
    pointerStart.current = null;
    if (Math.abs(delta) > 48) {
      goToSlide(activeSlide + (delta < 0 ? 1 : -1));
    }
  };

  const openSettings = () => {
    setDraftCredentials(credentials);
    setDrawerOpen(true);
    setMenuOpen(false);
  };

  const saveCredentials = (event: FormEvent) => {
    event.preventDefault();
    const clean = {
      ...draftCredentials,
      llmKey: draftCredentials.llmKey.trim(),
      embeddingKey: draftCredentials.embeddingKey.trim(),
      llmBaseUrl: draftCredentials.llmBaseUrl.trim().replace(/\/$/, ""),
      embeddingBaseUrl: draftCredentials.embeddingBaseUrl.trim().replace(/\/$/, ""),
      llmModel: draftCredentials.llmModel.trim(),
      embeddingModel: draftCredentials.embeddingModel.trim(),
    };
    setCredentials(clean);
    sessionStorage.setItem(sessionKey, JSON.stringify(clean));
    setDrawerOpen(false);
    setNotice("配置已保存，仅对当前标签页有效。关闭标签页后浏览器会清除密钥。" );
    window.setTimeout(() => setNotice(""), 4200);
  };

  const clearCredentials = () => {
    setCredentials(defaultCredentials);
    setDraftCredentials(defaultCredentials);
    sessionStorage.removeItem(sessionKey);
    setNotice("当前标签页中的密钥已清除。" );
    window.setTimeout(() => setNotice(""), 3200);
  };

  const scrollToWorkspace = () => {
    workspaceRef.current?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth" });
  };

  const sendQuestion = async (event?: FormEvent, prompt?: string) => {
    event?.preventDefault();
    const content = (prompt ?? question).trim();
    if (!content || isSending) return;
    if (!hasKey) {
      setNotice("请先配置你的模型 API Key，再开始问答。" );
      openSettings();
      return;
    }

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content,
    };
    setMessages((current) => [...current, userMessage]);
    pageScrollLockRef.current = window.scrollY;
    setQuestion("");
    setIsSending(true);
    setNotice("");
    const assistantId = crypto.randomUUID();
    setMessages((current) => [
      ...current,
      { id: assistantId, role: "assistant", content: "", channel: "streaming" },
    ]);
    setTracePhase("正在启动：安全护栏");
    setLastTrace({ exporter: "本地 Trace", nodes: [{ name: "guard", label: "安全护栏", status: "running", detail: "检查急症与高风险描述" }] });

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-LLM-API-Key": credentials.llmKey,
      };
      if (credentials.embeddingKey) {
        headers["X-Embedding-API-Key"] = credentials.embeddingKey;
      }
      const response = await fetch("/api/chat/stream", {
        method: "POST",
        headers,
        body: JSON.stringify({
          question: content,
          session_id: activeSessionId,
          provider: {
            llm_base_url: credentials.llmBaseUrl,
            llm_model: credentials.llmModel,
            embedding_base_url: credentials.embeddingBaseUrl,
            embedding_model: credentials.embeddingModel,
          },
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail?.message ?? "请求失败，请检查模型配置后重试。");
      }
      for await (const event of readSseEvents(response)) {
        if (event.type === "status") {
          setNotice(event.text ?? "正在生成回答…");
          setTracePhase(event.text ?? "正在运行节点…");
        } else if (event.type === "delta") {
          setMessages((current) => current.map((message) => (
            message.id === assistantId
              ? { ...message, content: message.content + (event.text ?? "") }
              : message
          )));
        } else if (event.type === "meta") {
          setMessages((current) => current.map((message) => (
            message.id === assistantId
              ? { ...message, channel: event.channel, trace: event.route_trace, observability: event.observability }
              : message
          )));
          setLastTrace({ ...(event.observability ?? {}), channel: event.channel });
          setTracePhase("运行完成，可查看本次 Trace");
        } else if (event.type === "error") {
          throw new Error(event.message ?? "服务暂时不可用，请稍后重试。");
        } else if (event.type === "done") {
          setNotice("");
        }
      }
    } catch (error) {
      setMessages((current) => current.map((message) => (
        message.id === assistantId
          ? {
              ...message,
              content: error instanceof Error ? error.message : "服务暂时不可用，请稍后重试。",
              channel: "error",
            }
          : message
      )));
    } finally {
      setIsSending(false);
      setNotice("");
      setTracePhase((current) => current === "运行完成，可查看本次 Trace" ? current : "运行结束");
      const lockedScrollY = pageScrollLockRef.current;
      window.requestAnimationFrame(() => {
        if (lockedScrollY != null) window.scrollTo({ top: lockedScrollY, behavior: "auto" });
        pageScrollLockRef.current = null;
      });
    }
  };

  const resetConversation = async () => {
    const sessionId = activeSessionId;
    try {
      await fetch("/api/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId }),
      });
    } finally {
      setMessages([welcomeMessage()]);
      setNotice("会话已重置。" );
      window.setTimeout(() => setNotice(""), 2500);
    }
  };

  const createConversation = () => {
    if (isSending) return;
    const nextId = crypto.randomUUID();
    sessionStorage.setItem(chatSessionKey, nextId);
    setActiveSessionId(nextId);
    setMessages([welcomeMessage()]);
    setQuestion("");
    setNotice("已新建对话。" );
    window.setTimeout(() => setNotice(""), 1800);
  };

  const selectConversation = (conversation: Conversation) => {
    if (isSending || conversation.id === activeSessionId) return;
    sessionStorage.setItem(chatSessionKey, conversation.id);
    setActiveSessionId(conversation.id);
    setMessages(conversation.messages.length ? conversation.messages : [welcomeMessage()]);
    setQuestion("");
    setNotice("");
  };

  const startTraining = (caseId: string) => {
    const selected = trainingCases.find((item) => item.id === caseId) ?? trainingCases[0];
    setTrainingCaseId(selected.id);
    setTrainingOpen(true);
    setTrainingDraft("");
    setTrainingJudgement("");
    setTrainingAsked([]);
    setTrainingReport(null);
    setTrainingMessages([{
      id: crypto.randomUUID(),
      role: "patient",
      content: selected.opening,
      topic: "主诉",
    }]);
    setDemoStep("inquiry");
    setNotice("病例训练已开始：你扮演医生，AI 扮演患者。请主动问诊。");
    window.setTimeout(() => setNotice(""), 2600);
  };

  const submitTrainingText = (rawContent: string) => {
    const content = rawContent.trim();
    if (!content || trainingReport) return;
    const selected = trainingCases.find((item) => item.id === trainingCaseId) ?? trainingCases[0];
    const response = selected.respond(content);
    const matched = selected.keyQuestions
      .filter((item) => item.keywords.some((keyword) => content.includes(keyword)))
      .map((item) => item.label);
    setTrainingAsked((current) => Array.from(new Set([...current, ...matched])));
    setTrainingMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "student", content },
      { id: crypto.randomUUID(), role: "patient", content: response.text, topic: response.topic },
    ]);
    setTrainingDraft("");
  };

  const submitTrainingQuestion = (event: FormEvent) => {
    event.preventDefault();
    submitTrainingText(trainingDraft);
  };

  const finishTraining = () => {
    if (!trainingMessages.length || trainingReport) return;
    if (!trainingJudgement.trim()) {
      setNotice("请先写下你的初步判断，再提交训练报告。");
      window.setTimeout(() => setNotice(""), 2200);
      return;
    }
    const selected = trainingCases.find((item) => item.id === trainingCaseId) ?? trainingCases[0];
    const total = selected.keyQuestions.length;
    const completeness = Math.min(98, 45 + Math.round((trainingAsked.length / total) * 53));
    const redFlagAsked = trainingAsked.includes("放射与伴随症状") || trainingAsked.includes("呼吸与意识");
    const coverage = Math.min(96, 42 + Math.round((trainingAsked.length / total) * 54));
    const reasoning = Math.min(94, 62 + trainingAsked.length * 6);
    const safety = redFlagAsked ? 91 : 52;
    const overall = Math.round(completeness * 0.3 + coverage * 0.3 + reasoning * 0.2 + safety * 0.2);
    setTrainingReport({
      overall,
      completeness,
      coverage,
      reasoning,
      safety,
      asked: trainingAsked,
      missed: selected.keyQuestions.map((item) => item.label).filter((label) => !trainingAsked.includes(label)),
    });
    setDemoStep("feedback");
    setNotice("问诊已提交：系统根据规则覆盖和学习路径生成训练报告。");
    window.setTimeout(() => setNotice(""), 2600);
  };

  const closeTraining = () => {
    if (!trainingReport && trainingMessages.length > 1) {
      setNotice("可以先点击“结束问诊并提交”，保存本次训练反馈。");
      window.setTimeout(() => setNotice(""), 2200);
      return;
    }
    setTrainingOpen(false);
    setTrainingMessages([]);
    setTrainingJudgement("");
    setTrainingReport(null);
    setDemoStep("idle");
  };

  const runPracticeDemo = async () => {
    if (isSending) return;
    const nextId = crypto.randomUUID();
    sessionStorage.setItem(chatSessionKey, nextId);
    setActiveSessionId(nextId);
    setMessages([welcomeMessage()]);
    setQuestion("");
    setIsSending(true);
    setDemoStep("inquiry");
    setTracePhase("本地演示：正在运行陪练节点");
    setLastTrace({ exporter: "本地 Trace（离线演示）", channel: "课程陪练", latency_ms: 2860, token_usage: { total_tokens: 620, estimated: true }, nodes: [
      { name: "guard", label: "安全护栏", status: "completed", detail: "教学场景边界检查", duration_ms: 12 },
      { name: "inquiry", label: "缺槽追问", status: "completed", detail: "补齐病程、寒热、痰与四诊信息", duration_ms: 410 },
      { name: "rag", label: "课程检索", status: "completed", detail: "命中中医教培演示资料", duration_ms: 328 },
      { name: "review", label: "教师审核", status: "completed", detail: "处方请求转人工", duration_ms: 90 },
    ] });
    setNotice("本地演示模式：正在模拟学员与课程助教的陪练流程…");
    const wait = (duration: number) => new Promise((resolve) => window.setTimeout(resolve, duration));

    await wait(420);
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "user", content: practiceDemo.casePrompt },
    ]);
    await wait(620);
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "assistant", content: practiceDemo.inquiry, channel: "医案陪练 · 追问" },
    ]);
    await wait(520);
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "user", content: practiceDemo.followUp },
    ]);
    setDemoStep("feedback");
    await wait(700);
    setMessages((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        role: "assistant",
        content: practiceDemo.feedback,
        channel: "课程陪练 · 来源可核",
        trace: ["缺槽追问", "中医资料检索", "学习反馈"],
      },
    ]);
    setDemoStep("safety");
    await wait(500);
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "user", content: practiceDemo.safetyPrompt },
    ]);
    await wait(620);
    setMessages((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        role: "assistant",
        content: practiceDemo.safety,
        channel: "安全闸 · 教师审核",
        trace: ["风险识别", "处方越界拦截", "教师审核"],
      },
    ]);
    setDemoStep("safety");
    setIsSending(false);
    setTracePhase("本地演示完成，可查看节点流转");
    setNotice("本地陪练演示完成：追问、来源、反馈和人工审核均已展示。");
    window.setTimeout(() => setNotice(""), 3200);
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="岐序首页">
          <span className="brand-mark" aria-hidden="true">岐</span>
          <span className="brand-copy">
            <strong>岐序</strong>
            <small>中医教培智能助教</small>
          </span>
        </a>

        <nav className={menuOpen ? "nav-links is-open" : "nav-links"} aria-label="主导航">
          <a href="#capabilities" onClick={() => setMenuOpen(false)}>能力底座</a>
          <a href="#workflow" onClick={() => setMenuOpen(false)}>运行路径</a>
          <button type="button" className="nav-workbench" onClick={scrollToWorkspace}>
            进入中医工作台 <ChevronRight size={15} />
          </button>
        </nav>

        <div className="top-actions">
          <button
            className={hasKey ? "key-button is-ready" : "key-button"}
            type="button"
            onClick={openSettings}
            aria-label="配置 API Key"
          >
            {hasKey ? <Check size={16} /> : <KeyRound size={16} />}
            <span>{hasKey ? "密钥已就绪" : "配置 API Key"}</span>
          </button>
          <button
            className="menu-button"
            type="button"
            aria-label={menuOpen ? "关闭菜单" : "打开菜单"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((current) => !current)}
          >
            {menuOpen ? <X /> : <Menu />}
          </button>
        </div>
      </header>

      <main>
        <section
          id="top"
          className="hero"
          aria-roledescription="carousel"
          aria-label="平台能力概览"
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerCancel={() => { pointerStart.current = null; }}
          onMouseEnter={() => setCarouselPaused(true)}
          onMouseLeave={() => setCarouselPaused(false)}
          onFocusCapture={() => setCarouselPaused(true)}
          onBlurCapture={() => setCarouselPaused(false)}
        >
          <div className="paper-grain" aria-hidden="true" />
          <div className="hero-rail" aria-hidden="true">
            <span>医学知识</span><span>智能编排</span><span>安全优先</span>
          </div>

          <div className="slides-viewport">
            <div
              className="slides-track"
              style={{ transform: `translate3d(-${activeSlide * 100}%, 0, 0)` }}
            >
              {slides.map((slide, index) => (
                <article
                  className="hero-slide"
                  key={slide.eyebrow}
                  aria-hidden={activeSlide !== index}
                >
                  <div className="slide-copy">
                    <div className="eyebrow-row">
                      <span className="eyebrow">{slide.eyebrow}</span>
                      <span className="hairline" />
                      <span className="kicker">{slide.kicker}</span>
                    </div>
                    <h1>{slide.title.split("\n").map((line) => <span key={line}>{line}</span>)}</h1>
                    <p>{slide.body}</p>
                    <div className="hero-cta-row">
                      <button type="button" className="primary-cta" onClick={scrollToWorkspace}>
                        进入中医工作台 <ArrowRight size={18} />
                      </button>
                      <button type="button" className="text-cta" onClick={() => document.getElementById("workflow")?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth" })}>
                        查看运行路径 <ArrowDown size={16} />
                      </button>
                    </div>
                  </div>

                  <div className={`hero-visual visual-${slide.visual}`} aria-hidden="true">
                    <div className="visual-orbit orbit-one" />
                    <div className="visual-orbit orbit-two" />
                    <div className="visual-core">
                      {slide.visual === "route" && <Route />}
                      {slide.visual === "archive" && <BookOpenText />}
                      {slide.visual === "guard" && <ShieldCheck />}
                    </div>
                    <div className="visual-node node-a"><span /></div>
                    <div className="visual-node node-b"><span /></div>
                    <div className="visual-node node-c"><span /></div>
                    <div className="visual-stamp">
                      <small>{slide.tag}</small>
                      <strong>{slide.stat}</strong>
                    </div>
                    <div className="visual-caption">QIXU / {String(index + 1).padStart(2, "0")}</div>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div className="carousel-controls">
            <div className="slide-dots" role="tablist" aria-label="切换概览">
              {slides.map((slide, index) => (
                <button
                  type="button"
                  key={slide.eyebrow}
                  className={activeSlide === index ? "slide-dot is-active" : "slide-dot"}
                  onClick={() => goToSlide(index)}
                  role="tab"
                  aria-selected={activeSlide === index}
                  aria-label={`查看第 ${index + 1} 项：${slide.tag}`}
                >
                  <span>{String(index + 1).padStart(2, "0")}</span>
                </button>
              ))}
            </div>
            <div className="arrow-controls">
              <button type="button" onClick={() => goToSlide(activeSlide - 1)} aria-label="上一项">
                <ArrowLeft />
              </button>
              <span>{String(activeSlide + 1).padStart(2, "0")} / 03</span>
              <button type="button" onClick={() => goToSlide(activeSlide + 1)} aria-label="下一项">
                <ArrowRight />
              </button>
            </div>
          </div>
        </section>

        <section id="capabilities" className="capabilities section-pad">
          <div className="section-heading" data-reveal>
            <div>
              <span className="section-number">能力底座 · 04</span>
              <h2>不只会回答，<br />更要知道如何工作。</h2>
            </div>
            <p>从分流、检索、安全到凭据隔离，每一层都能单独解释、替换和验证。</p>
          </div>
          <div className="capability-grid">
            {capabilityCards.map(({ icon: Icon, ...card }, index) => (
              <article
                className="capability-card"
                key={card.title}
                data-reveal
                role="button"
                tabIndex={0}
                aria-label={`查看${card.title}能力详情`}
                style={{ "--delay": `${index * 80}ms` } as React.CSSProperties}
                onClick={() => setActiveCapability(card.explanation)}
                onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setActiveCapability(card.explanation); } }}
              >
                <div className="card-topline"><span>{card.index}</span><Icon size={25} /></div>
                <h3>{card.title}</h3>
                <p>{card.copy}</p>
                <div className="card-detail"><span />查看详情 · {card.detail}</div>
              </article>
            ))}
          </div>
          {activeCapability && (
            <div className="detail-overlay" role="presentation" onClick={() => setActiveCapability(null)}>
              <article className="detail-dialog" role="dialog" aria-modal="true" aria-labelledby="capability-dialog-title" onClick={(event) => event.stopPropagation()}>
                <button type="button" className="detail-close" aria-label="关闭能力详情" onClick={() => setActiveCapability(null)}><X size={18} /></button>
                <span className="section-number">能力说明 · 可验证</span>
                <h3 id="capability-dialog-title">{activeCapability.title}</h3>
                <p className="detail-purpose">{activeCapability.purpose}</p>
                <dl className="detail-list">
                  <div><dt>输入</dt><dd>{activeCapability.input}</dd></div>
                  <div><dt>输出</dt><dd>{activeCapability.output}</dd></div>
                  <div><dt>边界</dt><dd>{activeCapability.boundary}</dd></div>
                  <div><dt>怎么查看</dt><dd>{activeCapability.next}</dd></div>
                </dl>
              </article>
            </div>
          )}
        </section>

        <section id="workflow" className="workflow section-pad">
          <div className="workflow-grid">
            <div className="workflow-intro" data-reveal>
              <span className="section-number light">运行路径 · 节点记录</span>
              <h2>一次提问，<br />四次确认。</h2>
              <p>每一步都有明确职责，模型不是唯一的判断者。</p>
            </div>
            <div className="workflow-column">
              <ol className="workflow-steps">
                {workflowSteps.map((step, index) => {
                  const StepIcon = step.Icon;
                  return (
                    <li key={step.number} className={activeWorkflowStep === index ? "is-active" : ""} data-reveal style={{ "--delay": `${index * 90}ms` } as React.CSSProperties}>
                      <button type="button" className="workflow-step-button" onClick={() => setActiveWorkflowStep(index)} aria-expanded={activeWorkflowStep === index}>
                        <span className="step-number">{step.number}</span><StepIcon size={21} />
                        <div><h3>{step.title}</h3><p>{step.copy}</p></div><ChevronRight size={16} />
                      </button>
                      {activeWorkflowStep === index && <div className="workflow-step-detail">{step.detail}</div>}
                    </li>
                  );
                })}
              </ol>
              <div className="trace-console" aria-live="polite">
                <div className="trace-console-heading"><div><span className="section-number light">本次运行 · 实时记录</span><strong>{tracePhase}</strong></div><span className={lastTrace ? "trace-status is-ready" : "trace-status"}>{lastTrace ? "已采集" : "等待运行"}</span></div>
                {lastTrace ? <>
                  <div className="trace-metrics"><span><b>总耗时</b>{lastTrace.latency_ms != null ? `${lastTrace.latency_ms} 毫秒` : "运行中"}</span><span><b>Token 用量（模型计费单位）</b>{lastTrace.token_usage?.total_tokens != null ? `${lastTrace.token_usage.total_tokens}${lastTrace.token_usage.estimated ? "（估算）" : ""}` : "等待返回"}</span><span><b>处理通道</b>{lastTrace.channel === "agent" ? "智能助手" : (lastTrace.channel ?? "智能助手")}</span><span><b>记录方式</b>{lastTrace.exporter ?? "本地运行记录"}</span></div>
                  <div className="trace-node-list">{(lastTrace.nodes ?? []).map((node) => <div className={`trace-node ${node.status}`} key={`${node.name}-${node.label}`}><span className="trace-node-dot" /><div><strong>{node.label}</strong><small>{node.detail ?? "节点已完成"}</small></div>{node.duration_ms != null && <em>{node.duration_ms} ms</em>}</div>)}</div>
                  <p className="trace-note">本地运行记录默认开启；生产环境可将同一事件结构接入 Langfuse 或 LangSmith，查看完整链路与成本。</p>
                </> : <p className="trace-empty">发送一次问题后，这里会显示安全护栏、主控分流、知识检索、模型回答的节点流转，以及本次耗时和 Token 用量。当前不需要外部观测账号。</p>}
              </div>
            </div>
          </div>
        </section>

        <section id="workspace" className="workspace section-pad" ref={workspaceRef}>
          <div className="workspace-heading" data-reveal>
            <div>
              <span className="section-number">中医教培工作台 · 实时</span>
              <h2>把经典与医案放进来，<br />看系统如何讲清楚。</h2>
            </div>
            <div className="workspace-status">
              <span className={hasKey ? "status-light is-ready" : "status-light"} />
              <div><strong>{hasKey ? "模型连接已配置" : "等待配置 API Key"}</strong><small>密钥仅保留在当前标签页</small></div>
              <button type="button" onClick={openSettings}><Settings2 size={17} /> 设置</button>
            </div>
          </div>

          <div className="console" data-reveal>
            <aside className="console-sidebar">
              <div className="console-brand"><Activity size={18} /><span>协理控制台</span></div>
              <div className="demo-panel">
                <div className="demo-panel-topline"><span>现场演示</span><span className="demo-dot" /></div>
                <strong>中医课程陪练</strong>
                <p>无需 API Key，先跑通一条现场演示链路。</p>
                <button type="button" className="demo-button" onClick={() => void runPracticeDemo()} disabled={isSending}>
                  <Sparkles size={14} /> {isSending ? "演示进行中…" : "开始现场 Demo"}
                </button>
                <button type="button" className="training-launch-button" onClick={() => startTraining("chest-pain")} disabled={isSending}>
                  <Stethoscope size={14} /> 进入病例训练
                </button>
              </div>
              <div className="history-heading">
                <span>对话记录</span>
                <small>当前标签页</small>
              </div>
              <button type="button" className="new-chat-button" onClick={createConversation} disabled={isSending}>
                <Plus size={14} /> 新建对话
              </button>
              <div className="conversation-list" aria-label="对话历史">
                {conversations.map((conversation) => (
                  <button
                    type="button"
                    key={conversation.id}
                    className={conversation.id === activeSessionId ? "conversation-item is-active" : "conversation-item"}
                    onClick={() => selectConversation(conversation)}
                    disabled={isSending}
                  >
                    <MessageSquareText size={14} />
                    <span><strong>{conversation.title}</strong><small>{formatConversationTime(conversation.updatedAt)}</small></span>
                  </button>
                ))}
                {conversations.length === 0 && <p className="history-empty">还没有提问，开始一段中医学习对话吧。</p>}
              </div>
              <p className="history-caption">演示记录仅保存在当前标签页，不跨设备同步。</p>
              <div className="console-metric">
                <span>运行状态</span><strong>{hasKey ? "模型已就绪" : "等待配置"}</strong>
              </div>
              <div className="console-metric">
                <span>知识范围</span><strong>中医教培资料</strong>
              </div>
              <div className="console-metric">
                <span>检索方式</span><strong>{credentials.embeddingKey ? "向量 + 关键词" : "本地关键词"}</strong>
              </div>
              <div className="console-metric">
                <span>会话范围</span><strong>当前标签页隔离</strong>
              </div>
              <div className="sidebar-rule" />
              <button type="button" className="reset-button" onClick={resetConversation}>
                <RefreshCw size={16} /> 重置本次会话
              </button>
              <div className="medical-note"><Stethoscope size={18} /><p>以中医教培为主：只做经典、医案和方法讲解，不代替辨证诊疗。</p></div>
            </aside>

            <div className="chat-panel">
              <div className="chat-header">
                <div><span className="live-dot" /><strong>岐序智能助手</strong><small>{demoStep === "idle" ? "主控模块在线" : `陪练阶段 · ${demoStep === "inquiry" ? "补齐信息" : demoStep === "feedback" ? "学习反馈" : "教师审核"}`}</small></div>
                <div className="chat-header-actions">
                  {trainingOpen && <button type="button" onClick={closeTraining} aria-label="退出病例训练">退出训练</button>}
                  <button type="button" onClick={openSettings} aria-label="打开设置"><Settings2 size={18} /></button>
                </div>
              </div>

              {trainingOpen ? (
                <section className="training-workspace" aria-label="病例训练">
                  {!trainingReport ? (
                    <>
                      <div className="training-case-picker">
                        <div><span className="section-number">临床训练 · Clinical Training</span><h3>你是医生，AI 扮演患者</h3><p>不要急着猜答案，先通过问诊逐步获取信息。</p></div>
                        <label>选择病例<select value={trainingCaseId} onChange={(event) => startTraining(event.target.value)} disabled={trainingMessages.length > 1}><option value="chest-pain">胸痛 · 急性风险识别</option><option value="cough">咳嗽 · 四诊信息采集</option><option value="fever">发热 · 风险分层</option></select></label>
                      </div>
                      <div className="training-meta-row">
                        <span>科室：{(trainingCases.find((item) => item.id === trainingCaseId) ?? trainingCases[0]).department}</span><span>难度：{(trainingCases.find((item) => item.id === trainingCaseId) ?? trainingCases[0]).difficulty}</span><span>预计：{(trainingCases.find((item) => item.id === trainingCaseId) ?? trainingCases[0]).duration}</span>
                      </div>
                      <div className="training-dialogue" aria-live="polite">
                        {trainingMessages.map((message) => (
                          <article className={`training-message ${message.role}`} key={message.id}><span>{message.role === "patient" ? "患者" : "你"}</span><p>{message.content}</p>{message.topic && <small>{message.topic}</small>}</article>
                        ))}
                      </div>
                      <div className="training-suggestions" aria-label="快捷追问">
                        <span>可以这样问</span>
                        <div>{(trainingSuggestedQuestions[trainingCaseId] ?? trainingSuggestedQuestions["chest-pain"]).map((suggestion) => <button type="button" key={suggestion} onClick={() => submitTrainingText(suggestion)} disabled={Boolean(trainingReport)}>{suggestion}<ChevronRight size={13} /></button>)}</div>
                      </div>
                      <form className="training-composer" onSubmit={submitTrainingQuestion}>
                        <textarea id="training-question" value={trainingDraft} onChange={(event) => setTrainingDraft(event.target.value)} placeholder="像医生一样主动提问：疼痛在哪里？持续多久？有没有放射或大汗？" rows={2} />
                        <button type="submit" disabled={!trainingDraft.trim()}>追问患者 <Send size={15} /></button>
                      </form>
                      <div className="training-judgement"><label htmlFor="training-judgement">初步判断 <span>先写你的思路，系统不会提前展示标准答案</span></label><textarea id="training-judgement" value={trainingJudgement} onChange={(event) => setTrainingJudgement(event.target.value)} placeholder="我目前的初步判断是……依据包括……还需要排除……" rows={2} /></div>
                      <div className="training-footer"><span>已覆盖 {trainingAsked.length} / {(trainingCases.find((item) => item.id === trainingCaseId) ?? trainingCases[0]).keyQuestions.length} 个核心维度</span><button type="button" onClick={finishTraining} disabled={trainingMessages.length < 2 || !trainingJudgement.trim()}>结束问诊并提交 <Check size={15} /></button></div>
                    </>
                  ) : (
                    <div className="training-report">
                      <div className="report-heading"><div><span className="section-number">临床训练报告 · Training Report</span><h3>这次问诊，你学到了什么？</h3><p>评分由结构化覆盖规则生成，反馈用于训练，不替代临床判断。</p></div><div className="overall-score"><strong>{trainingReport.overall}</strong><span>综合评分</span></div></div>
                      <div className="score-grid">{[["问诊完整度", trainingReport.completeness], ["关键症状覆盖", trainingReport.coverage], ["临床思维", trainingReport.reasoning], ["风险意识", trainingReport.safety]].map(([label, score]) => <div className="score-card" key={String(label)}><span>{String(label)}</span><strong>{String(score)}</strong><i><b style={{ width: `${Number(score)}%` }} /></i></div>)}</div>
                      <div className="report-columns"><div><h4>你的初步判断</h4><p className="report-judgement">{trainingJudgement}</p><h4>你做得好的地方</h4><p>你已经覆盖了 {trainingReport.asked.length} 个核心问诊维度，并保留了连续追问的上下文。下一次可以更早确认高风险伴随症状。</p><h4>为什么重要</h4><p>临床训练不只看问了多少，而是看能否优先获取会改变风险分层和下一步决策的信息。</p></div><div><h4>你遗漏的问题</h4>{trainingReport.missed.length ? <ul>{trainingReport.missed.map((item) => <li key={item}><span>⚠</span>{item}</li>)}</ul> : <p className="report-good">✓ 核心维度覆盖完整</p>}<h4>下一步建议</h4><p>复习“胸痛危险信号与问诊顺序”，再用同一病例尝试更短、更有优先级的提问路径。</p></div></div>
                      <div className="reasoning-timeline"><h4>临床思维时间轴 · Clinical Reasoning Timeline</h4><div>{(trainingCases.find((item) => item.id === trainingCaseId) ?? trainingCases[0]).keyQuestions.map((item, index) => <span className={trainingReport.asked.includes(item.label) ? "timeline-step is-done" : "timeline-step is-missed"} key={item.label}><b>{String(index + 1).padStart(2, "0")}</b><i>{trainingReport.asked.includes(item.label) ? "✓" : "⚠"}</i><em>{item.label}</em></span>)}</div></div>
                    </div>
                  )}
                </section>
              ) : <>
              <div className="message-list" aria-live="polite" ref={messageListRef}>
                {messages.map((message) => (
                  <article className={`message ${message.role}`} key={message.id}>
                    <div className="message-avatar" aria-hidden="true">
                      {message.role === "assistant" ? <Sparkles size={16} /> : <MessageSquareText size={16} />}
                    </div>
                    <div className="message-content">
                      <div className="message-meta">
                        <strong>{message.role === "assistant" ? "岐序" : "你"}</strong>
                        {message.channel && <span>{message.channel}</span>}
                      </div>
                      <p>{message.content}</p>
                      {message.trace && message.trace.length > 0 && (
                        <div className="trace-row"><Route size={14} />{message.trace.map(readableTraceStep).join("  →  ")}</div>
                      )}
                      {message.observability && (
                        <details className="message-trace">
                          <summary>查看本次运行 Trace · {message.observability.latency_ms ?? "—"} ms · {message.observability.token_usage?.total_tokens ?? "—"}{message.observability.token_usage?.estimated ? "（估算 Token）" : " Token"}</summary>
                          <div>{(message.observability.nodes ?? []).map((node) => <span key={`${node.name}-${node.label}`}><b>✓</b>{node.label}</span>)}</div>
                        </details>
                      )}
                    </div>
                  </article>
                ))}
                {isSending && (
                  <article className="message assistant">
                    <div className="message-avatar"><Sparkles size={16} /></div>
                    <div className="thinking"><span /><span /><span /> 正在流式整理回答</div>
                  </article>
                )}
              </div>

              {messages.length === 1 && (
                <div className="starter-prompts">
                  <span>可以从这里开始</span>
                  <div>
                    {starterPrompts.map((prompt) => (
                      <button type="button" key={prompt} onClick={() => void sendQuestion(undefined, prompt)}>{prompt}<ChevronRight size={15} /></button>
                    ))}
                  </div>
                </div>
              )}

              <form className="composer" onSubmit={(event) => void sendQuestion(event)}>
                <label htmlFor="question" className="sr-only">输入问题</label>
                <textarea
                  id="question"
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void sendQuestion();
                    }
                  }}
                  placeholder={hasKey ? "提问经典、四诊或辨证论治，Enter 发送…" : "先配置 API Key，再开始学习…"}
                  rows={2}
                  maxLength={8000}
                />
                <div className="composer-footer">
                  <span><LockKeyhole size={13} /> 不记录密钥</span>
                  <button type="submit" disabled={!question.trim() || isSending} aria-label="发送问题"><Send size={18} /></button>
                </div>
              </form>
              </>}
            </div>
          </div>
        </section>

        <section className="closing-statement section-pad" data-reveal>
          <div className="closing-mark">岐</div>
          <p>技术负责抵达，<br />边界负责守住。</p>
          <span>岐序 · 中医教培智能助教 · 2026</span>
        </section>
      </main>

      <footer>
        <div className="brand compact"><span className="brand-mark">岐</span><span className="brand-copy"><strong>岐序</strong><small>中医教培智能助教</small></span></div>
        <p>中医教学资料与合成医案演示 · 不接入真实医疗生产系统</p>
        <a href="#top">回到顶部 <ArrowRight size={14} /></a>
      </footer>

      {drawerOpen && (
        <div className="drawer-layer" role="presentation">
          <button className="drawer-backdrop" type="button" aria-label="关闭设置" onClick={() => setDrawerOpen(false)} />
          <aside className="settings-drawer" role="dialog" aria-modal="true" aria-labelledby="settings-title">
            <div className="drawer-header">
              <div><span className="section-number">连接设置</span><h2 id="settings-title">使用你的 API Key</h2></div>
              <button type="button" onClick={() => setDrawerOpen(false)} aria-label="关闭设置"><X /></button>
            </div>
            <div className="security-callout">
              <ShieldCheck size={22} />
              <div><strong>只在当前标签页中保存</strong><p>Key 使用 sessionStorage 暂存，并通过请求头发送；关闭标签页后由浏览器清除。服务端不落盘、不回显。</p></div>
            </div>
            <form onSubmit={saveCredentials} className="settings-form">
              <label>
                <span>模型 API Key <em>必填</em></span>
                <div className="secret-input">
                  <KeyRound size={17} />
                  <input
                    type={showKey ? "text" : "password"}
                    value={draftCredentials.llmKey}
                    onChange={(event) => setDraftCredentials({ ...draftCredentials, llmKey: event.target.value })}
                    placeholder="sk-…"
                    autoComplete="off"
                    required
                  />
                  <button type="button" onClick={() => setShowKey((current) => !current)} aria-label={showKey ? "隐藏密钥" : "显示密钥"}>{showKey ? <EyeOff size={17} /> : <Eye size={17} />}</button>
                </div>
              </label>
              <div className="field-row">
                <label><span>OpenAI 兼容地址</span><input type="url" value={draftCredentials.llmBaseUrl} onChange={(event) => setDraftCredentials({ ...draftCredentials, llmBaseUrl: event.target.value })} required /></label>
                <label><span>模型名称</span><input value={draftCredentials.llmModel} onChange={(event) => setDraftCredentials({ ...draftCredentials, llmModel: event.target.value })} required /></label>
              </div>

              <details className="advanced-settings">
                <summary><Database size={17} /> 可选：启用向量检索 <ChevronRight size={16} /></summary>
                <div className="advanced-body">
                  <p>不填写向量检索配置时，系统会自动使用本地关键词检索（BM25），不影响现场演示。</p>
                  <label><span>Embedding API Key</span><input type="password" value={draftCredentials.embeddingKey} onChange={(event) => setDraftCredentials({ ...draftCredentials, embeddingKey: event.target.value })} placeholder="可留空" autoComplete="off" /></label>
                  <div className="field-row">
                    <label><span>Embedding 地址</span><input type="url" value={draftCredentials.embeddingBaseUrl} onChange={(event) => setDraftCredentials({ ...draftCredentials, embeddingBaseUrl: event.target.value })} /></label>
                    <label><span>Embedding 模型</span><input value={draftCredentials.embeddingModel} onChange={(event) => setDraftCredentials({ ...draftCredentials, embeddingModel: event.target.value })} /></label>
                  </div>
                </div>
              </details>

              <div className="drawer-actions">
                <button type="button" className="clear-button" onClick={clearCredentials}>清除当前密钥</button>
                <button type="submit" className="save-button">保存并返回 <ArrowRight size={17} /></button>
              </div>
            </form>
            <div className="drawer-footnote"><CircleHelp size={15} /> 本项目兼容 OpenAI API 协议；请确认你的供应商支持对应地址与模型名。</div>
          </aside>
        </div>
      )}

      {notice && <div className="toast" role="status"><Check size={17} />{notice}</div>}
    </div>
  );
}

export default App;
