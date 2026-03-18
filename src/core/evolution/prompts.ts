/**
 * Evolution Prompts - AI prompt templates for skill evolution
 */

/**
 * Detect if content is primarily Chinese
 */
function isChineseContent(content: string): boolean {
  // First check frontmatter description (most reliable for skills)
  const frontmatterMatch = content.match(/^---\n[\s\S]*?\n---/);
  if (frontmatterMatch) {
    const frontmatter = frontmatterMatch[0];
    const descMatch = frontmatter.match(/description:\s*(.+)/);
    if (descMatch) {
      const desc = descMatch[1];
      const descChineseChars = (desc.match(/[\u4e00-\u9fff]/g) || []).length;
      // If description has Chinese characters, it's a Chinese skill
      if (descChineseChars > 0) {
        return true;
      }
    }
  }

  // Count Chinese characters in content
  const chineseChars = content.match(/[\u4e00-\u9fff]/g) || [];
  const totalChars = content.replace(/\s/g, '').length;
  // If more than 10% Chinese characters, consider it Chinese content
  // (lowered from 30% because skills often have lots of code/URLs)
  return chineseChars.length / totalChars > 0.1;
}

/**
 * Build evolution prompt with context
 */
export function buildEvolutionPrompt(context: {
  skillName: string;
  skillContent: string;
  soulPreferences?: {
    communicationStyle?: string;
    boundaries?: string[];
  };
  memoryRules?: Array<{ category: string; rule: string }>;
  workspaceInfo?: {
    languages?: string[];
    frameworks?: string[];
    packageManager?: string;
  };
}): string {
  const { skillName, skillContent, soulPreferences, memoryRules, workspaceInfo } = context;

  // Detect skill language
  const isChinese = isChineseContent(skillContent);

  if (isChinese) {
    // Chinese prompt for Chinese skills
    return buildChinesePrompt(skillName, skillContent, soulPreferences, memoryRules, workspaceInfo);
  } else {
    // English prompt for English skills
    return buildEnglishPrompt(skillName, skillContent, soulPreferences, memoryRules, workspaceInfo);
  }
}

/**
 * Build Chinese prompt for Chinese skills
 */
function buildChinesePrompt(
  skillName: string,
  skillContent: string,
  soulPreferences?: { communicationStyle?: string; boundaries?: string[] },
  memoryRules?: Array<{ category: string; rule: string }>,
  workspaceInfo?: { languages?: string[]; frameworks?: string[]; packageManager?: string }
): string {
  let prompt = `你是一位技能优化专家。请分析这个技能并生成进化建议。

# 语言要求（最高优先级）
⚠️ 你的thinking（思考过程）、分析内容、以及最终JSON输出中的所有文本必须全部使用中文。
⚠️ 不要使用英文，即使部分技术术语可以用英文，但解释和描述必须用中文。
⚠️ 例如：title写"启用浏览器工具实时查询"，不要写"Enable Browser Tools"。

## 技能: ${skillName}

\`\`\`markdown
${skillContent.slice(0, 8000)}
\`\`\`

`;

  // Add user preferences
  if (soulPreferences?.communicationStyle || soulPreferences?.boundaries?.length) {
    prompt += `## 用户偏好\n`;
    if (soulPreferences.communicationStyle) {
      prompt += `- 沟通风格: ${soulPreferences.communicationStyle}\n`;
    }
    if (soulPreferences.boundaries?.length) {
      prompt += `- 边界: ${soulPreferences.boundaries.slice(0, 3).join(', ')}\n`;
    }
    prompt += '\n';
  }

  // Add memory rules
  if (memoryRules?.length) {
    prompt += `## 历史学习记录\n`;
    for (const rule of memoryRules.slice(0, 5)) {
      prompt += `- [${rule.category}] ${rule.rule}\n`;
    }
    prompt += '\n';
  }

  // Add workspace info
  if (workspaceInfo?.languages?.length || workspaceInfo?.packageManager) {
    prompt += `## 工作区环境\n`;
    if (workspaceInfo.languages?.length) {
      prompt += `- 编程语言: ${workspaceInfo.languages.join(', ')}\n`;
    }
    if (workspaceInfo.packageManager) {
      prompt += `- 包管理器: ${workspaceInfo.packageManager}\n`;
    }
    prompt += '\n';
  }

  prompt += `## 任务
生成 1-3 个具体、可执行的进化建议。重点关注：
1. 针对当前工作区的环境适配
2. 注入用户偏好的风格
3. 应用历史记忆中的学习经验
4. **关键要求**: 确保技能可以使用浏览器工具 (WebSearch, WebFetch, Playwright) 获取实时信息。Agent 循环必须具备浏览器搜索能力。

## 输出格式 (仅 JSON，无需解释)
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
      "suggestedContent": "## 动态版本查询\\n\\n执行docker pull前，使用WebSearch查询最新版本...",
      "confidence": 0.9
    }
  ]
}
\`\`\`

现在请分析技能并生成建议：`;

  return prompt;
}

