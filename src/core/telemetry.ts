/**
 * Telemetry - Data collection for Skill evolution metrics
 *
 * Tracks: Token consumption, Tool calls, User rounds, Context load
 */

export interface TelemetryData {
  sessionId: string;
  skillName: string;
  timestamp: Date;
  tokenInput: number;
  tokenOutput: number;
  toolCalls: number;
  userRounds: number;
  contextLoad: number;  // in tokens
  version: string;
}

export interface MetricsSummary {
  avgUserRounds: number;
  avgToolCalls: number;
  totalTokenInput: number;
  totalTokenOutput: number;
  avgContextLoad: number;
  sessionCount: number;
}

export class Telemetry {
  private records: TelemetryData[] = [];

  /**
   * Record a session's telemetry data
   */
  recordSession(data: TelemetryData): void {
    this.records.push(data);
  }

  /**
   * Get all records for a specific skill
   */
  getRecords(skillName: string): TelemetryData[] {
    return this.records.filter(r => r.skillName === skillName);
  }

  /**
   * Get records for a specific version
   */
  getRecordsByVersion(skillName: string, version: string): TelemetryData[] {
    return this.records.filter(r => r.skillName === skillName && r.version === version);
  }

  /**
   * Calculate metrics summary for a skill version
   */
  getMetrics(skillName: string, version: string): MetricsSummary {
    const records = this.getRecordsByVersion(skillName, version);

    if (records.length === 0) {
      return {
        avgUserRounds: 0,
        avgToolCalls: 0,
        totalTokenInput: 0,
        totalTokenOutput: 0,
        avgContextLoad: 0,
        sessionCount: 0
      };
    }

    const sum = records.reduce((acc, r) => ({
      userRounds: acc.userRounds + r.userRounds,
      toolCalls: acc.toolCalls + r.toolCalls,
      tokenInput: acc.tokenInput + r.tokenInput,
      tokenOutput: acc.tokenOutput + r.tokenOutput,
      contextLoad: acc.contextLoad + r.contextLoad
    }), { userRounds: 0, toolCalls: 0, tokenInput: 0, tokenOutput: 0, contextLoad: 0 });

    return {
      avgUserRounds: sum.userRounds / records.length,
      avgToolCalls: sum.toolCalls / records.length,
      totalTokenInput: sum.tokenInput,
      totalTokenOutput: sum.tokenOutput,
      avgContextLoad: sum.contextLoad / records.length,
      sessionCount: records.length
    };
  }

  /**
   * Export all records for persistence
   */
  exportAll(): TelemetryData[] {
    return [...this.records];
  }

  /**
   * Import records from persistence
   */
  importAll(records: TelemetryData[]): void {
    this.records = [...records];
  }

  /**
   * Clear all records
   */
  clear(): void {
    this.records = [];
  }
}

// Singleton instance
export const telemetry = new Telemetry();