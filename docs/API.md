# Skill-Adapter API 文档

## 概述

Skill-Adapter 提供完整的 API 用于集成到其他应用程序。

---

## 安装

```bash
npm install skill-adapter
```

---

## 核心模块

### 安全评估

```typescript
import { securityEvaluator, SecurityScanResult } from 'skill-adapter';

// 扫描内容
const result: SecurityScanResult = securityEvaluator.scan(
  skillContent,
  'my-skill',
  { checkSensitiveInfo: true, checkDangerousOps: true }
);

// 检查是否通过
if (result.passed) {
  console.log('Security check passed');
}

// 获取报告
const report = securityEvaluator.generateReport(result, 'markdown');
```

### 分享功能

```typescript
import { skillExporter, skillRegistry, SkillPackage } from 'skill-adapter';

// 创建 Skill 包
const skillPackage = skillExporter.createPackage(
  'my-skill',
  { systemPrompt: '# My Skill\n\n...' },
  { version: '1.0.0', description: 'My skill description' }
);

// 导出为 JSON
const jsonContent = skillExporter.exportToJson(skillPackage);

// 发布到 Registry
const result = await skillRegistry.publish(skillPackage, 'skills-sh');
```

### 发现功能

```typescript
import { platformFetcher, recommendationEngine, RemoteSkill } from 'skill-adapter';

// 获取热门 Skills
const hotSkills = await platformFetcher.fetchHot('skills-sh', 10);

// 搜索 Skills
const searchResult = await recommendationEngine.discover('code review', {
  platforms: ['skills-sh'],
  limit: 20
});

// 获取 Insight
const insight = await recommendationEngine.getInsight('frontend-design');
```

### 版本管理

```typescript
import { versionManager, VersionChange } from 'skill-adapter';

// 根据指标计算新版本
const change: VersionChange = versionManager.calculateNewVersion(
  '1.0.0',
  { tokenReduction: 15, callReduction: 10 }
);

console.log(change.newVersion);  // "1.1.0"
console.log(change.newTag);      // "v1.1.0-cost-15p"
console.log(change.changeSummary); // "Cost reduced by 15% (tokens)"
```

### Agent 检测

```typescript
import { agentDetector, AgentConfig } from 'skill-adapter';

// 检测当前平台
const platform = agentDetector.detect();
console.log(platform); // 'claude-code' | 'openclaw' | ...

// 获取配置
const result = agentDetector.getConfig();
console.log(result.detected);
console.log(result.config?.model);

// 确保已配置
const config: AgentConfig = await agentDetector.ensureConfigured();
```

---

## 数据库操作

```typescript
import { EvolutionDatabase, EvolutionRecord } from 'skill-adapter';

// 数据库默认存储在 ~/.skill-adapter/evolution.jsonl (JSONL格式)
const db = new EvolutionDatabase();

// 也可以指定自定义路径
// const db = new EvolutionDatabase('/path/to/custom.jsonl');

// 添加记录
db.addRecord({
  id: EvolutionDatabase.generateId(),
  skillName: 'my-skill',
  version: '1.0.0',
  timestamp: new Date(),
  telemetryData: JSON.stringify([]),
  patches: JSON.stringify([]),
  importSource: 'skills.sh',  // 可选: 导入来源
  skillPath: '/path/to/skill'  // 可选: 技能文件路径
});

// 获取记录
const records = db.getRecords('my-skill');
const latestVersion = db.getLatestVersion('my-skill');
const latestRecord = db.getLatestRecord('my-skill');  // 新增: 获取最新记录

// 获取所有记录
const allRecords = db.getAllRecords();
const allSkillNames = db.getAllSkillNames();  // 新增: 获取所有技能名称

// 更新记录
db.updateRecord(recordId, { skillPath: '/new/path' });

// 获取数据库路径
const dbPath = db.getDbPath();  // 新增: 获取数据库文件路径
```

---

## 类型定义

### SecurityScanResult

```typescript
interface SecurityScanResult {
  skillName: string;
  scanTimestamp: Date;
  sensitiveInfoFindings: SensitiveInfoFinding[];
  dangerousOperationFindings: DangerousOperationFinding[];
  permissionIssues: PermissionIssue[];
  riskAssessment: RiskAssessment;
  passed: boolean;
}
```

### SkillPackage

```typescript
interface SkillPackage {
  id: string;
  manifest: SkillManifest;
  content: {
    systemPrompt: string;
    patches?: SkillPatch[];
    constraints?: WorkspaceConstraint[];
  };
  metadata: {
    createdAt: Date;
    updatedAt: Date;
    securityScan?: SecurityScanResult;
    checksum?: string;
  };
  signature?: string;
}
```

### VersionChange

```typescript
interface VersionChange {
  previousVersion: string;
  newVersion: string;
  newTag: string;
  bumpType: 'major' | 'minor' | 'patch';
  evolutionType: EvolutionType;
  changeSummary: string;
}
```

---

## Registry API

### GET /api/skills

列出所有 Skills。

**参数：**
- `search` (可选): 搜索关键词
- `sort` (可选): 排序方式 (`downloads`, `name`, `updated`)
- `limit` (可选): 结果数量，默认 20
- `offset` (可选): 偏移量，默认 0

**响应：**
```json
[
  {
    "id": "skill-xxx",
    "name": "frontend-design",
    "version": "1.0.0",
    "description": "Create distinctive UIs",
    "author": "anthropics",
    "downloads": 15300,
    "keywords": ["frontend", "design"]
  }
]
```

### GET /api/skills/:name

获取 Skill 详情。

**响应：**
```json
{
  "id": "skill-xxx",
  "name": "frontend-design",
  "version": "1.0.0",
  "versions": ["1.0.0"],
  "latestVersion": "1.0.0",
  "description": "...",
  "author": "...",
  "downloads": 15300
}
```

### GET /api/skills/:name/download

下载 Skill 为 ZIP 文件。

**响应：** ZIP 文件包含：
- `skill.json` - Manifest
- `skill.md` - System Prompt
- `README.md` - 说明文档

### POST /api/skills

发布 Skill。

**请求体：**
```json
{
  "manifest": {
    "name": "my-skill",
    "version": "1.0.0",
    "description": "...",
    "author": "...",
    "keywords": [...]
  },
  "content": {
    "systemPrompt": "# My Skill\n\n..."
  },
  "metadata": {
    "checksum": "..."
  }
}
```

**响应：**
```json
{
  "id": "skill-xxx",
  "name": "my-skill",
  "version": "1.0.0",
  "published": true
}
```

### DELETE /api/skills/:name

删除 Skill。

**响应：**
```json
{
  "deleted": true,
  "name": "my-skill"
}
```