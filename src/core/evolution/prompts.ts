/**
 * Evolution Prompts - AI prompt templates for skill evolution
 */

export interface SessionEvidenceContext {
  summary: {
    scannedSessions: number;
    relevantSessions: number;
    skillMatches: number;
    keywordMatches: number;
    grepMatches: number;
    loopSignals: number;
    topKeywords: Array<{ term: string; count: number }>;
    topGrepTerms: Array<{ term: string; count: number }>;
    topErrors: Array<{ message: string; count: number }>;
    topTools: Array<{ name: string; count: number }>;
  };
  highlights: Array<{
    source: 'claude_code' | 'openclaw';
    sessionId: string;
    timestamp?: Date;
    score: number;
    reason: string;
    excerpt: string;
    matchedKeywords: string[];
    matchedGrepTerms: string[];
    loopSignals: string[];
  }>;
  loopInsights: Array<{
    label: string;
    description: string;
    frequency: number;
    sessionIds: string[];
  }>;
  keywords: string[];
  grepTerms: string[];
}

// ── Locale labels ───────────────────────────────────────────────

type Locale = 'zh' | 'en';

const L = {
  role: { zh: '你是一位技能优化专家。请分析这个技能并生成进化建议。', en: 'You are a skill optimization expert. Analyze this skill and generate evolution recommendations.' },
  langNote: { zh: `⚠️ 你的thinking（思考过程）、分析内容、以及最终JSON输出中的所有文本必须全部使用中文。\n⚠️ 不要使用英文，即使部分技术术语可以用英文，但解释和描述必须用中文。\n⚠️ 例如：title写"启用浏览器工具实时查询"，不要写"Enable Browser Tools"。`, en: '**IMPORTANT: Your thinking process, analysis, and all output must be in English.**' },
  skillHeading: { zh: '技能', en: 'Skill' },
  preferences: { zh: '用户偏好', en: 'User Preferences' },
  commStyle: { zh: '沟通风格', en: 'Communication Style' },
  boundaries: { zh: '边界', en: 'Boundaries' },
  learnings: { zh: '历史学习记录', en: 'Historical Learnings' },
  workspace: { zh: '工作区环境', en: 'Workspace Environment' },
  languages: { zh: '编程语言', en: 'Languages' },
  pkgManager: { zh: '包管理器', en: 'Package Manager' },
  task: {
    zh: `## 任务
生成 1-3 个具体、可执行的进化建议。重点关注：
1. 针对当前工作区的环境适配
2. 注入用户偏好的风格
3. 应用历史记忆中的学习经验
4. **关键要求**: 如果需要在会话中检索历史证据，只使用 bash \`grep\` / \`rg\` 这类文本搜索方式，不要依赖浏览器工具。模型应该优先分析我们提供的 session evidence。`,
    en: `## Task
Generate 1-3 specific, actionable evolution recommendations. Focus on:
1. Environment adaptation for this workspace
2. Injecting user's preferred style
3. Applying learnings from historical memory
4. **CRITICAL**: For session evidence lookup, rely on bash \`grep\` / \`rg\` text search only. Do not depend on browser tools; use the evidence we provide and refine it across loop rounds.`,
  },
  outputFormat: {
    zh: `## 输出格式 (仅 JSON，无需解释)
⚠️ 再次提醒：以下JSON中的title、description、suggestedContent都必须使用中文！

示例（参考格式，内容需根据实际分析生成）：
\`\`\`json
{
  "recommendations": [
    {
      "type": "best_practice",
      "priority": "high",
      "title": "启用浏览器工具实时查询镜像版本",
      "description": "建议在技能中添加使用浏览器工具实时查询最新镜像版本的指导，避免硬编码版本号过期。",
      "suggestedContent": "## 动态版本查询\\n\\n执行 docker pull 前，使用 bash grep / rg 检索历史会话中的版本信息...",
      "confidence": 0.9
    }
  ]
}
\`\`\`

现在请分析技能并生成建议：`,
    en: `## Output Format (JSON only, no explanation)
\`\`\`json
{
  "recommendations": [
    {
      "type": "env_adaptation" | "style_injection" | "error_avoidance" | "best_practice",
      "priority": "high" | "medium" | "low",
      "title": "Brief title",
      "description": "What to do",
      "suggestedContent": "Actual content to add to the skill file",
      "confidence": 0.8
    }
  ]
}
\`\`\``,
  },
  evidence: { zh: '会话证据', en: 'Session Evidence' },
  evidenceSummary: { zh: '摘要', en: 'Summary' },
  evidenceHighlights: { zh: '高信号片段', en: 'High-signal Highlights' },
  evidenceLoops: { zh: 'Agent Loop 线索', en: 'Agent Loop Signals' },
} as const;

// ── Language detection ──────────────────────────────────────────

export function isChineseContent(content: string): boolean {
  const frontmatterMatch = content.match(/^---\n[\s\S]*?\n---/);
  if (frontmatterMatch) {
    const frontmatter = frontmatterMatch[0];
    const descMatch = frontmatter.match(/description:\s*(.+)/);
    if (descMatch) {
      const desc = descMatch[1];
      const descChineseChars = (desc.match(/[一-鿿]/g) || []).length;
      if (descChineseChars > 0) return true;
    }
  }
  const chineseChars = content.match(/[一-鿿]/g) || [];
  const totalChars = content.replace(/\s/g, '').length;
  return chineseChars.length / totalChars > 0.1;
}

// ── Prompt builders ─────────────────────────────────────────────

