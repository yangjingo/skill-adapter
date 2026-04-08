/**
 * Session evidence extraction
 *
 * Builds a high-signal subset of session history using:
 * - skill-name matching
 * - keyword expansion
 * - grep-like term matching
 * - repeated tool / error loop detection
 */

import { ClaudeCodeExtractor } from './claude-code-extractor';
import { OpenClawExtractor } from './openclaw-extractor';
import type {
  ClaudeCodeExtractedSession,
  ExtractedSession,
  SessionEvidenceBundle,
  SessionEvidenceHighlight,
  SessionEvidenceSummary,
  SessionLoopInsight,
} from './types';

type EvidenceSource = 'claude_code' | 'openclaw';

interface ScoredEvidence {
  source: EvidenceSource;
  sessionId: string;
  timestamp?: Date;
  score: number;
  reason: string;
  excerpt: string;
  matchedKeywords: string[];
  matchedGrepTerms: string[];
  loopSignals: string[];
}

interface EvidenceCandidate {
  source: EvidenceSource;
  sessionId: string;
  timestamp?: Date;
  score: number;
  matchedKeywords: string[];
  matchedGrepTerms: string[];
  loopSignals: string[];
  excerpt: string;
  rawSession: ClaudeCodeExtractedSession | ExtractedSession;
}

const BASE_EVIDENCE_KEYWORDS = [
  'agent',
  'loop',
  'thinking',
  'evolve',
  'evolution',
  'recommend',
  'apply',
  'patch',
  'refactor',
  'fix',
  'error',
  'grep',
  'keyword',
  'session',
  'tool',
];

const BASE_GREP_TERMS = [
  'Read',
  'Write',
  'Edit',
  'Bash',
  'Grep',
  'thinking',
  'error',
  'failed',
  'fix',
  'refactor',
  'apply',
];

export function buildKeywordCatalog(skillName: string, skillContent: string): string[] {
  const tokens = new Set<string>();
  const add = (value: string) => {
    const normalized = normalizeToken(value);
    if (normalized) tokens.add(normalized);
  };

  splitSkillName(skillName).forEach(add);
  extractSkillContentKeywords(skillContent).forEach(add);
  BASE_EVIDENCE_KEYWORDS.forEach(add);

  return Array.from(tokens);
}

export function buildGrepTerms(skillName: string, skillContent: string): string[] {
  const tokens = new Set<string>();
  const add = (value: string) => {
    const normalized = normalizeToken(value);
    if (normalized) tokens.add(normalized);
  };

  splitSkillName(skillName).forEach(add);
  extractSkillContentKeywords(skillContent).slice(0, 20).forEach(add);
  BASE_GREP_TERMS.forEach(add);

  return Array.from(tokens);
}

export function scoreEvidenceText(
  text: string,
  keywords: string[],
  grepTerms: string[],
): {
  score: number;
  matchedKeywords: string[];
  matchedGrepTerms: string[];
} {
  const haystack = text.toLowerCase();
  const matchedKeywords = keywords.filter(term => containsTerm(haystack, term));
  const matchedGrepTerms = grepTerms.filter(term => containsTerm(haystack, term));
  const score = (matchedKeywords.length * 3) + (matchedGrepTerms.length * 2);

  return { score, matchedKeywords, matchedGrepTerms };
}

