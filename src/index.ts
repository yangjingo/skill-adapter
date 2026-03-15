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

// Version
export const VERSION = '1.0.0';