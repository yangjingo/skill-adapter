/**
 * SA Agent Evolution Engine Test - With Streaming Visualization
 *
 * Tests the SAAgentEvolutionEngine with ora animations and real-time thinking output.
 *
 * Usage: npx ts-node tests/test-evolve-streaming.ts [skill-name]
 * Example: npx ts-node tests/test-evolve-streaming.ts docker-env
 */

import { saAgentEvolutionEngine } from '../src/core/evolution';
import { modelConfigLoader } from '../src/core/model-config-loader';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import ora, { Ora } from 'ora';

const skillName = process.argv[2] || 'docker-env';

// Find skill file
function findSkillFile(name: string): string | null {
  const searchPaths = [
    path.join(os.homedir(), '.openclaw', 'skills', name, 'SKILL.md'),
    path.join(os.homedir(), '.claude', 'commands', `${name}.md`),
    path.join(process.cwd(), 'skills', name, 'SKILL.md'),
  ];

  for (const p of searchPaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return null;
}

// Load SOUL preferences
function loadSoulPreferences(): { communicationStyle?: string; boundaries?: string[] } | undefined {
  const soulPath = path.join(os.homedir(), '.openclaw', 'SOUL.md');
  if (fs.existsSync(soulPath)) {
    const content = fs.readFileSync(soulPath, 'utf-8');
    // Extract communication style
    const styleMatch = content.match(/communication[_\s-]?style:\s*(\w+)/i);
    // Extract boundaries
    const boundariesMatch = content.match(/boundaries:\s*([\s\S]*?)(?=\n##|\n#|$)/i);

    return {
      communicationStyle: styleMatch?.[1] || 'direct',
      boundaries: boundariesMatch?.[1]?.split('\n').map(s => s.replace(/^[-*]\s*/, '').trim()).filter(Boolean) || [],
    };
  }
  return undefined;
}

// Load MEMORY rules
function loadMemoryRules(): Array<{ category: string; rule: string }> {
  const memoryPath = path.join(os.homedir(), '.openclaw', 'MEMORY.md');
  if (fs.existsSync(memoryPath)) {
    const content = fs.readFileSync(memoryPath, 'utf-8');
    const rules: Array<{ category: string; rule: string }> = [];

    // Extract error avoidance rules
    const errorMatch = content.match(/error[_\s-]?avoidance:\s*([\s\S]*?)(?=\n##|\n#|$)/i);
    if (errorMatch) {
      const items = errorMatch[1].split('\n').map(s => s.replace(/^[-*]\s*/, '').trim()).filter(Boolean);
      items.forEach(rule => rules.push({ category: 'error_avoidance', rule }));
    }

    // Extract best practices
    const bestMatch = content.match(/best[_\s-]?practices?:\s*([\s\S]*?)(?=\n##|\n#|$)/i);
    if (bestMatch) {
      const items = bestMatch[1].split('\n').map(s => s.replace(/^[-*]\s*/, '').trim()).filter(Boolean);
      items.forEach(rule => rules.push({ category: 'best_practice', rule }));
    }

    return rules;
  }
  return [];
}

// Detect workspace info
function detectWorkspaceInfo(): { languages?: string[]; frameworks?: string[]; packageManager?: string } {
  const cwd = process.cwd();
  const info: { languages?: string[]; frameworks?: string[]; packageManager?: string } = {};

  // Detect package manager
  if (fs.existsSync(path.join(cwd, 'pnpm-lock.yaml'))) {
    info.packageManager = 'pnpm';
  } else if (fs.existsSync(path.join(cwd, 'yarn.lock'))) {
    info.packageManager = 'yarn';
  } else if (fs.existsSync(path.join(cwd, 'package-lock.json'))) {
    info.packageManager = 'npm';
  }

  // Detect languages from package.json
  const pkgPath = path.join(cwd, 'package.json');
  if (fs.existsSync(pkgPath)) {
    info.languages = ['TypeScript', 'JavaScript'];

    // Detect frameworks from dependencies
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      const frameworks: string[] = [];

      if (deps['react'] || deps['next']) frameworks.push('React');
      if (deps['vue']) frameworks.push('Vue');
      if (deps['express']) frameworks.push('Express');
      if (deps['fastify']) frameworks.push('Fastify');
      if (deps['nestjs']) frameworks.push('NestJS');

      if (frameworks.length > 0) info.frameworks = frameworks;
    } catch {}
  }

  return info;
}

// Detect session patterns (simulated - would be from actual session data)
function detectSessionPatterns(): { toolUsagePatterns?: string[]; commonErrors?: string[] } {
  // In a real implementation, this would read from session database
  return {
    toolUsagePatterns: ['Bash for git operations', 'Read for config files'],
    commonErrors: ['Path resolution issues on Windows'],
  };
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║              🧬 SA Agent Evolution - Streaming Visualization Test            ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

  // Step 1: SA Agent Configuration
  let spinner = ora('Loading SA Agent model configuration...').start();
  const configResult = modelConfigLoader.load();

  if (!configResult.success) {
    spinner.fail('SA Agent model not configured!');
    console.log('\n   Run `sa config` to set up model first.\n');
    process.exit(1);
  }

  const config = configResult.config!;
  spinner.succeed('SA Agent model configured');
  console.log(`   ├─ Model: ${config.modelId}`);
  console.log(`   ├─ Endpoint: ${config.baseUrl || 'https://api.anthropic.com (default)'}`);
  console.log(`   └─ API Key: ${config.apiKey.slice(0, 10)}...${config.apiKey.slice(-4)}\n`);

  // Step 2: Load skill
  spinner = ora(`Loading skill "${skillName}"...`).start();
  const skillPath = findSkillFile(skillName);

  if (!skillPath) {
    spinner.fail(`Skill "${skillName}" not found!`);
    console.log('\n   Searched paths:');
    console.log('   - ~/.openclaw/skills/<name>/SKILL.md');
    console.log('   - ~/.claude/commands/<name>.md\n');
    process.exit(1);
  }

  const skillContent = fs.readFileSync(skillPath, 'utf-8');
  spinner.succeed(`Skill loaded: ${skillPath}`);
  console.log(`   └─ Size: ${skillContent.length} bytes\n`);

  // Step 3: Static analysis
  spinner = ora('📊 Analyzing static skill content...').start();

  // Count sections
  const sections = (skillContent.match(/^##\s/gm) || []).length;
  const codeBlocks = (skillContent.match(/```/g) || []).length / 2;
  const links = (skillContent.match(/\[.*?\]\(.*?\)/g) || []).length;

  spinner.succeed('Static analysis complete');
  console.log(`   ├─ Sections: ${sections}`);
  console.log(`   ├─ Code blocks: ${Math.floor(codeBlocks)}`);
  console.log(`   └─ Links: ${links}\n`);

  // Step 4: Dynamic context loading
  spinner = ora('📂 Loading dynamic context...').start();

  const soulPrefs = loadSoulPreferences();
  const memoryRules = loadMemoryRules();
  const workspaceInfo = detectWorkspaceInfo();
  const sessionPatterns = detectSessionPatterns();

  spinner.succeed('Dynamic context loaded');
  console.log(`   ├─ SOUL preferences: ${soulPrefs ? '✓' : '✗'}`);
  console.log(`   ├─ MEMORY rules: ${memoryRules.length} rules`);
  console.log(`   ├─ Workspace info: ${workspaceInfo.languages?.join(', ') || 'not detected'}`);
  console.log(`   └─ Session patterns: ${sessionPatterns.toolUsagePatterns?.length || 0} patterns\n`);

  // Step 5: SA Agent Evolution with streaming
  console.log('─'.repeat(60));
  console.log('🤖 SA Agent Evolution Process');
  console.log('─'.repeat(60) + '\n');

  spinner = ora('Connecting to SA Agent model...').start();

  try {
    // Collect thinking output
    let thinkingBuffer = '';
    let contentBuffer = '';

    const recommendations = await saAgentEvolutionEngine.generateRecommendations(
      {
        skillName,
        skillContent,
        soulPreferences: soulPrefs,
        memoryRules: memoryRules.length > 0 ? memoryRules : undefined,
        workspaceInfo: Object.keys(workspaceInfo).length > 0 ? workspaceInfo : undefined,
      },
      {
        onThinking: (text) => {
          if (spinner.isSpinning) {
            spinner.stop();
            console.log('\n💭 SA Agent Thinking (streaming):\n');
            console.log('─'.repeat(40));
          }
          process.stdout.write(text);
          thinkingBuffer += text;
        },
        onContent: (text) => {
          contentBuffer += text;
        },
        onComplete: () => {
          if (thinkingBuffer) {
            console.log('\n─'.repeat(40));
            console.log('\n✅ Thinking complete!\n');
          }
        },
      }
    );

    spinner.succeed(`Generated ${recommendations.length} recommendation(s)`);

    // Display recommendations
    console.log('\n' + '═'.repeat(60));
    console.log('📋 EVOLUTION RECOMMENDATIONS');
    console.log('═'.repeat(60) + '\n');

    if (recommendations.length === 0) {
      console.log('   No recommendations generated.\n');
    } else {
      for (let i = 0; i < recommendations.length; i++) {
        const rec = recommendations[i];
        const priorityEmoji = rec.priority === 'high' ? '🔴' : rec.priority === 'medium' ? '🟡' : '🟢';

        console.log(`\n${priorityEmoji} [${rec.priority.toUpperCase()}] Recommendation #${i + 1}`);
        console.log('─'.repeat(50));
        console.log(`   Title: ${rec.title}`);
        console.log(`   Type: ${rec.type}`);
        console.log(`   Confidence: ${(rec.confidence * 100).toFixed(0)}%`);
        console.log(`\n   Description:`);
        console.log(`   ${rec.description.split('\n').join('\n   ')}`);

        if (rec.suggestedContent) {
          console.log(`\n   Suggested Content:`);
          const lines = rec.suggestedContent.split('\n').slice(0, 10);
          lines.forEach(line => console.log(`   │ ${line}`));
          if (rec.suggestedContent.split('\n').length > 10) {
            console.log('   │ ... (truncated)');
          }
        }
      }
    }

    console.log('\n' + '═'.repeat(60));
    console.log('🎉 Evolution analysis complete!\n');

  } catch (error: any) {
    spinner.fail('SA Agent generation failed!');
    console.log(`\n   Error: ${error.message}\n`);
    process.exit(1);
  }
}

main().catch(console.error);