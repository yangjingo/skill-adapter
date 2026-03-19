# Skill-Adapter TODO

> 最后更新: 2026-03-18

---

## 📊 项目进度

```
总任务: 4 个核心模块
已完成: 3 个 (AI Evolution Engine, Security Scanner, Evaluator)
重构完成: 3 个 (硬编码优化)
进行中: 0 个
待处理: 3 个 (低优先级接口预留)

进度: ████████████████████░░░░ 75%
```

### ✅ AI Agent 实现

| 模块 | 文件 | 功能 | 完成日期 |
|------|------|------|----------|
| Evolution Engine | `core/evolution/` | AI 引擎 + 流式输出 + 中英文 Prompt | 2026-03-18 |
| Security Scanner | `core/security/` | AI 安全扫描 + 流式输出 + 漏洞检测 | 2026-03-19 |
| Evaluator | `core/evaluator.ts` | AI 评估报告 + 流式输出 + 智能分析 | 2026-03-19 |

### 🔧 已重构模块 (硬编码优化)

| 模块 | 文件 | 改造内容 | 完成日期 |
|------|------|----------|----------|
| Session Extractor | `core/session/` | Claude Code + OpenClaw 会话提取 | 2026-03-18 |
| Model Config | `core/model-config-loader.ts` | 自动搜索配置 + 引导用户配置 | 2026-03-18 |
| Database | `core/database.ts` | SQLite → JSONL 格式 | 2026-03-18 |

### ⬜ 待处理模块 (低优先级)

| 模块 | 策略 | 说明 |
|------|------|------|
| SessionAnalyzer | 简化 + 接口预留 | 保持关键词匹配，定义 IAnalyzer 接口 |
| WorkspaceAnalyzer | 简化 + 接口预留 | 保持文件检测，定义 IWorkspaceAnalyzer 接口 |
| RecommendationEngine | 简化 + 接口预留 | 保持相似度计算，定义 IRecommender 接口 |

### 🔮 新功能需求

| 功能 | 位置 | 状态 | 说明 |
|------|------|------|------|
| **Smart Recommendations** | `sa evolve` 命令 | ✅ 已完成 | 进化前显示建议和推荐 |
| ↳ 进化建议 | AI 分析 | ✅ | 一行简洁建议 |
| ↳ 相关技能推荐 | skills.sh API | ✅ | 2 个热门相关技能 |
| ↳ --quick flag | 跳过建议 | ✅ | 直接开始进化 |

---

## 🏗️ 架构概览

### 模块分类

```
┌─────────────────────────────────────────────────────────────┐
│                    模块实现方式分布                           │
├─────────────────────────────────────────────────────────────┤
│ ✅ AI Agent 实现                                             │
│    core/evolution/           AI 进化引擎 (唯一)              │
│                                                             │
│ 🔧 已重构 (硬编码优化)                                        │
│    core/session/             会话提取 (JSON解析)             │
│    core/model-config-loader.ts  配置搜索 + 引导             │
│    core/database.ts          JSONL 存储                      │
│                                                             │
│ 🔄 待重构 (接口预留，低优先级)                                 │
│    core/analyzer.ts          简化 + 预留AI接口               │
│    core/workspace.ts         简化 + 预留AI接口               │
│    core/discovery/recommender.ts  简化 + 预留AI接口          │
│                                                             │
│ 🔮 未来 AI 改造候选                                          │
│    core/discovery/fetcher.ts  Agent + chrome/websearch 推荐  │
│                                                             │
│ ✅ AI Agent 实现 (已完成)                                    │
│    core/evolution/           AI 进化引擎 + 流式输出          │
│    core/security/            AI 安全扫描 (scanWithAI)        │
│    core/evaluator.ts         AI 评估报告 (evaluateWithAI)    │
│                                                             │
│ ⬜ 保持硬编码 (无需改动)                                       │
│    core/patcher.ts           字符串操作                      │
│    core/telemetry.ts         数据统计                        │
│    report/summary.ts         报告生成                        │
│    core/sharing/             技能导入导出                     │
│    cli.ts import 命令        技能安装 (npx skills add 包装)   │
└─────────────────────────────────────────────────────────────┘
```

