/**
 * Security Patterns - Detection patterns for sensitive information and dangerous operations
 *
 * Provides regex patterns for detecting security issues in skill content
 */

import {
  DetectionPattern,
  SensitiveInfoFinding,
  DangerousOperationFinding,
  CustomPattern,
  SourceLocation
} from '../../types/security';

/**
 * Predefined sensitive information patterns
 */
export const SENSITIVE_PATTERNS: DetectionPattern[] = [
  {
    name: 'api_key',
    pattern: /(?:api[_-]?key|apikey)\s*[=:]\s*['"]([a-zA-Z0-9_\-]{20,})['"]/gi,
    type: 'sensitive',
    severity: 'high',
    description: 'API key detected',
    recommendation: 'Use environment variables or secure configuration instead of hardcoding API keys'
  },
  {
    name: 'password',
    pattern: /(?:password|passwd|pwd)\s*[=:]\s*['"]([^'"]{8,})['"]/gi,
    type: 'sensitive',
    severity: 'high',
    description: 'Password detected',
    recommendation: 'Never hardcode passwords. Use secure credential management'
  },
  {
    name: 'token',
    pattern: /(?:token|auth[_-]?token|access[_-]?token|bearer)\s*[=:]\s*['"]([a-zA-Z0-9_\-\.]{20,})['"]/gi,
    type: 'sensitive',
    severity: 'high',
    description: 'Authentication token detected',
    recommendation: 'Store tokens securely and rotate them regularly'
  },
  {
    name: 'secret',
    pattern: /(?:secret|secret[_-]?key|secretkey)\s*[=:]\s*['"]([a-zA-Z0-9_\-]{16,})['"]/gi,
    type: 'sensitive',
    severity: 'high',
    description: 'Secret key detected',
    recommendation: 'Use secure secret management systems'
  },
  {
    name: 'private_key',
    pattern: /-----BEGIN\s+(?:RSA\s+|EC\s+|OPENSSH\s+)?PRIVATE\s+KEY-----/gi,
    type: 'sensitive',
    severity: 'high',
    description: 'Private key detected',
    recommendation: 'Never commit private keys. Use SSH agents or secure key storage'
  },
  {
    name: 'aws_access_key',
    pattern: /(?:AKIA|ABIA|ACCA|ASIA)[0-9A-Z]{16}/g,
    type: 'sensitive',
    severity: 'high',
    description: 'AWS access key detected',
    recommendation: 'Use IAM roles or AWS Secrets Manager instead of hardcoded keys'
  },
  {
    name: 'github_token',
    pattern: /(?:ghp_|gho_|ghu_|ghs_|ghr_)[a-zA-Z0-9]{36}/g,
    type: 'sensitive',
    severity: 'high',
    description: 'GitHub token detected',
    recommendation: 'Use GitHub Apps or OAuth tokens stored in environment variables'
  },
  {
    name: 'openai_key',
    pattern: /sk-[a-zA-Z0-9]{20,}/g,
    type: 'sensitive',
    severity: 'high',
    description: 'OpenAI API key detected',
    recommendation: 'Store OpenAI keys in environment variables or secure vaults'
  },
  {
    name: 'generic_secret',
    pattern: /(?:secret|key|token|password|credential)\s*[=:]\s*['"]([a-zA-Z0-9_\-]{16,})['"]/gi,
    type: 'sensitive',
    severity: 'medium',
    description: 'Generic secret pattern detected',
    recommendation: 'Review if this is a sensitive value that should be externalized'
  },
  {
    name: 'connection_string',
    pattern: /(?:mongodb|mysql|postgres|redis):\/\/[^:]+:[^@]+@[^\s]+/gi,
    type: 'sensitive',
    severity: 'high',
    description: 'Database connection string with credentials detected',
    recommendation: 'Use connection string templates with environment variable substitution'
  }
];

/**
 * Predefined dangerous operation patterns
 */
export const DANGEROUS_PATTERNS: DetectionPattern[] = [
  {
    name: 'file_deletion',
    pattern: /(?:rm\s+-rf|rm\s+-fr|del\s+\/s|rmdir\s+\/s|shutil\.rmtree|fs\.rm|fs\.rmdir|rimraf|removeall)/gi,
    type: 'dangerous',
    severity: 'high',
    description: 'Recursive file deletion operation detected',
    recommendation: 'Ensure file deletion operations have proper safeguards and user confirmation'
  },
  {
    name: 'system_command',
    pattern: /(?:exec\s*\(|execSync|spawn\s*\(|spawnSync|system\s*\(|subprocess\.(?:run|call|Popen)|child_process|shell\.exec|os\.system)/gi,
    type: 'dangerous',
    severity: 'high',
    description: 'System command execution detected',
    recommendation: 'Validate and sanitize all inputs. Use allowlists for permitted commands'
  },
  {
    name: 'network_request',
    pattern: /(?:fetch\s*\(|axios\.|http\.request|XMLHttpRequest|\.get\s*\(|\.post\s*\(|requests\.(?:get|post)|urllib\.request)/gi,
    type: 'dangerous',
    severity: 'medium',
    description: 'Network request detected',
    recommendation: 'Validate URLs and ensure proper error handling for network operations'
  },
  {
    name: 'privilege_escalation',
    pattern: /(?:sudo\s+|chmod\s+[0-7]{3,4}|chown\s+|setuid|setgid|runas\s+)/gi,
    type: 'dangerous',
    severity: 'high',
    description: 'Privilege escalation pattern detected',
    recommendation: 'Avoid privilege escalation. Run with minimal required permissions'
  },
  {
    name: 'code_execution',
    pattern: /(?:eval\s*\(|Function\s*\(|new\s+Function|compile\s*\(|exec\s*\(|__import__)/gi,
    type: 'dangerous',
    severity: 'high',
    description: 'Dynamic code execution detected',
    recommendation: 'Avoid eval and dynamic code execution. Use safer alternatives'
  },
  {
    name: 'file_modification',
    pattern: /(?:fs\.writeFile|fs\.appendFile|fwrite|file_put_contents|with\s+open\s*\([^)]+['"]w['"])/gi,
    type: 'dangerous',
    severity: 'medium',
    description: 'File modification operation detected',
    recommendation: 'Ensure file operations have proper path validation and user consent'
  },
  {
    name: 'process_termination',
    pattern: /(?:process\.exit|process\.kill|os\.kill|subprocess\.kill|taskkill)/gi,
    type: 'dangerous',
    severity: 'medium',
    description: 'Process termination detected',
    recommendation: 'Handle process termination gracefully with proper cleanup'
  },
  {
    name: 'env_modification',
    pattern: /(?:process\.env\[|os\.environ\[|setenv\s*\(|putenv\s*\()/gi,
    type: 'dangerous',
    severity: 'medium',
    description: 'Environment variable modification detected',
    recommendation: 'Be cautious when modifying environment variables'
  }
];

/**
 * SecurityPatterns class for pattern detection
 */
export class SecurityPatterns {
  private sensitivePatterns: Map<string, DetectionPattern>;
  private dangerousPatterns: Map<string, DetectionPattern>;
  private customPatterns: Map<string, DetectionPattern>;

  constructor() {
    this.sensitivePatterns = new Map();
    this.dangerousPatterns = new Map();
    this.customPatterns = new Map();

    // Initialize with predefined patterns
    for (const pattern of SENSITIVE_PATTERNS) {
      this.sensitivePatterns.set(pattern.name, pattern);
    }
    for (const pattern of DANGEROUS_PATTERNS) {
      this.dangerousPatterns.set(pattern.name, pattern);
    }
  }

  /**
   * Detect sensitive information in content
   */
  detectSensitiveInfo(content: string, filePath?: string): SensitiveInfoFinding[] {
    const findings: SensitiveInfoFinding[] = [];
    const lines = content.split('\n');

    // Check all patterns including custom ones
    const allPatterns = [...this.sensitivePatterns.values(), ...this.customPatterns.values()]
      .filter(p => p.type === 'sensitive');

    for (const patternDef of allPatterns) {
      const regex = new RegExp(patternDef.pattern.source, patternDef.pattern.flags);
      let match;

      while ((match = regex.exec(content)) !== null) {
        // Find line number
        const lineNumber = this.getLineNumber(content, match.index);
        const lineContent = lines[lineNumber - 1] || '';

        // Mask sensitive data in the matched text
        const maskedText = this.maskSensitiveData(match[0]);

        findings.push({
          type: patternDef.name as SensitiveInfoFinding['type'],
          pattern: patternDef.name,
          location: {
            filePath,
            line: lineNumber,
            section: this.detectSection(content, match.index)
          },
          severity: patternDef.severity,
          matchedText: maskedText,
          recommendation: patternDef.recommendation
        });
      }
    }

    return findings;
  }

  /**
   * Detect dangerous operations in content
   */
  detectDangerousOps(content: string, filePath?: string): DangerousOperationFinding[] {
    const findings: DangerousOperationFinding[] = [];
    const lines = content.split('\n');

    // Check all patterns including custom ones
    const allPatterns = [...this.dangerousPatterns.values(), ...this.customPatterns.values()]
      .filter(p => p.type === 'dangerous');

    for (const patternDef of allPatterns) {
      const regex = new RegExp(patternDef.pattern.source, patternDef.pattern.flags);
      let match;

      while ((match = regex.exec(content)) !== null) {
        const lineNumber = this.getLineNumber(content, match.index);
        const lineContent = lines[lineNumber - 1] || '';
        const context = this.getContext(lines, lineNumber - 1, 2);

        findings.push({
          type: patternDef.name as DangerousOperationFinding['type'],
          pattern: patternDef.name,
          location: {
            filePath,
            line: lineNumber,
            section: this.detectSection(content, match.index)
          },
          severity: patternDef.severity,
          description: patternDef.description,
          context: context
        });
      }
    }

    return findings;
  }

  /**
   * Add custom detection pattern
   */
  addCustomPattern(pattern: CustomPattern): void {
    const detectionPattern: DetectionPattern = {
      name: pattern.name,
      pattern: typeof pattern.pattern === 'string' ? new RegExp(pattern.pattern, 'gi') : pattern.pattern,
      type: pattern.type,
      severity: pattern.severity,
      description: pattern.description,
      recommendation: `Review and handle ${pattern.name} appropriately`
    };
    this.customPatterns.set(pattern.name, detectionPattern);
  }

  /**
   * Remove custom pattern
   */
  removeCustomPattern(name: string): boolean {
    return this.customPatterns.delete(name);
  }

  /**
   * Get all sensitive patterns
   */
  getSensitivePatterns(): DetectionPattern[] {
    return [...this.sensitivePatterns.values()];
  }

  /**
   * Get all dangerous operation patterns
   */
  getDangerousPatterns(): DetectionPattern[] {
    return [...this.dangerousPatterns.values()];
  }

  /**
   * Get all custom patterns
   */
  getCustomPatterns(): DetectionPattern[] {
    return [...this.customPatterns.values()];
  }

  /**
   * Get line number from character index
   */
  private getLineNumber(content: string, index: number): number {
    const lines = content.substring(0, index).split('\n');
    return lines.length;
  }

  /**
   * Detect section header from position
   */
  private detectSection(content: string, index: number): string | undefined {
    const beforeContent = content.substring(0, index);
    const sectionMatch = beforeContent.match(/^(#+\s+.+)$/gm);
    if (sectionMatch && sectionMatch.length > 0) {
      return sectionMatch[sectionMatch.length - 1].replace(/^#+\s+/, '');
    }
    return undefined;
  }

  /**
   * Mask sensitive data for display
   */
  private maskSensitiveData(text: string): string {
    // Keep first 4 and last 4 characters visible, mask the rest
    if (text.length <= 12) {
      return text.substring(0, 2) + '***' + text.substring(text.length - 2);
    }
    return text.substring(0, 4) + '***' + text.substring(text.length - 4);
  }

  /**
   * Get context around a line
   */
  private getContext(lines: string[], lineIndex: number, contextLines: number): string {
    const start = Math.max(0, lineIndex - contextLines);
    const end = Math.min(lines.length, lineIndex + contextLines + 1);
    return lines.slice(start, end).join('\n');
  }
}

// Singleton instance
export const securityPatterns = new SecurityPatterns();