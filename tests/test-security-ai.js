/**
 * Security Scan Test - Follows `sa evolve` pattern
 *
 * Usage:
 *   node tests/test-security-ai.js <skill-path>
 *
 * Example:
 *   node tests/test-security-ai.js ~/.openclaw/skills/docker-helper/SKILL.md
 *   node tests/test-security-ai.js ./skills/my-skill/SKILL.md
 */

const fs = require('fs');
const path = require('path');
const { securityEvaluator } = require('../dist/core/security/index');

// Expand ~ to home directory
function expandPath(p) {
  if (p.startsWith('~')) {
    return path.join(process.env.USERPROFILE || process.env.HOME, p.slice(1));
  }
  return path.resolve(p);
}

// Find skill file
function findSkill(skillPath) {
  const expandedPath = expandPath(skillPath);

  // Direct file path
  if (fs.existsSync(expandedPath)) {
    return {
      content: fs.readFileSync(expandedPath, 'utf-8'),
      name: path.basename(path.dirname(expandedPath)) || path.basename(expandedPath, '.md'),
      path: expandedPath
    };
  }

  // Directory path - look for SKILL.md or skill.md
  if (fs.existsSync(expandedPath)) {
    const skillMd = path.join(expandedPath, 'SKILL.md');
    const skillMdAlt = path.join(expandedPath, 'skill.md');

    if (fs.existsSync(skillMd)) {
      return {
        content: fs.readFileSync(skillMd, 'utf-8'),
        name: path.basename(expandedPath),
        path: skillMd
      };
    }
    if (fs.existsSync(skillMdAlt)) {
      return {
        content: fs.readFileSync(skillMdAlt, 'utf-8'),
        name: path.basename(expandedPath),
        path: skillMdAlt
      };
    }
  }

  // Try OpenClaw skills directory
  const openClawBase = path.join(process.env.USERPROFILE || process.env.HOME, '.openclaw', 'skills');
  const openClawPath = path.join(openClawBase, skillPath);
  if (fs.existsSync(openClawPath)) {
    const skillMd = path.join(openClawPath, 'SKILL.md');
    if (fs.existsSync(skillMd)) {
      return {
        content: fs.readFileSync(skillMd, 'utf-8'),
        name: skillPath,
        path: skillMd
      };
    }
  }

  return null;
}

