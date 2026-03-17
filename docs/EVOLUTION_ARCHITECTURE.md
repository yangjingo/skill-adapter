# Skill Evolution 系统架构

## 概述

Skill-Adapter 的进化系统是一个**自动化技能优化框架**，直接执行优化并报告结果，而不是仅仅提供建议。

**核心理念：进化 = 执行优化 + 报告结果**

---

## 进化流程图

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              EVOLVE 流程 (自动执行模式)                          │
└─────────────────────────────────────────────────────────────────────────────────┘

                    ┌─────────────────────────────────────┐
                    │         sa evolve <skill>           │
                    └─────────────────┬───────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    STEP 0: 查找技能 (多源统一)                                    │
│                                                                                  │
│   优先级: Database → OpenClaw → Claude Code                                      │
│                                                                                  │
│   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐                           │
│   │  Database   │   │  OpenClaw   │   │ Claude Code │                           │
│   │ evolution.  │   │ ~/.openclaw │   │ ~/.claude/  │                           │
│   │ jsonl       │   │ /skills/    │   │ skills/     │                           │
│   └──────┬──────┘   └──────┬──────┘   └──────┬──────┘                           │
│          │                 │                 │                                   │
│          └─────────────────┼─────────────────┘                                   │
│                            │                                                     │
│                            ▼                                                     │
│                  找到 SKILL.md → 继续进化                                        │
│                  未找到 → 提示用户可用技能                                        │
└─────────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    STEP 1-2: 分析环境与技能内容                                   │
│                                                                                  │
│   ┌─────────────────────┐   ┌─────────────────────┐   ┌─────────────────────┐    │
│   │   Workspace Analysis │   │  Skill Content     │   │   Context Load     │    │
│   │                      │   │  Analysis          │   │   (SOUL/MEMORY)    │    │
│   │ • Languages          │   │                    │   │                    │    │
│   │ • Frameworks         │   │ • Size             │   │ • SOUL.md 风格     │    │
│   │ • Package Manager    │   │ • Code blocks      │   │ • MEMORY.md 历史   │    │
│   │ • Build Tools        │   │ • Env vars         │   │ • Daily sessions   │    │
│   └─────────────────────┘   └─────────────────────┘   └─────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    STEP 4: 执行优化 (核心)                                        │
│                                                                                  │
│   ┌─────────────────────────────────────────────────────────────────────────┐    │
│   │                        自动优化执行器                                     │    │
│   │                                                                          │    │
│   │   1. 路径本地化                                                          │    │
│   │      /home/user → ${HOME}                                               │    │
│   │      /Users/xxx → ${HOME}                                               │    │
│   │                                                                          │    │
│   │   2. 包管理器适配                                                        │    │
│   │      npm run → pnpm run / yarn run                                      │    │
│   │      npm install → pnpm install                                         │    │
│   │                                                                          │    │
│   │   3. 环境适配提示 (追加到 SKILL.md)                                      │    │
│   │      - TypeScript 环境建议                                              │    │
│   │      - Python 虚拟环境提醒                                              │    │
│   │      - Docker 启动检查                                                  │    │
│   │                                                                          │    │
│   │   4. SOUL.md 风格注入 (追加到 SKILL.md)                                  │    │
│   │      - 沟通风格: 直接简洁 / 正式客套                                     │    │
│   │      - 隐私边界提醒                                                     │    │
│   │                                                                          │    │
│   │   5. MEMORY.md 历史学习 (追加到 SKILL.md)                                │    │
│   │      - 提取错误规避记录                                                 │    │
│   │      - 注入经验总结                                                     │    │
│   │                                                                          │    │
│   └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
│   输出: OptimizationResult[]                                                     │
│   { category, action, status: 'applied' | 'added' | 'skipped' }                 │
└─────────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    STEP 5-6: 保存与记录                                          │
│                                                                                  │
│   ┌─────────────────────────────────────────────────────────────────────────┐    │
│   │                                                                          │    │
│   │   1. 备份: SKILL.md → SKILL.md.backup                                   │    │
│   │   2. 写入: 新的 SKILL.md 内容                                           │    │
│   │   3. 记录: EvolutionDatabase                                            │    │
│   │      - version: 1.0.0 → 1.1.0                                           │    │
│   │      - patches: 优化详情列表                                            │    │
│   │      - skillPath: 实际文件路径                                          │    │
│   │                                                                          │    │
│   └─────────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         输出示例                                                 │
│                                                                                  │
│   ⚙️  Step 4: 执行优化                                                          │
│   ──────────────────────────────────────────────────                             │
│                                                                                  │
│      1. ➕ [环境适配]                                                            │
│         操作: 添加 2 条环境适配提示                                              │
│                                                                                  │
│      2. ➕ [风格注入]                                                            │
│         操作: 根据 SOUL.md 注入交互风格: 直接简洁，避免客套                       │
│                                                                                  │
│      3. ℹ️ [环境变量]                                                            │
│         操作: 检测到 1 个环境变量: $USER                                         │
│                                                                                  │
│   💾 Step 5: 保存更改                                                           │
│   ──────────────────────────────────────────────────                             │
│      备份: SKILL.md.backup                                                      │
│      修改: SKILL.md                                                             │
│                                                                                  │
│   📊 进化摘要                                                                   │
│   ──────────────────────────────────────────────────                             │
│      版本: 1.0.0 → 1.1.0                                                        │
│      优化: 2 个已应用, 1 个需关注                                                │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 优化后的 SKILL.md 结构

