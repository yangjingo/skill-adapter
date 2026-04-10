# 做 Skill-Adapter 这段时间，我对 /dream 的理解变了三次

> 先把话说清楚：这不是一篇产品对比文。这是一个开发者在写 skill-adapter 的过程中，反复理解 Claude Code /dream 的笔记。

---

## 一、起因：一个很朴素的问题

做 skill-adapter 之前，我在用 Claude Code 的 Skill 系统。技能市场上有不少好东西，但每次导入到自己的项目里，总得手动改。

比如一个 docker 技能，里面写的是 `npm install`，我的项目用的是 bun。路径写的是 `/usr/local/bin`，但我本地是 `${HOME}/.local/bin`。每次都得手动改，改完下一次换个项目又得改。

更烦的是，有些技能的行为我每次对话都要纠正。比如一个 commit 技能，总是想写很长的 commit message，我喜欢短的。每次对话第一件事就是跟它说"别写那么长"，它说好的，下个 session 又忘了。

这就是 skill-adapter 想解决的问题：**让技能能记住你的习惯，不用每次都教一遍**。

但我很快发现，"记住习惯"这件事，Claude Code 自己也在做——就是 /dream。

那 skill-adapter 和 /dream 到底是什么关系？我理解了三次，每次都不一样。

---

## 二、第一次理解：它们是同一个东西（错的）

最开始，我觉得 /dream 和 skill-adapter 是竞争关系。

Claude Code 的 auto-memory 系统：用户在对话里说"别用 mock"，这个信号会被 Claude Code 记下来，写到 memory 文件里。/dream 在后台自动整理这些记忆——删掉过期的、合并重复的、更新过时的。

skill-adapter 做的事看起来差不多：从会话日志里提取用户的修正行为，固化成本地 patch。

那不就是同一件事吗？

**不是。** 我后来发现一个关键区别：

- /dream 管的是**记忆**——"用户是谁、项目在做什么、之前做了什么决定"
- skill-adapter 管的是**技能**——"这个工具在这个环境里应该怎么用"

打一个不太恰当的比方。你去一家餐厅：

- 记忆是服务员记住你"不吃香菜"——这是偏好
- 技能进化是厨师根据你的反馈调整菜谱——这是行为

服务员记住你不吃香菜，下次不会给你加。但厨师不会因为你一次说"太咸了"就改整本菜单。需要你反复反馈，厨师才慢慢调整。skill-adapter 就是这个"反复反馈→调整菜谱"的过程。

---

## 三、第二次理解：它们是上下两层（还不够准确）

搞清楚区别之后，我把它们理解成上下两层的关系：

```
记忆层（/dream）：Agent 知道什么
技能层（skill-adapter）：Agent 怎么做
```

这个理解不算错，但太抽象了。直到我自己开始写 skill-adapter 的 session 提取逻辑，才真正理解这两个系统在实现层面的差异有多大。

### /dream 的信号提取：关键词匹配

/dream（或者说 AutoDream，内部代号 Kairos）做的事很直接：扫描会话转录文件，用关键词匹配提取信号。

我在 nano-claude 项目里找到了它的 Python 重写版本，关键词定义得非常具体：

```python
KEYWORD_PATTERNS = {
    "preference": ["不要用", "别用", "prefer", "always use", "never use"],
    "error":      ["bug", "错误", "失败", "broken", "fix", "regression"],
    "decision":   ["决定用", "我们选", "go with", "chose", "switch to"],
    "deadline":   ["截止", "deadline", "freeze", "due", "之前"],
}
```

四种信号类型，每个类型十几个关键词。匹配到之后提取上下文（前后各 5 行），跟已有的 memory 做相似度对比，决定是创建新的、更新已有的、还是合并。

这很聪明，也很克制。它不做语义理解，不调用 AI——纯字符串匹配，简单粗暴但有效。

### skill-adapter 的信号提取：三层过滤

