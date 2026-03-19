/**
 * Model Connection Test
 *
 * Tests the ModelConfigLoader and verifies AI model connectivity.
 *
 * Usage: npx ts-node tests/test-model-connection.ts
 */

import { modelConfigLoader } from '../src/core/model-config-loader';

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                    🧪 Model Connection Test                                  ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

  // Step 1: Load configuration
  console.log('📋 Step 1: Loading model configuration...\n');
  const result = modelConfigLoader.load();

  if (!result.success) {
    console.log('❌ No model configuration found!\n');
    if (result.guidance) {
      console.log(result.guidance);
    }
    process.exit(1);
  }

  const config = result.config!;
  const source = result.source!;

  console.log('✅ Configuration loaded successfully!\n');
  console.log(`   Source: ${source.type}`);
  if (source.path) {
    console.log(`   Path: ${source.path}`);
  }
  if (source.details) {
    console.log(`   Details: ${source.details}`);
  }
  console.log(`   Provider: ${config.provider}`);
  console.log(`   Model: ${config.modelId}`);
  console.log(`   Base URL: ${config.baseUrl || 'https://api.anthropic.com (default)'}`);
  console.log(`   API Key: ${config.apiKey.slice(0, 10)}...${config.apiKey.slice(-4)}`);

  // Step 2: Test connection
  console.log('\n📡 Step 2: Testing model connection...\n');

  try {
    const testResult = await modelConfigLoader.testConnection();

    if (testResult.success) {
      console.log('✅ Connection successful!\n');
      console.log(`   Message: ${testResult.message}`);
      console.log(`   Model: ${testResult.model}`);
    } else {
      console.log('❌ Connection failed!\n');
      console.log(`   Error: ${testResult.message}`);
      process.exit(1);
    }
  } catch (error: any) {
    console.log('❌ Connection test failed with exception!\n');
    console.log(`   Error: ${error.message}`);
    process.exit(1);
  }

  // Step 3: Test a simple evolution-like request
  console.log('\n🤖 Step 3: Testing evolution-style request...\n');

  try {
    const client = modelConfigLoader.createClient();

    if (!client) {
      throw new Error('Failed to create client');
    }

    const response = await client.messages.create({
      model: config.modelId,
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: `You are a skill optimization expert. Given the following skill, suggest ONE improvement.

Skill: "Docker Environment Manager"
Description: A tool to manage Docker containers and images.

Respond in JSON format:
{
  "improvement": {
    "type": "env_adaptation" | "style_injection" | "error_avoidance",
    "title": "string",
    "description": "string"
  }
}`
      }]
    });

    const content = response.content[0];
    if (content.type === 'text') {
      console.log('✅ AI Response received!\n');
      console.log('─'.repeat(60));
      console.log(content.text.slice(0, 500));
      if (content.text.length > 500) {
        console.log('...(truncated)');
      }
      console.log('─'.repeat(60));
    }
  } catch (error: any) {
    console.log('❌ Evolution test failed!\n');
    console.log(`   Error: ${error.message}`);
    process.exit(1);
  }

  console.log('\n🎉 All tests passed! Model is ready for evolution operations.\n');
}

main().catch(console.error);