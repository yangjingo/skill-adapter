/**
 * Evaluator AI Test - Follows `sa evolve` pattern
 *
 * Usage:
 *   node tests/test-evaluator-ai.js <skill-name> [--security]
 *
 * Example:
 *   node tests/test-evaluator-ai.js docker-helper
 *   node tests/test-evaluator-ai.js docker-helper --security
 *
 * This script simulates evolution evaluation:
 * 1. Uses mock baseline metrics (v1.0.0)
 * 2. Uses mock evolved metrics (v1.1.0)
 * 3. Optionally includes security metrics
 * 4. Shows AI-powered intelligent evaluation
 */

const { evaluator } = require('../dist/core/evaluator');
const { securityEvaluator } = require('../dist/core/security/index');
const fs = require('fs');
const path = require('path');

// Find skill content for security scan
function findSkillContent(skillName) {
  // Try OpenClaw skills directory
  const openClawBase = path.join(process.env.USERPROFILE || process.env.HOME, '.openclaw', 'skills');
  const openClawPath = path.join(openClawBase, skillName, 'SKILL.md');
  if (fs.existsSync(openClawPath)) {
    return { content: fs.readFileSync(openClawPath, 'utf-8'), path: openClawPath };
  }

  // Try Claude Code skills
  const claudeCodeBase = path.join(process.env.USERPROFILE || process.env.HOME, '.claude', 'skills');
  const claudeCodePath = path.join(claudeCodeBase, skillName, 'skill.md');
  if (fs.existsSync(claudeCodePath)) {
    return { content: fs.readFileSync(claudeCodePath, 'utf-8'), path: claudeCodePath };
  }

  return null;
}

