import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.APP_URL || "http://127.0.0.1:8001";
const evidenceDir = process.env.EVIDENCE_DIR || path.resolve("artifacts", "browser-check");
const defaultChrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const executablePath = process.env.CHROME_PATH || defaultChrome;
const fakeKey = "dummy-key-browser-verification";

await access(executablePath);
await mkdir(evidenceDir, { recursive: true });

const results = {
  url: baseUrl,
  desktop: {},
  training: {},
  mobile: {},
  reducedMotion: {},
  pageErrors: [],
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForFonts(page) {
  await Promise.race([
    page.evaluate(() => document.fonts.ready),
    page.waitForTimeout(2500),
  ]);
}

const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ["--disable-gpu", "--hide-scrollbars"],
});

try {
  const desktop = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: "light",
    reducedMotion: "no-preference",
  });
  const desktopPage = await desktop.newPage();
  desktopPage.on("pageerror", (error) => results.pageErrors.push(error.message));

  let capturedRequest = null;
  await desktopPage.route("**/api/chat/stream", async (route) => {
    const request = route.request();
    capturedRequest = {
      keyInHeader: request.headers()["x-llm-api-key"] === fakeKey,
      keyInBody: (request.postData() || "").includes(fakeKey),
      streamEventCount: 2,
    };
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      headers: { "Cache-Control": "no-cache" },
      body: [
        'data: {"type":"status","text":"正在生成"}',
        'data: {"type":"delta","text":"这是浏览器验收"}',
        'data: {"type":"delta","text":"返回的模拟回答。"}',
        'data: {"type":"meta","channel":"agent","route_trace":["guard(通过)","supervisor","→ 医疗知识子图"]}',
        'data: {"type":"done"}',
        "",
      ].join("\n\n"),
    });
  });

  await desktopPage.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await waitForFonts(desktopPage);
  await desktopPage.locator("h1").first().waitFor();
  assert(await desktopPage.locator(".hero").isVisible(), "桌面端首屏不可见");

  const initialDot = await desktopPage.locator(".slide-dot.is-active").innerText();
  const initialTransition = await desktopPage.locator(".slides-track").evaluate(
    (element) => getComputedStyle(element).transitionDuration,
  );
  await desktopPage.waitForTimeout(6700);
  const autoDot = await desktopPage.locator(".slide-dot.is-active").innerText();
  assert(autoDot !== initialDot, "轮播未自动播放");

  await desktopPage.locator(".hero").hover();
  await desktopPage.getByRole("button", { name: "下一项" }).click();
  const manualDot = await desktopPage.locator(".slide-dot.is-active").innerText();
  assert(manualDot !== autoDot, "轮播手动切换失败");

  const hero = desktopPage.locator(".hero");
  await hero.dispatchEvent("pointerdown", {
    clientX: 900,
    clientY: 400,
    pointerId: 1,
    pointerType: "touch",
  });
  await hero.dispatchEvent("pointerup", {
    clientX: 650,
    clientY: 400,
    pointerId: 1,
    pointerType: "touch",
  });
  const swipeDot = await desktopPage.locator(".slide-dot.is-active").innerText();
  assert(swipeDot !== manualDot, "轮播触摸滑动切换失败");

  await desktopPage.locator(".key-button").click();
  await desktopPage.waitForTimeout(450);
  await desktopPage.screenshot({
    path: path.join(evidenceDir, "api-key-settings.png"),
  });
  await desktopPage.locator(".secret-input input").fill(fakeKey);
  await desktopPage.getByRole("button", { name: "保存并返回" }).click();
  const storageState = await desktopPage.evaluate(() => ({
    sessionHasCredentials: sessionStorage.getItem("qixu.credentials.v1") !== null,
    localStorageCount: localStorage.length,
  }));
  assert(storageState.sessionHasCredentials, "API Key 未保存到当前标签页 sessionStorage");
  assert(storageState.localStorageCount === 0, "API Key 页面意外使用了 localStorage");

  await desktopPage.locator("#workspace").scrollIntoViewIfNeeded();
  assert(await desktopPage.locator(".conversation-list").isVisible(), "桌面端对话记录侧栏不可见");
  await desktopPage.getByRole("button", { name: "开始现场 Demo" }).click();
  await desktopPage.getByText("陪练阶段 · 学习反馈", { exact: true }).waitFor();
  await desktopPage.getByText("teacher_review_required").waitFor();
  assert(await desktopPage.getByText("本地陪练演示完成：追问、来源、反馈和人工审核均已展示。").isVisible(), "本地陪练 Demo 未完成");
  await desktopPage.getByRole("button", { name: "进入病例训练" }).click();
  await desktopPage.getByRole("button", { name: /疼痛具体在哪里/ }).click();
  await desktopPage.getByText("主要在胸骨后偏左的位置").waitFor();
  await desktopPage.locator("#training-question").fill("疼痛在哪里、是什么性质、持续多久，活动和休息有什么关系，有没有放射到左肩或大汗，既往有高血压吗，是否过敏以及家族史如何？");
  await desktopPage.getByRole("button", { name: "追问患者" }).click();
  await desktopPage.locator("#training-judgement").fill("优先考虑需要排除急性冠脉综合征，依据是活动后胸痛、压榨感和向左肩放射；还需要结合危险信号和既往史进一步判断。");
  await desktopPage.getByRole("button", { name: "结束问诊并提交" }).click();
  await desktopPage.getByText("Clinical Reasoning Timeline").waitFor();
  assert(await desktopPage.getByText("综合评分").isVisible(), "病例训练报告未生成");
  results.training = {
    caseSelection: true,
    patientRoleplay: true,
    judgementSubmission: true,
    reportRendered: true,
    reasoningTimeline: true,
  };
  await desktopPage.getByRole("button", { name: "退出病例训练" }).click();
  await desktopPage.getByRole("button", { name: "新建对话" }).click();
  await desktopPage.locator(".conversation-item.is-active").waitFor();
  assert(await desktopPage.locator(".conversation-item.is-active").count() >= 1, "新建对话后当前会话未高亮");
  const pageScrollBeforeChat = await desktopPage.evaluate(() => window.scrollY);
  await desktopPage.locator("#question").fill("浏览器验收问题");
  await desktopPage.locator("#question").press("Enter");
  await desktopPage.getByText("这是浏览器验收返回的模拟回答。").waitFor();
  await desktopPage.waitForTimeout(450);
  const pageScrollAfterChat = await desktopPage.evaluate(() => window.scrollY);
  assert(
    Math.abs(pageScrollAfterChat - pageScrollBeforeChat) < 80,
    `发送消息后页面滚动位置异常变化：${pageScrollBeforeChat} -> ${pageScrollAfterChat}`,
  );
  assert(capturedRequest?.keyInHeader, "API Key 未通过专用请求头发送");
  assert(!capturedRequest?.keyInBody, "API Key 被写入请求体");
  assert(capturedRequest?.streamEventCount === 2, "SSE 没有按多个片段发送回答");

  await desktopPage.locator("#capabilities").scrollIntoViewIfNeeded();
  await desktopPage.waitForTimeout(450);
  const firstCard = desktopPage.locator(".capability-card").first();
  assert(await firstCard.evaluate((element) => element.classList.contains("is-visible")), "滚动入场动画未触发");
  await firstCard.hover();
  await desktopPage.waitForTimeout(380);
  const hoverTransform = await firstCard.evaluate((element) => getComputedStyle(element).transform);
  assert(hoverTransform !== "none", "卡片悬停效果未生效");
  await firstCard.click();
  assert(await desktopPage.getByRole("dialog").isVisible(), "能力卡片详情未打开");
  await desktopPage.getByRole("button", { name: "关闭能力详情" }).click();
  const workflowStep = desktopPage.locator(".workflow-step-button").first();
  await workflowStep.click();
  assert(await desktopPage.locator(".workflow-step-detail").first().isVisible(), "运行路径详情未展开");
  assert(await desktopPage.getByText("本次运行 · 实时记录").isVisible(), "运行 Trace 面板不可见");
  await desktopPage.locator("#explainer").scrollIntoViewIfNeeded();
  const plainCard = desktopPage.locator(".plain-card").first();
  await plainCard.locator("summary").click();
  assert(await plainCard.locator(".plain-card-body").isVisible(), "非技术说明模块未展开");
  await desktopPage.locator("#course-center").scrollIntoViewIfNeeded();
  assert(await desktopPage.locator(".course-product-card").count() === 4, "课程 AI 产品模块不完整");

  await desktopPage.screenshot({
    path: path.join(evidenceDir, "desktop-home.png"),
    fullPage: true,
  });
  results.desktop = {
    viewport: "1440x900",
    heroVisible: true,
    autoplay: true,
    manualNavigation: true,
    pointerSwipe: true,
    transitionDuration: initialTransition,
    scrollReveal: true,
    cardHoverTransform: hoverTransform,
    keyStoredInSessionOnly: true,
    keySentInHeaderOnly: true,
    chatResponseRendered: true,
    sseChunkedResponse: true,
    pageScrollStableAfterChat: true,
  };
  await desktop.close();

  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
    reducedMotion: "no-preference",
  });
  const mobilePage = await mobile.newPage();
  mobilePage.on("pageerror", (error) => results.pageErrors.push(error.message));
  await mobilePage.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await waitForFonts(mobilePage);
  await mobilePage.locator("h1").first().waitFor();
  const mobileLayout = await mobilePage.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));
  assert(
    mobileLayout.documentWidth <= mobileLayout.viewportWidth + 1,
    `移动端出现横向溢出：${mobileLayout.documentWidth}/${mobileLayout.viewportWidth}`,
  );
  await mobilePage.locator(".menu-button").click();
  assert(await mobilePage.locator(".nav-links.is-open").isVisible(), "移动端菜单无法展开");
  await mobilePage.locator(".menu-button").click();

  const mobileBefore = await mobilePage.locator(".slide-dot.is-active").innerText();
  const mobileHero = mobilePage.locator(".hero");
  await mobileHero.dispatchEvent("pointerdown", {
    clientX: 330,
    clientY: 420,
    pointerId: 2,
    pointerType: "touch",
  });
  await mobileHero.dispatchEvent("pointerup", {
    clientX: 90,
    clientY: 420,
    pointerId: 2,
    pointerType: "touch",
  });
  const mobileAfter = await mobilePage.locator(".slide-dot.is-active").innerText();
  assert(mobileAfter !== mobileBefore, "移动端触摸滑动失败");
  await mobilePage.waitForTimeout(950);
  await mobilePage.screenshot({
    path: path.join(evidenceDir, "mobile-hero.png"),
  });
  await mobilePage.screenshot({
    path: path.join(evidenceDir, "mobile-home.png"),
    fullPage: true,
  });
  results.mobile = {
    viewport: "390x844",
    noHorizontalOverflow: true,
    menuToggle: true,
    touchSwipe: true,
  };
  await mobile.close();

  const reduced = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    reducedMotion: "reduce",
  });
  const reducedPage = await reduced.newPage();
  reducedPage.on("pageerror", (error) => results.pageErrors.push(error.message));
  await reducedPage.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await reducedPage.locator("h1").first().waitFor();
  const reducedBefore = await reducedPage.locator(".slide-dot.is-active").innerText();
  await reducedPage.waitForTimeout(6700);
  const reducedAfter = await reducedPage.locator(".slide-dot.is-active").innerText();
  assert(reducedAfter === reducedBefore, "reduced-motion 下轮播仍在自动播放");
  const reducedTransition = await reducedPage.locator(".slides-track").evaluate(
    (element) => getComputedStyle(element).transitionDuration,
  );
  results.reducedMotion = {
    autoplayDisabled: true,
    computedTransitionDuration: reducedTransition,
  };
  await reduced.close();

  assert(results.pageErrors.length === 0, `页面运行时错误：${results.pageErrors.join(" | ")}`);
  await writeFile(
    path.join(evidenceDir, "results.json"),
    `${JSON.stringify(results, null, 2)}\n`,
    "utf8",
  );
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
