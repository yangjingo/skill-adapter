# Skill-Adapter 用户指南

## 目录

- [快速开始](#快速开始)
- [安装](#安装)
- [核心命令](#核心命令)
- [使用场景](#使用场景)
- [配置](#配置)
- [本地 Registry](#本地-registry)
- [常见问题](#常见问题)

---

## 快速开始

```bash
# 安装
npm install -g skill-adapter

# 发现热门 Skills
sa find

# 安装一个 Skill
sa get https://skills.sh/anthropics/skills/frontend-design

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

### `sa get <source>` - 安装/导入 Skill

自动识别来源类型，支持：
- Registry URL (`https://skills.sh/...`)
- 本地文件 (`./my-skill.json`)
- 本地目录 (`./my-skill/`)
- Registry 名称 (`frontend-design`)

```bash
# 从 Registry 安装
sa get frontend-design

# 从 URL 安装
sa get https://skills.sh/anthropics/skills/frontend-design

# 从本地文件导入
sa get ./my-skill.json

# 从本地目录导入
sa get ./my-skill/

# 指定自定义名称
sa get ./old-name.json --name my-new-skill

# 跳过安全扫描
sa get ./my-skill.json --no-scan
```

### `sa find [query]` - 发现 Skills

```bash
# 查看热门 Skills（默认）
sa find

# 搜索特定关键词
sa find "code review"

# 指定平台
sa find "api" --platform clawhub

# 限制结果数量
sa find --limit 5

# 显示基于本地 Skill 的推荐
sa find --recommend
```

### `sa info [skill]` - 查看详情

```bash
# 列出所有已安装的 Skills
sa info

# 查看特定 Skill 详情
sa info frontend-design

# 查看安全状态
sa info my-skill --security
```

### `sa evolve [skill]` - 进化分析

```bash
# 分析所有 Skills
sa evolve

# 分析特定 Skill
sa evolve my-skill

# 应用建议的改进
sa evolve my-skill --apply
```

### `sa share <skill>` - 分享/发布

```bash
# 导出为 JSON 文件
sa share my-skill --output ./my-skill.json

# 导出为 YAML 文件
sa share my-skill --output ./my-skill.yaml --format yaml

# 发布到 Registry
sa share my-skill --registry http://localhost:3000

# 跳过确认
sa share my-skill --registry http://localhost:3000 --yes
```

### `sa scan <file>` - 安全扫描

```bash
# 扫描文件
sa scan ./my-skill.md

# JSON 格式输出
sa scan ./my-skill.md --format json
```

### `sa workspace` - 工作区分析

```bash
# 分析当前工作区
sa workspace
```

---

## 使用场景

### 场景 1：发现并安装社区 Skill

```bash
# 1. 浏览热门 Skills
sa find

# 2. 搜索特定类型的 Skill
sa find "code review"

# 3. 安装感兴趣的 Skill
sa get skill-creator

# 4. 查看安装结果
sa info skill-creator
```

### 场景 2：改进现有 Skill

```bash
# 1. 查看当前 Skills
sa info

# 2. 运行进化分析
sa evolve my-skill

# 3. 查看建议
# 输出会显示版本标签建议，如：v1.2.0-cost-15p

# 4. 应用改进
sa evolve my-skill --apply
```

### 场景 3：安全审计

```bash
# 安装前扫描
sa scan ./downloaded-skill.md

# 查看已安装 Skill 的安全状态
sa info my-skill --security

# 导出前自动扫描（默认行为）
sa share my-skill --registry http://localhost:3000
```

### 场景 4：团队协作

```bash
# 1. 导出 Skill
sa share team-skill --output ./team-skill.json

# 2. 分享给团队成员

# 3. 团队成员导入
sa get ./team-skill.json

# 4. 发布到内部 Registry
sa share team-skill --registry http://internal-registry:3000
```

### 场景 5：版本管理

```bash
# 进化会自动生成版本标签
sa evolve my-skill --apply

# 输出示例：
# 📊 Suggested version: v1.2.0-cost-15p
#    Reason: Cost reduced by 15% (tokens)
```

---

## 配置

### 自动检测 Agent 平台

Skill-Adapter 会自动检测你正在使用的 Agent：

| Agent | 检测方式 |
|-------|----------|
| Claude Code | `.claude/settings.json` 或 `ANTHROPIC_API_KEY` |
| OpenClaw | `.openclaw/config.json` 或 `OPENCLAW_API_KEY` |
| Cline | `.cline/config.json` 或 `CLINE_VERSION` |
| Cursor | `.cursor/settings.json` |
| Windsurf | `.windsurf/config.json` |

### 手动配置

创建 `.skill-adapter.json` 在项目根目录：

```json
{
  "registry": "http://localhost:3000",
  "defaultPlatform": "claude-code",
  "securityCheck": true
}
```

---

## 本地 Registry

### 启动本地服务器

```bash
cd registry-server
npm install
node server.js
```

服务器将在 `http://localhost:3000` 启动。

### API 端点

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/skills` | GET | 列出所有 Skills |
| `/api/skills?search=query` | GET | 搜索 Skills |
| `/api/skills/:name` | GET | 获取详情 |
| `/api/skills/:name/download` | GET | 下载 ZIP 包 |
| `/api/skills` | POST | 发布 Skill |
| `/api/skills/:name` | DELETE | 删除 Skill |

### CLI 对接本地 Registry

```bash
# 从本地 Registry 安装
sa get my-skill --registry http://localhost:3000

# 发布到本地 Registry
sa share my-skill --registry http://localhost:3000
```

---

## 常见问题

### Q: 安全扫描失败怎么办？

A: 检查扫描报告，修复高风险问题，或使用 `--no-scan` 跳过（不推荐）。

### Q: 如何查看检测到的 Agent 平台？

A: 运行 `sa workspace`，会显示当前检测到的环境信息。

### Q: 版本标签是什么意思？

A: 格式为 `v主版本.次版本.补丁-类型-数值`：
- `v1.2.0-cost-15p` - 成本降低 15%
- `v1.2.1-security-2` - 修复 2 个安全问题
- `v1.3.0-feature-xxx` - 新增 xxx 功能
- `v2.0.0-breaking-1` - 1 个破坏性变更

### Q: 如何迁移现有 Skill？

A: 创建 `skill.json` 和 `skill.md` 文件，然后使用 `sa get ./skill-dir/` 导入。