async function main() {
  const args = process.argv.slice(2);
  const skillName = args.find(a => !a.startsWith('--')) || 'docker-helper';
  const includeSecurity = args.includes('--security');

  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║      Evaluator AI - Evolution Effect Analysis           ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  // ═══════════════════════════════════════════
  // STEP 1: Check AI Configuration
  // ═══════════════════════════════════════════
  const aiAvailable = evaluator.isAIAvailable();

  console.log('📋 AI Configuration:');
  console.log(`   └─ Status: ${aiAvailable ? '✅ Available' : '❌ Not configured'}\n`);

  // ═══════════════════════════════════════════
  // STEP 2: Prepare Metrics
  // ═══════════════════════════════════════════
  console.log('═'.repeat(60));
  console.log('📊 PREPARING METRICS');
  console.log('═'.repeat(60) + '\n');

  // Simulated baseline metrics (v1.0.0)
  const baselineMetrics = {
    avgUserRounds: 5.2,
    avgToolCalls: 12.5,
    totalTokenInput: 15000,
    totalTokenOutput: 8500,
    avgContextLoad: 12000,
    sessionCount: 100
  };

  // Simulated evolved metrics (v1.1.0) - showing improvements
  const evolvedMetrics = {
    avgUserRounds: 3.8,      // 减少 27%
    avgToolCalls: 9.2,       // 减少 26%
    totalTokenInput: 12000,  // 减少 20%
    totalTokenOutput: 6500,  // 减少 24%
    avgContextLoad: 11000,   // 减少 8%
    sessionCount: 100
  };

  console.log('基线版本 (v1.0.0):');
  console.log(`   User Rounds: ${baselineMetrics.avgUserRounds}`);
  console.log(`   Tool Calls: ${baselineMetrics.avgToolCalls}`);
  console.log(`   Tokens: ${(baselineMetrics.totalTokenInput + baselineMetrics.totalTokenOutput) / 1000}k`);

  console.log('\n进化版本 (v1.1.0):');
  console.log(`   User Rounds: ${evolvedMetrics.avgUserRounds}`);
  console.log(`   Tool Calls: ${evolvedMetrics.avgToolCalls}`);
  console.log(`   Tokens: ${(evolvedMetrics.totalTokenInput + evolvedMetrics.totalTokenOutput) / 1000}k`);

  // Security metrics (optional)
  let securityMetrics = undefined;

  if (includeSecurity) {
    console.log('\n🔍 Loading security metrics...');
    const skill = findSkillContent(skillName);

    if (skill) {
      // Baseline security (simulated as worse)
      const baselineScan = await securityEvaluator.scanWithAI(skill.content, skillName, { useAI: false });

      // Simulate evolved security (better)
      const baselineSecurityMetrics = securityEvaluator.getSecurityMetrics(baselineScan);

      // Evolved version shows improvement (simulate by reducing issues)
      const evolvedSecurity = {
        totalIssues: Math.max(0, baselineSecurityMetrics.totalIssues - Math.floor(baselineSecurityMetrics.totalIssues * 0.6)),
        highSeverity: Math.max(0, baselineSecurityMetrics.highSeverity - Math.floor(baselineSecurityMetrics.highSeverity * 0.8)),
        mediumSeverity: Math.max(0, baselineSecurityMetrics.mediumSeverity - Math.floor(baselineSecurityMetrics.mediumSeverity * 0.5)),
        lowSeverity: Math.max(0, baselineSecurityMetrics.lowSeverity - Math.floor(baselineSecurityMetrics.lowSeverity * 0.3)),
        riskScore: Math.max(0, baselineSecurityMetrics.riskScore - Math.floor(baselineSecurityMetrics.riskScore * 0.6))
      };

      securityMetrics = {
        baseline: baselineSecurityMetrics,
        evolved: evolvedSecurity
      };

      console.log(`   Baseline Issues: ${baselineSecurityMetrics.totalIssues} → Evolved: ${evolvedSecurity.totalIssues}`);
      console.log(`   Baseline Risk: ${baselineSecurityMetrics.riskScore} → Evolved: ${evolvedSecurity.riskScore}`);
    } else {
      // Use mock security metrics if skill not found
      securityMetrics = {
        baseline: {
          totalIssues: 15,
          highSeverity: 5,
          mediumSeverity: 7,
          lowSeverity: 3,
          riskScore: 72
        },
        evolved: {
          totalIssues: 6,
          highSeverity: 1,
          mediumSeverity: 3,
          lowSeverity: 2,
          riskScore: 28
        }
      };
      console.log('   Using mock security metrics (skill not found)');
    }
  }

  // ═══════════════════════════════════════════
  // STEP 3: Execute AI Evaluation
  // ═══════════════════════════════════════════
  console.log('\n' + '═'.repeat(60));
  console.log('🤖 AI EVALUATION IN PROGRESS');
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
    const result = await evaluator.evaluateWithAI(
      skillName,
      '1.0.0',
      '1.1.0',
      baselineMetrics,
      evolvedMetrics,
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
      },
      securityMetrics
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
    console.log('📊 EVALUATION RESULTS');
    console.log('═'.repeat(60) + '\n');

    console.log(`技能名称: ${result.skillName}`);
    console.log(`版本: ${result.baselineVersion} → ${result.evolvedVersion}`);

    const statusIcon = result.overallStatus === 'improved' ? '✅' :
                       result.overallStatus === 'degraded' ? '❌' : '➖';
    console.log(`整体状态: ${statusIcon} ${result.overallStatus.toUpperCase()}`);
    console.log(`评估时间: ${result.timestamp.toISOString()}`);

    // Metrics table
    console.log('\n--- 指标对比 ---');
    console.log('| 指标 | 基线 | 进化后 | 变化 | 状态 |');
    console.log('|------|------|--------|------|------|');
    result.metrics.forEach(m => {
      const icon = m.status === 'good' ? '✅' : m.status === 'bad' ? '❌' : '➖';
      const baselineStr = m.name.includes('Token') || m.name.includes('Context') || m.name.includes('Score')
        ? (m.baseline >= 1000 ? (m.baseline / 1000).toFixed(1) + 'k' : m.baseline.toFixed(1))
        : m.baseline.toFixed(1);
      const evolvedStr = m.name.includes('Token') || m.name.includes('Context') || m.name.includes('Score')
        ? (m.evolved >= 1000 ? (m.evolved / 1000).toFixed(1) + 'k' : m.evolved.toFixed(1))
        : m.evolved.toFixed(1);
      console.log(`| ${m.name} | ${baselineStr} | ${evolvedStr} | ${m.delta > 0 ? '+' : ''}${m.delta}% | ${icon} |`);
    });

    // Conclusion
    console.log('\n--- 结论 ---');
    console.log(result.conclusion);

    // AI Insights
    if (result.aiInsights) {
      console.log('\n--- AI 洞察 ---');
      console.log(result.aiInsights);
    }

    if (result.aiRecommendations?.length) {
      console.log('\n--- AI 建议 ---');
      result.aiRecommendations.forEach((r, i) => console.log(`${i + 1}. ${r}`));
    }

    // Metric Analysis
    const hasAnalysis = result.metrics.some(m => m.analysis);
    if (hasAnalysis) {
      console.log('\n--- 指标分析 ---');
      result.metrics.forEach(m => {
        if (m.analysis) {
          console.log(`\n**${m.name}**:`);
          console.log(m.analysis);
        }
      });
    }

    // ═══════════════════════════════════════════
    // STEP 5: Next Steps
    // ═══════════════════════════════════════════
    console.log('\n' + '═'.repeat(60));
    console.log('📌 Next Steps');
    console.log('═'.repeat(60) + '\n');

    console.log('   # View evolution history');
    console.log(`   sa log ${skillName}\n`);
    console.log('   # Export skill');
    console.log(`   sa export ${skillName}\n`);
    console.log('   # Apply improvements');
    console.log(`   sa evolve ${skillName} --apply\n`);

  } catch (error) {
    console.log(`\n❌ Error: ${error.message}`);
  }
}

main().catch(console.error);