export function detectLoopSignals(
  toolNames: string[],
  errorMessages: string[],
  thinkingTexts: string[],
): string[] {
  const signals = new Set<string>();

  const counts = new Map<string, number>();
  for (const tool of toolNames) {
    const key = tool.toLowerCase();
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  for (const [tool, count] of counts.entries()) {
    if (count >= 3) {
      signals.add(`repeat-tool:${tool}`);
    }
  }

  if (errorMessages.length > 0 && toolNames.length > 1) {
    signals.add('error-retry-loop');
  }

  const thinkingBlob = thinkingTexts.join(' ').toLowerCase();
  const thinkingLoopTerms = ['analyze', 'verify', 'check', 'refactor', 'optimize', 'debug'];
  for (const term of thinkingLoopTerms) {
    if (thinkingBlob.includes(term) && toolNames.length >= 2) {
      signals.add(`thinking-loop:${term}`);
    }
  }

  return Array.from(signals);
}

export class SessionEvidenceExtractor {
  private readonly claudeCodeExtractor: ClaudeCodeExtractor;
  private readonly openClawExtractor: OpenClawExtractor;

  constructor() {
    this.claudeCodeExtractor = new ClaudeCodeExtractor();
    this.openClawExtractor = new OpenClawExtractor();
  }

  async buildEvidence(skillName: string, days: number, skillContent = ''): Promise<SessionEvidenceBundle> {
    const keywords = buildKeywordCatalog(skillName, skillContent);
    const grepTerms = buildGrepTerms(skillName, skillContent);

    const [claudeCodeSessions, openClawSessions] = await Promise.all([
      this.loadClaudeCodeSessions(days),
      this.loadOpenClawSessions(days),
    ]);

    const loopResult = this.runEvidenceLoop(claudeCodeSessions, openClawSessions, keywords, grepTerms);

    const merged = loopResult.candidates;
    const highlights = merged
      .sort((a, b) => b.score - a.score)
      .slice(0, 12)
      .map(candidate => this.toHighlight(candidate));

    const selectedClaudeSessions = new Set(
      merged.filter(candidate => candidate.source === 'claude_code').map(candidate => candidate.sessionId),
    );
    const selectedOpenClawSessions = new Set(
      merged.filter(candidate => candidate.source === 'openclaw').map(candidate => candidate.sessionId),
    );

    const loopInsights = this.buildLoopInsights(merged);
    const summary = this.buildSummary(claudeCodeSessions.length + openClawSessions.length, merged, loopResult.keywords, loopResult.grepTerms);

    return {
      claudeCodeSessions: claudeCodeSessions.filter(session => selectedClaudeSessions.has(session.id)),
      openClawSessions: openClawSessions.filter(session => selectedOpenClawSessions.has(session.id)),
      summary,
      highlights,
      loopInsights,
      keywords: loopResult.keywords,
      grepTerms: loopResult.grepTerms,
    };
  }

  private runEvidenceLoop(
    claudeCodeSessions: ClaudeCodeExtractedSession[],
    openClawSessions: ExtractedSession[],
    seedKeywords: string[],
    seedGrepTerms: string[],
  ): { candidates: EvidenceCandidate[]; keywords: string[]; grepTerms: string[] } {
    let currentKeywords = [...seedKeywords];
    let currentGrepTerms = [...seedGrepTerms];
    let currentCandidates: EvidenceCandidate[] = [];

    for (let round = 0; round < 3; round++) {
      const roundCandidates = [
        ...this.scoreClaudeCodeSessions(claudeCodeSessions, currentKeywords, currentGrepTerms),
        ...this.scoreOpenClawSessions(openClawSessions, currentKeywords, currentGrepTerms),
      ];
      const merged = this.mergeCandidates(roundCandidates);
      currentCandidates = merged;

      const nextKeywords = this.expandKeywordsFromCandidates(merged, currentKeywords);
      const nextGrepTerms = this.expandGrepTermsFromCandidates(merged, currentGrepTerms);

      const keywordsChanged = nextKeywords.length !== currentKeywords.length;
      const grepChanged = nextGrepTerms.length !== currentGrepTerms.length;

      currentKeywords = nextKeywords;
      currentGrepTerms = nextGrepTerms;

      if (!keywordsChanged && !grepChanged) {
        break;
      }
    }

    return {
      candidates: currentCandidates,
      keywords: currentKeywords,
      grepTerms: currentGrepTerms,
    };
  }

  private async loadClaudeCodeSessions(days: number): Promise<ClaudeCodeExtractedSession[]> {
    try {
      const sessionFiles = await this.claudeCodeExtractor.findSessionFiles(days);
      const sessions: ClaudeCodeExtractedSession[] = [];
      for (const file of sessionFiles.slice(0, 12)) {
        try {
          sessions.push(await this.claudeCodeExtractor.extractSession(file.path));
        } catch {
          // Skip broken sessions.
        }
      }
      return sessions;
    } catch {
      return [];
    }
  }

  private async loadOpenClawSessions(days: number): Promise<ExtractedSession[]> {
    try {
      const sessionFiles = await this.openClawExtractor.findSessionFiles(days);
      const sessions: ExtractedSession[] = [];
      for (const filePath of sessionFiles.slice(0, 12)) {
        try {
          sessions.push(await this.openClawExtractor.extractSession(filePath));
        } catch {
          // Skip broken sessions.
        }
      }
      return sessions;
    } catch {
      return [];
    }
  }

  private scoreClaudeCodeSessions(
    sessions: ClaudeCodeExtractedSession[],
    keywords: string[],
    grepTerms: string[],
  ): EvidenceCandidate[] {
    const candidates: EvidenceCandidate[] = [];
    for (const session of sessions) {
      const text = this.collectClaudeCodeSessionText(session);
      const scoreResult = scoreEvidenceText(text, keywords, grepTerms);
      const skillMatch = session.metadata.skillNames.length > 0 ? 5 : 0;
      const loopSignals = detectLoopSignals(
        session.toolCalls.map(call => call.name),
        session.errors.map(error => error.message),
        session.thinkings.map(thinking => thinking.content),
      );
      const loopScore = loopSignals.length * 2;
      const score = scoreResult.score + skillMatch + loopScore;

      if (score <= 0) continue;

      candidates.push({
        source: 'claude_code',
        sessionId: session.id,
        timestamp: session.endTime || session.startTime,
        score,
        matchedKeywords: scoreResult.matchedKeywords,
        matchedGrepTerms: scoreResult.matchedGrepTerms,
        loopSignals,
        excerpt: this.buildExcerpt(text, scoreResult.matchedKeywords, scoreResult.matchedGrepTerms, loopSignals),
        rawSession: session,
      });
    }
    return candidates;
  }

  private scoreOpenClawSessions(
    sessions: ExtractedSession[],
    keywords: string[],
    grepTerms: string[],
  ): EvidenceCandidate[] {
    const candidates: EvidenceCandidate[] = [];
    for (const session of sessions) {
      const text = this.collectOpenClawSessionText(session);
      const scoreResult = scoreEvidenceText(text, keywords, grepTerms);
      const skillMatch = session.skillsUsed.length > 0 ? 5 : 0;
      const loopSignals = detectLoopSignals(
        session.toolCalls.map(call => call.name),
        session.errors.map(error => error.message),
        session.thinkingBlocks.map(block => block.content),
      );
      const loopScore = loopSignals.length * 2;
      const score = scoreResult.score + skillMatch + loopScore;

      if (score <= 0) continue;

      candidates.push({
        source: 'openclaw',
        sessionId: session.id,
        timestamp: session.timestamp,
        score,
        matchedKeywords: scoreResult.matchedKeywords,
        matchedGrepTerms: scoreResult.matchedGrepTerms,
        loopSignals,
        excerpt: this.buildExcerpt(text, scoreResult.matchedKeywords, scoreResult.matchedGrepTerms, loopSignals),
        rawSession: session,
      });
    }
    return candidates;
  }

  private mergeCandidates(candidates: EvidenceCandidate[]): EvidenceCandidate[] {
    const merged = new Map<string, EvidenceCandidate>();
    for (const candidate of candidates) {
      const key = `${candidate.source}:${candidate.sessionId}`;
      const existing = merged.get(key);
      if (!existing || candidate.score > existing.score) {
        merged.set(key, candidate);
      }
    }
    return Array.from(merged.values());
  }

  private expandKeywordsFromCandidates(candidates: EvidenceCandidate[], keywords: string[]): string[] {
    const counts = new Map<string, number>();
    const seed = new Set(keywords);
    const stems = candidates
      .flatMap(candidate => candidate.matchedKeywords)
      .concat(candidates.flatMap(candidate => candidate.loopSignals));

    for (const term of stems) {
      const normalized = normalizeToken(term);
      if (!normalized || seed.has(normalized)) continue;
      counts.set(normalized, (counts.get(normalized) || 0) + 1);
    }

    const additions = Array.from(counts.entries())
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .map(([term]) => term)
      .slice(0, 12);

    return Array.from(new Set([...keywords, ...additions]));
  }

  private expandGrepTermsFromCandidates(candidates: EvidenceCandidate[], grepTerms: string[]): string[] {
    const counts = new Map<string, number>();
    const seed = new Set(grepTerms);
    const stems = candidates.flatMap(candidate => [
      ...candidate.matchedGrepTerms,
      ...candidate.loopSignals,
    ]);

    for (const term of stems) {
      const normalized = normalizeToken(term);
      if (!normalized || seed.has(normalized)) continue;
      counts.set(normalized, (counts.get(normalized) || 0) + 1);
    }

    const additions = Array.from(counts.entries())
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .map(([term]) => term)
      .slice(0, 12);

    return Array.from(new Set([...grepTerms, ...additions]));
  }

  private buildLoopInsights(candidates: EvidenceCandidate[]): SessionLoopInsight[] {
    const buckets = new Map<string, { count: number; sessionIds: Set<string>; description: string }>();
    for (const candidate of candidates) {
      for (const signal of candidate.loopSignals) {
        const existing = buckets.get(signal) || {
          count: 0,
          sessionIds: new Set<string>(),
          description: this.describeLoopSignal(signal),
        };
        existing.count++;
        existing.sessionIds.add(candidate.sessionId);
        buckets.set(signal, existing);
      }
    }

    return Array.from(buckets.entries())
      .map(([label, data]) => ({
        label,
        description: data.description,
        frequency: data.count,
        sessionIds: Array.from(data.sessionIds).slice(0, 5),
      }))
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 8);
  }

  private buildSummary(
    scannedSessions: number,
    candidates: EvidenceCandidate[],
    keywords: string[],
    grepTerms: string[],
  ): SessionEvidenceSummary {
    const keywordCounts = new Map<string, number>();
    const grepCounts = new Map<string, number>();
    const errorCounts = new Map<string, number>();
    const toolCounts = new Map<string, number>();

    for (const candidate of candidates) {
      for (const keyword of candidate.matchedKeywords) {
        keywordCounts.set(keyword, (keywordCounts.get(keyword) || 0) + 1);
      }
      for (const term of candidate.matchedGrepTerms) {
        grepCounts.set(term, (grepCounts.get(term) || 0) + 1);
      }

      const rawSession = candidate.rawSession;
      if ('errors' in rawSession) {
        const errors = rawSession.errors as Array<{ message: string }>;
        for (const error of errors) {
          const key = error.message.slice(0, 80);
          errorCounts.set(key, (errorCounts.get(key) || 0) + 1);
        }
      }

      if ('toolCalls' in rawSession) {
        const tools = rawSession.toolCalls as Array<{ name: string }>;
        for (const tool of tools) {
          toolCounts.set(tool.name, (toolCounts.get(tool.name) || 0) + 1);
        }
      }
    }

    return {
      scannedSessions,
      relevantSessions: candidates.length,
      skillMatches: candidates.filter(candidate => candidate.score >= 5).length,
      keywordMatches: Array.from(keywordCounts.values()).reduce((sum, count) => sum + count, 0),
      grepMatches: Array.from(grepCounts.values()).reduce((sum, count) => sum + count, 0),
      loopSignals: candidates.reduce((sum, candidate) => sum + candidate.loopSignals.length, 0),
      topKeywords: Array.from(keywordCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([term, count]) => ({ term, count })),
      topGrepTerms: Array.from(grepCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([term, count]) => ({ term, count })),
      topErrors: Array.from(errorCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([message, count]) => ({ message, count })),
      topTools: Array.from(toolCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([name, count]) => ({ name, count })),
    };
  }

  private toHighlight(candidate: EvidenceCandidate): SessionEvidenceHighlight {
    return {
      source: candidate.source,
      sessionId: candidate.sessionId,
      timestamp: candidate.timestamp,
      score: candidate.score,
      reason: this.describeReason(candidate),
      excerpt: candidate.excerpt,
      matchedKeywords: candidate.matchedKeywords,
      matchedGrepTerms: candidate.matchedGrepTerms,
      loopSignals: candidate.loopSignals,
    };
  }

  private describeReason(candidate: EvidenceCandidate): string {
    const reasons: string[] = [];
    if (candidate.matchedKeywords.length > 0) {
      reasons.push(`keywords=${candidate.matchedKeywords.slice(0, 3).join(', ')}`);
    }
    if (candidate.matchedGrepTerms.length > 0) {
      reasons.push(`grep=${candidate.matchedGrepTerms.slice(0, 3).join(', ')}`);
    }
    if (candidate.loopSignals.length > 0) {
      reasons.push(`loops=${candidate.loopSignals.slice(0, 2).join(', ')}`);
    }
    return reasons.join(' | ') || 'high-signal session';
  }

  private describeLoopSignal(signal: string): string {
    if (signal.startsWith('repeat-tool:')) {
      return `Repeated tool usage: ${signal.slice('repeat-tool:'.length)}`;
    }
    if (signal === 'error-retry-loop') {
      return 'Errors followed by retry activity';
    }
    if (signal.startsWith('thinking-loop:')) {
      return `Thinking loop around ${signal.slice('thinking-loop:'.length)}`;
    }
    return signal;
  }

  private buildExcerpt(
    text: string,
    matchedKeywords: string[],
    matchedGrepTerms: string[],
    loopSignals: string[],
  ): string {
    const allTerms = [...matchedKeywords, ...matchedGrepTerms];
    for (const term of allTerms) {
      const index = text.toLowerCase().indexOf(term.toLowerCase());
      if (index >= 0) {
        return this.trimExcerpt(text.slice(Math.max(0, index - 120), index + 240));
      }
    }
    if (loopSignals.length > 0) {
      return this.trimExcerpt(loopSignals.join(' | '));
    }
    return this.trimExcerpt(text.slice(0, 240));
  }

  private trimExcerpt(value: string): string {
    return value.replace(/\s+/g, ' ').trim().slice(0, 320);
  }

  private collectClaudeCodeSessionText(session: ClaudeCodeExtractedSession): string {
    const parts: string[] = [];
    for (const message of session.userMessages) {
      parts.push(message.content);
    }
    for (const thinking of session.thinkings) {
      parts.push(thinking.content);
    }
    for (const toolCall of session.toolCalls) {
      parts.push(toolCall.name);
      parts.push(JSON.stringify(toolCall.input));
    }
    for (const error of session.errors) {
      parts.push(error.message);
      if (error.context) parts.push(error.context);
    }
    return parts.join('\n');
  }

  private collectOpenClawSessionText(session: ExtractedSession): string {
    const parts: string[] = [];
    for (const message of session.messages) {
      parts.push(message.content);
    }
    for (const thinking of session.thinkingBlocks) {
      parts.push(thinking.content);
    }
    for (const toolCall of session.toolCalls) {
      parts.push(toolCall.name);
      parts.push(JSON.stringify(toolCall.arguments));
      if (toolCall.context) parts.push(toolCall.context);
    }
    for (const error of session.errors) {
      parts.push(error.message);
      if (error.context) parts.push(error.context);
    }
    return parts.join('\n');
  }
}