function buildPrompt(
  skillName: string,
  skillContent: string,
  locale: Locale,
  soulPreferences?: { communicationStyle?: string; boundaries?: string[] },
  memoryRules?: Array<{ category: string; rule: string }>,
  workspaceInfo?: { languages?: string[]; frameworks?: string[]; packageManager?: string },
  sessionEvidence?: SessionEvidenceContext,
): string {
  const t = (key: keyof typeof L) => L[key][locale];

  let prompt = `${t('role')}

${t('langNote')}

## ${t('skillHeading')}: ${skillName}

\`\`\`markdown
${skillContent.slice(0, 8000)}
\`\`\`

`;

  // User preferences
  if (soulPreferences?.communicationStyle || soulPreferences?.boundaries?.length) {
    prompt += `## ${t('preferences')}\n`;
    if (soulPreferences.communicationStyle) {
      prompt += `- ${t('commStyle')}: ${soulPreferences.communicationStyle}\n`;
    }
    if (soulPreferences.boundaries?.length) {
      prompt += `- ${t('boundaries')}: ${soulPreferences.boundaries.slice(0, 3).join(', ')}\n`;
    }
    prompt += '\n';
  }

  // Memory rules
  if (memoryRules?.length) {
    prompt += `## ${t('learnings')}\n`;
    for (const rule of memoryRules.slice(0, 5)) {
      prompt += `- [${rule.category}] ${rule.rule}\n`;
    }
    prompt += '\n';
  }

  // Workspace info
  if (workspaceInfo?.languages?.length || workspaceInfo?.packageManager) {
    prompt += `## ${t('workspace')}\n`;
    if (workspaceInfo.languages?.length) {
      prompt += `- ${t('languages')}: ${workspaceInfo.languages.join(', ')}\n`;
    }
    if (workspaceInfo.packageManager) {
      prompt += `- ${t('pkgManager')}: ${workspaceInfo.packageManager}\n`;
    }
    prompt += '\n';
  }

  // Session evidence
  if (sessionEvidence) {
    prompt += buildSessionEvidenceSection(sessionEvidence, locale === 'zh');
  }

  prompt += `${t('task')}\n\n${t('outputFormat')}`;

  return prompt;
}

export function buildEvolutionPrompt(context: {
  skillName: string;
  skillContent: string;
  soulPreferences?: { communicationStyle?: string; boundaries?: string[] };
  memoryRules?: Array<{ category: string; rule: string }>;
  workspaceInfo?: { languages?: string[]; frameworks?: string[]; packageManager?: string };
  sessionEvidence?: SessionEvidenceContext;
}): string {
  const { skillName, skillContent, soulPreferences, memoryRules, workspaceInfo, sessionEvidence } = context;
  const locale = isChineseContent(skillContent) ? 'zh' : 'en';
  return buildPrompt(skillName, skillContent, locale, soulPreferences, memoryRules, workspaceInfo, sessionEvidence);
}

export function buildSummaryPrompt(context: {
  skillName: string;
  oldVersion: string;
  newVersion: string;
  appliedChanges: Array<{ title: string; description: string }>;
}): string {
  const { skillName, oldVersion, newVersion, appliedChanges } = context;
  const changesText = appliedChanges.map(c => `${c.title} ${c.description}`).join(' ');
  const isChinese = isChineseContent(changesText);
  const languageNote = isChinese ? 'Respond in Chinese.' : 'Respond in English.';

  return `Generate a concise evolution summary (2-3 sentences). ${languageNote}

## Evolution Record
- Skill: ${skillName}
- Version: ${oldVersion} → ${newVersion}

## Applied Changes
${appliedChanges.map(c => `- ${c.title}: ${c.description}`).join('\n')}

## Output
Just the summary text, no JSON, keep it brief and friendly.`;
}

function buildSessionEvidenceSection(sessionEvidence: SessionEvidenceContext, chinese: boolean): string {
  const locale: Locale = chinese ? 'zh' : 'en';

  let section = `## ${L.evidence[locale]}\n`;
  section += `${L.evidenceSummary[locale]}: scanned=${sessionEvidence.summary.scannedSessions}, relevant=${sessionEvidence.summary.relevantSessions}, `;
  section += `skillMatches=${sessionEvidence.summary.skillMatches}, keywordHits=${sessionEvidence.summary.keywordMatches}, `;
  section += `grepHits=${sessionEvidence.summary.grepMatches}, loopSignals=${sessionEvidence.summary.loopSignals}\n`;

  if (sessionEvidence.summary.topKeywords.length > 0) {
    section += `Keywords: ${sessionEvidence.summary.topKeywords.map(item => `${item.term}(${item.count})`).join(', ')}\n`;
  }
  if (sessionEvidence.summary.topGrepTerms.length > 0) {
    section += `Grep Terms: ${sessionEvidence.summary.topGrepTerms.map(item => `${item.term}(${item.count})`).join(', ')}\n`;
  }
  if (sessionEvidence.loopInsights.length > 0) {
    section += `${L.evidenceLoops[locale]}:\n`;
    for (const loop of sessionEvidence.loopInsights.slice(0, 5)) {
      section += `- ${loop.label}: ${loop.description} (${loop.frequency})\n`;
    }
  }
  if (sessionEvidence.highlights.length > 0) {
    section += `${L.evidenceHighlights[locale]}:\n`;
    for (const highlight of sessionEvidence.highlights.slice(0, 6)) {
      section += `- [${highlight.source}] ${highlight.reason}\n`;
      section += `  ${highlight.excerpt.slice(0, 260)}\n`;
    }
  }

  section += '\n';
  return section;
}