```markdown
# 原有技能内容
...

# 参考文档
...

## 环境适配提示

> 由 Skill-Adapter 自动生成 (基于当前工作区)

- 工作区使用 TypeScript，建议添加类型定义示例
- Python 技能建议使用虚拟环境 (venv/conda)

## 交互风格

> 基于 SOUL.md 自动注入

- 直接简洁，避免客套
- 尊重隐私边界

## 经验记录

> 从历史会话中学习

- 修改核心架构前，必须检查并同步更新相关的 README.md 或文档说明
- 严禁将调试用的临时脚本、大型二进制文件或敏感配置提交至 Git
```

---

## 当前问题诊断

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              问题 1: 数据源不一致                                │
└─────────────────────────────────────────────────────────────────────────────────┘

   info 命令                          evolve 命令
   ┌─────────────────┐                ┌─────────────────┐
   │ 扫描目录        │                │ 查询数据库      │
   │ ~/.openclaw/    │                │ evolution.jsonl │
   │ skills/         │                │                 │
   └────────┬────────┘                └────────┬────────┘
            │                                  │
            ▼                                  ▼
   显示 modelscope-cli              报错 "Skill not found"
   (存在于目录但未导入)             (数据库无记录)

┌─────────────────────────────────────────────────────────────────────────────────┐
│                              问题 2: 未集成 Session 数据                         │
└─────────────────────────────────────────────────────────────────────────────────┘

   OpenClaw Session 数据             当前 evolve 实现
   ┌─────────────────┐                ┌─────────────────┐
   │ ~/.openclaw/    │                │ 未读取          │
   │ workspace/      │ ──────────────X│ SessionAnalyzer │
   │ memory/*.md     │                │ 未调用          │
   │ SOUL.md         │                └─────────────────┘
   └─────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────┐
│                              问题 3: Skill 内容读取失败                          │
└─────────────────────────────────────────────────────────────────────────────────┘

   Step 2 输出:
   "Skill content not available for analysis"

   原因:
   - importSource = "openclaw" (没有具体路径信息)
   - skillPath = undefined (导入时未记录)
   - findOpenClawSkillsPath() 可能返回 null
```

---

## OpenClaw 目录结构

```
~/.openclaw/
├── skills/                          # 技能目录
│   ├── modelscope-cli/
│   │   ├── SKILL.md                 # 技能定义文件
│   │   ├── evals/
│   │   ├── scripts/
│   │   └── tests/
│   ├── hccn-tools/
│   └── ...
├── workspace/                       # 工作空间
│   ├── SOUL.md                      # Agent 人格定义
│   ├── USER.md                      # 用户信息
│   ├── MEMORY.md                    # 长期记忆
│   ├── AGENTS.md                    # 工作空间规则
│   ├── memory/                      # 每日日志
│   │   └── 2026-03-13.md
│   └── .openclaw/
│       └── workspace-state.json
└── memory/
    └── main.sqlite                  # Session 数据库
```

---

## 正确的进化架构图

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           SKILL-ADAPTER EVOLUTION SYSTEM                        │
│                              (修正版架构)                                        │
└─────────────────────────────────────────────────────────────────────────────────┘

                                 ┌──────────────────┐
                                 │   USER COMMAND   │
                                 │  sa evolve [skill] │
                                 └────────┬─────────┘
                                          │
                                          ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         STEP 0: SKILL DISCOVERY (新增)                           │
│                                                                                  │
│   ┌─────────────────────────────────────────────────────────────────────────┐    │
│   │                        查找技能 (多源统一)                                │    │
│   │                                                                          │    │
│   │   1. EvolutionDatabase.getRecords(skillName)                            │    │
│   │      └─► 找到 → 使用 skillPath 或 importSource                          │    │
│   │                                                                          │    │
│   │   2. OpenClaw Skills: ~/.openclaw/skills/<skillName>/SKILL.md           │    │
│   │      └─► 找到 → 直接读取内容                                             │    │
│   │                                                                          │    │
│   │   3. Claude Code Skills: ~/.claude/skills/<skillName>/skill.md          │    │
│   │      └─► 找到 → 直接读取内容                                             │    │
│   │                                                                          │    │
│   │   都未找到 → "Skill not found in any source"                            │    │
│   └─────────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         STEP 1: LOAD CONTEXT (新增)                              │
│                                                                                  │
│   ┌─────────────────────┐   ┌─────────────────────┐   ┌─────────────────────┐    │
│   │      SOUL.md        │   │     USER.md         │   │    MEMORY.md        │    │
│   │   ~/.openclaw/      │   │  ~/.openclaw/       │   │  ~/.openclaw/       │    │
│   │   workspace/        │   │  workspace/         │   │  workspace/         │    │
│   │                     │   │                     │   │                     │    │
│   │ • Agent 人格偏好    │   │ • 用户信息          │   │ • 长期记忆          │    │
│   │ • 交互风格          │   │ • 联系方式          │   │ • 历史决策          │    │
│   │ • 边界定义          │   │ • 偏好设置          │   │ • 纠错记录          │    │
│   └─────────────────────┘   └─────────────────────┘   └─────────────────────┘    │
│                                          │                                       │
│                                          ▼                                       │
│   ┌─────────────────────────────────────────────────────────────────────────┐    │
│   │                        Context Bundle                                    │    │
│   │   {                                                                      │    │
│   │     soul: { personality, boundaries, preferences },                     │    │
│   │     user: { info, contacts, preferences },                              │    │
│   │     memory: { longTermMemories, corrections },                          │    │
│   │     skillContent: SKILL.md content                                      │    │
│   │   }                                                                      │    │
│   └─────────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         STEP 2: SESSION ANALYSIS (增强)                          │
│                                                                                  │
│   ┌─────────────────────────────────────────────────────────────────────────┐    │
│   │                     OpenClaw Session Data                                │    │
│   │                                                                          │    │
│   │   ~/.openclaw/workspace/memory/YYYY-MM-DD.md                            │    │
│   │   ┌───────────────────────────────────────────────────────────────────┐  │    │
│   │   │ # 2026-03-13                                                      │  │    │
│   │   │ ## 安装 ascend-skills 技能                                        │  │    │
│   │   │ 从 CodeHub clone 并安装了 10 个昇腾 NPU 技能...                  │  │    │
│   │   └───────────────────────────────────────────────────────────────────┘  │    │
│   │                                                                          │    │
│   │   ~/.openclaw/memory/main.sqlite                                        │    │
│   │   ┌───────────────────────────────────────────────────────────────────┐  │    │
│   │   │ Tables: conversations, messages, tool_calls, ...                  │  │    │
│   │   │ • 用户对话历史                                                    │  │    │
│   │   │ • 工具调用记录                                                    │  │    │
│   │   │ • 错误和修正记录                                                  │  │    │
│   │   └───────────────────────────────────────────────────────────────────┘  │    │
│   └─────────────────────────────────────────────────────────────────────────┘    │
│                                          │                                       │
│                                          ▼                                       │
│   ┌─────────────────────────────────────────────────────────────────────────┐    │
│   │                     SessionAnalyzer.analyze()                            │    │
│   │                                                                          │    │
│   │   输入: SessionLog[] (从 SQLite 和 daily logs 解析)                     │    │
│   │   输出: AnalysisResult {                                                 │    │
│   │     patterns: BehaviorPattern[],     // 行为模式                        │    │
│   │     suggestions: ImprovementSuggestion[],  // 改进建议                  │    │
│   │     intentSummary: string            // 意图总结                        │    │
│   │   }                                                                      │    │
│   └─────────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         STEP 3: WORKSPACE ANALYSIS (保留)                        │
│                                                                                  │
│   WorkspaceAnalyzer.analyze()                                                    │
│   ┌─────────────────────────────────────────────────────────────────────────┐    │
│   │ • 检测语言: TypeScript, Python, Go, Java...                              │    │
│   │ • 检测框架: React, Vue, Django, Spring...                                │    │
│   │ • 检测包管理器: npm, yarn, pnpm, pip...                                  │    │
│   │ • 检测构建工具: webpack, vite, gradle...                                 │    │
│   └─────────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         STEP 4: OPTIMIZATION ENGINE (重构)                       │
│                                                                                  │
│   ┌─────────────────────────────────────────────────────────────────────────┐    │
│   │                     综合所有数据源生成建议                                │    │
│   │                                                                          │    │
│   │   输入:                                                                  │    │
│   │   ├── contextBundle (SOUL, USER, MEMORY)                               │    │
│   │   ├── sessionAnalysis (patterns, suggestions)                          │    │
│   │   ├── workspaceConfig (techStack)                                      │    │
│   │   └── skillContent (SKILL.md)                                          │    │
│   │                                                                          │    │
│   │   处理逻辑:                                                              │    │
│   │   1. 匹配 Session patterns 与 SKILL.md 内容                             │    │
│   │   2. 根据 SOUL.md 风格调整建议表达方式                                   │    │
│   │   3. 根据 MEMORY.md 中的纠错记录避免重复错误                             │    │
│   │   4. 根据 workspace techStack 添加环境特定优化                          │    │
│   │                                                                          │    │
│   │   输出: OptimizationSuggestion[]                                        │    │
│   └─────────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         STEP 5: APPLY CHANGES (增强)                             │
│                                                                                  │
│   ┌─────────────────────────────────────────────────────────────────────────┐    │
│   │                        修改 SKILL.md                                     │    │
│   │                                                                          │    │
│   │   1. 读取原始 SKILL.md                                                   │    │
│   │   2. 应用优化补丁:                                                       │    │
│   │      • 添加环境特定的示例代码                                            │    │
│   │      • 更新命令以匹配包管理器                                            │    │
│   │      • 根据 session 模式添加常见问题解决方案                             │    │
│   │   3. 创建备份: SKILL.md.backup                                           │    │
│   │   4. 写入新版本                                                          │    │
│   │   5. 记录到 EvolutionDatabase:                                           │    │
│   │      • skillPath: 指向实际 SKILL.md 位置                                │    │
│   │      • importSource: 记录来源平台                                       │    │
│   │      • patches: 记录具体修改内容                                        │    │
│   └─────────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 数据流完整图

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              完整数据流                                          │
└─────────────────────────────────────────────────────────────────────────────────┘

                    ┌─────────────────────────────────────┐
                    │         sa evolve modelscope-cli    │
                    └─────────────────┬───────────────────┘
                                      │
                                      ▼
        ┌─────────────────────────────────────────────────────────┐
        │                    查找技能来源                          │
        │                                                          │
        │  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐    │
        │  │ Database    │   │ OpenClaw    │   │ Claude Code │    │
        │  │ ❌ 未找到   │   │ ✅ 找到     │   │ ❌ 未找到   │    │
        │  └─────────────┘   └─────────────┘   └─────────────┘    │
        │                              │                          │
        │                              ▼                          │
        │              ~/.openclaw/skills/modelscope-cli/        │
        │                          SKILL.md                       │
        └─────────────────────────────┬───────────────────────────┘
                                      │
        ┌─────────────────────────────┼───────────────────────────┐
        │                             │                           │
        ▼                             ▼                           ▼
┌───────────────┐          ┌───────────────────┐      ┌───────────────┐
│   SOUL.md     │          │   memory/*.md     │      │  main.sqlite  │
│               │          │   Session logs    │      │  (可选)       │
│               │          │                   │      │               │
│ 人格/偏好     │          │ 每日工作记录      │      │ 对话历史      │
└───────┬───────┘          └─────────┬─────────┘      └───────┬───────┘
        │                            │                        │
        └────────────────────────────┼────────────────────────┘
                                     │
                                     ▼
                    ┌─────────────────────────────────────┐
                    │         SessionAnalyzer             │
                    │                                     │
                    │  解析 Session 数据:                 │
                    │  • 工具调用频率                     │
                    │  • 错误模式                         │
                    │  • 用户修正记录                     │
                    │  • 常见工作流                       │
                    └─────────────────┬───────────────────┘
                                      │
                                      ▼
                    ┌─────────────────────────────────────┐
                    │       Optimization Engine           │
                    │                                     │
                    │  生成优化建议:                       │
                    │  • 基于 session patterns            │
                    │  • 基于 workspace tech stack        │
                    │  • 基于 SOUL.md 偏好                │
                    │  • 基于 MEMORY.md 纠错              │
                    └─────────────────┬───────────────────┘
                                      │
                                      ▼
                    ┌─────────────────────────────────────┐
                    │         应用修改                     │
                    │                                     │
                    │  1. 备份 SKILL.md                   │
                    │  2. 应用补丁                        │
                    │  3. 写入新版本                      │
                    │  4. 记录到数据库                    │
                    │     (包含 skillPath)                │
                    └─────────────────────────────────────┘
```

---

## 代码修复建议

### 修复 1: 统一技能查找逻辑

```typescript
// src/core/skill-finder.ts (新文件)
export class SkillFinder {
  /**
   * 查找技能 - 统一入口
   * 按优先级: Database → OpenClaw → Claude Code
   */
  static findSkill(skillName: string): SkillLocation | null {
    // 1. 检查数据库
    const db = new EvolutionDatabase();
    const dbRecord = db.getLatestRecord(skillName);
    if (dbRecord?.skillPath && fs.existsSync(dbRecord.skillPath)) {
      return {
        source: 'database',
        skillPath: dbRecord.skillPath,
        importSource: dbRecord.importSource,
        content: fs.readFileSync(dbRecord.skillPath, 'utf-8')
      };
    }

    // 2. 检查 OpenClaw
    const openClawSkill = this.findInOpenClaw(skillName);
    if (openClawSkill) return openClawSkill;

    // 3. 检查 Claude Code
    const claudeCodeSkill = this.findInClaudeCode(skillName);
    if (claudeCodeSkill) return claudeCodeSkill;

    return null;
  }

  static findInOpenClaw(skillName: string): SkillLocation | null {
    const openClawPath = path.join(os.homedir(), '.openclaw', 'skills');
    const skillMdPath = path.join(openClawPath, skillName, 'SKILL.md');

    if (fs.existsSync(skillMdPath)) {
      return {
        source: 'openclaw',
        skillPath: skillMdPath,
        importSource: 'OpenClaw:' + skillName,
        content: fs.readFileSync(skillMdPath, 'utf-8')
      };
    }
    return null;
  }

  static findInClaudeCode(skillName: string): SkillLocation | null {
    const claudePath = path.join(os.homedir(), '.claude', 'skills', skillName);
    const skillMdPath = path.join(claudePath, 'skill.md');

    if (fs.existsSync(skillMdPath)) {
      return {
        source: 'claudecode',
        skillPath: skillMdPath,
        importSource: 'ClaudeCode:' + skillName,
        content: fs.readFileSync(skillMdPath, 'utf-8')
      };
    }
    return null;
  }
}

