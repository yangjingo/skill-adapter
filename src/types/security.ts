/**
 * Security Types - Type definitions for skill security evaluation
 *
 * Defines interfaces for sensitive information detection, dangerous operation identification,
 * permission boundary checking, and risk assessment
 */

/**
 * Source location for security findings
 */
export interface SourceLocation {
  filePath?: string;
  line?: number;
  column?: number;
  section?: string;  // For system prompts, the section name
}

/**
 * Sensitive information detection result
 */
export interface SensitiveInfoFinding {
  type: 'api_key' | 'password' | 'token' | 'secret' | 'private_key' | 'credential' | 'aws_key' | 'generic_secret';
  pattern: string;
  location: SourceLocation;
  severity: 'high' | 'medium' | 'low';
  matchedText: string;
  recommendation: string;
}

/**
 * Dangerous operation detection result
 */
export interface DangerousOperationFinding {
  type: 'file_deletion' | 'system_command' | 'network_request' | 'privilege_escalation' | 'code_execution' | 'file_modification';
  pattern: string;
  location: SourceLocation;
  severity: 'high' | 'medium' | 'low';
  description: string;
  context: string;
}

/**
 * Permission boundary issue
 */
export interface PermissionIssue {
  type: 'excessive_permission' | 'missing_constraint' | 'unsafe_pattern' | 'unrestricted_access';
  resource: string;
  currentPermission?: string;
  recommendedPermission?: string;
  severity: 'high' | 'medium' | 'low';
  description: string;
}

/**
 * Risk assessment summary
 */
export interface RiskAssessment {
  overallRisk: 'high' | 'medium' | 'low';
  riskScore: number;  // 0-100
  summary: string;
  recommendations: string[];
  breakdown: {
    sensitiveInfoRisk: number;
    dangerousOpsRisk: number;
    permissionRisk: number;
  };
}

/**
 * Security scan result
 */
export interface SecurityScanResult {
  skillName: string;
  skillVersion?: string;
  scanTimestamp: Date;
  sensitiveInfoFindings: SensitiveInfoFinding[];
  dangerousOperationFindings: DangerousOperationFinding[];
  permissionIssues: PermissionIssue[];
  riskAssessment: RiskAssessment;
  passed: boolean;
}

/**
 * Security scan options
 */
export interface SecurityScanOptions {
  checkSensitiveInfo?: boolean;
  checkDangerousOps?: boolean;
  checkPermissions?: boolean;
  customPatterns?: CustomPattern[];
  excludePatterns?: string[];
  failOnHigh?: boolean;
  failOnMedium?: boolean;
}

/**
 * Custom detection pattern
 */
export interface CustomPattern {
  name: string;
  pattern: string | RegExp;
  type: 'sensitive' | 'dangerous';
  severity: 'high' | 'medium' | 'low';
  description: string;
}

/**
 * Detection pattern definition
 */
export interface DetectionPattern {
  name: string;
  pattern: RegExp;
  type: 'sensitive' | 'dangerous';
  severity: 'high' | 'medium' | 'low';
  description: string;
  recommendation: string;
}

/**
 * Security report format options
 */
export type ReportFormat = 'text' | 'json' | 'markdown';

/**
 * Security scan history record
 */
export interface SecurityScanRecord {
  id: string;
  skillName: string;
  skillVersion: string;
  timestamp: Date;
  result: SecurityScanResult;
}