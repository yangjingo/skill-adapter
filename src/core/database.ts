/**
 * Evolution Database - SQLite storage for evolution history
 *
 * Stores evolution trajectories and version comparison data
 */

import * as path from 'path';
import * as fs from 'fs';

// Simple in-memory database implementation (can be replaced with better-sqlite3)
export interface EvolutionRecord {
  id: string;
  skillName: string;
  version: string;
  timestamp: Date;
  telemetryData: string;  // JSON
  patches: string;  // JSON
  evaluationResult?: string;  // JSON
}

export class EvolutionDatabase {
  private dbPath: string;
  private records: EvolutionRecord[] = [];

  constructor(dbPath: string = 'evolution.db') {
    this.dbPath = dbPath;
    this.load();
  }

  /**
   * Load database from file
   */
  private load(): void {
    if (fs.existsSync(this.dbPath)) {
      try {
        const data = fs.readFileSync(this.dbPath, 'utf-8');
        this.records = JSON.parse(data);
        // Convert timestamp strings back to Date objects
        for (const record of this.records) {
          record.timestamp = new Date(record.timestamp);
        }
      } catch (error) {
        console.error('Failed to load evolution database:', error);
        this.records = [];
      }
    }
  }

  /**
   * Save database to file
   */
  save(): void {
    try {
      const data = JSON.stringify(this.records, null, 2);
      fs.writeFileSync(this.dbPath, data, 'utf-8');
    } catch (error) {
      console.error('Failed to save evolution database:', error);
    }
  }

  /**
   * Add an evolution record
   */
  addRecord(record: EvolutionRecord): void {
    this.records.push(record);
    this.save();
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
   * Get record by version
   */
  getRecordByVersion(skillName: string, version: string): EvolutionRecord | null {
    return this.records.find(r => r.skillName === skillName && r.version === version) || null;
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
}