export interface SkillLocation {
  source: 'database' | 'openclaw' | 'claudecode';
  skillPath: string;
  importSource: string;
  content: string;
}
```

### 修复 2: 集成 Session 分析

```typescript
// src/core/session-loader.ts (新文件)
export class SessionLoader {
  /**
   * 从 OpenClaw 加载 session 数据
   */
  static loadOpenClawSessions(skillName?: string): SessionLog[] {
    const sessions: SessionLog[] = [];
    const memoryDir = path.join(os.homedir(), '.openclaw', 'workspace', 'memory');

    if (!fs.existsSync(memoryDir)) return sessions;

    const files = fs.readdirSync(memoryDir).filter(f => f.endsWith('.md'));

    for (const file of files) {
      const content = fs.readFileSync(path.join(memoryDir, file), 'utf-8');
      const parsed = this.parseMemoryFile(content, skillName);
      sessions.push(...parsed);
    }

    return sessions;
  }

  /**
   * 解析 memory/YYYY-MM-DD.md 文件
   */
  static parseMemoryFile(content: string, skillName?: string): SessionLog[] {
    // 解析 markdown 内容，提取技能使用记录
    // ...
  }

  /**
   * 加载 SOUL.md 配置
   */
  static loadSoulConfig(): SoulConfig {
    const soulPath = path.join(os.homedir(), '.openclaw', 'workspace', 'SOUL.md');
    if (!fs.existsSync(soulPath)) return null;

    const content = fs.readFileSync(soulPath, 'utf-8');
    return this.parseSoulMd(content);
  }
}
```

### 修复 3: 改进 evolve 命令

```typescript
// src/cli.ts evolve 命令修改
.action((skillName: string | undefined, options) => {
  console.log('🔄 Running evolution analysis...\n');

  if (skillName) {
    // 使用统一的 SkillFinder
    const skillLocation = SkillFinder.findSkill(skillName);

    if (!skillLocation) {
      console.log(`Skill "${skillName}" not found.`);
      console.log('\nAvailable sources:');
      console.log('  - OpenClaw: ~/.openclaw/skills/');
      console.log('  - Claude Code: ~/.claude/skills/');
      console.log('\nRun: sa info -p openclaw  # 查看可用技能');
      return;
    }

    console.log(`📦 Analyzing: ${skillName}`);
    console.log(`   Source: ${skillLocation.source}`);
    console.log(`   Path: ${skillLocation.skillPath}\n`);

    // 加载上下文
    const soulConfig = SessionLoader.loadSoulConfig();
    const sessions = SessionLoader.loadOpenClawSessions(skillName);

    // 分析 session
    const sessionAnalyzer = new SessionAnalyzer();
    sessions.forEach(s => sessionAnalyzer.addSession(s));
    const analysisResult = sessionAnalyzer.analyze();

    // ... 继续后续分析
  }
});
```

---

## 推荐的改进方案

```typescript
// 改进 1: evolve 命令增强错误提示
if (records.length === 0) {
  // 检查是否存在于 OpenClaw 或 Claude Code
  const openClawPath = findOpenClawSkillsPath();
  if (openClawPath && fs.existsSync(path.join(openClawPath, skillName))) {
    console.log(`Skill "${skillName}" exists in OpenClaw but hasn't been imported.`);
    console.log(`Run: sa import ${skillName}`);
    return;
  }
  console.log(`Skill "${skillName}" not found.`);
  return;
}

