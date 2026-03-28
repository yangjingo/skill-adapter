/**
 * Evolution Summary - Builds CLI summary output from evolution records
 */

import { EvolutionRecord } from './database';

interface TelemetryMetrics {
  optimizations: number;
  applied: number;
  skipped: number;
  soulLoaded: boolean;
  memoryLoaded: boolean;
  languages: string[];
  packageManager: string;
}

interface AppliedChanges {
  style: string[];
  errors: string[];
  env: string[];
}

type SummaryStatus = 'found' | 'not-found';

export interface SummaryRenderResult {
  status: SummaryStatus;
  lines: string[];
}

function parseTelemetryMetrics(record: EvolutionRecord): TelemetryMetrics {
  try {
    const t = JSON.parse(record.telemetryData || '{}');
    return {
      optimizations: Number(t.optimizationsCount || 0),
      applied: Number(t.appliedCount || 0),
      skipped: Number(t.skippedCount || 0),
      soulLoaded: Boolean(t.soulLoaded),
      memoryLoaded: Boolean(t.memoryLoaded),
      languages: Array.isArray(t.workspaceAnalysis?.languages) ? t.workspaceAnalysis.languages : [],
      packageManager: t.workspaceAnalysis?.packageManager || '-',
    };
  } catch {
    return {
      optimizations: 0,
      applied: 0,
      skipped: 0,
      soulLoaded: false,
      memoryLoaded: false,
      languages: [],
      packageManager: '-',
    };
  }
}

function classifyPatch(categoryText: string): keyof AppliedChanges | null {
  const text = categoryText.toLowerCase();
  if (text.includes('style')) return 'style';
  if (text.includes('error')) return 'errors';
  if (text.includes('env') || text.includes('environment')) return 'env';
  return null;
}

function parseAppliedChanges(record: EvolutionRecord): AppliedChanges {
  const empty: AppliedChanges = { style: [], errors: [], env: [] };
  try {
    const patches = JSON.parse(record.patches || '[]');
    if (!Array.isArray(patches)) return empty;

    for (const patch of patches) {
      const category = String(patch?.category || patch?.type || '');
      const bucket = classifyPatch(category);
      if (!bucket) continue;

      const details: string[] = [];
      if (Array.isArray(patch?.details)) {
        for (const d of patch.details) {
          if (typeof d === 'string' && d.trim()) details.push(d.trim());
        }
      }
      if (typeof patch?.title === 'string' && patch.title.trim()) details.push(patch.title.trim());
      if (typeof patch?.description === 'string' && patch.description.trim()) details.push(patch.description.trim());

      if (details.length === 0) {
        details.push(category);
      }
      empty[bucket].push(...details);
    }
  } catch {
    return empty;
  }
  return empty;
}

function calculateDelta(base: number, evolved: number): number {
  if (base === 0) return evolved > 0 ? 100 : 0;
  return ((evolved - base) / base) * 100;
}

function formatDelta(delta: number): string {
  if (delta === 0) return '-';
  return delta > 0 ? `+${delta.toFixed(0)}%` : `${delta.toFixed(0)}%`;
}

function countStatus(delta: number): string {
  if (delta > 0) return 'Enhanced';
  if (delta < 0) return 'Reduced';
  return 'Stable';
}

function renderTable(baselineVersion: string, latestVersion: string, rows: Array<{ name: string; base: number; evolved: number }>): string[] {
  const vBase = baselineVersion.padEnd(5);
  const vLatest = latestVersion.padEnd(5);
  const lines: string[] = [];

  lines.push('┌─────────────────────┬─────────────────┬─────────────────┬──────────┬──────────────────┐');
  lines.push(`│ Metric              │ Baseline (v${vBase})│ Evolved (v${vLatest})│ Change   │ Status           │`);
  lines.push('├─────────────────────┼─────────────────┼─────────────────┼──────────┼──────────────────┤');

  for (const row of rows) {
    const delta = calculateDelta(row.base, row.evolved);
    const deltaStr = formatDelta(delta).padStart(8);
    const status = countStatus(delta).padEnd(16);
    const name = row.name.padEnd(19);
    const base = String(row.base).padStart(15);
    const evolved = String(row.evolved).padStart(15);
    lines.push(`│ ${name} │ ${base} │ ${evolved} │ ${deltaStr} │ ${status} │`);
  }

  lines.push('└─────────────────────┴─────────────────┴─────────────────┴──────────┴──────────────────┘');
  return lines;
}

