# 2026-10-28 验收记录：中医临床学习与问诊训练平台

## 结论

本次 P0 目标通过：本地离线 Demo、结构化病例训练、规则评分、学习反馈、Clinical Reasoning Timeline、教师审核边界和现有 SSE/会话能力均已验证。

## 已执行命令

| 检查项 | 命令/方式 | 结果 |
| --- | --- | --- |
| 后端单元测试 | `C:\Users\19174\.conda\envs\EduRAG\python.exe -m unittest discover -s tests -v` | PASS，9 tests OK |
| 前端类型检查 | `npm run typecheck` | PASS |
| 前端构建 | `npm run build` | PASS |
| 浏览器验收 | `npm run verify:ui` | PASS：桌面、移动端、减弱动效、SSE、滚动稳定性、现场 Demo、病例报告均通过 |
| 代码格式检查 | `git diff --check` | PASS |

## Golden Path

1. 打开 `http://127.0.0.1:8001/`。
2. 点击“进入病例训练”，保留默认“胸痛·急性风险识别”。
3. 以医生身份向 AI 患者连续询问胸痛位置、持续时间、诱因、放射/伴随症状、既往史和用药。
4. 在“初步判断”中填写判断、依据和仍需排除的风险。
5. 点击“结束问诊并提交”。
6. 展示四项分数、初步判断、做得好的地方、遗漏问题、下一步建议和 Clinical Reasoning Timeline。
7. 退出训练后，可点击“开始现场 Demo”展示中医课程问答、来源、学习反馈和处方请求转教师审核。

## 已知边界

- 病例和课程资料为合成演示数据；患者回答由固定规则驱动，保证现场事实稳定。
- 当前训练评分为规则评分，不宣称真实临床能力或学习效果提升。
- 当前未把完整移动端 App、真实账号体系、生产数据库和线上模型凭据纳入本次演示。
- 系统 Python 环境存在 `typing_extensions` 冲突；验收使用项目可运行的 `EduRAG` Conda 环境完成。
