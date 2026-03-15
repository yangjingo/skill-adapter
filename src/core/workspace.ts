/**
 * Workspace - Space rule parsing and constraint management
 *
 * Parses project structure, identifies tech stack, generates workspace constraints
 */

import * as fs from 'fs';
import * as path from 'path';

export interface WorkspaceConfig {
  rootPath: string;
  techStack: TechStack;
  constraints: WorkspaceConstraint[];
  filePreferences: FilePreference[];
}

export interface TechStack {
  languages: string[];
  frameworks: string[];
  buildTools: string[];
  packageManager: string;
}

export interface WorkspaceConstraint {
  type: 'allow' | 'deny';
  pattern: string;
  description: string;
}

export interface FilePreference {
  extension: string;
  priority: 'high' | 'medium' | 'low';
  description: string;
}

export class WorkspaceAnalyzer {
  private rootPath: string;

  constructor(rootPath: string) {
    this.rootPath = rootPath;
  }

  /**
   * Analyze the workspace and generate configuration
   */
  analyze(): WorkspaceConfig {
    const techStack = this.detectTechStack();
    const constraints = this.generateConstraints(techStack);
    const filePreferences = this.generateFilePreferences(techStack);

    return {
      rootPath: this.rootPath,
      techStack,
      constraints,
      filePreferences
    };
  }

  /**
   * Detect technology stack from project files
   */
  private detectTechStack(): TechStack {
    const techStack: TechStack = {
      languages: [],
      frameworks: [],
      buildTools: [],
      packageManager: 'npm'
    };

    // Check for TypeScript
    if (this.fileExists('tsconfig.json')) {
      techStack.languages.push('TypeScript');
      techStack.buildTools.push('tsc');
    }

    // Check for JavaScript
    if (this.fileExists('package.json') && !techStack.languages.includes('TypeScript')) {
      techStack.languages.push('JavaScript');
    }

    // Check for frameworks
    if (this.fileExists('next.config.js') || this.fileExists('next.config.mjs')) {
      techStack.frameworks.push('Next.js');
    }
    if (this.fileExists('nuxt.config.js') || this.fileExists('nuxt.config.ts')) {
      techStack.frameworks.push('Nuxt');
    }
    if (this.fileExists('vue.config.js')) {
      techStack.frameworks.push('Vue');
    }
    if (this.fileExists('angular.json')) {
      techStack.frameworks.push('Angular');
    }
    if (this.dirExists('src/app') && this.fileExists('requirements.txt')) {
      techStack.frameworks.push('FastAPI');
      techStack.languages.push('Python');
    }

    // Check for package manager
    if (this.fileExists('pnpm-lock.yaml')) {
      techStack.packageManager = 'pnpm';
    } else if (this.fileExists('yarn.lock')) {
      techStack.packageManager = 'yarn';
    } else if (this.fileExists('package-lock.json')) {
      techStack.packageManager = 'npm';
    }

    // Check for Python
    if (this.fileExists('requirements.txt') || this.fileExists('pyproject.toml')) {
      techStack.languages.push('Python');
      if (this.fileExists('pyproject.toml')) {
        techStack.buildTools.push('poetry');
      }
    }

    // Check for Go
    if (this.fileExists('go.mod')) {
      techStack.languages.push('Go');
    }

    // Check for Rust
    if (this.fileExists('Cargo.toml')) {
      techStack.languages.push('Rust');
    }

    return techStack;
  }

  /**
   * Generate workspace constraints based on tech stack
   */
  private generateConstraints(techStack: TechStack): WorkspaceConstraint[] {
    const constraints: WorkspaceConstraint[] = [
      // Deny access to sensitive directories
      {
        type: 'deny',
        pattern: '**/.env*',
        description: 'Environment files contain secrets'
      },
      {
        type: 'deny',
        pattern: '**/node_modules/**',
        description: 'Dependencies should not be modified'
      },
      {
        type: 'deny',
        pattern: '**/.git/**',
        description: 'Git internal files'
      },
      // Allow source directories
      {
        type: 'allow',
        pattern: 'src/**',
        description: 'Source code directory'
      },
      {
        type: 'allow',
        pattern: 'lib/**',
        description: 'Library directory'
      },
      {
        type: 'allow',
        pattern: 'tests/**',
        description: 'Test directory'
      }
    ];

    // Add framework-specific constraints
    if (techStack.frameworks.includes('Next.js')) {
      constraints.push({
        type: 'allow',
        pattern: 'app/**',
        description: 'Next.js app router directory'
      });
      constraints.push({
        type: 'allow',
        pattern: 'pages/**',
        description: 'Next.js pages directory'
      });
    }

    return constraints;
  }

  /**
   * Generate file preferences based on tech stack
   */
  private generateFilePreferences(techStack: TechStack): FilePreference[] {
    const preferences: FilePreference[] = [];

    if (techStack.languages.includes('TypeScript')) {
      preferences.push({
        extension: '.ts',
        priority: 'high',
        description: 'TypeScript source files'
      });
      preferences.push({
        extension: '.tsx',
        priority: 'high',
        description: 'TypeScript React files'
      });
    }

    if (techStack.languages.includes('JavaScript')) {
      preferences.push({
        extension: '.js',
        priority: 'medium',
        description: 'JavaScript source files'
      });
      preferences.push({
        extension: '.jsx',
        priority: 'medium',
        description: 'JavaScript React files'
      });
    }

    if (techStack.languages.includes('Python')) {
      preferences.push({
        extension: '.py',
        priority: 'high',
        description: 'Python source files'
      });
    }

    // Test files
    preferences.push({
      extension: '.test.ts',
      priority: 'medium',
      description: 'TypeScript test files'
    });
    preferences.push({
      extension: '.spec.ts',
      priority: 'medium',
      description: 'TypeScript spec files'
    });

    return preferences;
  }

  /**
   * Check if a file exists
   */
  private fileExists(filename: string): boolean {
    return fs.existsSync(path.join(this.rootPath, filename));
  }

  /**
   * Check if a directory exists
   */
  private dirExists(dirpath: string): boolean {
    return fs.existsSync(path.join(this.rootPath, dirpath));
  }

  /**
   * Generate workspace rules as a string for Skill injection
   */
  generateWorkspaceRules(): string {
    const config = this.analyze();

    let rules = `# Workspace Rules\n\n`;
    rules += `## Root Path\n\`${config.rootPath}\`\n\n`;

    rules += `## Tech Stack\n`;
    rules += `- Languages: ${config.techStack.languages.join(', ') || 'Unknown'}\n`;
    rules += `- Frameworks: ${config.techStack.frameworks.join(', ') || 'None detected'}\n`;
    rules += `- Package Manager: ${config.techStack.packageManager}\n\n`;

    rules += `## Constraints\n`;
    for (const constraint of config.constraints) {
      const icon = constraint.type === 'allow' ? '✓' : '✗';
      rules += `- ${icon} \`${constraint.pattern}\`: ${constraint.description}\n`;
    }

    rules += `\n## File Preferences\n`;
    for (const pref of config.filePreferences) {
      rules += `- [${pref.priority}] \`${pref.extension}\`: ${pref.description}\n`;
    }

    return rules;
  }
}