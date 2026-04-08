require('ts-node/register/transpile-only');

const { buildGrepTerms, buildKeywordCatalog, detectLoopSignals, scoreEvidenceText } = require('../src/core/session/evidence-extractor');

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

test('buildKeywordCatalog should include skill and base keywords', () => {
  const keywords = buildKeywordCatalog('scan-evolve', '# Scan evolve\nUse agent loops for tuning');
  assert(keywords.includes('scan'), 'missing skill token scan');
  assert(keywords.includes('evolve'), 'missing skill token evolve');
  assert(keywords.includes('agent'), 'missing base keyword agent');
  assert(keywords.includes('loop'), 'missing base keyword loop');
});

test('buildGrepTerms should include tool and session terms', () => {
  const grepTerms = buildGrepTerms('scan-evolve', '## Tools\nUse Read and Bash');
  assert(grepTerms.includes('read'), 'missing Read grep term');
  assert(grepTerms.includes('bash'), 'missing Bash grep term');
  assert(grepTerms.includes('scan'), 'missing skill term scan');
});

test('scoreEvidenceText should count keyword and grep hits', () => {
  const result = scoreEvidenceText(
    'This session uses agent loops, thinking, and Read tool output.',
    ['agent', 'thinking', 'session'],
    ['read', 'bash'],
  );

  assert(result.matchedKeywords.includes('agent'), 'expected agent keyword hit');
  assert(result.matchedKeywords.includes('thinking'), 'expected thinking keyword hit');
  assert(result.matchedGrepTerms.includes('read'), 'expected read grep hit');
  assert(result.score > 0, 'expected positive score');
});

test('detectLoopSignals should flag repeated tool usage and retry loops', () => {
  const signals = detectLoopSignals(
    ['Read', 'Read', 'Read', 'Bash'],
    ['failed to parse response'],
    ['analyze the context again', 'verify the output'],
  );

  assert(signals.some(signal => signal.startsWith('repeat-tool:read')), 'expected repeated Read loop');
  assert(signals.includes('error-retry-loop'), 'expected error retry loop');
  assert(signals.some(signal => signal.startsWith('thinking-loop:')), 'expected thinking loop');
});

console.log('session evidence tests passed');
