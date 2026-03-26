# Skill-Adapter

> **让技能在你的工作空间中进化。**

`Skill-Adapter` 是一个为 **Claude Code** 和 **OpenClaw** 设计的进化管理层。它不仅负责 Skill 的本地化适配，更通过 **Workspace 规则感知**与 **Session 行为回溯**，实现工具能力的自我迭代与效能评估。

[English](./README.md)

---

## 核心初衷

* **环境适配 (Context-Aware):** 消除公共 Skill 与私有工作空间（Workspace）之间的"信息差"。
* **会话进化 (Session-Driven):** 自动捕获用户在对话中对 Skill 的修正，并将其固化为本地 Patch。
* **效能闭环 (Evaluation-Based):** 所有的改进必须通过量化数据（成本、轮数、调用次数）来证明其价值。

---

## 核心功能

### 1. Workspace 深度绑定

* **空间隔离：** 自动将 `OpenClaw` 的 Workspace 路径约束注入 Skill，防止越权操作。
* **技术栈对齐：** 实时感知项目源码，动态调整 Skill 的操作偏好（如：优先处理 `.ts` 文件）。

### 2. Session 进化引擎 (The Refiner)

* **行为学习：** 自动分析 `Claude Code` 的 Session 日志，提取用户对手动修正的意图。
* **自适应补丁：** 自动更新 Skill 的 System Prompt 或执行逻辑，实现"越用越顺手"。

### 3. 进化效能评估

系统会对进化前后的 Skill 进行多维度对比，生成**效能总结报告**：

* **成本评估 (Cost):** 统计 Token 消耗（Input/Output）的升降。
* **执行密度 (Efficiency):** 统计完成相同任务所需的**工具调用次数**。
* **交互质量 (User Friction):** 统计达成目标所需的**用户对话轮数**。
* **上下文负载 (Context Load):** 监控环境注入对 Context Window 的占用。

### 4. 安全扫描 (Security Scanning)

内置安全扫描功能，在执行或分享前检测潜在恶意模式。此功能灵感来源于 [skill-vetter](https://github.com/nickg/skill-vetter)。

**检测的安全模式：**

| 类别 | 检测模式 |
|------|----------|
| **危险命令** | `rm -rf`、`sudo rm`、`mkfs`、`dd if=` |
| **网络操作** | `curl ... sh`、`wget ... \| bash`、反向 Shell |
| **权限提升** | `chmod 777`、`chown root`、`sudo su` |
| **数据泄露** | `curl -F`、`wget --post-file`、Base64 上传 |
| **持久化** | Cron 任务、启动脚本、服务安装 |

```bash
# 扫描技能文件
sa scan ./my-skill.md

# 导入时自动扫描
sa import ./suspicious-skill.md  # 发现问题会发出警告
```

---

## 快速开始

### 安装

```bash
npm install -g @yangjingo/skill-adapter
```

### 1. 适配并安装

```bash
sa install https://github.com/public/fs-skill.git
```

### 2. 执行进化与评估

在使用一段时间后，运行进化命令：

```bash
sa evolve --last 10 --analyze
```

### 3. 查看效能总结

```bash
sa summary fs-skill
```

---

## 评估报告示例

执行 `sa summary` 后，你将得到如下反馈：

| 指标 | 原始版本 (v1.0) | 进化版本 (v1.1) | 变化 | 状态 |
|------|-----------------|-----------------|------|------|
| **平均对话轮数** | 5.2 轮 | 2.1 轮 | **-60%** | ✅ 极速达成 |
| **工具调用次数** | 15 次 | 6 次 | **-60%** | ✅ 路径更精准 |
| **Token 消耗** | 12.4k | 8.8k | **-29%** | ✅ 成本优化 |
| **上下文占用** | 1.1k | 2.3k | **+109%** | ⚠️ 环境注入较多 |

> **进化结论：** 通过注入 Workspace 路径规则，成功减少了 Skill 在无效目录下的盲目检索。虽然初始上下文有所增加，但显著降低了用户手动纠错的成本。

---

## 致谢

本项目参考并集成了以下开源项目：

- **[skills.sh](https://skills.sh)** - Vercel Labs 开发的开放技能生态系统
  - 本项目使用官方 `skills` CLI 进行技能发现和安装
  - 部分发现 API 端点参考了 skills.sh 的实现
  - 安装: `npm install skills` 或 `npx skills`

### 功能对照

| 功能 | skill-adapter | skills CLI |
|------|--------------|------------|
| 技能发现 | ✅ `sa import` | ✅ `skills find` |
| 技能安装 | ✅ 调用 skills CLI | ✅ `skills add` |
| 安全扫描 | ✅ `sa scan` | ❌ |
| 进化追踪 | ✅ `sa evolve` | ❌ |
| 效能评估 | ✅ `sa summary` | ❌ |
| 版本管理 | ✅ `sa log` | ✅ `skills check` |

---

## 许可证

MIT