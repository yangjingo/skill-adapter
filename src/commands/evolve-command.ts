import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';

import { maskApiKey } from '../utils/helpers';

import {
  EvolutionDatabase,
  EvolutionRecord,
  EvolutionRecommendation,
  SAAgentRecommendation,
  WorkspaceAnalyzer,
  configManager,
  evolutionEngine,
  modelConfigLoader,
  saAgentEvolutionEngine,
} from '../index';
import {
  analyzeSkillStaticContent,
  loadTrackedSkill,
  summarizeRecommendationPriorities,
} from '../core/evolution/cli-helpers';
import type { SessionEvidenceBundle } from '../core/session/types';

type EvolutionContext = Awaited<ReturnType<typeof evolutionEngine.buildEvolutionContext>>;
type Recommendation = EvolutionRecommendation | SAAgentRecommendation;

interface EvolutionReporter {
  isLive: boolean;
  phase: (phase: string, detail?: string) => void;
  log: (line: string) => void;
  thinking: (chunk: string) => void;
  recommendSummary: (text: string) => void;
  applySummary: (text: string) => void;
  fail: (message: string) => void;
  finish: () => void;
  stop: () => Promise<void>;
}

const DEFAULT_SKILL_VERSION = '1.1.0';

export function registerEvolveCommand(program: Command): void {
  program
    .command('evolve <skillName>')
    .description('Analyze and adapt a tracked skill')
    .showHelpAfterError()
    .showSuggestionAfterError()
    .option('--apply', 'Apply suggested improvements', false)
    .option('-v, --verbose', 'Show detailed output', false)
    .action(async (skillName: string, options: { apply: boolean; verbose: boolean }) => {
      const db = new EvolutionDatabase();
      const isVerbose = options.verbose;
      const reporter = await createEvolutionReporter({
        skillName,
        verbose: isVerbose,
        apply: options.apply,
      });

      try {
        reporter.phase('load', 'Loading tracked skill');
        const skillLocation = loadTrackedSkill(db, skillName);

        if (!skillLocation) {
          reporter.fail(`Skill "${skillName}" not found in local tracking database.`);
          reporter.log('Try:');
          reporter.log(`  sa import ${skillName}      # Import and track this skill first`);
          reporter.log('  sa info                     # View tracked/importable skills');
          return;
        }

        const {
          content: skillContent,
          dir: skillDir,
          filePath: skillFilePath,
          source: skillSource,
        } = skillLocation;

        reporter.log(`Loaded: ${skillName}`);
        configManager.recordSkillUsage(skillName);

        reporter.phase('model', 'Checking model configuration');
        const useAI = saAgentEvolutionEngine.isAvailable();
        const modelStatus = modelConfigLoader.getStatus();
        let maskedApiKey = '';

        if (isVerbose) {
          const configResult = modelConfigLoader.load();
          if (configResult.success && configResult.config) {
            maskedApiKey = maskApiKey(configResult.config.apiKey || '');
          }
        }

        if (isVerbose) {
          console.log(`Model: configured=${modelStatus.configured} source=${modelStatus.source} model=${modelStatus.model} apiKey=${maskedApiKey} aiReady=${useAI}`);
          reporter.log(`Endpoint: ${modelStatus.endpoint || 'not configured'}`);
          if (maskedApiKey) {
            reporter.log(`API key: ${maskedApiKey}`);
          }
          reporter.log(`AI ready: ${useAI ? 'yes' : 'no'}`);
        }

        reporter.phase('static', 'Analyzing skill content');
        const { sections, codeBlocks, links } = analyzeSkillStaticContent(skillContent);
        reporter.log(`Sections: ${sections}`);
        reporter.log(`Code blocks: ${codeBlocks}`);
        reporter.log(`Links: ${links}`);

        reporter.phase('context', 'Building workspace context');
        const workspaceAnalyzer = new WorkspaceAnalyzer(process.cwd());
        const workspaceConfig = workspaceAnalyzer.analyze();

        let evolutionContext: EvolutionContext;
        try {
          evolutionContext = await evolutionEngine.buildEvolutionContext(skillName, 10, skillContent);
        } catch {
          evolutionContext = createDefaultEvolutionContext();
        }

        const soulPrefs =
          evolutionContext.behaviorStyle.boundaries.length > 0 ||
          evolutionContext.behaviorStyle.preferences.length > 0;

        reporter.log(`SOUL preferences: ${soulPrefs ? 'yes' : 'none'}`);
        reporter.log(`MEMORY rules: ${evolutionContext.memoryRules.length}`);
        reporter.log(`Workspace: ${workspaceConfig.techStack.languages.join(', ') || 'not detected'}`);
        reporter.log(`Session patterns: ${evolutionContext.sessionPatterns.toolSequences.length}`);

        reporter.phase('thinking', useAI ? 'Streaming SA Agent thinking' : 'Rule-based fallback');

        let evolutionRecommendations: EvolutionRecommendation[] = [];
        let saAgentRecommendations: SAAgentRecommendation[] = [];

        try {
          if (!useAI) {
            reporter.log('SA Agent model not configured. Falling back to rule-based recommendations.');
            evolutionRecommendations = evolutionEngine.generateRecommendations(evolutionContext);
          } else if (!isVerbose && !reporter.isLive) {
            saAgentRecommendations = await saAgentEvolutionEngine.generateRecommendationsSync({
              skillName,
              skillContent,
              soulPreferences: {
                communicationStyle: evolutionContext.behaviorStyle.communicationStyle,
                boundaries: evolutionContext.behaviorStyle.boundaries.slice(0, 3),
              },
              memoryRules: evolutionContext.memoryRules.slice(0, 5).map(rule => ({
                category: rule.category,
                rule: rule.rule,
              })),
              workspaceInfo: {
                languages: workspaceConfig.techStack.languages.slice(0, 3),
                packageManager: workspaceConfig.techStack.packageManager,
              },
              sessionEvidence: evolutionContext.sessionEvidence,
              loopConfig: {
                enabled: true,
                maxRounds: 3,
                minConfidence: 0.8,
              },
            });
          } else {
            saAgentRecommendations = await saAgentEvolutionEngine.generateRecommendations(
              {
                skillName,
                skillContent,
                soulPreferences: {
                  communicationStyle: evolutionContext.behaviorStyle.communicationStyle,
                  boundaries: evolutionContext.behaviorStyle.boundaries.slice(0, 3),
                },
                memoryRules: evolutionContext.memoryRules.slice(0, 5).map(rule => ({
                  category: rule.category,
                  rule: rule.rule,
                })),
                workspaceInfo: {
                  languages: workspaceConfig.techStack.languages.slice(0, 3),
                  packageManager: workspaceConfig.techStack.packageManager,
                },
                sessionEvidence: evolutionContext.sessionEvidence,
                loopConfig: {
                  enabled: true,
                  maxRounds: 3,
                  minConfidence: 0.8,
                },
              },
              {
                onRoundStart: (round, totalRounds) => {
                  reporter.phase('thinking', `Agent loop round ${round}/${totalRounds}`);
                },
                onThinking: (text) => {
                  reporter.thinking(text);
                },
                onContent: (text) => {
                  reporter.thinking(text);
                },
                onComplete: () => {
                  reporter.log('Thinking complete');
                },
              },
            );
          }
        } catch {
          reporter.log('Falling back to rule-based recommendations...');
          evolutionRecommendations = evolutionEngine.generateRecommendations(evolutionContext);
          if (isVerbose) {
            reporter.log('SA Agent deep analysis unavailable, fallback active.');
          }
        }

        const allRecommendations = saAgentRecommendations.length > 0
          ? saAgentRecommendations
          : evolutionRecommendations.length > 0
            ? evolutionRecommendations
            : [];

        const summary = summarizeRecommendationPriorities(allRecommendations as Array<{ priority?: string }>);

        reporter.phase('recommend', `Generated ${allRecommendations.length} recommendation(s)`);

        if (reporter.isLive) {
          reporter.recommendSummary(formatSummary(summary, allRecommendations.length));
          if (isVerbose && allRecommendations.length > 0) {
            allRecommendations.slice(0, 5).forEach((rec, index) => {
              reporter.log(formatRecommendationPreview(rec, index));
            });
            if (allRecommendations.length > 5) {
              reporter.log(`... ${allRecommendations.length - 5} more recommendation(s)`);
            }
          }
          reporter.log('Next steps: sa log <skill>, sa summary <skill>, sa export <skill>, sa scan <skill>');
        } else {
          if (isVerbose && allRecommendations.length > 0) {
            printVerboseRecommendations(allRecommendations);
          } else {
            console.log(`Recommendations: total=${summary.total} high=${summary.high} medium=${summary.medium} low=${summary.low}`);
          }
          if (allRecommendations.length > 0) {
            console.log(`${'='.repeat(40)}`);
            console.log('To apply: sa evolve <skill> --apply');
          }
        }

        reporter.phase('apply', options.apply ? 'Applying changes' : 'Preview only');

        if (options.apply && allRecommendations.length > 0) {
          reporter.log('Applying high-confidence recommendations...');
          const applyResult = applyRecommendations({
            skillName,
            skillContent,
            recommendations: allRecommendations,
            skillFilePath,
            skillDir,
            skillSource,
          });
          reporter.applySummary(`Applied ${applyResult.appliedCount} recommendations`);
        }

        if (reporter.isLive) {
          reporter.finish();
        } else {
          console.log('\n? Evolution analysis complete.\n');
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        reporter.fail(`Evolution analysis failed: ${message}`);
        if (!reporter.isLive) {
          console.error(message);
        }
      } finally {
        await reporter.stop();
      }
    });
}

function createEvolutionReporter(options: {
  skillName: string;
  verbose: boolean;
  apply: boolean;
}): EvolutionReporter {
  return {
    isLive: false,
    phase: (_phase, detail) => {
      if (detail && options.verbose) {
        console.log(`\n== ${detail} ==`);
      }
    },
    log: (line) => console.log(line),
    thinking: (chunk) => { process.stdout.write(chunk); },
    recommendSummary: (text) => console.log(text),
    applySummary: (text) => console.log(text),
    fail: (message) => console.error(message),
    finish: () => void 0,
    stop: async () => void 0,
  };
}

function createDefaultEvolutionContext(): EvolutionContext {
  return {
    sessionPatterns: {
      toolSequences: [],
      errorPatterns: [],
      successPatterns: [],
      userIntents: [],
      summary: { totalSessions: 0, avgToolCalls: 0, errorRate: 0, topTools: [] },
    },
    memoryRules: [],
    behaviorStyle: {
      communicationStyle: 'direct',
      boundaries: [],
      preferences: [],
      avoidPatterns: [],
      source: 'claude_code',
    },
    crossSkillPatterns: [],
    sessionEvidence: emptySessionEvidence(),
  } as EvolutionContext;
}

function emptySessionEvidence(): SessionEvidenceBundle {
  return {
    claudeCodeSessions: [],
    openClawSessions: [],
    summary: {
      scannedSessions: 0,
      relevantSessions: 0,
      skillMatches: 0,
      keywordMatches: 0,
      grepMatches: 0,
      loopSignals: 0,
      topKeywords: [],
      topGrepTerms: [],
      topErrors: [],
      topTools: [],
    },
    highlights: [],
    loopInsights: [],
    keywords: [],
    grepTerms: [],
  };
}

function formatSummary(summary: ReturnType<typeof summarizeRecommendationPriorities>, count: number): string {
  return `count=${count} high=${summary.high ?? 0} medium=${summary.medium ?? 0} low=${summary.low ?? 0}`;
}

function formatRecommendationPreview(rec: Recommendation, index: number): string {
  const confidence = 'confidence' in rec ? rec.confidence : 0.7;
  return `#${index + 1} ${rec.title} (${rec.type}, ${(confidence * 100).toFixed(0)}%)`;
}

function printVerboseRecommendations(recommendations: Recommendation[]): void {
  console.log('EVOLUTION RECOMMENDATIONS');
  for (let i = 0; i < recommendations.length; i++) {
    const rec = recommendations[i];
    const priority = 'priority' in rec ? rec.priority : 'medium';
    const confidence = 'confidence' in rec ? rec.confidence : 0.7;
    const suggestedContent = 'suggestedContent' in rec ? rec.suggestedContent : undefined;

    console.log(`\n[${priority.toUpperCase()}] Recommendation #${i + 1}`);
    console.log(`   Title: ${rec.title}`);
    console.log(`   Type: ${rec.type}`);
    console.log(`   Confidence: ${(confidence * 100).toFixed(0)}%`);
    console.log(`   Description: ${rec.description}`);

    if (suggestedContent) {
      console.log('   Suggested Content:');
      const lines = suggestedContent.split('\n').slice(0, 8);
      for (const line of lines) {
        console.log(`   ${line}`);
      }
      if (suggestedContent.split('\n').length > 8) {
        console.log('   ... (truncated)');
      }
    }
  }
}

function applyRecommendations(params: {
  skillName: string;
  skillContent: string;
  recommendations: Recommendation[];
  skillFilePath: string;
  skillDir: string;
  skillSource: string;
}): { newContent: string; appliedCount: number } {
  let newContent = params.skillContent;
  const appliedRecommendations = params.recommendations.filter((rec) => {
    const confidence = 'confidence' in rec ? rec.confidence : 0.7;
    return confidence >= 0.8 && 'suggestedContent' in rec && Boolean(rec.suggestedContent);
  });

  for (const rec of appliedRecommendations) {
    const suggestedContent = 'suggestedContent' in rec ? rec.suggestedContent : undefined;
    if (!suggestedContent) continue;

    const sectionTitle = `## ${rec.title}`;
    if (!newContent.includes(sectionTitle)) {
      newContent += `\n\n${sectionTitle}\n\n${suggestedContent}\n`;
    }
  }

  fs.writeFileSync(params.skillFilePath, newContent, 'utf-8');

  const newRecord: EvolutionRecord = {
    id: EvolutionDatabase.generateId(),
    skillName: params.skillName,
    version: DEFAULT_SKILL_VERSION,
    timestamp: new Date(),
    telemetryData: JSON.stringify({
      recommendationsCount: params.recommendations.length,
      appliedCount: appliedRecommendations.length,
    }),
    patches: JSON.stringify(params.recommendations.map((rec) => ({
      category: rec.type,
      title: rec.title,
      description: rec.description,
    }))),
    importSource: params.skillSource,
    skillPath: params.skillDir,
  };

  const db = new EvolutionDatabase();
  db.addRecord(newRecord);

  return {
    newContent,
    appliedCount: appliedRecommendations.length,
  };
}