### 依赖关系

```
cli.ts
  │
  ├── ModelConfigLoader (硬编码) ──► 搜索配置
  │       │                        │
  │       ├── 找到 ────────────────┼──► AIEvolutionEngine (AI) ✅
  │       │                        │         │
  │       └── 未找到 ──────────────┼──► 返回引导信息
  │                                │
  ├── SessionExtractor (硬编码) ───┴──► 提供会话数据给 AI 分析
  │
  ├── import 命令 (硬编码) ──────────► npx skills add 包装器
  │
  ├── EvolutionEngine (AI) ✅
  ├── SecurityScanner (AI) ✅ ───────► vet 命令使用 scanWithAI
  ├── Evaluator (AI) ✅ ─────────────► summary 命令可使用 evaluateWithAI
  │
  ├── WorkspaceAnalyzer (硬编码) ⬜ 接口预留
  ├── SessionAnalyzer (硬编码) ⬜ 接口预留
  └── RecommendationEngine (硬编码) ⬜ 接口预留
        └── PlatformFetcher (硬编码) 🔮 未来 AI 改造
```

**核心流程**: `配置搜索` → `Session提取` → `AI进化分析`

**安装流程**: `sa import` → `npx skills add` → `~/.claude/skills/`

---

## 🔥 Smart Recommendations 设计 ✅ 已实现

### 功能目标

为用户提供智能推荐：
1. **进化建议** - AI 分析推荐进化方向
2. **相关技能推荐** - 从 skills.sh API 获取相关热门技能

### 设计决策

**方案**: 整合到 `evolve` 命令，无需新增命令

| 优点 | 说明 |
|------|------|
| 无心智负担 | 用户只需记住 `evolve` |
| 自然流程 | evolve 前先看建议，再决定是否继续 |
| 可跳过 | 加 `--quick` 直接进化，跳过建议 |

### 用户体验

```
$ sa evolve web-design-guidelines

──────────────────────────────────────────────────
💡 Smart Recommendations
──────────────────────────────────────────────────

   💡 Suggestion:
      → Add WCAG 2.1 guidelines support

   🎯 Related skills:
      • frontend-design (1234 downloads)
      • vercel-react-best (567 downloads)

──────────────────────────────────────────────────

🚀 Starting evolution...
[AI 分析流式输出...]
```

**跳过建议直接进化**:
```
$ sa evolve web-design-guidelines --quick
🚀 Evolving web-design-guidelines...
[直接开始 AI 分析...]
```

### 实现要点

```typescript
// cli.ts - evolve 命令
// 1. 添加 --quick 选项
.option('--quick', 'Skip suggestions and start evolution immediately', false)

// 2. 在 STEP 2 后，STEP 3 前，并行获取建议
if (!options.quick) {
  const [aiSuggestion, relatedSkills] = await Promise.all([
    saAgentEvolutionEngine.getQuickSuggestion(skillContent),
    platformFetcher.search(skillName, { limit: 2 })
  ]);
  // 显示建议...
}

  // 2. 执行进化
  console.log(`🚀 Evolving ${skillName}...`);
  await aiEvolutionEngine.evolve(skillContent);
});
```

---

## 📋 接口预留设计

> 原则: 先简化硬编码实现，预留 AI 扩展接口

### 1. IAnalyzer 接口

```typescript
// src/types/analyzer.ts (新建)
export interface IntentAnalysis {
  primaryIntent: string;
  secondaryIntents: string[];
  confidence: number;
}

export interface IAnalyzer {
  analyze(sessions: SessionLog[]): Promise<IntentAnalysis>;
}

// 当前实现: RuleBasedAnalyzer
export class RuleBasedAnalyzer implements IAnalyzer {
  async analyze(sessions: SessionLog[]): Promise<IntentAnalysis> {
    return this.extractByKeywords(sessions);
  }
}

// 未来实现: AIAnalyzer
// export class AIAnalyzer implements IAnalyzer {
//   async analyze(sessions: SessionLog[]): Promise<IntentAnalysis> {
//     return this.aiEngine.analyzeIntent(sessions);
//   }
// }
```

