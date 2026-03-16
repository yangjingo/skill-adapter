/**
 * Security Evaluator - Main security evaluation module
 *
 * Orchestrates security scanning by integrating patterns, validators, and reporters
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  SecurityScanResult,
  SecurityScanOptions,
  SensitiveInfoFinding,
  DangerousOperationFinding,
  PermissionIssue,
  CustomPattern,
  ReportFormat,
  SecurityScanRecord
} from '../../types/security';
import { SecurityPatterns, securityPatterns } from './patterns';
import { PermissionValidators, permissionValidators } from './validators';
import { SecurityReporters, securityReporters } from './reporters';

/**
 * Skill source for scanning
 */
export interface SkillSource {
  content: string;
  filePath?: string;
  name?: string;
}

/**
 * SecurityEvaluator class - Main security evaluation interface
 */
export class SecurityEvaluator {
  private patterns: SecurityPatterns;
  private validators: PermissionValidators;
  private reporters: SecurityReporters;
  private scanHistory: SecurityScanRecord[];

  constructor() {
    this.patterns = securityPatterns;
    this.validators = permissionValidators;
    this.reporters = securityReporters;
    this.scanHistory = [];
  }

  /**
   * Scan a skill for security issues
   */
  scan(
    skillContent: string,
    skillName: string,
    options: SecurityScanOptions = {}
  ): SecurityScanResult {
    const {
      checkSensitiveInfo = true,
      checkDangerousOps = true,
      checkPermissions = true,
      customPatterns = [],
      excludePatterns = [],
      failOnHigh = true,
      failOnMedium = false
    } = options;

    // Add custom patterns
    for (const pattern of customPatterns) {
      this.patterns.addCustomPattern(pattern);
    }

    // Perform scans
    let sensitiveInfoFindings: SensitiveInfoFinding[] = [];
    let dangerousOperationFindings: DangerousOperationFinding[] = [];
    let permissionIssues: PermissionIssue[] = [];

    if (checkSensitiveInfo) {
      sensitiveInfoFindings = this.patterns.detectSensitiveInfo(skillContent);
    }

    if (checkDangerousOps) {
      dangerousOperationFindings = this.patterns.detectDangerousOps(skillContent);
    }

    if (checkPermissions) {
      permissionIssues = this.validators.validatePermissions(skillContent);
    }

    // Filter excluded patterns
    if (excludePatterns.length > 0) {
      const excludeRegex = new RegExp(excludePatterns.join('|'), 'i');
      sensitiveInfoFindings = sensitiveInfoFindings.filter(f => !excludeRegex.test(f.pattern));
      dangerousOperationFindings = dangerousOperationFindings.filter(f => !excludeRegex.test(f.pattern));
      permissionIssues = permissionIssues.filter(i => !excludeRegex.test(i.resource));
    }

    // Calculate risk assessment
    const riskAssessment = this.reporters.calculateRiskAssessment(
      sensitiveInfoFindings,
      dangerousOperationFindings,
      permissionIssues
    );

    // Determine if passed
    let passed = true;
    if (failOnHigh && riskAssessment.overallRisk === 'high') {
      passed = false;
    }
    if (failOnMedium && (riskAssessment.overallRisk === 'high' || riskAssessment.overallRisk === 'medium')) {
      passed = false;
    }

    const result: SecurityScanResult = {
      skillName,
      scanTimestamp: new Date(),
      sensitiveInfoFindings,
      dangerousOperationFindings,
      permissionIssues,
      riskAssessment,
      passed
    };

    return result;
  }

  /**
   * Scan multiple sources
   */
  scanMultiple(
    sources: SkillSource[],
    skillName: string,
    options: SecurityScanOptions = {}
  ): SecurityScanResult {
    // Combine all findings
    const allSensitiveFindings: SensitiveInfoFinding[] = [];
    const allDangerousFindings: DangerousOperationFinding[] = [];
    const allPermissionIssues: PermissionIssue[] = [];

    for (const source of sources) {
      const content = source.content || this.readFile(source.filePath || '');
      if (!content) continue;

      const result = this.scan(content, source.name || skillName, options);
      allSensitiveFindings.push(...result.sensitiveInfoFindings);
      allDangerousFindings.push(...result.dangerousOperationFindings);
      allPermissionIssues.push(...result.permissionIssues);
    }

    // Calculate combined risk assessment
    const riskAssessment = this.reporters.calculateRiskAssessment(
      allSensitiveFindings,
      allDangerousFindings,
      allPermissionIssues
    );

    return {
      skillName,
      scanTimestamp: new Date(),
      sensitiveInfoFindings: allSensitiveFindings,
      dangerousOperationFindings: allDangerousFindings,
      permissionIssues: allPermissionIssues,
      riskAssessment,
      passed: riskAssessment.overallRisk !== 'high'
    };
  }

