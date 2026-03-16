/**
 * Permission Validators - Permission boundary checking for skills
 *
 * Validates skill permissions and access controls against workspace constraints
 */

import { PermissionIssue, SourceLocation } from '../../types/security';
import { WorkspaceConstraint } from '../workspace';

/**
 * Default safe patterns that skills should follow
 */
const SAFE_FILE_PATTERNS = [
  /^src\//,
  /^lib\//,
  /^tests?\//,
  /^test\//,
  /^app\//,
  /^pages\//,
  /^components\//,
  /^utils\//,
  /^helpers\//,
  /^services\//,
  /\.md$/,
  /\.json$/,
  /\.yaml$/,
  /\.yml$/,
  /\.txt$/
];

/**
 * Dangerous file patterns that should be restricted
 */
const DANGEROUS_FILE_PATTERNS = [
  /^\.env/,
  /\.pem$/,
  /\.key$/,
  /\.p12$/,
  /\.pfx$/,
  /credentials/i,
  /secrets?/i,
  /password/i,
  /^\.git\//,
  /^\.ssh\//,
  /node_modules/,
  /package-lock\.json$/,
  /yarn\.lock$/,
  /pnpm-lock\.yaml$/
];

/**
 * PermissionValidators class for checking permission boundaries
 */
export class PermissionValidators {
  /**
   * Validate permission boundaries for a skill
   */
  validatePermissions(
    skillContent: string,
    filePath?: string,
    declaredPermissions?: string[]
  ): PermissionIssue[] {
    const issues: PermissionIssue[] = [];

    // Check for excessive permissions
    const excessiveIssues = this.checkExcessivePermissions(skillContent, filePath);
    issues.push(...excessiveIssues);

    // Check for missing constraints
    const missingIssues = this.checkMissingConstraints(skillContent, filePath);
    issues.push(...missingIssues);

    // Check for unsafe patterns
    const unsafeIssues = this.checkUnsafePatterns(skillContent, filePath);
    issues.push(...unsafeIssues);

    // Check declared permissions if provided
    if (declaredPermissions) {
      const declaredIssues = this.validateDeclaredPermissions(declaredPermissions, filePath);
      issues.push(...declaredIssues);
    }

    return issues;
  }

  /**
   * Check if permissions are excessive
   */
  checkExcessivePermissions(
    content: string,
    filePath?: string
  ): PermissionIssue[] {
    const issues: PermissionIssue[] = [];

    // Check for wildcard file access
    if (content.includes('*.*') || content.includes('**/*')) {
      issues.push({
        type: 'excessive_permission',
        resource: 'files',
        currentPermission: '**/* (all files)',
        recommendedPermission: 'Specific directories (e.g., src/**, lib/**)',
        severity: 'medium',
        description: 'Wildcard file access pattern detected - may access sensitive files'
      });
    }

    // Check for unrestricted file read
    const unrestrictedReadPatterns = [
      /read.*all\s*files/i,
      /access.*all\s*files/i,
      /\.\//,
      /all\s*directories/i
    ];

    for (const pattern of unrestrictedReadPatterns) {
      if (pattern.test(content)) {
        issues.push({
          type: 'excessive_permission',
          resource: 'file system',
          currentPermission: 'Unrestricted read access',
          recommendedPermission: 'Scope to specific directories',
          severity: 'medium',
          description: 'Unrestricted file system access detected'
        });
        break;
      }
    }

    // Check for unrestricted network access
    if (content.includes('*://*') || content.includes('http://*') || content.includes('https://*')) {
      issues.push({
        type: 'excessive_permission',
        resource: 'network',
        currentPermission: '*://* (all URLs)',
        recommendedPermission: 'Specific domains (e.g., api.example.com)',
        severity: 'medium',
        description: 'Unrestricted network access detected'
      });
    }

    return issues;
  }

  /**
   * Check for missing constraints
   */
  checkMissingConstraints(
    content: string,
    filePath?: string
  ): PermissionIssue[] {
    const issues: PermissionIssue[] = [];

    // Check if skill mentions file operations but has no constraints
    const hasFileOperations = /(?:read|write|delete|create|modify)\s+(?:file|directory|folder)/i.test(content);
    const hasConstraints = /(?:constraint|restriction|allow|deny|permission)/i.test(content);

    if (hasFileOperations && !hasConstraints) {
      issues.push({
        type: 'missing_constraint',
        resource: 'file operations',
        severity: 'medium',
        description: 'Skill performs file operations but lacks explicit constraints or permissions'
      });
    }

    // Check for network operations without domain restrictions
    const hasNetworkOps = /(?:fetch|request|http|api|endpoint)/i.test(content);
    const hasDomainRestrictions = /(?:domain|host|origin|allowed\s+ur[li])/i.test(content);

    if (hasNetworkOps && !hasDomainRestrictions) {
      issues.push({
        type: 'missing_constraint',
        resource: 'network operations',
        severity: 'low',
        description: 'Skill makes network requests without explicit domain restrictions'
      });
    }

    // Check for command execution without validation
    const hasCommandExec = /(?:exec|run|execute|spawn|command)/i.test(content);
    const hasInputValidation = /(?:valid|sanitize|escape|allowlist|whitelist)/i.test(content);

    if (hasCommandExec && !hasInputValidation) {
      issues.push({
        type: 'missing_constraint',
        resource: 'command execution',
        severity: 'high',
        description: 'Skill executes commands without apparent input validation'
      });
    }

    return issues;
  }