### 2. IWorkspaceAnalyzer 接口

```typescript
// src/types/workspace.ts (新建)
export interface TechStackResult {
  languages: string[];
  frameworks: string[];
  packageManager: string;
  confidence: number;
}

export interface IWorkspaceAnalyzer {
  analyze(rootPath: string): Promise<TechStackResult>;
}

// 当前实现: FileBasedAnalyzer
export class FileBasedAnalyzer implements IWorkspaceAnalyzer {
  async analyze(rootPath: string): Promise<TechStackResult> {
    return this.detectByFiles(rootPath);
  }
}
```

### 3. IRecommender 接口

```typescript
// src/types/discovery.ts (扩展)
export interface RecommendationResult {
  score: number;
  reason: string;
  improvements: string[];
}

export interface IRecommender {
  recommend(localSkill: string, remoteSkills: RemoteSkill[]): Promise<RecommendationResult[]>;
}

// 当前实现: SimilarityRecommender
export class SimilarityRecommender implements IRecommender {
  async recommend(localSkill: string, remoteSkills: RemoteSkill[]): Promise<RecommendationResult[]> {
    return this.calculateSimilarity(localSkill, remoteSkills);
  }
}
```

### 切换机制

```typescript
// src/core/factory.ts (新建)
export class AnalyzerFactory {
  static create(useAI: boolean = false): IAnalyzer {
    if (useAI && aiEvolutionEngine.isAvailable()) {
      // return new AIAnalyzer();  // 未来实现
      console.warn('AI Analyzer not implemented, falling back to rule-based');
    }
    return new RuleBasedAnalyzer();
  }
}
```

---

## ✅ 验收标准

1. **功能完整性**: 所有模块正常工作
2. **测试覆盖**: 单元测试覆盖率 > 80%
3. **性能**: AI 调用延迟 < 5s
4. **文档**: README 和 API 文档更新完成
5. **代码质量**: 通过 lint 检查

---

## 📝 变更记录

### 2026-03-19

**已完成**:
- ✅ 移除 `summary --ai` 选项
  - **设计决策**: summary 是数据展示命令，不需要 AI
  - evolve 时 AI 已经分析了数据，summary 只需提取展示
  - 避免重复调用 AI 做无意义分析
  - 简化用户心智：所有命令 AI 使用统一为隐式（自动检测）
- ✅ 测试文档英文转换
  - 将 `tests/*.md` 所有中文提示转换为英文
  - 提升国际化友好度
- ✅ 文档冗余清理
  - 删除 `tests/06-log.md` (log 命令文档)
  - 删除 `tests/quick-reference.md` (与各命令文档重复)
  - 删除 `docs/README.md` (与 tests/README.md 重复)
  - 修复 README.md 中的文档链接

**设计原则**:
- `sa evolve` / `sa vet` - AI 是核心功能，隐式使用
- `sa summary` - 纯数据展示，不需要 AI

### 2026-03-18

**已完成**:
- ✅ AI Evolution Engine (流式输出)
- ✅ Session 提取模块 (Claude Code + OpenClaw)
- ✅ Model 配置自动检测
- ✅ 数据库格式重构 (SQLite → JSONL)
- ✅ 提交 refactor commit (3e0581a)
- ✅ Smart Recommendations 功能实现
  - AI 进化建议 (`getQuickSuggestion`)
  - skills.sh 相关技能推荐
  - `--quick` 参数跳过建议

**决策**:
- SessionAnalyzer/WorkspaceAnalyzer/Recommender 保持简单实现
- 仅预留接口，不进行 AI 改造（低优先级）
- docs/ 目录不提交到 git，保持本地文档

**未来规划**:
- `fetcher.ts` 可结合 Agent + chrome/websearch 进行智能推荐
- `security/` 漏洞检测已在改造中

---

> 文档维护: Claude Code