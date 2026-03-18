/**
 * Evolution Database - JSONL storage for evolution history
 *
 * Stores evolution trajectories and version comparison data
 * Format: One JSON object per line (JSONL)
 */

import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

// Simple in-memory database implementation with JSONL storage
export interface EvolutionRecord {
  id: string;
  skillName: string;
  version: string;
  timestamp: Date;
  telemetryData: string;  // JSON
  patches: string;  // JSON
  evaluationResult?: string;  // JSON

  // Security evaluation fields
  securityScanResult?: string;  // JSON - SecurityScanResult
  securityPassed?: boolean;

  // Sharing fields
  registryId?: string;
  publishedAt?: Date;
  importSource?: string;

  // Discovery fields
  discoveredFrom?: string;      // Source platform
  appliedInsights?: string[];   // Applied insight IDs

  // Skill content path (for detailed info display)
  skillPath?: string;           // Local path to skill files
}

export class EvolutionDatabase {
  private dbPath: string;
  private records: EvolutionRecord[] = [];

  constructor(dbPath: string = 'evolution.jsonl') {
    // Default to user home directory for persistence
    if (dbPath === 'evolution.db' || dbPath === 'evolution.jsonl') {
      this.dbPath = path.join(os.homedir(), '.skill-adapter', 'evolution.jsonl');
    } else {
      this.dbPath = dbPath;
    }
    this.load();
  }

  /**
   * Load database from JSONL file
   */
  private load(): void {
    if (fs.existsSync(this.dbPath)) {
      try {
        const content = fs.readFileSync(this.dbPath, 'utf-8');
        const lines = content.trim().split('\n').filter(line => line.trim());
        this.records = lines.map(line => {
          const record = JSON.parse(line);
          // Convert timestamp strings back to Date objects
          record.timestamp = new Date(record.timestamp);
          if (record.publishedAt) {
            record.publishedAt = new Date(record.publishedAt);
          }
          return record;
        });
      } catch (error) {
        console.error('Failed to load evolution database:', error);
        this.records = [];
      }
    }
  }

  /**
   * Save database to JSONL file (rewrite all records)
   */
  save(): void {
    try {
      // Ensure directory exists
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const lines = this.records.map(record => JSON.stringify(record));
      fs.writeFileSync(this.dbPath, lines.join('\n') + '\n', 'utf-8');
    } catch (error) {
      console.error('Failed to save evolution database:', error);
    }
  }

  /**
   * Append a single record to the JSONL file (efficient for single adds)
   */
  private appendRecord(record: EvolutionRecord): void {
    try {
      // Ensure directory exists
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Append to file
      fs.appendFileSync(this.dbPath, JSON.stringify(record) + '\n', 'utf-8');
    } catch (error) {
      console.error('Failed to append evolution record:', error);
    }
  }

  /**
   * Add an evolution record
   */
  addRecord(record: EvolutionRecord): void {
    this.records.push(record);
    this.appendRecord(record);
  }

  /**
   * Get all records for a skill
   */
  getRecords(skillName: string): EvolutionRecord[] {
    return this.records.filter(r => r.skillName === skillName);
  }

  /**
   * Get the latest version for a skill
   */
  getLatestVersion(skillName: string): string | null {
    const records = this.getRecords(skillName);
    if (records.length === 0) {
      return null;
    }
    // Sort by timestamp descending
    records.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return records[0].version;
  }

  /**
   * Get the latest record for a skill
   */
  getLatestRecord(skillName: string): EvolutionRecord | null {
    const records = this.getRecords(skillName);
    if (records.length === 0) {
      return null;
    }
    // Sort by timestamp descending
    records.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return records[0];
  }

  /**
   * Get record by version
   */
  getRecordByVersion(skillName: string, version: string): EvolutionRecord | null {
    return this.records.find(r => r.skillName === skillName && r.version === version) || null;
  }

  /**
   * Update a record
   */
  updateRecord(id: string, updates: Partial<EvolutionRecord>): boolean {
    const index = this.records.findIndex(r => r.id === id);
    if (index !== -1) {
      this.records[index] = { ...this.records[index], ...updates };
      this.save();
      return true;
    }
    return false;
  }

  /**
   * Delete a record
   */
  deleteRecord(id: string): boolean {
    const index = this.records.findIndex(r => r.id === id);
    if (index !== -1) {
      this.records.splice(index, 1);
      this.save();
      return true;
    }
    return false;
  }

  /**
   * Get all records
   */
  getAllRecords(): EvolutionRecord[] {
    return [...this.records];
  }

  /**
   * Get all unique skill names
   */
  getAllSkillNames(): string[] {
    return [...new Set(this.records.map(r => r.skillName))];
  }

  /**
   * Clear all records
   */
  clear(): void {
    this.records = [];
    this.save();
  }

  /**
   * Generate unique record ID
   */
  static generateId(): string {
    return `evo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get database path
   */
  getDbPath(): string {
    return this.dbPath;
  }
}