// 改进 2: 集成 SessionAnalyzer 到 evolve
const sessionAnalyzer = new SessionAnalyzer();
// 从 Claude Code 历史加载会话
loadSessionsFromHistory(sessionAnalyzer);
const analysisResult = sessionAnalyzer.analyze();
// 将分析结果加入优化建议
suggestions.push(...analysisResult.suggestions);

// 改进 3: 通过 Hooks 自动收集遥测数据
// 创建 ~/.claude/hooks/PostToolUse/skill-telemetry.md
// 自动记录每次工具调用的遥测数据
```

---

## v1.2.0 新增特性 (2026-03-17)

### 1. 结构化 MEMORY.md 解析

现在支持从 `*Memory 01*:` 格式中提取错误规避记录：

```
MEMORY.md 格式:
- *Memory 01*: 修改核心架构前，必须检查并同步更新相关的 `README.md` 或文档说明。
- *Memory 02*: 严禁将调试用的临时脚本、大型二进制文件或敏感配置（.env）提交至 Git。
- *Memory 03*: 保持代码整洁，优先考虑"优雅与可维护性"，而非仅追求解决当下的 Bug。
```

### 2. 跨技能学习

每次进化都会分析所有已进化技能的模式：

```
   4. ℹ️ [跨技能学习]
      操作: 发现 6 个可借鉴模式
      → hccn-tools: 环境适配
      → docker-env: 环境适配
      → vllm-ascend-deploy: 环境适配
