Skill-Adapter cli

00 / Identity

Title: Skill-Adapter

Subtitle: 让 Skills 在你的 ==Workspace== 里持续进化, 实现越用越好用

Link: github.com/yangjingo/skill-adapter

Metadata:

Author: Yang Jing

Version: v0.1.3

Date: 2026.03.28




01 / Context

Status: 大量个性化的信息（IP信息/环境变量/）被掩埋在碎片化的会话中。

Pain Point: 公共 Skills 与私有环境存在上下文断层， 例如 vllm-ascend-deploy需要输入ip信息。

Vision: 给Agent 开发一个工具， 能够帮助 Skill 潜移默化的来从你的对话里面获取有用的信息。

::visual
[ SKILL AGENT ]
|
[ ADAPTER LAYER ] <--- LOGIC CORE
|
[ WORKSPACE ]

@pulse: 「 每一次的和Agent的对话， 都是自己的偏好和环境的一次暴露，如何利用起来？ 」

02 / Agenda

Q1: 为什么现有的 Skill 无法那么顺手的完成工作？

Q2: 如何通过 ==Workspace== 感知解决上下文错配？

Q3: 设计什么样的工具，来串联 Skill 的完整生命周期？

Q4: 当前项目开发的一些感悟分享，下一步有什么计划？

03 / Motivation

盲目: Skill 的改动效果缺少可量化的评估指标。

风险: 导入外部脚本存在潜在的 ==提权/安全== 风险。

断层: 公共 Skill 不感知本地工具链与代码结构。

损耗: 每次重开 Session 都要重复解释开发习惯。


::visual
{ ENTROPY }
(Chat Context)
|
v
(Evaporates)

@pulse: 「 经验不沉淀，就是纯粹的算力浪费。能够无感的自主寻探能够更加迅速干活 」

04 / Problems

上下文对齐: 自动分析项目栈，对齐语言与习惯。

经验沉淀: 将纠错指令转化为可追踪的 ==Schema==， session里面的错误轨迹可以帮助skill的提升。

量化评估: 引入成本与摩擦力维度衡量收益。

供应链风控: 内置扫描器，拦截危险命令模式。

::visual
[ ALIGN ] -> [ EVOLVE ] -> [ SCAN ]

@pulse: 「 工程的问题，必须用协议来闭环。 」



/ 我们需要开发一个什么样子的工具？


- API  -> MCP  -> CLI

为什么选择 CLI 的方式来进行开发？

- 上下文，CLI 省着用，MCP 一上来就铺张
- Agent原生， llm在训练的时候bash is all you need
- 灵活且可以，可组合，可以脚本化， 可Skill化


题外话， 飞书、钉钉 这些软件上周迅速推出CLI； 他们的思考是不是也是从 to Agent出发的？



05 / Features

sa import: 发现热点并导入本地。

sa evolve: ==运行演进分析== 并应用建议。

sa scan: 自动化安全风险筛查。

sa summary: 输出演进指标对比效果。


Command	Description	File
sa init	Initialize configuration	01-init.md
sa import	Import/discover skills	02-import.md
sa info	View skill information	03-info.md
sa evolve	Evolution analysis	04-evolve.md
sa scan	Security scan (--repair / --apply)	05-scan.md
sa export	Export local skill package	07-export.md
sa share	Create PR for local skill	08-share.md
sa config	Configuration management	09-config.md
sa summary	Evolution metrics comparison	10-summary.md

https://github.com/yangjingo/skill-adapter/tree/main/docs/commands

::visual
[ SA-CORE ]

modules_active: 4

focus: engineering

@pulse: 「 工具链的完备性决定了生产力的上限。 」

06 / CLI demo

引入: sa import / sa info

优化: ==sa evolve== / sa summary

风控: sa scan / sa repair

传播: sa share / sa export

::code
// 执行本地演进
$ sa evolve --session ./logs

// 安全审计
$ sa scan --level high

@pulse: 「 把逻辑路径固化为 CLI 动作。 」


/CLI Demo

sa --scan

解决skill的安全性能的问题

- 网络： 去除代理， 去除
- 危险命令： rm -rf / sudo 之类
- 

https://github.com/yangjingo/skill-adapter/blob/main/docs/commands/05-scan.md




/ CLI Demo

sa -evolve

- 结合本地的 workspace 的固定上下文Soul.md / Identity.md
- 通过grep 关键字检索session内容
- 默认不进行--apply 
- 进化完成之后可以通过 --log 和 --summary 查看对应的变更

https://github.com/yangjingo/skill-adapter/blob/main/docs/commands/04-evolve.md




/CLI demo

sa --share 


- 可以本地导出为 zip 技能包
- 可以在线 直接对于github repo 生成一个 PR
- 

https://github.com/yangjingo/skill-adapter/blob/main/docs/commands/08-share.md





07 / 可以使用的典型场景有那些？

团队标准: 建立私有库，统一 Skill 质量门槛。

效率优化: 让常用 Skill 动态贴合当前项目。

平台治理: 在 Claude Code 与 OpenClaw 间对齐。

社区贡献: 优化成果一键打包并提交 ==PR== 分享出现。

::visual
USER <-> TEAM <-> UPSTREAM

@pulse: 「 场景定义功能，标准定义质量。 」



/  如何快速开始使用？


一行命令极简安装


- 无需像ClaudeCode 自动配置model，
- 化繁为简，只保留三个命令，降低心智
- 通过 next tips 渐进式的引导用户


:: code
npm install -g @yangjingo/skill-adapter

甚至连 C模型都不用配；


08 / Stats

Commits: 45 Git Commits

Source Files: 47 Files

Completion: ==65%== (TODO Done)

Commands: 9+ Core Cmds

docs： 从0到1的所有文档全部保持，所有计划TODO维持，随时上手开发；

::visual
[ v0.1.3 ]
Metric: Verified

@pulse: 「 全程借助claude code ，从0开始开发 ， 人是最后防线。 」




/ 如何进行开发？


- 全程使用 Claude code + glm5开发 (全职3天左右工作量，加上一些零碎实践 )
- 文档进行驱动，文档不仅要清楚，也需要组织清楚
- 测试进行兜底，这里的测试是人，并非是Agent；
- 干中学，不断地向Claude进行学习（节省上下文， 节省Token，互相磨合）



/ sa cli 开发的一些经验


- 不要进行交互， 不要用yes来确定；
- --help 里面的描述 与示例
- 打印关键日志 （无论成功与失败），尤其是报错就好好的报错
- 可以加上 --dry-run 和备份
- 结构化的输出 json文件





09 / Next

M1: 业务逻辑服务化解耦 (Thin CLI)。

M2: 完善 Help & Guidance 系统覆盖。

M3: 增强 ==Agent== 自动化兼容性 (--json)。


M4: 作为一个单独的模块给到AIE（或者类似的平台） ClaudeCode/OpenClaw进行使用

::math
P(\text{Success}) \propto \frac{\text{Logic}}{\text{Context Drift}}

@pulse: 「 保持轻量，持续重构， 为人类和Agent 一起打造工作 」

10 / Summary

Position: Skill-Adapter 是为 Skill 提供可落地的==工程层==。

Logic: 拒绝 Skill 管理的碎片化与挥发。

Action: Clone Repo, Build Local, Start Evolving.



::visual
[ SA-EVOLVE ]

LOCALIZED

SECURED

@pulse: 「 好的 Skill 应该随代码一同生长。 没有迭代和更新的skills就没有生命力」