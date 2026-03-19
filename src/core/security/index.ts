/**
 * Security Evaluator - Main security evaluation module
 *
 * Orchestrates security scanning by integrating patterns, validators, and reporters
 * Supports both traditional regex-based scanning and SA Agent-powered deep analysis
 */

import * as fs from 'fs';
import * as path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import ora from 'ora';
import {
  SecurityScanResult,
  SecurityScanOptions,
  SensitiveInfoFinding,
  DangerousOperationFinding,
  PermissionIssue,
  CustomPattern,
  ReportFormat,
  SecurityScanRecord,
  RiskAssessment
} from '../../types/security';
import { SecurityPatterns, securityPatterns } from './patterns';
import { PermissionValidators, permissionValidators } from './validators';
import { SecurityReporters, securityReporters } from './reporters';
import { buildSecurityPrompt, isChineseContent } from './prompts';
import { modelConfigLoader } from '../model-config-loader';

/**
 * Security metrics for evaluation
 */
export interface SecurityMetrics {
  totalIssues: number;        // Total number of issues
  highSeverity: number;       // High severity issues
  mediumSeverity: number;     // Medium severity issues
  lowSeverity: number;        // Low severity issues
  riskScore: number;          // Risk score (0-100)
}

/**
 * Skill source for scanning
 */
export interface SkillSource {
  content: string;
  filePath?: string;
  name?: string;
}

/**
 * SA Agent Security Analysis Result
 */
export interface SAAgentSecurityAnalysis {
  verifiedFindings: Array<{
    type: 'sensitive' | 'dangerous' | 'permission';
    name: string;
    severity: 'high' | 'medium' | 'low';
    line?: number;
    description: string;
    isFalsePositive: boolean;
    context?: string;
  }>;
  newFindings: Array<{
    type: 'sensitive' | 'dangerous' | 'permission';
    name: string;
    severity: 'high' | 'medium' | 'low';
    line?: number;
    description: string;
    recommendation: string;
    context?: string;
  }>;
  riskAssessment: RiskAssessment;
  recommendations: string[];
  insights: string;
}

/**
 * Stream callbacks for real-time output
 */
export interface SecurityStreamCallbacks {
  onThinking?: (text: string) => void;
  onContent?: (text: string) => void;
  onProgress?: (message: string) => void;
}

/**
 * SecurityEvaluator class - Main security evaluation interface
 */
export class SecurityEvaluator {
  private patterns: SecurityPatterns;
  private validators: PermissionValidators;
  private reporters: SecurityReporters;
  private scanHistory: SecurityScanRecord[];
  private client: Anthropic | null = null;
  private modelId: string = 'claude-sonnet-4-6';

  constructor() {
    this.patterns = securityPatterns;
    this.validators = permissionValidators;
    this.reporters = securityReporters;
    this.scanHistory = [];
    this.initClient();
  }

  /**
   * Initialize SA Agent client from model config
   */
  private initClient(): void {
    const result = modelConfigLoader.load();
    if (result.success && result.config) {
      this.client = new Anthropic({
        apiKey: result.config.apiKey,
        baseURL: result.config.baseUrl,
      });
      this.modelId = result.config.modelId;
    }
  }

  /**
   * Check if SA Agent is available
   */
  isAIAvailable(): boolean {
    return this.client !== null;
  }