```

### 3. 智能语义版本控制

根据变更类型自动决定版本号：

| 变更类型 | 版本变更 | 示例 |
|---------|---------|------|
| Breaking | MAJOR | 1.0.0 → 2.0.0 |
| New Features | MINOR | 1.0.0 → 1.1.0 |
| Fixes/Patches | PATCH | 1.0.0 → 1.0.1 |

### 4. 每日会话分析

读取 `~/.openclaw/workspace/memory/` 中的日志文件：

```
   3. ℹ️ [会话历史]
      操作: 分析最近 1 天会话
      → 安装 ascend-skills 技能
```

### 5. 环境变量自动注入

检测到环境变量时，自动添加配置说明：

```
   5. ➕ [环境变量]
      操作: 添加环境变量配置说明
      → $TOKENIZER_BASE_PATH
      → ${MODEL_NAME}
```

### 优化后的 SKILL.md 完整结构

```markdown
# 原有技能内容
...

## 环境适配提示

> 由 Skill-Adapter 自动生成 (基于当前工作区)

- 工作区使用 TypeScript，建议添加类型定义示例
- Python 技能建议使用虚拟环境 (venv/conda)
- 使用前请确保 Docker 已启动: docker --version

## 交互风格

> 基于 SOUL.md 自动注入

- 直接简洁，避免客套
- 尊重隐私边界

## 错误规避记录

> 从 MEMORY.md 学习 (自动注入)

- 修改核心架构前，必须检查并同步更新相关的 `README.md` 或文档说明。
- 严禁将调试用的临时脚本、大型二进制文件或敏感配置（.env）提交至 Git。
- 保持代码整洁，优先考虑"优雅与可维护性"，而非仅追求解决当下的 Bug。

## 环境变量配置

> 自动检测到以下环境变量

- `$TOKENIZER_BASE_PATH`
- `${MODEL_NAME}`

请在使用前确保这些变量已正确设置。
```