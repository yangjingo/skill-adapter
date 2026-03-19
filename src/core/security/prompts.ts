/**
 * Security Prompts - SA Agent prompt templates for security analysis
 */

/**
 * Detect if content is primarily Chinese
 */
function isChineseContent(content: string): boolean {
  const chineseChars = content.match(/[\u4e00-\u9fff]/g) || [];
  const totalChars = content.replace(/\s/g, '').length;
  return chineseChars.length / totalChars > 0.1;
}

/**
 * Build security analysis prompt - model decides output language
 */
export function buildSecurityPrompt(context: {
  skillName: string;
  skillContent: string;
  basicFindings: {
    sensitiveInfo: number;
    dangerousOps: number;
    permissions: number;
  };
}): string {
  const { skillName, skillContent, basicFindings } = context;

  return `You are a security analysis expert. Analyze the following skill for security risks.

**Output Language**: Respond in the same language as the skill content. If the skill is in Chinese, output in Chinese. If in English, output in English.

## Skill Information
- Name: ${skillName}
- Basic Scan Findings: ${basicFindings.sensitiveInfo} sensitive info issues, ${basicFindings.dangerousOps} dangerous operations, ${basicFindings.permissions} permission issues

## Skill Content
\`\`\`markdown
${skillContent.slice(0, 6000)}
\`\`\`

## Analysis Tasks
1. **Verify Basic Findings**: Confirm if basic scan findings are real risks, exclude false positives
2. **Deep Detection**: Identify security issues that regex patterns might miss
3. **Context Analysis**: Determine risk severity based on skill purpose
4. **Risk Assessment**: Provide overall risk level and improvement recommendations

## Output Format (JSON Only)
\`\`\`json
{
  "verifiedFindings": [
    {
      "type": "sensitive|dangerous|permission",
      "name": "Issue name",
      "severity": "high|medium|low",
      "line": 123,
      "description": "Issue description",
      "isFalsePositive": false,
      "context": "Related code snippet"
    }
  ],
  "newFindings": [
    {
      "type": "sensitive|dangerous|permission",
      "name": "Newly discovered issue",
      "severity": "high|medium|low",
      "line": 456,
      "description": "Issue description",
      "recommendation": "Fix recommendation"
    }
  ],
  "riskAssessment": {
    "overallRisk": "high|medium|low",
    "riskScore": 75,
    "summary": "Security risk summary",
    "breakdown": {
      "sensitiveInfoRisk": 30,
      "dangerousOpsRisk": 40,
      "permissionRisk": 10
    }
  },
  "recommendations": ["Recommendation 1", "Recommendation 2"],
  "insights": "Deep insights: Analysis conclusion..."
}
\`\`\`

Now analyze the skill and provide results:`;
}

/**
 * Build summary prompt for brief security report
 */
export function buildSecuritySummaryPrompt(context: {
  skillName: string;
  totalFindings: number;
  highSeverity: number;
  riskLevel: string;
}): string {
  const { skillName, totalFindings, highSeverity, riskLevel } = context;

  return `Generate a brief security summary (2-3 sentences). Respond in the language appropriate for the context.

## Security Scan Result
- Skill: ${skillName}
- Total Issues: ${totalFindings}
- High Severity: ${highSeverity}
- Risk Level: ${riskLevel}

## Output
Just the summary text, keep it brief and actionable.`;
}

export { isChineseContent };