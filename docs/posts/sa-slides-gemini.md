WHY.J SLIDES: Skill-Adapter Engineering Theater

00 / Identity

Title: Skill-Adapter

Subtitle: 面向 Agent 时代的 ==Skill 演进== 协议

Link: github.com/yangjingo/skill-adapter

Metadata:

Author: Yang Jing

Version: v0.1.3

Date: 2026.03.30

01 / Context

Status: 开发者 90% 的工程直觉（如 IP、环境偏好）都随着 Chat 窗口的关闭而彻底“蒸发”。

Pain Point: 公共 Skill 在私有环境下经常“水土不服”，始终难以跨越落地的“最后一公里”。

Vision: 打造无缝的 ==Adapter Layer==，让每一次对话都成为 Skill 进化的燃料。

Nano Banano Prompt: Minimalist Excalidraw-style technical diagram. A stick figure chatting with a box labeled "AI". Floating dots representing "Preferences" are leaking from the chat bubbles. Below them, a layer labeled "Adapter" catches these dots with a funnel and pipes them into a larger box labeled "Workspace". Clean white background, high-contrast black ink, shaky hand-drawn marker strokes. Watermark bottom-right: "whyj + nano banano + 2026/03/30".

@pulse: 「 对话不应只是消耗。如果它不能让 Skill 进化，那就是在浪费算力。 」

02 / Agenda

Q1: 为什么现有的 Skill 机制无法处理深度工程中的“变数”？

Q2: 为什么 ==CLI== 是 Agent 与本地环境最无歧义的交互协议？

Q3: 深度拆解：感知 (Info)、演进 (Evolve) 与风控 (Scan) 的底层逻辑。

Q4: 典型场景、快速上手以及借助 Claude Code 开发的底层复盘。

03 / Motivation

盲目: Skill 的改动效果无法量化评估，收益全凭“感觉”。

风险: 导入外部脚本如同开盲盒，存在潜在的 ==权限/安全== 隐患。

断层: 公共 Skill 无法感知宿主机的 NPU/GPU 等物理环境差异。

损耗: 每次重开会话都要重复解释同样的习惯，认知摩擦极高。

Nano Banano Prompt: Minimalist Excalidraw-style diagram. A bucket labeled "Session Logs" is leaking liquid (knowledge) through cracks. The liquid is evaporating into clouds labeled "Forgotten". A stick figure looks sad, holding an empty cup. Strictly black and white, shaky felt-tip marker lines. Watermark bottom-right: "whyj + nano banano + 2026/03/30".

@pulse: 「 拒绝“一次性”知识，我们需要可积累的工程复利。 」

04 / Philosophy: Why CLI?

Agent 原生: 对于 LLM 而言，==Bash== 是沟通物理世界最简洁、低熵的协议。

资源效率: CLI 极省 Token，相比 MCP 协议，通信载荷更轻。

组合力量: 像乐高一样可脚本化，能够无缝级联多个原子化的 Skill。

趋势: 协同软件纷纷转向 CLI 界面，这正是面向 Agent 交互的终局形态。

Nano Banano Prompt: Minimalist Excalidraw-style diagram. Three elements compared horizontally: a messy knot labeled "API/Web", a heavy block labeled "MCP", and a simple sharp sword labeled "CLI". The sword is thin but strikes a target labeled "Agent Action". Raw, informal geek-style. Watermark bottom-right: "whyj + nano banano + 2026/03/30".

@pulse: 「 复杂是 Agent 的敌人，而 CLI 是 Agent 的利刃。 」

05 / CLI Demo: sa info (感知与监控)

自动扫描: 自动识别并挂载 ClaudeCode/OpenClaw 的活跃工作空间。

环境探测: 实时获取当前模型、Token 消耗倾向及环境依赖栈。

详情透视: 深度解析 Skill 元数据，量化其与本地环境的 ==匹配度==。

Nano Banano Prompt: Minimalist Excalidraw-style diagram. A radar dish labeled "sa info" emitting scanning waves over two folders labeled "ClaudeCode" and "OpenClaw". A stick figure looks at a terminal screen displaying a list: "Skill A [OK]", "Skill B [DEPRECATED]", "Skill C [CONFLICT]". Strictly black and white, shaky felt-tip marker lines. Watermark bottom-right: "whyj + nano banano + 2026/03/30".

@pulse: 「 在优化之前，先看清你的工程全貌。 」

06 / CLI Demo: sa evolve (感知与进化)

Workspace 感知: 结合本地 Identity.md 注入固定上下文，拒绝模型“脑补”。

特征嗅探: 基于 ==Keyword Grep== 策略精准检索 Session 中的报错与纠错轨迹。

安全变更: 默认不执行 --apply。进化完成后，支持通过 --log 预览每一行变更。

Nano Banano Prompt: Minimalist Excalidraw-style diagram. A magnifying glass is hovering over a scroll labeled "Session History". It highlights the word "ERROR". The magnifying glass extracts a small puzzle piece (improvement) and tries to fit it into a larger puzzle labeled "Skill". A stick figure is checking a checklist labeled "Dry Run". Watermark bottom-right: "whyj + nano banano + 2026/03/30".