skill-adapter 的 `sa evolve` 命令在提取信号时要复杂得多。因为我们要提取的不是"用户说了什么"，而是"用户在用什么工具的时候遇到了什么问题"。

实际代码里，session 证据提取分了三层：

```
第一层：关键词过滤
  在会话日志里搜索技能相关的关键词
  比如一个 docker 技能，搜索 "docker"、"container"、"Dockerfile"

第二层：grep 分析
  在日志里搜索命令模式
  比如 "docker-compose up"、"docker build"

第三层：agent-loop 信号
  识别 AI 自己循环重试的行为模式
  比如连续 3 次调用 docker 工具都失败了
```

每一层都会给信号打分，分数高的才进入下一轮。最终只有高价值的信号才会被用来生成进化建议。

这是我在写 skill-adapter 时踩的第一个大坑。

### 踩坑一：信号提取太激进

最初我只做了关键词过滤这一层。结果进化建议里全是噪音——用户在对话里随口提到 "docker" 一词，系统就以为这个 docker 技能需要进化了。

后来加了 grep 分析来过滤，好了一些，但还是不够。因为有些会话里确实用到了 docker 相关命令，但用户没有任何不满，不需要进化。

最终加上了 agent-loop 信号这一层。如果 AI 自己在反复重试某个操作，那才是真正有价值的信号——说明技能在这个场景下不够好，需要调整。

**教训：不是所有提到某个词的会话都跟那个技能有关。需要多层过滤，逐层提纯。**

### 踩坑二：进化建议的置信度

另一个坑是"什么建议该自动应用，什么该让用户确认"。

一开始我设了 0.5 的置信度阈值——AI 觉得有 50% 以上概率有用的建议就自动应用。结果灾难性的。它把"建议将 npm 替换为 bun"应用到了一个纯 Python 项目里。

后来把阈值调到了 0.8，并且只对特定类型的建议自动应用：

```typescript
// 只有环境适配类的高置信度建议才自动应用
if (recommendation.type === 'env_adaptation' && recommendation.confidence >= 0.8) {
  // 自动应用
}
```

其他类型的建议（style_injection、error_avoidance 等）即使置信度高，也只展示不自动应用。

**教训：自动应用任何修改之前，先想想最坏情况。50% 的正确率在有上下文的对话里还行，但在自动修改文件的场景里是灾难。**

---

## 四、第三次理解：它们处理的是同一个信号源，但关注不同层面

现在我的理解是这样的：

用户的每一次对话，都是一堆混合的信号。里面同时包含：
- "我是谁、我在做什么"（记忆信号）
- "这个工具应该怎么用才对"（技能信号）

/dream 和 skill-adapter 都在从同一堆会话日志里淘金，但它们筛的是不同大小的颗粒：

- /dream 筛粗颗粒：大的偏好、重要的决定、项目的截止日期
- skill-adapter 筛细颗粒：某个工具在某类操作中的具体行为修正

举个实际例子。假设你在对话里说了一句：

> "别再用 jest 了，我们现在用的是 vitest，测试文件放在 `src/__tests__` 目录下"

/dream 会提取：
- 创建一条 feedback 记忆："用户偏好 vitest 而不是 jest"
- 可能还会关联项目信号："测试框架已迁移"

skill-adapter 会提取：
- 如果有一个 "test-runner" 技能，标记为需要进化
- 生成建议：将测试命令从 `jest` 替换为 `vitest`
- 将测试目录从 `test/` 或 `tests/` 改为 `src/__tests__/`

同一个信号，两种不同粒度的处理。/dream 关心"是什么"，skill-adapter 关心"怎么做"。

---

## 五、/dream 的一些设计细节，我觉得很值得学

在研究 /dream 的过程中（主要看 nano-claude 的重写版和 Claude Code 的源码分析），有几个设计决策我觉得特别好，分享出来。

### 1. 触发时机：不是随时都能跑的