async function main() {
  const skillPath = process.argv[2];

  if (!skillPath) {
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║       Security AI Scan - Skill Security Analyzer        ║');
    console.log('╚══════════════════════════════════════════════════════════╝\n');
    console.log('Usage: node tests/test-security-ai.js <skill-path>\n');
    console.log('Examples:');
    console.log('  node tests/test-security-ai.js ~/.openclaw/skills/docker-helper/SKILL.md');
    console.log('  node tests/test-security-ai.js ./skills/my-skill');
    console.log('  node tests/test-security-ai.js docker-helper  # Short name for OpenClaw skill\n');
    return;
  }

  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║       Security AI Scan - Skill Security Analyzer        ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  // ═══════════════════════════════════════════
  // STEP 1: Find Skill
  // ═══════════════════════════════════════════
  const skill = findSkill(skillPath);

  if (!skill) {
    console.log(`❌ Skill not found: ${skillPath}\n`);
    console.log('📋 Search locations:');
    console.log('   • Direct path provided');
    console.log(`   • OpenClaw: ~/.openclaw/skills/${skillPath}/SKILL.md`);
    console.log('\n📌 Try:');
    console.log('   sa info -p openclaw    # View OpenClaw skills');
    return;
  }

  console.log(`✅ Found skill: ${skill.name}`);
  console.log(`   Path: ${skill.path}\n`);

  // ═══════════════════════════════════════════
  // STEP 2: Check AI Availability
  // ═══════════════════════════════════════════
  const aiAvailable = securityEvaluator.isAIAvailable();
  const modelInfo = securityEvaluator.getModelInfo();

  console.log('📋 AI Configuration:');
  console.log(`   ├─ Model: ${modelInfo.modelId}`);
  console.log(`   └─ Status: ${aiAvailable ? '✅ Available' : '❌ Not configured'}\n`);

  // ═══════════════════════════════════════════
  // STEP 3: Execute Security Scan with AI
  // ═══════════════════════════════════════════
  console.log('═'.repeat(60));
  console.log('🔍 SECURITY SCAN IN PROGRESS');
  console.log('═'.repeat(60) + '\n');

  // Stream output handlers (matching sa evolve pattern)
  let thinkingStarted = false;
  let lineBuffer = '';

  const filterLine = (line) => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    // Skip separator-only lines
    if (/^[\u2500-\u257F\u2010-\u2015\-_=\-*#\.~\s│┌┐└┘├┤┬┴┼]+$/.test(trimmed)) return false;
    if (/^(.)\1{2,}$/.test(trimmed)) return false;
    return true;
  };

  try {
    const result = await securityEvaluator.scanWithAI(
      skill.content,
      skill.name,
      { useAI: aiAvailable },
      {
        onProgress: (msg) => console.log(`\n📋 ${msg}`),
        onThinking: (text) => {
          if (!thinkingStarted) {
            console.log('\n💭 AI 分析中:\n');
            console.log('─'.repeat(40));
            thinkingStarted = true;
          }
          // Buffer text and output only complete lines
          lineBuffer += text;
          const lines = lineBuffer.split('\n');
          lineBuffer = lines.pop() || '';
          const filteredLines = lines.filter(filterLine);
          if (filteredLines.length > 0) {
            process.stdout.write(filteredLines.join('\n') + '\n');
          }
        },
        onContent: (text) => {
          // Content also goes to buffer
          lineBuffer += text;
          const lines = lineBuffer.split('\n');
          lineBuffer = lines.pop() || '';
          const filteredLines = lines.filter(filterLine);
          if (filteredLines.length > 0) {
            process.stdout.write(filteredLines.join('\n') + '\n');
          }
        }
      }
    );

    // Output any remaining buffered content
    if (lineBuffer.trim()) {
      process.stdout.write(lineBuffer + '\n');
      lineBuffer = '';
    }
    if (thinkingStarted) {
      console.log('\n✅ AI 分析完成!\n');
    }

    // ═══════════════════════════════════════════
    // STEP 4: Display Results
    // ═══════════════════════════════════════════
    console.log('═'.repeat(60));
    console.log('📊 SECURITY SCAN RESULTS');
    console.log('═'.repeat(60) + '\n');

    console.log(`技能名称: ${result.skillName}`);
    console.log(`扫描时间: ${result.scanTimestamp.toISOString()}`);
    console.log(`整体结果: ${result.passed ? '✅ 通过' : '❌ 未通过'}`);

    console.log(`\n风险等级: ${result.riskAssessment.overallRisk.toUpperCase()}`);
    console.log(`风险评分: ${result.riskAssessment.riskScore}/100`);
    console.log(`风险摘要: ${result.riskAssessment.summary}`);

    console.log('\n--- 发现的问题 ---');
    console.log(`敏感信息: ${result.sensitiveInfoFindings.length} 个`);
    result.sensitiveInfoFindings.forEach(f => {
      console.log(`  - [${f.severity.toUpperCase()}] ${f.type}: ${f.matchedText}`);
    });

    console.log(`\n危险操作: ${result.dangerousOperationFindings.length} 个`);
    result.dangerousOperationFindings.forEach(f => {
      console.log(`  - [${f.severity.toUpperCase()}] ${f.type}: ${f.description}`);
    });

    console.log(`\n权限问题: ${result.permissionIssues.length} 个`);
    result.permissionIssues.forEach(i => {
      console.log(`  - [${i.severity.toUpperCase()}] ${i.type}: ${i.description}`);
    });

    // AI Insights
    if (result.aiInsights) {
      console.log('\n--- AI 洞察 ---');
      console.log(result.aiInsights);
    }

    if (result.aiRecommendations?.length) {
      console.log('\n--- AI 建议 ---');
      result.aiRecommendations.forEach((r, i) => console.log(`${i + 1}. ${r}`));
    }

    // ═══════════════════════════════════════════
    // STEP 5: Security Metrics (for evaluator)
    // ═══════════════════════════════════════════
    const metrics = securityEvaluator.getSecurityMetrics(result);

    console.log('\n--- 安全指标 (用于评估) ---');
    console.log(`总问题数: ${metrics.totalIssues}`);
    console.log(`高危问题: ${metrics.highSeverity}`);
    console.log(`中危问题: ${metrics.mediumSeverity}`);
    console.log(`低危问题: ${metrics.lowSeverity}`);
    console.log(`风险评分: ${metrics.riskScore}`);

    // ═══════════════════════════════════════════
    // STEP 6: Next Steps
    // ═══════════════════════════════════════════
    console.log('\n' + '═'.repeat(60));
    console.log('📌 Next Steps');
    console.log('═'.repeat(60) + '\n');

    console.log('   # Run evaluator with this skill to compare evolution');
    console.log(`   node tests/test-evaluator-ai.js ${skill.name}\n`);
    console.log('   # Or with full metrics:');
    console.log(`   node tests/test-evaluator-ai.js ${skill.name} --security\n`);

  } catch (error) {
    console.log(`\n❌ Error: ${error.message}`);
  }
}

main().catch(console.error);