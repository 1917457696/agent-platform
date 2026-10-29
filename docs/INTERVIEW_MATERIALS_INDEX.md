# 华医世界面试材料索引

这份索引是两天准备材料的入口。建议按“先看方案、再练问答、最后看 PPT”的顺序使用。

> 版本：2026-10-29。以下材料、页面原型和 PPT 已按同一套产品口径对齐。

## 重点材料

| 优先级 | 材料 | 位置 | 用途 |
| --- | --- | --- | --- |
| 1 | 产品方案 / PRD | [`PRODUCT_PROPOSAL.md`](PRODUCT_PROPOSAL.md) | 理解机构真正要做的 AI 教培产品、用户、闭环、架构和商业价值 |
| 2 | 问答与模拟答辩 | [`HUAYI_SECOND_ROUND_BUSINESS_QA.md`](HUAYI_SECOND_ROUND_BUSINESS_QA.md) | 董事长、CEO、App 负责人可能追问的业务、AI、协作和薪资话术 |
| 3 | 现场讲解与 20 个追问 | [`PRESENTATION_GUIDE.md`](PRESENTATION_GUIDE.md) | 30 秒介绍、3 分钟产品思路、5 分钟 Demo、技术和业务追问 |
| 4 | MVP 可行性 | [`MVP_FEASIBILITY.md`](MVP_FEASIBILITY.md) | 区分已实现、Demo 可实现、产品方案，以及一天/三天/一个月的边界 |
| 5 | 答辩 PPT | [`../output/huayi-world-tcm-ai-education-platform.pptx`](../output/huayi-world-tcm-ai-education-platform.pptx) | 最新版面试展示，包含需求不足、不能做的能力和替代方案 |
| 6 | Demo 操作手册 | [`DEMO_GUIDE.md`](DEMO_GUIDE.md) | 本地页面的演示顺序、输入问题、训练流程和安全边界 |

## 最短准备路径

### 第一次：理解产品

1. 阅读 `PRODUCT_PROPOSAL.md` 的“产品定位”和“学 → 练 → 评 → 补 → 再练”。
2. 阅读 `MVP_FEASIBILITY.md`，记住哪些是真实实现、哪些只是方案。
3. 看最新版 PPT 第 2—4、8—14 页，重点看需求不足、边界替代和岗位协作。

### 第二次：练业务答辩

1. 阅读 `HUAYI_SECOND_ROUND_BUSINESS_QA.md` 的三条主线和 90 秒开场。
2. 重点练 Q1、Q3、Q6、Q8、Q11、Q12。
3. 用 `PRESENTATION_GUIDE.md` 的 20 个问题做口头模拟。

### 第三次：练现场 Demo

1. 打开 `http://127.0.0.1:8001/`。
2. 先讲课程 AI 导师，再进入医案训练，不要把产品讲成单纯问诊机器人。
3. 最后展示训练反馈、教师审核和 Trace。
4. 明确说明当前使用合成资料和演示病例。

## 一句话统一口径

> 我不是在做一个问诊机器人，而是在把中医课程升级成“AI 导师 + 章节练习 + 病例实训 + 临床教练 + 个性化复习”的学习服务；现有问诊 Agent 是其中的病例训练模块。

## 可运行项目位置

- 项目根目录：当前 worktree 根目录。
- 启动脚本：[`../scripts/start_server.ps1`](../scripts/start_server.ps1)。
- 中医演示资料：[`../data/tcm_demo.md`](../data/tcm_demo.md)。
- 前端页面：[`../frontend/src/App.tsx`](../frontend/src/App.tsx)。
- Agent / RAG 后端：[`../app/graph.py`](../app/graph.py)、[`../app/retriever.py`](../app/retriever.py)。