  /**
   * Get model info
   */
  getModelInfo(): { modelId: string; available: boolean } {
    return {
      modelId: this.modelId,
      available: this.client !== null,
    };
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
   * SA Agent-powered security scan with streaming output
   * Combines regex-based quick scan with SA Agent deep analysis
   */
  async scanWithAI(
    skillContent: string,
    skillName: string,
    options: SecurityScanOptions & { useAI?: boolean } = {},
    callbacks?: SecurityStreamCallbacks
  ): Promise<SecurityScanResult> {
    // Step 1: Basic regex scan first
    callbacks?.onProgress?.('Running basic security scan...');
    const basicResult = this.scan(skillContent, skillName, options);
    callbacks?.onProgress?.('Basic scan complete');

    // Check if SA Agent is available and requested
    if (!options.useAI || !this.client) {
      callbacks?.onProgress?.('SA Agent not enabled, returning basic scan results');
      return basicResult;
    }

    // Step 2: SA Agent deep analysis with streaming
    callbacks?.onProgress?.('SA Agent deep analysis...');

    try {
      const agentAnalysis = await this.performAgentAnalysis(
        skillContent,
        skillName,
        basicResult,
        callbacks
      );

      callbacks?.onProgress?.('SA Agent analysis complete');

      // Step 3: Merge results
      const mergedResult = this.mergeAgentResults(basicResult, agentAnalysis, skillName);

      return mergedResult;
    } catch (error: any) {
      callbacks?.onProgress?.(`SA Agent analysis failed: ${error.message}`);
      return basicResult;
    }
  }

  /**
   * Perform SA Agent deep analysis with streaming
   */
  private async performAgentAnalysis(
    skillContent: string,
    skillName: string,
    basicResult: SecurityScanResult,
    callbacks?: SecurityStreamCallbacks
  ): Promise<SAAgentSecurityAnalysis> {
    if (!this.client) {
      throw new Error('SA Agent client not initialized');
    }

    const prompt = buildSecurityPrompt({
      skillName,
      skillContent,
      basicFindings: {
        sensitiveInfo: basicResult.sensitiveInfoFindings.length,
        dangerousOps: basicResult.dangerousOperationFindings.length,
        permissions: basicResult.permissionIssues.length
      }
    });

    // Use streaming API
    const stream = this.client.messages.stream({
      model: this.modelId,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });

    let fullText = '';

    // Process stream events
    for await (const event of await stream) {
      if (event.type === 'content_block_delta') {
        const delta = event.delta as any;
        if (delta.type === 'thinking_delta' && delta.thinking) {
          callbacks?.onThinking?.(delta.thinking);
        } else if (delta.type === 'text_delta' && delta.text) {
          fullText += delta.text;
          callbacks?.onContent?.(delta.text);
        }
      }
    }

    // Parse SA Agent response
    return this.parseAgentAnalysis(fullText);
  }

  /**
   * Parse SA Agent analysis response
   */
  private parseAgentAnalysis(text: string): SAAgentSecurityAnalysis {
    // Extract JSON from response
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1]) as SAAgentSecurityAnalysis;
      } catch {}
    }

    // Try direct JSON parse
    try {
      return JSON.parse(text) as SAAgentSecurityAnalysis;
    } catch {
      // Try to find JSON object in text
      const objectMatch = text.match(/\{[\s\S]*"riskAssessment"[\s\S]*\}/);
      if (objectMatch) {
        try {
          return JSON.parse(objectMatch[0]) as SAAgentSecurityAnalysis;
        } catch {}
      }
    }

    // Return empty analysis if parsing fails
    return {
      verifiedFindings: [],
      newFindings: [],
      riskAssessment: {
        overallRisk: 'low',
        riskScore: 0,
        summary: 'SA Agent analysis parsing failed',
        recommendations: [],
        breakdown: { sensitiveInfoRisk: 0, dangerousOpsRisk: 0, permissionRisk: 0 }
      },
      recommendations: [],
      insights: 'Failed to parse SA Agent analysis results'
    };
  }

  /**
   * Merge SA Agent analysis results with basic scan results
   */
  private mergeAgentResults(
    basicResult: SecurityScanResult,
    agentAnalysis: SAAgentSecurityAnalysis,
    skillName: string
  ): SecurityScanResult {
    // Convert SA Agent findings to standard format
    const agentSensitiveFindings: SensitiveInfoFinding[] = agentAnalysis.newFindings
      .filter(f => f.type === 'sensitive')
      .map(f => ({
        type: f.name as SensitiveInfoFinding['type'],
        pattern: f.name,
        location: { line: f.line },
        severity: f.severity,
        matchedText: f.context || '',
        recommendation: f.recommendation
      }));

    const agentDangerousFindings: DangerousOperationFinding[] = agentAnalysis.newFindings
      .filter(f => f.type === 'dangerous')
      .map(f => ({
        type: f.name as DangerousOperationFinding['type'],
        pattern: f.name,
        location: { line: f.line },
        severity: f.severity,
        description: f.description,
        context: f.context || ''
      }));

    const agentPermissionIssues: PermissionIssue[] = agentAnalysis.newFindings
      .filter(f => f.type === 'permission')
      .map(f => ({
        type: f.name as PermissionIssue['type'],
        resource: f.name,
        severity: f.severity,
        description: f.description
      }));

    // Filter out false positives from basic findings
    const falsePositiveSet = new Set(
      agentAnalysis.verifiedFindings
        .filter(f => f.isFalsePositive)
        .map(f => f.name)
    );

    const filteredSensitive = basicResult.sensitiveInfoFindings.filter(
      f => !falsePositiveSet.has(f.pattern)
    );
    const filteredDangerous = basicResult.dangerousOperationFindings.filter(
      f => !falsePositiveSet.has(f.pattern)
    );

    // Combine all findings
    const agentRiskAssessment = agentAnalysis.riskAssessment.overallRisk !== 'low' || agentAnalysis.newFindings.length > 0
      ? {
          overallRisk: agentAnalysis.riskAssessment.overallRisk,
          riskScore: agentAnalysis.riskAssessment.riskScore,
          summary: agentAnalysis.riskAssessment.summary || '',
          recommendations: agentAnalysis.riskAssessment.recommendations || agentAnalysis.recommendations || [],
          breakdown: agentAnalysis.riskAssessment.breakdown || {
            sensitiveInfoRisk: 0,
            dangerousOpsRisk: 0,
            permissionRisk: 0
          }
        }
      : basicResult.riskAssessment;

    const mergedResult: SecurityScanResult = {
      skillName,
      scanTimestamp: new Date(),
      sensitiveInfoFindings: [...filteredSensitive, ...agentSensitiveFindings],
      dangerousOperationFindings: [...filteredDangerous, ...agentDangerousFindings],
      permissionIssues: [...basicResult.permissionIssues, ...agentPermissionIssues],
      riskAssessment: agentRiskAssessment,
      passed: agentAnalysis.riskAssessment.overallRisk !== 'high' && agentAnalysis.newFindings.filter(f => f.severity === 'high').length === 0
    };

    // Add SA Agent insights to the result (store in a custom field or log)
    (mergedResult as any).aiInsights = agentAnalysis.insights;
    (mergedResult as any).aiRecommendations = agentAnalysis.recommendations;

    return mergedResult;
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
   * Extract security metrics from scan result for evaluation
   */
  getSecurityMetrics(result: SecurityScanResult): SecurityMetrics {
    const allFindings = [
      ...result.sensitiveInfoFindings,
      ...result.dangerousOperationFindings,
      ...result.permissionIssues
    ];

    return {
      totalIssues: allFindings.length,
      highSeverity: allFindings.filter(f => f.severity === 'high').length,
      mediumSeverity: allFindings.filter(f => f.severity === 'medium').length,
      lowSeverity: allFindings.filter(f => f.severity === 'low').length,
      riskScore: result.riskAssessment.riskScore
    };
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