AutoDream 不会在用户工作时突然启动。它要满足三个条件：

- 积累了 5000+ 新 token（有内容才巩固，避免空跑）
- 用户闲置 30 分钟以上（不打扰工作）
- 距离上次巩固超过一定时间

这个设计背后的考量很朴素：**整理房间应该在主人出门之后**。

我在 skill-adapter 里没有做自动触发，只做了手动 `sa evolve`。原因是进化操作比记忆整理风险更大——它可能直接修改技能文件。所以我把决定权留给用户，等他们觉得"最近这个技能用得不太顺"的时候再手动触发。

### 2. 日期归一化：一个小细节但特别重要

/dream 做了一件很容易被忽略的事：把"昨天"、"下周一"、"周四之后"这些相对时间转成绝对日期。

```
"昨天"     → "2026-04-09"
"下周一"   → "2026-04-13"
"周四之后"  → "2026-04-16 之后"
```

这看起来是小事，但想想后果：如果用户在周一说"周四截止"，memory 里存的也是"周四截止"。到周五的时候，AI 看到这条记忆，它怎么知道是哪个周四？

绝对日期是记忆持久化的前提。相对时间只能在当前对话的上下文里理解，一旦脱离上下文就变成噪音。

### 3. 相似度判断：80% 以上就跳过

/dream 在合并记忆的时候，如果新信号和已有记忆的相似度超过 80%，直接跳过不处理。

这个阈值选得很有讲究。太高（比如 95%），会导致很多重复但表述略有不同的记忆被重复创建。太低（比如 60%），会把不同的记忆错误合并。

80% 大概是"说的是同一件事，只是用了不同的词"和"说的是不同的事"的分界线。

### 4. MEMORY.md 的 200 行硬限制

Claude Code 的 MEMORY.md 索引文件有 200 行的硬限制。这不是随意的数字——这是在 200K token 的上下文窗口里，给记忆索引分配的"预算"。

200 行索引，每行 150 字符以内，大约 30KB。在 200K token 的上下文里占 15% 左右。这个比例是有意为之的：记忆太多会挤占工作空间，太少又不够用。

这个设计理念我在 skill-adapter 里也借用了——技能文件的 system prompt 注入也有大小限制，太长的技能会拖慢整个 Agent 的响应速度。

---

## 六、skill-adapter 的双引擎：为什么 90% 是规则

skill-adapter 的架构是"90% 规则引擎 + 10% AI 引擎"。

刚看到这个比例的时候，可能觉得奇怪——都 2026 年了，为什么不用 AI？

因为我发现，绝大多数的"技能进化"根本不需要 AI 的"智慧"。

```typescript
// 进化引擎做的事情，大多数是这样的：

// 1. 路径本地化
'/usr/local/bin/node' → '${HOME}/.local/bin/node'

// 2. 包管理器适配
'npm install' → 'bun add'  // 检测到 bun.lock 就替换

// 3. 环境变量补全
// 从 .env 文件读取 DATABASE_URL，注入到技能的环境配置里

// 4. 目录结构适配
// 检测到 src/ 目录结构后，将测试目录从 tests/ 改为 src/__tests__/
```

这些操作规则清晰、输入确定、输出可预测。用 AI 反而引入不确定性——它可能"理解"错了你的目录结构，或者把不该替换的东西替换了。

AI 引擎（10%）只在需要语义理解的场景才上场。比如分析用户在对话里的隐含意图——用户说"这个技能太啰嗦了"，AI 需要理解这是要求精简 system prompt，而不是要求删功能。

### 踩坑三：AI 解析 JSON 的不稳定性

AI 引擎返回的建议需要是结构化的 JSON：

```typescript
interface SAAgentRecommendation {
  type: 'env_adaptation' | 'style_injection' | 'error_avoidance' | 'best_practice';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  suggestedContent: string;
  confidence: number;
}
```