  /**
   * Scan a file
   */
  scanFile(
    filePath: string,
    options: SecurityScanOptions = {}
  ): SecurityScanResult {
    const content = this.readFile(filePath);
    if (!content) {
      throw new Error(`Cannot read file: ${filePath}`);
    }

    const skillName = path.basename(filePath, path.extname(filePath));
    const result = this.scan(content, skillName, options);

    // Add file path to findings
    for (const finding of result.sensitiveInfoFindings) {
      finding.location.filePath = filePath;
    }
    for (const finding of result.dangerousOperationFindings) {
      finding.location.filePath = filePath;
    }

    return result;
  }

  /**
   * Generate a formatted security report
   */
  generateReport(
    result: SecurityScanResult,
    format: ReportFormat = 'text'
  ): string {
    return this.reporters.generateReport(result, format);
  }

  /**
   * Quick check if a skill passes basic security validation
   */
  quickCheck(skillContent: string): boolean {
    const result = this.scan(skillContent, 'quick-check', {
      checkSensitiveInfo: true,
      checkDangerousOps: true,
      checkPermissions: false
    });
    return result.passed;
  }

  /**
   * Save scan result to history
   */
  saveToHistory(result: SecurityScanResult, skillVersion?: string): string {
    const id = `scan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const record: SecurityScanRecord = {
      id,
      skillName: result.skillName,
      skillVersion: skillVersion || '1.0.0',
      timestamp: new Date(),
      result
    };
    this.scanHistory.push(record);
    return id;
  }

  /**
   * Get scan history for a skill
   */
  getScanHistory(skillName?: string): SecurityScanRecord[] {
    if (skillName) {
      return this.scanHistory.filter(r => r.skillName === skillName);
    }
    return [...this.scanHistory];
  }

  /**
   * Get latest scan for a skill
   */
  getLatestScan(skillName: string): SecurityScanRecord | null {
    const history = this.getScanHistory(skillName);
    if (history.length === 0) return null;
    return history.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0];
  }

  /**
   * Export scan history
   */
  exportHistory(): string {
    return JSON.stringify(this.scanHistory, null, 2);
  }

  /**
   * Import scan history
   */
  importHistory(data: string): number {
    const records = JSON.parse(data);
    let count = 0;
    for (const record of records) {
      record.timestamp = new Date(record.timestamp);
      record.result.scanTimestamp = new Date(record.result.scanTimestamp);
      this.scanHistory.push(record);
      count++;
    }
    return count;
  }

  /**
   * Get available detection patterns
   */
  getPatterns(): {
    sensitive: Array<{ name: string; description: string; severity: string }>;
    dangerous: Array<{ name: string; description: string; severity: string }>;
  } {
    const sensitive = this.patterns.getSensitivePatterns().map(p => ({
      name: p.name,
      description: p.description,
      severity: p.severity
    }));

    const dangerous = this.patterns.getDangerousPatterns().map(p => ({
      name: p.name,
      description: p.description,
      severity: p.severity
    }));

    return { sensitive, dangerous };
  }

  /**
   * Add custom detection pattern
   */
  addPattern(pattern: CustomPattern): void {
    this.patterns.addCustomPattern(pattern);
  }

  /**
   * Remove custom pattern
   */
  removePattern(name: string): boolean {
    return this.patterns.removeCustomPattern(name);
  }

  /**
   * Read file content
   */
  private readFile(filePath: string): string | null {
    try {
      return fs.readFileSync(filePath, 'utf-8');
    } catch {
      return null;
    }
  }
}

// Singleton instance
export const securityEvaluator = new SecurityEvaluator();

// Re-export types
export * from '../../types/security';
export { SecurityPatterns } from './patterns';
export { PermissionValidators } from './validators';
export { SecurityReporters } from './reporters';