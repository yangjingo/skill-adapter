/**
 * Security Reporters - Security report generation
 *
 * Generates text, JSON, and markdown reports for security scan results
 */

import {
  SecurityScanResult,
  SensitiveInfoFinding,
  DangerousOperationFinding,
  PermissionIssue,
  RiskAssessment,
  ReportFormat
} from '../../types/security';

/**
 * SecurityReporters class for generating security reports
 */
export class SecurityReporters {
  /**
   * Generate report in specified format
   */
  generateReport(result: SecurityScanResult, format: ReportFormat = 'text'): string {
    switch (format) {
      case 'json':
        return this.generateJsonReport(result);
      case 'markdown':
        return this.generateMarkdownReport(result);
      case 'text':
      default:
        return this.generateTextReport(result);
    }
  }

  /**
   * Generate text report
   */
  generateTextReport(result: SecurityScanResult): string {
    const lines: string[] = [];

    lines.push('═'.repeat(60));
    lines.push('  SKILL SECURITY SCAN REPORT');
    lines.push('═'.repeat(60));
    lines.push('');
    lines.push(`Skill: ${result.skillName}`);
    if (result.skillVersion) {
      lines.push(`Version: ${result.skillVersion}`);
    }
    lines.push(`Scan Time: ${result.scanTimestamp.toISOString()}`);
    lines.push('');

    // Risk Assessment
    lines.push('─'.repeat(40));
    lines.push('  RISK ASSESSMENT');
    lines.push('─'.repeat(40));
    lines.push('');
    lines.push(`Overall Risk: ${this.getRiskEmoji(result.riskAssessment.overallRisk)} ${result.riskAssessment.overallRisk.toUpperCase()}`);
    lines.push(`Risk Score: ${result.riskAssessment.riskScore}/100`);
    lines.push('');
    lines.push(`Summary: ${result.riskAssessment.summary}`);
    lines.push('');

    // Sensitive Information Findings
    if (result.sensitiveInfoFindings.length > 0) {
      lines.push('─'.repeat(40));
      lines.push('  SENSITIVE INFORMATION FINDINGS');
      lines.push('─'.repeat(40));
      lines.push('');

      for (const finding of result.sensitiveInfoFindings) {
        lines.push(`  [${finding.severity.toUpperCase()}] ${finding.type}`);
        lines.push(`    Pattern: ${finding.pattern}`);
        if (finding.location.line) {
          lines.push(`    Location: Line ${finding.location.line}`);
        }
        lines.push(`    Matched: ${finding.matchedText}`);
        lines.push(`    Recommendation: ${finding.recommendation}`);
        lines.push('');
      }
    }

    // Dangerous Operation Findings
    if (result.dangerousOperationFindings.length > 0) {
      lines.push('─'.repeat(40));
      lines.push('  DANGEROUS OPERATIONS');
      lines.push('─'.repeat(40));
      lines.push('');

      for (const finding of result.dangerousOperationFindings) {
        lines.push(`  [${finding.severity.toUpperCase()}] ${finding.type}`);
        lines.push(`    Description: ${finding.description}`);
        if (finding.location.line) {
          lines.push(`    Location: Line ${finding.location.line}`);
        }
        lines.push('');
      }
    }

    // Permission Issues
    if (result.permissionIssues.length > 0) {
      lines.push('─'.repeat(40));
      lines.push('  PERMISSION ISSUES');
      lines.push('─'.repeat(40));
      lines.push('');

      for (const issue of result.permissionIssues) {
        lines.push(`  [${issue.severity.toUpperCase()}] ${issue.type}`);
        lines.push(`    Resource: ${issue.resource}`);
        lines.push(`    Description: ${issue.description}`);
        if (issue.recommendedPermission) {
          lines.push(`    Recommended: ${issue.recommendedPermission}`);
        }
        lines.push('');
      }
    }

    // Recommendations
    if (result.riskAssessment.recommendations.length > 0) {
      lines.push('─'.repeat(40));
      lines.push('  RECOMMENDATIONS');
      lines.push('─'.repeat(40));
      lines.push('');

      for (let i = 0; i < result.riskAssessment.recommendations.length; i++) {
        lines.push(`  ${i + 1}. ${result.riskAssessment.recommendations[i]}`);
      }
      lines.push('');
    }

    // Final Status
    lines.push('═'.repeat(60));
    if (result.passed) {
      lines.push('  ✓ SCAN PASSED');
    } else {
      lines.push('  ✗ SCAN FAILED - Security issues detected');
    }
    lines.push('═'.repeat(60));

    return lines.join('\n');
  }

