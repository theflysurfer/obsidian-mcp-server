import type { VaultManager } from '../vault/vault-manager.js';
import type { ToolResponse } from '../utils/responses.js';
import { jsonResponse, textResponse } from '../utils/responses.js';
import { invalidParams } from '../utils/errors.js';
import { ensureMdExtension } from '../utils/path.js';

interface VaultTask {
  path: string;
  line: number;
  text: string;
  status: 'todo' | 'done' | 'cancelled' | 'in-progress';
  tags: string[];
  due?: string;
  priority?: string;
}

const TASK_REGEX = /^(\s*)-\s+\[([ xX\-\/])\]\s+(.+)$/;

export class TaskTools {
  constructor(private vault: VaultManager) {}

  /**
   * List tasks across the vault or within a specific note/directory.
   */
  async listTasks(
    vault?: string,
    options?: {
      path?: string;
      status?: 'todo' | 'done' | 'cancelled' | 'in-progress' | 'all';
      tag?: string;
      maxResults?: number;
      includeCompleted?: boolean;
    },
  ): Promise<ToolResponse> {
    const maxResults = options?.maxResults ?? 100;
    const statusFilter = options?.status ?? (options?.includeCompleted ? 'all' : 'todo');
    const directory = options?.path;

    const files = await this.vault.listFiles(vault, directory);
    const mdFiles = files.filter(f => f.extension === '.md');
    const allTasks: VaultTask[] = [];

    for (const file of mdFiles) {
      if (allTasks.length >= maxResults) break;

      try {
        const note = await this.vault.readNote(file.path, vault);
        const tasks = extractTasks(note.content, file.path);
        for (const task of tasks) {
          if (allTasks.length >= maxResults) break;
          if (statusFilter !== 'all' && task.status !== statusFilter) continue;
          if (options?.tag && !task.tags.includes(options.tag)) continue;
          allTasks.push(task);
        }
      } catch {
        // Skip unreadable files
      }
    }

    return jsonResponse({
      count: allTasks.length,
      tasks: allTasks,
    });
  }

  /**
   * Toggle or update a task's status in a note.
   */
  async updateTask(
    path: string,
    vault?: string,
    options?: {
      line: number;
      status: 'todo' | 'done' | 'cancelled' | 'in-progress';
    },
  ): Promise<ToolResponse> {
    if (!options?.line) throw invalidParams('options.line is required');
    if (!options?.status) throw invalidParams('options.status is required');

    const notePath = ensureMdExtension(path);
    const note = await this.vault.readNote(notePath, vault);
    const lines = note.content.split('\n');

    const lineIndex = options.line - 1;
    if (lineIndex < 0 || lineIndex >= lines.length) {
      throw invalidParams(`Line ${options.line} is out of range`);
    }

    const match = lines[lineIndex].match(TASK_REGEX);
    if (!match) {
      throw invalidParams(`Line ${options.line} is not a task`);
    }

    const marker = statusToMarker(options.status);
    lines[lineIndex] = lines[lineIndex].replace(/\[[ xX\-\/]\]/, `[${marker}]`);

    // Add completion date for done tasks
    if (options.status === 'done' && !lines[lineIndex].includes('✅')) {
      const today = new Date().toISOString().slice(0, 10);
      lines[lineIndex] += ` ✅ ${today}`;
    }

    await this.vault.updateNote(notePath, lines.join('\n'), vault);
    return textResponse(`Updated task at line ${options.line} to ${options.status}`);
  }

  /**
   * Get task statistics across the vault.
   */
  async taskStats(
    vault?: string,
    options?: { path?: string },
  ): Promise<ToolResponse> {
    const directory = options?.path;
    const files = await this.vault.listFiles(vault, directory);
    const mdFiles = files.filter(f => f.extension === '.md');

    let total = 0;
    let todo = 0;
    let done = 0;
    let cancelled = 0;
    let inProgress = 0;
    const byTag: Record<string, number> = {};
    const byFile: Array<{ path: string; total: number; done: number }> = [];

    for (const file of mdFiles) {
      try {
        const note = await this.vault.readNote(file.path, vault);
        const tasks = extractTasks(note.content, file.path);
        if (tasks.length === 0) continue;

        let fileDone = 0;
        for (const task of tasks) {
          total++;
          if (task.status === 'todo') todo++;
          else if (task.status === 'done') { done++; fileDone++; }
          else if (task.status === 'cancelled') cancelled++;
          else if (task.status === 'in-progress') inProgress++;

          for (const tag of task.tags) {
            byTag[tag] = (byTag[tag] ?? 0) + 1;
          }
        }

        byFile.push({ path: file.path, total: tasks.length, done: fileDone });
      } catch {
        // Skip unreadable files
      }
    }

    // Sort files by most tasks
    byFile.sort((a, b) => b.total - a.total);

    return jsonResponse({
      total,
      todo,
      done,
      cancelled,
      inProgress,
      completionRate: total > 0 ? Math.round((done / total) * 100) : 0,
      byTag,
      topFiles: byFile.slice(0, 10),
    });
  }
}

function extractTasks(content: string, filePath: string): VaultTask[] {
  const lines = content.split('\n');
  const tasks: VaultTask[] = [];

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(TASK_REGEX);
    if (!match) continue;

    const [, , marker, text] = match;
    const status = markerToStatus(marker);

    // Extract inline tags
    const tags: string[] = [];
    const tagMatches = text.matchAll(/#([\w\-/]+)/g);
    for (const tm of tagMatches) {
      tags.push(tm[1]);
    }

    // Extract due date (📅 YYYY-MM-DD or due:YYYY-MM-DD)
    const dueMatch = text.match(/(?:📅|due:)\s*(\d{4}-\d{2}-\d{2})/);
    const due = dueMatch ? dueMatch[1] : undefined;

    // Extract priority (🔺 high, 🔼 medium, 🔽 low, or !, !!, !!!)
    let priority: string | undefined;
    if (text.includes('🔺') || text.includes('!!!')) priority = 'high';
    else if (text.includes('🔼') || /(?<!\!)!!(?!\!)/.test(text)) priority = 'medium';
    else if (text.includes('🔽') || /(?<!\!)!(?!\!)/.test(text)) priority = 'low';

    tasks.push({ path: filePath, line: i + 1, text: text.trim(), status, tags, due, priority });
  }

  return tasks;
}

function markerToStatus(marker: string): VaultTask['status'] {
  switch (marker) {
    case ' ': return 'todo';
    case 'x':
    case 'X': return 'done';
    case '-': return 'cancelled';
    case '/': return 'in-progress';
    default: return 'todo';
  }
}

function statusToMarker(status: VaultTask['status']): string {
  switch (status) {
    case 'todo': return ' ';
    case 'done': return 'x';
    case 'cancelled': return '-';
    case 'in-progress': return '/';
  }
}