@pulse: 「 进化不是盲目覆盖，而是基于上下文的精准对齐。 」

07 / CLI Demo: sa scan (安全与风控)

网络脱钩: 自动识别并去除 Skill 中硬编码的代理配置，确保网络中立。

指令过滤: 拦截 rm -rf / 或高危 sudo 等可能导致物理破坏的非法指令。

供应链审计: 确保从社区导入的 Skill 经过了严格的 ==静态安全扫描==。

Nano Banano Prompt: Minimalist Excalidraw-style diagram. A stick figure holding a shield with a "Scan" icon. A giant hammer labeled "sudo rm" is swinging towards a box labeled "System", but the shield blocks it. In the background, a pair of scissors is cutting a wire labeled "Hardcoded Proxy". High-contrast black ink. Watermark bottom-right: "whyj + nano banano + 2026/03/30".

@pulse: 「 信任但不放任。安全是工程化的第一前提。 」

08 / CLI Demo: sa share (生态与回馈)

本地归档: 支持一键导出为 .zip 技能包，方便团队内部离线分发。

云端协同: 直接针对 GitHub 仓库生成 ==Pull Request==，实现技能的上游回馈。

标准化: 确保导出的 Skill 符合开源社区标准，降低他人的复用门槛。

Nano Banano Prompt: Minimalist Excalidraw-style diagram. A central box labeled "Local Evolved Skill" is splitting into two paths: one arrow leads to a folder icon labeled "Team ZIP", and another arrow leads to a cloud icon with a GitHub logo labeled "PR to Upstream". Raw, functional sketch. Watermark bottom-right: "whyj + nano banano + 2026/03/30".

@pulse: 「 让优化的成果走出本地，完成从私有到公有的进化闭环。 」

09 / Scenarios: 典型落地场景

团队标准: 建立内部私有库，统一 Skill 质量门槛，减少协作噪音。

环境迁移: 让 Skill 动态贴合当前项目栈（如 CUDA 动态切换至 Ascend）。

平台治理: 在 Claude Code 与 OpenClaw 间实现逻辑对齐，消除跨平台差异。

极简入门: 无需配置复杂的 Model，通过 ==Next Tips== 渐进式引导上手。

Nano Banano Prompt: Minimalist Excalidraw-style diagram. A loop of icons: a Stick Figure (Developer), a Group of Three (Team), and a Cloud (Community). Arrows connect them in a circle labeled "Ecosystem". Each icon has a small "Skill" puzzle piece. White background, black marker lines. Watermark bottom-right: "whyj + nano banano + 2026/03/30".

@pulse: 「 场景定义功能，标准定义质量。 」

10 / Quick Start: 极简安装与引导

无需配置模型: 甚至连 Claude 模型都不用配置，即可开始治理本地 Skill。

化繁为简: 精简命令集，只保留核心逻辑，极致降低开发者心智负担。

渐进式引导: 通过独特的 ==Next Tips== 机制，引导用户完成“发现-优化-分享”的闭环。

::code
// 一行命令全局安装
$ npm install -g @yangjingo/skill-adapter

@pulse: 「 好的工具应该像空气一样，上手即用，无感存在。 」

11 / Experience: 人机协作避坑

开发数据: 45 Commits | 47 Files | ==65%== TODO 完成度 | 3天核心交付。

人机边界: 测试是用来兜底的，这里的“测试人员”必须是==人==，而非 Agent。

CLI 守则: 严禁 yes/no 交互（防止 Agent 死锁）；输出必须是 ==结构化 JSON==。

干中学: 向 Agent 学习如何节省上下文，实现人机协作的深度磨合。

Nano Banano Prompt: Minimalist Excalidraw-style diagram. A large robot labeled "Claude Code" is typing furiously at a terminal. A small stick figure labeled "Human" is standing on top of the robot, holding a giant "STOP/GO" lever labeled "Final Check". Raw, geek-style sketch. Watermark bottom-right: "whyj + nano banano + 2026/03/30".

@pulse: 「 在 Agent 时代，人是逻辑的最后防线。干中学是唯一的进化路径。 」

12 / Summary & Next

Roadmap: M1-M2 (服务解耦/引导系统) | M3-M4 (Agent 自动化/模块化 AIE)。

Position: Skill-Adapter 是为 AI 技能提供落地的 ==工程管理层==。

Logic: 保持轻量，持续重构。为人类和 Agent 共同打造高效的工作协议。

Nano Banano Prompt: Minimalist Excalidraw-style diagram. A hand-drawn mathematical box. Inside, the formula: "P(Success) is proportional to (Logic / Context Drift)". The box is surrounded by arrows pointing upwards to "Future". Watermark bottom-right: "whyj + nano banano + 2026/03/30".

@pulse: 「 好的 Skill 应当像代码一样，随着工程共同生长。 」