  /**
   * Check for unsafe patterns
   */
  checkUnsafePatterns(
    content: string,
    filePath?: string
  ): PermissionIssue[] {
    const issues: PermissionIssue[] = [];

    // Check for accessing sensitive files
    for (const pattern of DANGEROUS_FILE_PATTERNS) {
      if (pattern.test(content)) {
        issues.push({
          type: 'unsafe_pattern',
          resource: 'sensitive files',
          severity: 'high',
          description: `Skill may access sensitive file pattern: ${pattern.source}`
        });
      }
    }

    // Check for user input in sensitive contexts
    const userInputInSensitive = /(?:user|input|param|arg).*\s*(?:exec|eval|system|shell)/i.test(content);
    if (userInputInSensitive) {
      issues.push({
        type: 'unsafe_pattern',
        resource: 'user input',
        severity: 'high',
        description: 'User input may be used in sensitive operations without validation'
      });
    }

    // Check for hardcoded paths
    const hardcodedPathPattern = /(?:\/home\/|\/etc\/|\/var\/|C:\\|\/root\/)/i;
    if (hardcodedPathPattern.test(content)) {
      issues.push({
        type: 'unsafe_pattern',
        resource: 'file paths',
        severity: 'medium',
        description: 'Hardcoded system paths detected - may not work across different environments'
      });
    }

    return issues;
  }

  /**
   * Validate declared permissions
   */
  validateDeclaredPermissions(
    permissions: string[],
    filePath?: string
  ): PermissionIssue[] {
    const issues: PermissionIssue[] = [];

    for (const permission of permissions) {
      // Check for overly broad permissions
      if (permission === '*' || permission === '**') {
        issues.push({
          type: 'excessive_permission',
          resource: permission,
          currentPermission: permission,
          recommendedPermission: 'Specific resources',
          severity: 'high',
          description: `Overly broad permission declared: ${permission}`
        });
      }

      // Check for dangerous file patterns in permissions
      for (const pattern of DANGEROUS_FILE_PATTERNS) {
        if (pattern.test(permission)) {
          issues.push({
            type: 'unsafe_pattern',
            resource: permission,
            severity: 'high',
            description: `Permission allows access to sensitive resource: ${permission}`
          });
        }
      }
    }

    return issues;
  }

  /**
   * Validate against workspace constraints
   */
  validateAgainstWorkspace(
    content: string,
    constraints: WorkspaceConstraint[],
    filePath?: string
  ): PermissionIssue[] {
    const issues: PermissionIssue[] = [];
    const denyConstraints = constraints.filter(c => c.type === 'deny');

    // Check if skill tries to access denied resources
    for (const constraint of denyConstraints) {
      const pattern = constraint.pattern.replace(/\*/g, '.*');
      const regex = new RegExp(pattern, 'i');

      if (regex.test(content)) {
        issues.push({
          type: 'unrestricted_access',
          resource: constraint.pattern,
          severity: 'high',
          description: `Skill may violate workspace constraint: ${constraint.description}`
        });
      }
    }

    return issues;
  }

  /**
   * Check if a file path is safe based on constraints
   */
  isPathSafe(
    path: string,
    constraints: WorkspaceConstraint[]
  ): boolean {
    const allowConstraints = constraints.filter(c => c.type === 'allow');
    const denyConstraints = constraints.filter(c => c.type === 'deny');

    // Check deny first
    for (const constraint of denyConstraints) {
      if (this.matchPattern(path, constraint.pattern)) {
        return false;
      }
    }

    // Check allow
    for (const constraint of allowConstraints) {
      if (this.matchPattern(path, constraint.pattern)) {
        return true;
      }
    }

    // Default to false if no allow pattern matches
    return false;
  }

  /**
   * Match a path against a glob pattern
   */
  private matchPattern(path: string, pattern: string): boolean {
    const regexPattern = pattern
      .replace(/\*\*/g, '.*')
      .replace(/\*/g, '[^/]*')
      .replace(/\./g, '\\.');
    const regex = new RegExp(`^${regexPattern}$`, 'i');
    return regex.test(path);
  }
}

// Singleton instance
export const permissionValidators = new PermissionValidators();