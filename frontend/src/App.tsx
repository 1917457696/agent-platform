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
    kicker: "TCM CORPUS · RAG",
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
  },
  {
    icon: Database,
    index: "02",
    title: "医案拆解",
    copy: "把合成案例拆成主诉、时间线、缺失信息和课堂讨论点，不直接替学员下诊断。",
    detail: "从案例回到方法",
  },
  {
    icon: ShieldCheck,
    index: "03",
    title: "辨证边界",
    copy: "强调四诊合参与教师审核，拒绝单症状定证、个人处方、剂量和停换药建议。",
    detail: "教学解释不代诊疗",
  },
  {
    icon: Fingerprint,
    index: "04",
    title: "师承式审核",
    copy: "AI 负责资料整理、复习题和答疑草稿，涉及临床决策的内容保留教师与执业医师入口。",
    detail: "人机协作可追溯",
  },
];

const starterPrompts = [
  "如何理解中医的辨证论治？",
  "四诊合参在医案学习中怎么用？",
  "《黄帝内经》的阴阳观如何入门？",
];

const sessionKey = "qixu.credentials.v1";
const chatSessionKey = "qixu.chat-session.v1";

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
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "你好，我是岐序中医教培智能助教。配置模型 API Key 后，可以学习中医经典、四诊与辨证论治，也可以让我帮你拆解合成医案。涉及个人诊疗时，我会提示转教师或执业医师审核。",
      channel: "system",
    },
  ]);
  const [isSending, setIsSending] = useState(false);
  const [notice, setNotice] = useState("");
  const pointerStart = useRef<number | null>(null);
  const workspaceRef = useRef<HTMLElement | null>(null);
  const messageListRef = useRef<HTMLDivElement | null>(null);

  const hasKey = Boolean(credentials.llmKey.trim());

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
    messageList.scrollTo({
      top: messageList.scrollHeight,
      behavior: reducedMotion ? "auto" : "smooth",
    });
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
    setQuestion("");
    setIsSending(true);
    setNotice("");
    const assistantId = crypto.randomUUID();
    setMessages((current) => [
      ...current,
      { id: assistantId, role: "assistant", content: "", channel: "streaming" },
    ]);

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
          session_id: getChatSession(),
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
        } else if (event.type === "delta") {
          setMessages((current) => current.map((message) => (
            message.id === assistantId
              ? { ...message, content: message.content + (event.text ?? "") }
              : message
          )));
        } else if (event.type === "meta") {
          setMessages((current) => current.map((message) => (
            message.id === assistantId
              ? { ...message, channel: event.channel, trace: event.route_trace }
              : message
          )));
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
    }
  };

  const resetConversation = async () => {
    const sessionId = getChatSession();
    try {
      await fetch("/api/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId }),
      });
    } finally {
      sessionStorage.removeItem(chatSessionKey);
      setMessages((current) => current.slice(0, 1));
      setNotice("会话已重置。" );
      window.setTimeout(() => setNotice(""), 2500);
    }
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="岐序首页">
          <span className="brand-mark" aria-hidden="true">岐</span>
          <span className="brand-copy">
            <strong>岐序</strong>
            <small>TCM EDUCATION AGENT</small>
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
            <span>HEALTH KNOWLEDGE</span><span>AGENT ORCHESTRATION</span><span>SAFETY FIRST</span>
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
                style={{ "--delay": `${index * 80}ms` } as React.CSSProperties}
              >
                <div className="card-topline"><span>{card.index}</span><Icon size={25} /></div>
                <h3>{card.title}</h3>
                <p>{card.copy}</p>
                <div className="card-detail"><span />{card.detail}</div>
              </article>
            ))}
          </div>
        </section>

        <section id="workflow" className="workflow section-pad">
          <div className="workflow-grid">
            <div className="workflow-intro" data-reveal>
              <span className="section-number light">运行路径 · TRACE</span>
              <h2>一次提问，<br />四次确认。</h2>
              <p>每一步都有明确职责，模型不是唯一的判断者。</p>
            </div>
            <ol className="workflow-steps">
              {[
                ["01", "护栏先行", "识别高风险描述，必要时直接提示急诊。", ShieldCheck],
                ["02", "缓存与 FAQ", "对已验证的高频答案进行低成本复用。", Layers3],
                ["03", "主控分流", "识别任务类型，只负责交接，不越权代答。", Route],
                ["04", "专家执行", "调用检索或工具，返回答案与路由轨迹。", Bot],
              ].map(([number, title, copy, Icon], index) => {
                const StepIcon = Icon as typeof ShieldCheck;
                return (
                  <li key={String(number)} data-reveal style={{ "--delay": `${index * 90}ms` } as React.CSSProperties}>
                    <span className="step-number">{String(number)}</span>
                    <StepIcon size={21} />
                    <div><h3>{String(title)}</h3><p>{String(copy)}</p></div>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>

        <section id="workspace" className="workspace section-pad" ref={workspaceRef}>
          <div className="workspace-heading" data-reveal>
            <div>
              <span className="section-number">中医教培工作台 · LIVE</span>
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
              <div className="console-metric">
                <span>RUNTIME</span><strong>{hasKey ? "READY" : "STANDBY"}</strong>
              </div>
              <div className="console-metric">
                <span>KNOWLEDGE MODE</span><strong>TCM TEACHING</strong>
              </div>
              <div className="console-metric">
                <span>RETRIEVAL</span><strong>{credentials.embeddingKey ? "RAG + BM25" : "LOCAL BM25"}</strong>
              </div>
              <div className="console-metric">
                <span>SESSION</span><strong>ISOLATED</strong>
              </div>
              <div className="sidebar-rule" />
              <button type="button" className="reset-button" onClick={resetConversation}>
                <RefreshCw size={16} /> 重置本次会话
              </button>
              <div className="medical-note"><Stethoscope size={18} /><p>以中医教培为主：只做经典、医案和方法讲解，不代替辨证诊疗。</p></div>
            </aside>

            <div className="chat-panel">
              <div className="chat-header">
                <div><span className="live-dot" /><strong>岐序 Agent</strong><small>Supervisor 在线</small></div>
                <button type="button" onClick={openSettings} aria-label="打开设置"><Settings2 size={18} /></button>
              </div>

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
                        <div className="trace-row"><Route size={14} />{message.trace.join("  →  ")}</div>
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
            </div>
          </div>
        </section>

        <section className="closing-statement section-pad" data-reveal>
          <div className="closing-mark">岐</div>
          <p>技术负责抵达，<br />边界负责守住。</p>
          <span>QIXU TCM EDUCATION AGENT · 2026</span>
        </section>
      </main>

      <footer>
        <div className="brand compact"><span className="brand-mark">岐</span><span className="brand-copy"><strong>岐序</strong><small>TCM EDUCATION AGENT</small></span></div>
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
                  <p>不填写 Embedding Key 时，系统会自动使用本地 BM25 检索。</p>
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