export function renderEvolutionSummary(skillName: string, records: EvolutionRecord[]): SummaryRenderResult {
  if (records.length === 0) {
    return {
      status: 'not-found',
      lines: [
        `No evolution records found for "${skillName}"`,
        '',
        'Next Steps:',
        `   sa evolve ${skillName}    # Run evolution analysis first`,
      ],
    };
  }

  const sorted = [...records].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  const baseline = sorted[0];
  const latest = sorted[sorted.length - 1];
  const baseMetrics = parseTelemetryMetrics(baseline);
  const latestMetrics = parseTelemetryMetrics(latest);

  const allChanges: AppliedChanges = { style: [], errors: [], env: [] };
  for (const rec of sorted) {
    const changes = parseAppliedChanges(rec);
    allChanges.style.push(...changes.style);
    allChanges.errors.push(...changes.errors);
    allChanges.env.push(...changes.env);
  }
  allChanges.style = [...new Set(allChanges.style)];
  allChanges.errors = [...new Set(allChanges.errors)];
  allChanges.env = [...new Set(allChanges.env)];

  const lines: string[] = [];
  lines.push(`Evolution Summary: ${skillName}`);
  lines.push('');
  lines.push(
    ...renderTable(baseline.version, latest.version, [
      { name: 'Optimizations', base: baseMetrics.optimizations, evolved: latestMetrics.optimizations },
      { name: 'Applied Patches', base: baseMetrics.applied, evolved: latestMetrics.applied },
      { name: 'Style Rules', base: 0, evolved: allChanges.style.length },
      { name: 'Error Avoidances', base: 0, evolved: allChanges.errors.length },
      { name: 'Env Adaptations', base: 0, evolved: allChanges.env.length },
    ])
  );

  if (latestMetrics.languages.length > 0) {
    lines.push('');
    lines.push(`Workspace: ${latestMetrics.languages.join(', ')} | ${latestMetrics.packageManager}`);
  }

  const contextLoaded: string[] = [];
  if (latestMetrics.soulLoaded) contextLoaded.push('SOUL.md');
  if (latestMetrics.memoryLoaded) contextLoaded.push('MEMORY.md');
  if (contextLoaded.length > 0) {
    lines.push(`Context: ${contextLoaded.join(', ')}`);
  }

  const totalApplied = allChanges.style.length + allChanges.errors.length + allChanges.env.length;
  const totalSkipped = latestMetrics.skipped;

  lines.push('');
  lines.push('Conclusion:');
  if (totalApplied > 0) {
    const parts: string[] = [];
    if (allChanges.style.length > 0) parts.push(`${allChanges.style.length} style rules`);
    if (allChanges.errors.length > 0) parts.push(`${allChanges.errors.length} error avoidances`);
    if (allChanges.env.length > 0) parts.push(`${allChanges.env.length} environment adaptations`);
    lines.push(`   Evolution applied: ${parts.join(', ')}.`);
    if (totalSkipped > 0) {
      lines.push(`   ${totalSkipped} optimization(s) skipped (cross-skill learning available).`);
    }
    lines.push(`   Version progressed from v${baseline.version} to v${latest.version} across ${records.length} evolution(s).`);
  } else {
    lines.push('   No significant changes applied in recent evolutions.');
    lines.push('   Run `sa evolve <skill>` to analyze and apply new optimizations.');
  }

  lines.push('');
  lines.push('Next Steps:');
  lines.push(`   sa log ${skillName}          # View detailed changes`);
  lines.push(`   sa share ${skillName}        # Create PR`);
  lines.push(`   sa export ${skillName}       # Export local package`);

  return { status: 'found', lines };
}