但 AI 返回的 JSON 经常不稳定。有时包在 ```json 代码块里，有时直接输出纯 JSON，有时在 JSON 前面加一段解释文字。

我在代码里做了三级兜底：

```typescript
// 第一层：提取 ```json ``` 代码块
const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);

// 第二层：尝试直接解析
const parsed = JSON.parse(text);

// 第三层：正则提取含 "recommendations" 字段的对象
const objectMatch = text.match(/\{[\s\S]*"recommendations"[\s\S]*\}/);
```

**教训：永远不要假设 AI 的输出格式是稳定的。做多重兜底解析。**

### 踩坑四：多轮进化的收敛问题

skill-adapter 的 AI 引擎支持多轮进化（最多 4 轮）。每轮基于上一轮的结果继续优化，直到收敛。

问题是：什么叫"收敛"？

我一开始的判断标准是"两轮的建议完全一样就停"。但 AI 不太可能给出完全一样的建议——同样的输入，换个措辞就不一样了。

后来改成了 fingerprint 比对 + 评分机制：

```typescript
const fingerprint = fingerprintRecommendations(recommendations);
const score = scoreRecommendations(recommendations, minConfidence);

if (fingerprint === previousFingerprint) break;
// 或者当前轮的分数不如上一轮（开始退化），也停
```

fingerprint 不是逐字比对，而是提取建议的核心特征（type + title + confidence）生成摘要。这样不同措辞但相同含义的建议会被识别为相同。

**教训：判断 AI 是否收敛，不能看表面文字是否一致，要看语义是否稳定。**

---

## 七、Session 提取：两个系统的底层差异

这个是我花最多时间研究的部分。

### /dream 读的是什么？

/dream 读取的是 Claude Code 的会话转录文件，存储在：

```
~/.claude/projects/<project-hash>/<session-id>.jsonl
```

每行是一个 JSON 对象，记录了对话的一条消息。/dream 逐行扫描这些文件，用关键词匹配提取信号。

nano-claude 的实现里还做了一件事我很喜欢：第二轮提取时，会用第一轮提取到的关键词去关联源文件。

```python
# Round 2: Context Enrichment
# 用提取到的关键词去 grep 源码文件
# 但只做关联，不从源码中提取新信号
```

这里有个刻意的设计决策：**不扫描源码找新信号，只用源码来丰富已有信号的上下文**。因为源码里太噪了，直接从源码提取记忆会引入大量无关信息。

### skill-adapter 读的是什么？

skill-adapter 读取的也是同一批 JSONL 文件，但提取的内容完全不同。

我写的 `ClaudeCodeExtractor` 会解析每一行，提取出：

```typescript
interface ClaudeCodeExtractedSession {
  sessionId: string;
  timestamp: Date;
  toolCalls: ClaudeCodeToolCall[];     // 工具调用记录
  toolResults: ClaudeCodeToolResult[]; // 工具返回结果
  patterns: ClaudeCodePattern[];       // 识别到的行为模式
}
```

重点在 `patterns`。我用 `ClaudeCodePatternType` 枚举定义了几种模式：

```typescript
enum ClaudeCodePatternType {
  TOOL_SEQUENCE = 'tool_sequence',     // 连续的工具调用序列
  ERROR_RECOVERY = 'error_recovery',   // 错误后的恢复行为
  REPEATED_ACTION = 'repeated_action', // 重复尝试同一个操作
  USER_CORRECTION = 'user_correction', // 用户纠正了 AI 的行为
}
```

`USER_CORRECTION` 是最有价值的模式。当 AI 做了一件事，用户说"不对，应该这样做"，这就是一个进化信号。skill-adapter 会把这些修正行为提取出来，作为进化建议的输入。

### 踩坑五：JSONL 文件可能很大

Claude Code 的会话文件没有大小限制。一个长对话的 JSONL 文件可能有几十 MB。如果一次性读入内存，直接 OOM。

我改成了流式读取：

```typescript
const rl = readline.createInterface({
  input: fs.createReadStream(filePath),
  crlfDelay: Infinity,
});