/**
 * Build English prompt for English skills
 */
function buildEnglishPrompt(
  skillName: string,
  skillContent: string,
  soulPreferences?: { communicationStyle?: string; boundaries?: string[] },
  memoryRules?: Array<{ category: string; rule: string }>,
  workspaceInfo?: { languages?: string[]; frameworks?: string[]; packageManager?: string }
): string {
  let prompt = `You are a skill optimization expert. Analyze this skill and generate evolution recommendations.

**IMPORTANT: Your thinking process, analysis, and all output must be in English.**

## Skill: ${skillName}

\`\`\`markdown
${skillContent.slice(0, 8000)}
\`\`\`

`;

  // Add user preferences
  if (soulPreferences?.communicationStyle || soulPreferences?.boundaries?.length) {
    prompt += `## User Preferences\n`;
    if (soulPreferences.communicationStyle) {
      prompt += `- Communication Style: ${soulPreferences.communicationStyle}\n`;
    }
    if (soulPreferences.boundaries?.length) {
      prompt += `- Boundaries: ${soulPreferences.boundaries.slice(0, 3).join(', ')}\n`;
    }
    prompt += '\n';
  }

  // Add memory rules
  if (memoryRules?.length) {
    prompt += `## Historical Learnings\n`;
    for (const rule of memoryRules.slice(0, 5)) {
      prompt += `- [${rule.category}] ${rule.rule}\n`;
    }
    prompt += '\n';
  }

  // Add workspace info
  if (workspaceInfo?.languages?.length || workspaceInfo?.packageManager) {
    prompt += `## Workspace Environment\n`;
    if (workspaceInfo.languages?.length) {
      prompt += `- Languages: ${workspaceInfo.languages.join(', ')}\n`;
    }
    if (workspaceInfo.packageManager) {
      prompt += `- Package Manager: ${workspaceInfo.packageManager}\n`;
    }
    prompt += '\n';
  }

  prompt += `## Task
Generate 1-3 specific, actionable evolution recommendations. Focus on:
1. Environment adaptation for this workspace
2. Injecting user's preferred style
3. Applying learnings from historical memory
4. **CRITICAL**: Ensure the skill can use browser tools (WebSearch, WebFetch, Playwright) for real-time information lookup. Agent loops MUST have browser search capability.

## Output Format (JSON only, no explanation)
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
\`\`\``;

  return prompt;
}

/**
 * Build summary prompt
 */
export function buildSummaryPrompt(context: {
  skillName: string;
  oldVersion: string;
  newVersion: string;
  appliedChanges: Array<{ title: string; description: string }>;
}): string {
  const { skillName, oldVersion, newVersion, appliedChanges } = context;

  // Detect if changes are in Chinese
  const changesText = appliedChanges.map(c => `${c.title} ${c.description}`).join(' ');
  const isChinese = isChineseContent(changesText);
  const languageNote = isChinese
    ? 'Respond in Chinese.'
    : 'Respond in English.';

  return `Generate a concise evolution summary (2-3 sentences). ${languageNote}

## Evolution Record
- Skill: ${skillName}
- Version: ${oldVersion} → ${newVersion}

## Applied Changes
${appliedChanges.map(c => `- ${c.title}: ${c.description}`).join('\n')}

## Output
Just the summary text, no JSON, keep it brief and friendly.`;
}

/**
 * Export the language detection function for external use
 */
export { isChineseContent };