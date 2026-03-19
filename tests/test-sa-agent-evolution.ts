/**
 * SA Agent Evolution Engine Test
 *
 * Tests the SAAgentEvolutionEngine recommendation generation.
 *
 * Usage: npx ts-node tests/test-sa-agent-evolution.ts
 */

import { saAgentEvolutionEngine, SAAgentRecommendation } from '../src/core/evolution';
import { modelConfigLoader } from '../src/core/model-config-loader';

// Sample skill content for testing
const SAMPLE_SKILL = `# Git Commit Helper

## Description
Help create well-formatted git commit messages following conventional commits.

## Usage
When asked to commit changes:
1. Analyze the staged changes
2. Generate a commit message in format: type(scope): description
3. Types: feat, fix, docs, style, refactor, test, chore

## Example
\`\`\`
feat(auth): add OAuth2 login support
fix(api): handle null response from user endpoint
\`\`\`
`;

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                    🧬 SA Agent Evolution Engine Test                        ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

  // Step 1: Check availability
  console.log('📋 Step 1: Checking SA Agent availability...\n');

  // Load and display model config
  const configResult = modelConfigLoader.load();
  if (!configResult.success) {
    console.log('❌ SA Agent model not configured!');
    console.log('   Run `sa config` to set up model first.\n');
    process.exit(1);
  }

  const config = configResult.config!;
  const source = configResult.source!;

  console.log('✅ SA Agent Configuration:\n');
  console.log(`   Source: ${source.type}`);
  if (source.path) {
    console.log(`   Config Path: ${source.path}`);
  }
  console.log(`   Model: ${config.modelId}`);
  console.log(`   Base URL: ${config.baseUrl || 'https://api.anthropic.com (default)'}`);
  console.log(`   API Key: ${config.apiKey.slice(0, 10)}...${config.apiKey.slice(-4)}`);
  console.log('');

  if (!saAgentEvolutionEngine.isAvailable()) {
    console.log('❌ SA Agent engine not available!\n');
    process.exit(1);
  }

  // Step 2: Display skill content
  console.log('📄 Step 2: Skill content to evolve...\n');
  console.log('─'.repeat(60));
  console.log(SAMPLE_SKILL);
  console.log('─'.repeat(60));
  console.log('');

  // Step 3: Generate recommendations
  console.log('🤖 Step 3: Generating SA Agent recommendations...\n');

  const context = {
    skillName: 'git-commit-helper',
    skillContent: SAMPLE_SKILL,
    soulPreferences: {
      communicationStyle: 'direct',
      boundaries: ['No emoji in commit messages', 'Keep it concise'],
    },
    memoryRules: [
      { category: 'error_avoidance', rule: 'Always verify staged changes before committing' },
      { category: 'best_practice', rule: 'Use conventional commits format consistently' },
    ],
    workspaceInfo: {
      languages: ['TypeScript', 'Python'],
      packageManager: 'pnpm',
    },
  };

  try {
    const recommendations = await saAgentEvolutionEngine.generateRecommendations(context);

    console.log(`✅ Generated ${recommendations.length} recommendation(s)\n`);
    console.log('─'.repeat(60));

    for (const rec of recommendations) {
      console.log(`\n📌 [${rec.priority.toUpperCase()}] ${rec.title}`);
      console.log(`   Type: ${rec.type}`);
      console.log(`   Confidence: ${(rec.confidence * 100).toFixed(0)}%`);
      console.log(`   Description: ${rec.description}`);

      if (rec.suggestedContent) {
        console.log(`   Suggested Content:\n   ${rec.suggestedContent.slice(0, 200).replace(/\n/g, '\n   ')}`);
      }
    }

    console.log('\n' + '─'.repeat(60));

    // Step 4: Generate summary
    if (recommendations.length > 0) {
      console.log('\n📝 Step 4: Generating evolution summary...\n');

      const summary = await saAgentEvolutionEngine.generateSummary({
        skillName: 'git-commit-helper',
        oldVersion: '1.0.0',
        newVersion: '1.1.0',
        appliedChanges: recommendations.slice(0, 2).map(r => ({
          title: r.title,
          description: r.description,
        })),
      });

      console.log('✅ Summary generated:\n');
      console.log(`   "${summary}"\n`);
    }

  } catch (error: any) {
    console.log('❌ SA Agent generation failed!\n');
    console.log(`   Error: ${error.message}\n`);
    process.exit(1);
  }

  console.log('🎉 All tests passed! SA Agent Evolution Engine is working correctly.\n');
}

main().catch(console.error);