for await (const line of rl) {
  // 逐行处理，不一次性加载
}
```

**教训：处理用户数据时，永远假设它可能比你预期的大几个数量级。流式处理是标配，不是优化。**

---

## 八、Patcher 的设计：改文件是件危险的事

skill-adapter 最终要修改技能文件。这是整个系统里最敏感的操作。

`SkillPatcher` 类的设计围绕一个核心原则：**所有修改必须可回滚**。

```typescript
interface SkillPatch {
  type: 'insert' | 'replace' | 'append';
  target: string;    // 修改的目标位置
  content: string;   // 新内容
  active: boolean;   // 当前是否生效
}
```

每个 patch 有三种类型：
- **insert**：在目标位置前面插入内容
- **replace**：替换目标位置的内容
- **append**：在文件末尾追加

每次应用 patch 后，系统会记录一个版本：

```typescript
interface SkillVersion {
  version: string;
  promptHash: string;  // 修改后的 prompt 的哈希
  patches: string[];   // 这个版本包含的 patch ID 列表
}
```

如果某个 patch 导致问题，可以单独回滚：

```typescript
rollbackPatch(patchId: string): boolean {
  const patch = this.patches.get(patchId);
  patch.active = false;
  // 重新应用所有仍然 active 的 patch
}
```

### 踩坑六：append 是最安全的，但也是最有局限的

一开始我只实现了 append——在技能文件末尾追加内容。最安全，不会破坏原有结构。

但很快发现，很多进化需要修改技能文件中间的某个部分（比如替换一个命令），append 做不到。

加上了 insert 和 replace 之后，新的问题来了：如果原始文件的结构变了（比如用户手动编辑了），insert 和 replace 的 target 可能找不到了。

我的处理方式是：如果 target 找不到，降级为 append。至少保证内容不丢失。

**教训：自动修改文件时，永远要有降级方案。最坏情况下，宁可追加不要替换。**

---

## 九、最后说几句

写 skill-adapter 这个项目，我对 /dream 的理解经历了三个阶段：

1. 以为是竞争关系 → 错了
2. 以为是上下层关系 → 太表面
3. 认识到它们是从同一个信号源里提取不同粒度的信息 → 这个理解目前是对的，也许以后还会变

两个系统处理的是同一个根本问题：**AI Agent 怎么从经验中学习，又不受上下文窗口的限制**。

/dream 的方案是定期整理记忆，保持精简。skill-adapter 的方案是让技能本身进化，减少重复修正的需要。

它们不是竞争，也不是简单的互补。更像是同一个问题的两种解法——一个管"记住"，一个管"会做"。

---

## 参考文献

1. [What Is Claude Code AutoDream Memory Consolidation?](https://www.mindstudio.ai/blog/what-is-claude-code-autodream-memory-consolidation-2) — MindStudio 对 AutoDream 的详细拆解
2. [grandamenium/dream-skill](https://github.com/grandamenium/dream-skill) — 开源的记忆巩固 Skill，4 阶段流程（Orient → Gather Signal → Consolidate → Prune & Index）
3. [Claude Code /Dream Explained in 6 Minutes](https://www.youtube.com/watch?v=_nzl_R7IoAU) — CLAUDE.md vs auto-memory、触发条件、基本用法
4. [Claude Code AutoDream 深度解析](https://zhuanlan.zhihu.com/p/2023374476071511253) — 知乎中文分析，Kairos/Dae 内部代号、灰度时间线
5. [nano-claude Memory System](https://github.com/yangjingo/nano-claude) — 7 层记忆架构 + 血月巩固引擎
6. [Skill-Adapter](https://github.com/yangjingo/skill-adapter) — 技能进化管理器

---

*2026-04-10，基于 skill-adapter v0.1.3 和 nano-claude 血月引擎。*
