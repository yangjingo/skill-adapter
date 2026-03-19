/**
 * SA Agent Evolution Engine Test - Real Skill
 *
 * Tests the SAAgentEvolutionEngine with a real skill.
 *
 * Usage: npx ts-node tests/test-evolve-real.ts <skill-name>
 * Example: npx ts-node tests/test-evolve-real.ts docker-env
 */

import { saAgentEvolutionEngine } from '../src/core/evolution';
import { modelConfigLoader } from '../src/core/model-config-loader';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

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

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                    🧬 SA Agent Evolution - Real Skill Test                  ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

  // Step 1: Load model config
  console.log('📋 Step 1: SA Agent Configuration...\n');
  const configResult = modelConfigLoader.load();
  if (!configResult.success) {
    console.log('❌ SA Agent model not configured!');
    process.exit(1);
  }
  const config = configResult.config!;
  console.log(`   Model: ${config.modelId}`);
  console.log(`   Base URL: ${config.baseUrl || 'default'}`);

  // Step 2: Load skill
  console.log(`\n📄 Step 2: Loading skill "${skillName}"...\n`);
  const skillPath = findSkillFile(skillName);
  if (!skillPath) {
    console.log(`❌ Skill "${skillName}" not found!`);
    console.log('   Searched paths:');
    console.log('   - ~/.openclaw/skills/<name>/SKILL.md');
    console.log('   - ~/.claude/commands/<name>.md');
    process.exit(1);
  }

  const skillContent = fs.readFileSync(skillPath, 'utf-8');
  console.log(`   Found: ${skillPath}`);
  console.log(`   Size: ${skillContent.length} bytes`);
  console.log('\n' + '─'.repeat(60));
  console.log(skillContent.slice(0, 500));
  if (skillContent.length > 500) console.log('...(truncated)');
  console.log('─'.repeat(60));

  // Step 3: Generate recommendations
  console.log(`\n🤖 Step 3: Generating SA Agent recommendations for "${skillName}"...\n`);

  try {
    const recommendations = await saAgentEvolutionEngine.generateRecommendations({
      skillName,
      skillContent,
      workspaceInfo: {
        languages: ['TypeScript', 'Python'],
        packageManager: 'pnpm',
      },
    });

    console.log(`\n✅ Generated ${recommendations.length} recommendation(s)\n`);
    console.log('─'.repeat(60));

    for (const rec of recommendations) {
      console.log(`\n📌 [${rec.priority.toUpperCase()}] ${rec.title}`);
      console.log(`   Type: ${rec.type}`);
      console.log(`   Confidence: ${(rec.confidence * 100).toFixed(0)}%`);
      console.log(`   Description: ${rec.description}`);
      if (rec.suggestedContent) {
        console.log(`   Suggested:\n   ${rec.suggestedContent.slice(0, 300).replace(/\n/g, '\n   ')}`);
      }
    }

    console.log('\n' + '─'.repeat(60));
    console.log('\n🎉 Test completed!\n');

  } catch (error: any) {
    console.log('❌ Failed!\n');
    console.log(`   Error: ${error.message}\n`);
    process.exit(1);
  }
}

main().catch(console.error);