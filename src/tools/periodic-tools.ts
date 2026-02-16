import type { VaultManager } from '../vault/vault-manager.js';
import type { ToolResponse } from '../utils/responses.js';
import { jsonResponse } from '../utils/responses.js';

type PeriodType = 'daily' | 'weekly' | 'monthly';

const DEFAULT_CONFIGS: Record<PeriodType, { folder: string; dateFormat: string }> = {
  daily: { folder: 'Daily Notes', dateFormat: 'YYYY-MM-DD' },
  weekly: { folder: 'Weekly Notes', dateFormat: 'YYYY-[W]WW' },
  monthly: { folder: 'Monthly Notes', dateFormat: 'YYYY-MM' },
};

export class PeriodicTools {
  constructor(private vault: VaultManager) {}

  /**
   * Get or create a periodic note (daily/weekly/monthly).
   */
  async getOrCreatePeriodic(
    vault?: string,
    options?: {
      period: PeriodType;
      date?: string;
      folder?: string;
      template?: string;
      createIfMissing?: boolean;
    },
  ): Promise<ToolResponse> {
    const period = options?.period ?? 'daily';
    const defaults = DEFAULT_CONFIGS[period];
    const folder = options?.folder ?? defaults.folder;
    const dateStr = options?.date ?? this.getCurrentDateStr(period);
    const noteName = `${dateStr}.md`;
    const notePath = `${folder}/${noteName}`;

    const exists = await this.vault.fileExists(notePath, vault);

    if (exists) {
      const note = await this.vault.readNote(notePath, vault);
      return jsonResponse({
        path: notePath,
        exists: true,
        created: false,
        frontmatter: note.frontmatter,
        content: note.body,
      });
    }

    if (options?.createIfMissing === false) {
      return jsonResponse({ path: notePath, exists: false, created: false });
    }

    // Create the periodic note
    const frontmatter: Record<string, unknown> = {
      date: dateStr,
      type: period,
    };

    let body = `# ${this.formatTitle(period, dateStr)}\n\n`;

    if (options?.template) {
      try {
        const templateContent = await this.vault.readFile(options.template, vault);
        body = templateContent;
      } catch {
        // Template not found, use default
      }
    }

    await this.vault.createNote(notePath, body, frontmatter, vault);
    return jsonResponse({
      path: notePath,
      exists: true,
      created: true,
      frontmatter,
    });
  }

  /**
   * Navigate between periodic notes (previous/next).
   */
  async navigatePeriodic(
    vault?: string,
    options?: {
      period: PeriodType;
      date?: string;
      direction: 'previous' | 'next';
      folder?: string;
    },
  ): Promise<ToolResponse> {
    const period = options?.period ?? 'daily';
    const direction = options?.direction ?? 'next';
    const folder = options?.folder ?? DEFAULT_CONFIGS[period].folder;
    const currentDate = options?.date ?? this.getCurrentDateStr(period);

    const targetDate = this.shiftDate(currentDate, period, direction === 'next' ? 1 : -1);
    const notePath = `${folder}/${targetDate}.md`;

    const exists = await this.vault.fileExists(notePath, vault);

    if (exists) {
      const note = await this.vault.readNote(notePath, vault);
      return jsonResponse({
        path: notePath,
        date: targetDate,
        exists: true,
        frontmatter: note.frontmatter,
        content: note.body,
      });
    }

    return jsonResponse({
      path: notePath,
      date: targetDate,
      exists: false,
    });
  }

  /**
   * List periodic notes in a date range.
   */
  async listPeriodic(
    vault?: string,
    options?: {
      period: PeriodType;
      folder?: string;
      limit?: number;
      from?: string;
      to?: string;
    },
  ): Promise<ToolResponse> {
    const period = options?.period ?? 'daily';
    const folder = options?.folder ?? DEFAULT_CONFIGS[period].folder;
    const limit = options?.limit ?? 30;

    const allFiles = await this.vault.listFiles(vault, folder);
    let mdFiles = allFiles
      .filter(f => f.extension === '.md')
      .sort((a, b) => b.name.localeCompare(a.name)); // Newest first

    // Filter by date range if specified
    if (options?.from) {
      mdFiles = mdFiles.filter(f => f.name >= options.from!);
    }
    if (options?.to) {
      mdFiles = mdFiles.filter(f => f.name <= options.to!);
    }

    const notes = mdFiles.slice(0, limit).map(f => ({
      path: f.path,
      date: f.name,
      modified: new Date(f.stat.mtime).toISOString(),
    }));

    return jsonResponse({
      period,
      folder,
      count: notes.length,
      notes,
    });
  }

  // --- Private helpers ---

  private getCurrentDateStr(period: PeriodType): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');

    switch (period) {
      case 'daily':
        return `${year}-${month}-${day}`;
      case 'weekly': {
        const weekNum = this.getISOWeek(now);
        return `${year}-W${String(weekNum).padStart(2, '0')}`;
      }
      case 'monthly':
        return `${year}-${month}`;
    }
  }

  private formatTitle(period: PeriodType, dateStr: string): string {
    switch (period) {
      case 'daily': return dateStr;
      case 'weekly': return `Week ${dateStr}`;
      case 'monthly': return dateStr;
    }
  }

  private shiftDate(dateStr: string, period: PeriodType, offset: number): string {
    if (period === 'daily') {
      const d = new Date(dateStr);
      d.setDate(d.getDate() + offset);
      return d.toISOString().slice(0, 10);
    } else if (period === 'weekly') {
      // YYYY-Www
      const match = dateStr.match(/^(\d{4})-W(\d{2})$/);
      if (!match) return dateStr;
      let [, yearStr, weekStr] = match;
      let year = parseInt(yearStr);
      let week = parseInt(weekStr) + offset;
      if (week < 1) { year--; week = 52; }
      if (week > 52) { year++; week = 1; }
      return `${year}-W${String(week).padStart(2, '0')}`;
    } else {
      // YYYY-MM
      const [yearStr, monthStr] = dateStr.split('-');
      let year = parseInt(yearStr);
      let month = parseInt(monthStr) + offset;
      if (month < 1) { year--; month = 12; }
      if (month > 12) { year++; month = 1; }
      return `${year}-${String(month).padStart(2, '0')}`;
    }
  }

  private getISOWeek(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  }
}
