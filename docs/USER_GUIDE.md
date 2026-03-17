# Skill-Adapter 用户指南

## 目录

- [快速开始](#快速开始)
- [安装](#安装)
- [核心命令](#核心命令)
- [命令工作流](#命令工作流)
- [使用场景](#使用场景)
- [配置](#配置)
- [常见问题](#常见问题)

---

## 快速开始

```bash
# 安装
npm install -g skill-adapter

# 发现热门 Skills（来自 skills.sh 和 clawhub.com）
sa import

# 安装一个 Skill
sa import frontend-design

# 查看已安装的 Skills
sa info

# 进化你的 Skill
sa evolve my-skill
```

---

## 安装

### NPM 安装

```bash
npm install -g skill-adapter
```

### 从源码安装

```bash
git clone https://github.com/your-repo/skill-adapter.git
cd skill-adapter
npm install
npm run build
npm link
```

### 验证安装

```bash
sa --version
# Output: 1.2.0
```

---

## 核心命令

### `sa import [source]` - 导入/发现 Skill

**不带参数** - 显示热门技能列表：
```bash
sa import
# 🔥 Discovering hot skills from skills.sh and clawhub.com...
#
# Rank | Downloads | Source      | Skill
# ─────────────────────────────────────────────────────────────────
# #1    | 752       | skills.sh   | find-skills
# #2    | 145       | skills.sh   | skill-creator
# #3    | 227000    | clawhub.com | self-improving-agent
#
# 📌 下一步操作:
#    sa import find-skills       # 安装热门技能
#    sa import <path-or-url>     # 从文件或URL导入
```

**带参数** - 导入技能：
```bash
# 从 Registry 安装（自动搜索 skills.sh 和 clawhub.com）
sa import frontend-design

# 从 URL 安装
sa import https://skills.sh/anthropics/skills/frontend-design

# 从本地 OpenClaw 目录导入
sa import leow3lab-harbor

# 从本地文件导入
sa import ./my-skill.json

# 指定自定义名称
sa import leow3lab-harbor --name my-harbor

# 跳过安全扫描
sa import ./my-skill.json --no-scan
```

**成功后提示**：
```
✅ 安装成功!
   技能: frontend-design (v1.0.0)
   来源: skills.sh

📌 下一步操作:
   sa info frontend-design       # 查看技能详情
   sa evolve frontend-design     # 分析并优化技能
   sa log frontend-design        # 查看版本历史
```

---

### `sa info [skill]` - 查看详情

**不带参数** - 列出所有技能：
```bash
sa info
# 📋 Available Skills
#
# ── Imported Skills ──
#   📦 frontend-design (v1.0.0) - 1 evolution(s)
#   📦 hccn-tools (v1.0.0) - 1 evolution(s)
#
# ── OpenClaw Skills ──
#   📦 docker-env
#   📦 vllm-ascend-deploy
#
# 📌 下一步操作:
#    sa info <skill-name>       # 查看具体技能详情
#    sa import <skill-name>     # 导入新技能
```

**带参数** - 查看详情：
```bash
# 查看技能详情
sa info hccn-tools

# 只显示已导入的技能
sa info -p imported

# 显示安全状态
sa info my-skill --security
```

**OpenClaw 技能详情**：
```
📦 hccn-tools

Source: Imported
Version: 1.0.0
Imported from: OpenClaw:hccn-tools

── System Prompt ──
Size: 2.6 KB
Lines: 168

── Directory Tree ──
├── SKILL.md (2.6 KB)
├── scripts/
│   ├── diagnose_hccn.sh (2.0 KB)
│   └── build_ranktable.sh (2.4 KB)
└── tests/
    └── test_scripts.sh (3.1 KB)

📌 下一步操作:
   sa evolve hccn-tools        # 分析并优化技能
   sa log hccn-tools           # 查看版本历史
   sa share hccn-tools         # 分享技能
```

---

### `sa evolve [skill]` - 进化分析

**不带参数** - 显示所有技能概览：
```bash
sa evolve
# 🔄 Running evolution analysis...
#
# Analyzing 3 skill(s)...
#   • frontend-design: v1.0.0 (1 evolution(s))
#   • hccn-tools: v1.0.0 (1 evolution(s))
#
# 📍 Workspace Analysis
# Languages: TypeScript
# Package Manager: npm
#
# 📌 下一步操作:
#    sa evolve <skill-name>     # 分析具体技能
#    sa import <skill-name>     # 导入新技能
```

**带参数** - 详细分析：
```bash
# 分析技能
sa evolve my-skill

# 应用自动优化
sa evolve my-skill --apply

# 显示详细信息
sa evolve my-skill --detail
```

**分析输出**：
```
🔄 Running evolution analysis...

📦 Analyzing: hccn-tools
   Version: 1.0.0

📊 Step 1: Workspace Analysis
──────────────────────────────────────────────────
   Root: C:\Users\...\my-project
   Languages: TypeScript
   Package Manager: npm

📋 Step 2: Skill Content Analysis
──────────────────────────────────────────────────
   Content Size: 2.6 KB
   Lines: 168
   Code Blocks: 11

🔧 Step 3: Environment Analysis
──────────────────────────────────────────────────
   OpenClaw Skills: C:\Users\...\.openclaw\skills
   Available Skills: 11

💡 Step 4: Optimization Suggestions
──────────────────────────────────────────────────

   1. 🔴 [Language Context]
      建议: Add TypeScript-specific examples
      原因: Workspace uses TypeScript
      类型: 📝 需手动处理

   2. 🟡 [Docker Integration]
      建议: Verify Docker is installed
      原因: Skill uses Docker containers
      类型: 📝 需手动处理

📌 下一步操作:
   sa evolve hccn-tools --apply   # 自动应用优化
   sa info hccn-tools             # 查看技能详情
   sa log hccn-tools              # 查看版本历史
```

---

### `sa log [skill]` - 查看版本历史

```bash
# 查看所有技能历史概览
sa log

# 查看具体技能历史
sa log my-skill

# 显示最近 5 条
sa log my-skill -n 5

# 单行模式
sa log my-skill --oneline
```

---

### `sa scan <file>` - 安全扫描

```bash
# 扫描文件
sa scan ./my-skill.md

# JSON 格式输出
sa scan ./my-skill.md --format json
```

---

### `sa share [skill]` - 分享/发布

```bash
# 列出可分享的技能
sa share

# 导出为 ZIP
sa share my-skill --zip

# 发布到 Registry
sa share my-skill --registry http://localhost:3000

# 创建 PR 到技能仓库
sa share my-skill --pr
```

---

### `sa export [skill]` - 导出技能

```bash
# 导出所有技能
sa export

# 导出特定技能
sa export my-skill

# 指定输出目录
sa export my-skill --output ./exports
```

---

## 命令工作流

Skill-Adapter 的命令设计为有机衔接，每个命令完成后都会提示下一步操作：

```
┌─────────────────────────────────────────────────────────────────┐
│                        sa import                                 │
│  发现热门技能 → 安装技能 → 显示下一步建议                         │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                        sa info                                   │
│  查看技能详情 → 显示目录树/系统提示 → 建议进化或分享               │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                       sa evolve                                  │
│  分析workspace/环境 → 生成优化建议 → 可选自动应用                  │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                        sa log                                    │
│  查看版本历史 → 了解变更记录                                      │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                       sa share                                   │
│  分享/发布技能 → 导出文件或发布到 Registry                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## 使用场景

### 场景 1：发现并安装社区 Skill

```bash
# 1. 浏览热门 Skills（来自 skills.sh 和 clawhub.com）
sa import

# 2. 安装感兴趣的 Skill
sa import find-skills

# 3. 查看安装结果
sa info find-skills

# 4. 运行进化分析
sa evolve find-skills
```

### 场景 2：导入本地 OpenClaw Skill

```bash
# 1. 查看可用的 OpenClaw Skills
sa info -p openclaw

# 2. 导入本地 Skill
sa import hccn-tools

# 3. 查看详情（包含目录树）
sa info hccn-tools

# 4. 分析并优化
sa evolve hccn-tools --apply
```

### 场景 3：改进现有 Skill

```bash
# 1. 查看当前 Skills
sa info

# 2. 运行进化分析
sa evolve my-skill

# 3. 查看优化建议
# 输出会显示：高/中/低优先级的建议

# 4. 应用自动优化
sa evolve my-skill --apply
```

### 场景 4：团队协作

```bash
# 1. 导出 Skill
sa share my-skill --zip

# 2. 分享给团队成员

# 3. 团队成员导入
sa import ./my-skill.zip

# 4. 发布到内部 Registry
sa share my-skill --registry http://internal-registry:3000
```

---

## 配置

### 自动检测 Agent 平台

Skill-Adapter 会自动检测你正在使用的 Agent：

| Agent | 检测方式 |
|-------|----------|
| Claude Code | `.claude/settings.json` 或 `ANTHROPIC_API_KEY` |
| OpenClaw | `.openclaw/config.json` 或 `OPENCLAW_API_KEY` |

### 环境变量

```bash
# 自定义 Registry URL
export SKILL_ADAPTER_REGISTRY=http://localhost:3000

# 自定义技能仓库
export SKILL_ADAPTER_REPO=https://github.com/your-repo/skills

# 默认平台
export SKILL_ADAPTER_PLATFORM=skills-sh
```

### 配置文件

创建 `.skill-adapter.json` 在项目根目录：

```json
{
  "registry": "http://localhost:3000",
  "defaultPlatform": "claude-code",
  "securityCheck": true
}
```

---

## 常见问题

### Q: 安全扫描失败怎么办？

A: 检查扫描报告，修复高风险问题，或使用 `--no-scan` 跳过（不推荐）。

### Q: 如何查看技能的目录结构？

A: 对于 OpenClaw 技能，`sa info <skill>` 会显示目录树。

### Q: 版本标签是什么意思？

A: 格式为 `v主版本.次版本.补丁-类型-数值`：
- `v1.2.0-cost-15p` - 成本降低 15%
- `v1.2.1-security-2` - 修复 2 个安全问题

### Q: evolve 建议中的优先级是什么意思？

A:
- 🔴 高优先级：需要立即处理，影响功能或安全
- 🟡 中优先级：建议处理，可改善体验
- 🟢 低优先级：可选优化

### Q: 如何迁移现有 Skill？

A: 创建 `skill.json` 和 `skill.md` 文件，然后使用 `sa import ./skill-dir/` 导入。

---

## 技能来源

Skill-Adapter 支持从以下平台获取技能：

| 平台 | URL | 官方 CLI | 说明 |
|------|-----|----------|------|
| skills.sh | https://skills.sh | `npx skills add owner/repo` | Vercel 官方技能目录 |
| clawhub.com | https://clawhub.com | `npx clawhub@latest install skill-name` | 开源技能生态系统 |
| OpenClaw | 本地目录 | - | 本地 OpenClaw 安装的技能 |
| Claude Code | 本地目录 | - | 本地 Claude Code 配置的技能 |

### 官方 CLI 安装方式

**Skill-Adapter 自动使用官方 CLI（默认行为）：**
```bash
# 自动识别平台并使用正确的官方 CLI
sa import find-skills              # 自动使用 npx skills add 或 npx clawhub install
sa import self-improving-agent     # 自动识别 clawhub 并使用正确的命令

# 使用内置导入（不使用官方 CLI）
sa import find-skills --no-npx
```

**手动使用官方 CLI：**
```bash
# skills.sh
npx skills add vercel-labs/agent-skills
npx skills add anthropics/skills/skill-creator

# ClawHub
npx clawhub@latest install self-improving-agent
npx clawhub@latest install api-gateway
```

**本地技能导入（自动使用内置导入）：**
```bash
# 从本地 OpenClaw 目录导入（自动跳过官方 CLI）
sa import hccn-tools

# 从本地文件导入
sa import ./my-skill.json
```