  /**
   * Generate JSON report
   */
  generateJsonReport(result: SecurityScanResult): string {
    return JSON.stringify(result, null, 2);
  }

  /**
   * Generate Markdown report
   */
  generateMarkdownReport(result: SecurityScanResult): string {
    const lines: string[] = [];

    lines.push(`# Security Scan Report: ${result.skillName}`);
    lines.push('');
    lines.push(`**Scan Time:** ${result.scanTimestamp.toISOString()}`);
    if (result.skillVersion) {
      lines.push(`**Version:** ${result.skillVersion}`);
    }
    lines.push('');

    // Risk Assessment
    lines.push('## Risk Assessment');
    lines.push('');
    lines.push(`| Metric | Value |`);
    lines.push(`|--------|-------|`);
    lines.push(`| Overall Risk | ${this.getRiskEmoji(result.riskAssessment.overallRisk)} **${result.riskAssessment.overallRisk.toUpperCase()}** |`);
    lines.push(`| Risk Score | ${result.riskAssessment.riskScore}/100 |`);
    lines.push(`| Status | ${result.passed ? '✅ Passed' : '❌ Failed'} |`);
    lines.push('');

    lines.push(`**Summary:** ${result.riskAssessment.summary}`);
    lines.push('');

    // Risk Breakdown
    lines.push('### Risk Breakdown');
    lines.push('');
    lines.push(`| Category | Risk Score |`);
    lines.push(`|----------|------------|`);
    lines.push(`| Sensitive Info | ${result.riskAssessment.breakdown.sensitiveInfoRisk} |`);
    lines.push(`| Dangerous Ops | ${result.riskAssessment.breakdown.dangerousOpsRisk} |`);
    lines.push(`| Permissions | ${result.riskAssessment.breakdown.permissionRisk} |`);
    lines.push('');

    // Findings Summary
    lines.push('## Findings Summary');
    lines.push('');
    lines.push(`| Category | Count | High | Medium | Low |`);
    lines.push(`|----------|-------|------|--------|-----|`);

    const sensitiveBySeverity = this.groupBySeverity(result.sensitiveInfoFindings);
    const dangerousBySeverity = this.groupBySeverity(result.dangerousOperationFindings);
    const permissionBySeverity = this.groupBySeverity(result.permissionIssues);

    lines.push(`| Sensitive Info | ${result.sensitiveInfoFindings.length} | ${sensitiveBySeverity.high} | ${sensitiveBySeverity.medium} | ${sensitiveBySeverity.low} |`);
    lines.push(`| Dangerous Ops | ${result.dangerousOperationFindings.length} | ${dangerousBySeverity.high} | ${dangerousBySeverity.medium} | ${dangerousBySeverity.low} |`);
    lines.push(`| Permissions | ${result.permissionIssues.length} | ${permissionBySeverity.high} | ${permissionBySeverity.medium} | ${permissionBySeverity.low} |`);
    lines.push('');

    // Detailed Findings
    if (result.sensitiveInfoFindings.length > 0) {
      lines.push('## Sensitive Information Findings');
      lines.push('');
      for (const finding of result.sensitiveInfoFindings) {
        lines.push(`### ${this.getSeverityBadge(finding.severity)} ${finding.type}`);
        lines.push('');
        lines.push(`- **Pattern:** \`${finding.pattern}\``);
        if (finding.location.line) {
          lines.push(`- **Location:** Line ${finding.location.line}`);
        }
        lines.push(`- **Matched:** \`${finding.matchedText}\``);
        lines.push(`- **Recommendation:** ${finding.recommendation}`);
        lines.push('');
      }
    }

    if (result.dangerousOperationFindings.length > 0) {
      lines.push('## Dangerous Operations');
      lines.push('');
      lines.push(`| Severity | Type | Description | Line |`);
      lines.push(`|----------|------|-------------|------|`);
      for (const finding of result.dangerousOperationFindings) {
        lines.push(`| ${this.getSeverityBadge(finding.severity)} | ${finding.type} | ${finding.description} | ${finding.location.line || '-'} |`);
      }
      lines.push('');
    }

    if (result.permissionIssues.length > 0) {
      lines.push('## Permission Issues');
      lines.push('');
      lines.push(`| Severity | Type | Resource | Description |`);
      lines.push(`|----------|------|----------|-------------|`);
      for (const issue of result.permissionIssues) {
        lines.push(`| ${this.getSeverityBadge(issue.severity)} | ${issue.type} | ${issue.resource} | ${issue.description} |`);
      }
      lines.push('');
    }

    // Recommendations
    if (result.riskAssessment.recommendations.length > 0) {
      lines.push('## Recommendations');
      lines.push('');
      for (let i = 0; i < result.riskAssessment.recommendations.length; i++) {
        lines.push(`${i + 1}. ${result.riskAssessment.recommendations[i]}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Calculate overall risk assessment
   */
  calculateRiskAssessment(
    sensitiveFindings: SensitiveInfoFinding[],
    dangerousFindings: DangerousOperationFinding[],
    permissionIssues: PermissionIssue[]
  ): RiskAssessment {
    // Calculate individual risk scores (0-100)
    const sensitiveInfoRisk = this.calculateCategoryRisk(sensitiveFindings);
    const dangerousOpsRisk = this.calculateCategoryRisk(dangerousFindings);
    const permissionRisk = this.calculateCategoryRisk(permissionIssues);

    // Weighted overall score
    // Sensitive info and dangerous ops are weighted more heavily
    const overallScore = Math.round(
      sensitiveInfoRisk * 0.4 +
      dangerousOpsRisk * 0.4 +
      permissionRisk * 0.2
    );

    // Determine overall risk level
    let overallRisk: 'high' | 'medium' | 'low';
    if (overallScore >= 60) {
      overallRisk = 'high';
    } else if (overallScore >= 30) {
      overallRisk = 'medium';
    } else {
      overallRisk = 'low';
    }

    // Generate summary
    const summary = this.generateSummary(sensitiveFindings, dangerousFindings, permissionIssues, overallRisk);

    // Generate recommendations
    const recommendations = this.generateRecommendations(sensitiveFindings, dangerousFindings, permissionIssues);

    return {
      overallRisk,
      riskScore: overallScore,
      summary,
      recommendations,
      breakdown: {
        sensitiveInfoRisk,
        dangerousOpsRisk,
        permissionRisk
      }
    };
  }

  /**
   * Calculate risk score for a category
   */
  private calculateCategoryRisk(findings: Array<{ severity: string }>): number {
    if (findings.length === 0) return 0;

    let score = 0;
    for (const finding of findings) {
      switch (finding.severity) {
        case 'high':
          score += 30;
          break;
        case 'medium':
          score += 15;
          break;
        case 'low':
          score += 5;
          break;
      }
    }

    // Cap at 100
    return Math.min(score, 100);
  }

  /**
   * Generate summary text
   */
  private generateSummary(
    sensitiveFindings: SensitiveInfoFinding[],
    dangerousFindings: DangerousOperationFinding[],
    permissionIssues: PermissionIssue[],
    overallRisk: string
  ): string {
    const total = sensitiveFindings.length + dangerousFindings.length + permissionIssues.length;

    if (total === 0) {
      return 'No security issues detected. Skill appears safe for use.';
    }

    const highCount = [...sensitiveFindings, ...dangerousFindings, ...permissionIssues]
      .filter(f => f.severity === 'high').length;

    const parts: string[] = [];

    if (sensitiveFindings.length > 0) {
      parts.push(`${sensitiveFindings.length} sensitive information finding(s)`);
    }
    if (dangerousFindings.length > 0) {
      parts.push(`${dangerousFindings.length} dangerous operation(s)`);
    }
    if (permissionIssues.length > 0) {
      parts.push(`${permissionIssues.length} permission issue(s)`);
    }

    let summary = `Found ${total} security issue(s): ${parts.join(', ')}.`;

    if (highCount > 0) {
      summary += ` **${highCount} HIGH severity issue(s) require immediate attention.**`;
    }

    return summary;
  }

  /**
   * Generate recommendations based on findings
   */
  private generateRecommendations(
    sensitiveFindings: SensitiveInfoFinding[],
    dangerousFindings: DangerousOperationFinding[],
    permissionIssues: PermissionIssue[]
  ): string[] {
    const recommendations: string[] = [];

    // Sensitive info recommendations
    const sensitiveTypes = new Set(sensitiveFindings.map(f => f.type));
    if (sensitiveTypes.has('api_key') || sensitiveTypes.has('token')) {
      recommendations.push('Move API keys and tokens to environment variables or secure vault');
    }
    if (sensitiveTypes.has('password')) {
      recommendations.push('Remove hardcoded passwords and use secure credential management');
    }
    if (sensitiveTypes.has('private_key')) {
      recommendations.push('Remove private keys from the skill and use SSH agents or secure key storage');
    }

    // Dangerous operation recommendations
    const dangerousTypes = new Set(dangerousFindings.map(f => f.type));
    if (dangerousTypes.has('system_command')) {
      recommendations.push('Validate and sanitize inputs for system command execution');
    }
    if (dangerousTypes.has('file_deletion')) {
      recommendations.push('Add user confirmation and safeguards for file deletion operations');
    }
    if (dangerousTypes.has('code_execution')) {
      recommendations.push('Replace eval/dynamic execution with safer alternatives');
    }

    // Permission recommendations
    const permissionTypes = new Set(permissionIssues.map(i => i.type));
    if (permissionTypes.has('excessive_permission')) {
      recommendations.push('Scope file and network access to specific resources');
    }
    if (permissionTypes.has('missing_constraint')) {
      recommendations.push('Add explicit constraints for file and network operations');
    }

    // General recommendations
    if (sensitiveFindings.length + dangerousFindings.length + permissionIssues.length > 5) {
      recommendations.push('Consider a security review of this skill before deployment');
    }

    return recommendations;
  }

  /**
   * Group findings by severity
   */
  private groupBySeverity(findings: Array<{ severity: string }>): { high: number; medium: number; low: number } {
    return {
      high: findings.filter(f => f.severity === 'high').length,
      medium: findings.filter(f => f.severity === 'medium').length,
      low: findings.filter(f => f.severity === 'low').length
    };
  }

  /**
   * Get emoji for risk level
   */
  private getRiskEmoji(risk: string): string {
    switch (risk) {
      case 'high':
        return '🔴';
      case 'medium':
        return '🟡';
      case 'low':
        return '🟢';
      default:
        return '⚪';
    }
  }

  /**
   * Get severity badge for markdown
   */
  private getSeverityBadge(severity: string): string {
    switch (severity) {
      case 'high':
        return '![High](https://img.shields.io/badge/High-red)';
      case 'medium':
        return '![Medium](https://img.shields.io/badge/Medium-yellow)';
      case 'low':
        return '![Low](https://img.shields.io/badge/Low-green)';
      default:
        return severity;
    }
  }
}

// Singleton instance
export const securityReporters = new SecurityReporters();