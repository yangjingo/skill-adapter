/**
 * Skill-Adapter - Core exports
 *
 * Making Skills Evolve within your Workspace
 */

// Core modules
export { Telemetry, telemetry, TelemetryData, MetricsSummary } from './core/telemetry';
export { WorkspaceAnalyzer, WorkspaceConfig, TechStack, WorkspaceConstraint, FilePreference } from './core/workspace';
export { SessionAnalyzer, SessionLog, ToolCallRecord, CorrectionRecord, AnalysisResult, BehaviorPattern, ImprovementSuggestion } from './core/analyzer';
export { SkillPatcher, skillPatcher, SkillPatch, SkillVersion } from './core/patcher';
export { Evaluator, evaluator, EvaluationResult, MetricComparison } from './core/evaluator';
export { EvolutionDatabase, EvolutionRecord } from './core/database';

// Report modules
export { SummaryGenerator, summaryGenerator } from './report/summary';

// Security modules
export { SecurityEvaluator, securityEvaluator, SecurityPatterns, PermissionValidators, SecurityReporters } from './core/security';
export * from './types/security';

// Sharing modules
export { SkillPackageManager, skillPackageManager, SkillExporter, skillExporter, SkillRegistry, skillRegistry } from './core/sharing';
export * from './types/sharing';

// Discovery modules
export { PlatformFetcher, platformFetcher, SkillAnalyzer, skillAnalyzer, RecommendationEngine, recommendationEngine } from './core/discovery';
export * from './types/discovery';

// Versioning modules
export { VersionManager, versionManager } from './core/versioning';
export * from './types/versioning';

// Config modules
export { AgentDetector, agentDetector } from './core/config';
export { ConfigManager, configManager, UserPreferences, SkillAdapterConfig } from './core/config-manager';
export { ModelConfigLoader, modelConfigLoader, ModelConfig, ConfigSource, LoadResult } from './core/model-config-loader';
export * from './types/config';

// Session modules
export { OpenClawExtractor, ClaudeCodeExtractor, claudeCodeExtractor } from './core/session';

// SA Agent Evolution Engine
export { SAAgentEvolutionEngine, saAgentEvolutionEngine, SAAgentRecommendation, EvolutionResult } from './core/evolution';
export { buildEvolutionPrompt, isChineseContent } from './core/evolution';

// Context Building (non-AI)
export { EvolutionEngine, evolutionEngine, EvolutionContext, EvolutionRecommendation, MemoryRule, BehaviorStyle } from './core/evolution-engine';

// Version
export const VERSION = '1.2.0';