function splitSkillName(skillName: string): string[] {
  return skillName
    .split(/[^a-zA-Z0-9]+/)
    .map(token => token.trim())
    .filter(Boolean);
}

function extractSkillContentKeywords(skillContent: string): string[] {
  const keywords = new Set<string>();
  const lines = skillContent.split('\n');

  for (const line of lines) {
    const heading = line.match(/^#{1,3}\s+(.+)$/);
    if (heading) {
      heading[1]
        .split(/[^a-zA-Z0-9]+/)
        .map(token => token.trim())
        .filter(token => token.length >= 3)
        .forEach(token => keywords.add(token.toLowerCase()));
    }

    const codeMatch = line.match(/`([^`]+)`/g);
    if (codeMatch) {
      for (const match of codeMatch) {
        match
          .replace(/`/g, '')
          .split(/[^a-zA-Z0-9]+/)
          .map(token => token.trim())
          .filter(token => token.length >= 3)
          .forEach(token => keywords.add(token.toLowerCase()));
      }
    }
  }

  const bodyTokens = skillContent
    .slice(0, 4000)
    .split(/[^a-zA-Z0-9]+/)
    .map(token => token.trim())
    .filter(token => token.length >= 4 && token.length <= 24);

  for (const token of bodyTokens) {
    if (/^\d+$/.test(token)) continue;
    keywords.add(token.toLowerCase());
  }

  return Array.from(keywords).slice(0, 80);
}

function containsTerm(haystack: string, term: string): boolean {
  if (!term) return false;
  return haystack.includes(term.toLowerCase());
}

function normalizeToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 40);
}

export const sessionEvidenceExtractor = new SessionEvidenceExtractor();
