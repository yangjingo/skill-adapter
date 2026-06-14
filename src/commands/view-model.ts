import type { EvolutionRecord } from '../core/database';
import { renderEvolutionSummary } from '../core/summary';

export function buildSummaryCommandView(skillName: string, records: EvolutionRecord[]): {
  status: 'success' | 'failure';
  title: string;
  summary?: string;
  details?: string;
  data?: unknown;
  nextSteps?: string[];
  error?: string;
} {
  const rendered = renderEvolutionSummary(skillName, records);

  if (rendered.status === 'not-found') {
    return {
      status: 'failure',
      title: `Evolution Summary: ${skillName}`,
      error: `No evolution records found for "${skillName}"`,
      details: 'Run evolution analysis first.',
      nextSteps: [`sa evolve ${skillName}`],
    };
  }

  const sorted = [...records].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  const baseline = sorted[0];
  const latest = sorted[sorted.length - 1];
  const nextStepsIndex = rendered.lines.findIndex((line) => line === 'Next Steps:');
  const detailsLines = nextStepsIndex >= 0
    ? rendered.lines.slice(2, nextStepsIndex)
    : rendered.lines.slice(2);

  return {
    status: 'success',
    title: `Evolution Summary: ${skillName}`,
    summary: `${records.length} evolution(s) from v${baseline.version} to v${latest.version}`,
    details: detailsLines.join('\n'),
    data: {
      skillName,
      recordsCount: records.length,
      baselineVersion: baseline.version,
      latestVersion: latest.version,
    },
    nextSteps: [
      `sa log ${skillName}`,
      `sa share ${skillName}`,
      `sa export ${skillName}`,
    ],
  };
}
