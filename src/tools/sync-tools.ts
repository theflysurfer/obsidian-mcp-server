import crypto from 'crypto';
import type { VaultManager } from '../vault/vault-manager.js';
import type { ToolResponse } from '../utils/responses.js';
import { jsonResponse, textResponse } from '../utils/responses.js';
import { invalidParams } from '../utils/errors.js';
import { parseFrontmatter } from '../markdown/frontmatter.js';

/**
 * Sync state entry for a single note.
 */
interface SyncEntry {
  path: string;
  contentHash: string;
  mtime: number;
  lastSynced?: string;
  notionPageId?: string;
  status: 'new' | 'modified' | 'synced' | 'deleted' | 'conflict';
}

/**
 * Property type mapping from Obsidian to Notion.
 */
const PROPERTY_TYPE_MAP: Record<string, string> = {
  text: 'rich_text',
  number: 'number',
  checkbox: 'checkbox',
  date: 'date',
  datetime: 'date',
  list: 'multi_select',
  tags: 'multi_select',
  aliases: 'rich_text',
  url: 'url',
  email: 'email',
  phone: 'phone_number',
};

export class SyncTools {
  constructor(private vault: VaultManager) {}

  /**
   * Generate a sync plan: analyze notes and produce Notion API operations as JSON.
   * Does NOT execute the sync — returns the plan for Claude Code to execute via Notion MCP.
   */
  async syncPlan(
    vault?: string,
    options?: {
      path?: string;
      syncStatePath?: string;
      databaseId?: string;
      filter?: {
        tags?: string[];
        properties?: Record<string, unknown>;
        modifiedSince?: string;
      };
      dryRun?: boolean;
    },
  ): Promise<ToolResponse> {
    const syncStatePath = options?.syncStatePath ?? '.obsidian/sync-state.json';
    const directory = options?.path;

    // Load existing sync state
    let syncState: Record<string, SyncEntry> = {};
    try {
      const raw = await this.vault.readFile(syncStatePath, vault);
      syncState = JSON.parse(raw);
    } catch {
      // No existing sync state, start fresh
    }

    // Scan vault files
    const files = await this.vault.listFiles(vault, directory);
    const mdFiles = files.filter(f => f.extension === '.md');

    const operations: Array<{
      action: 'create' | 'update' | 'skip';
      path: string;
      reason: string;
      properties?: Record<string, unknown>;
      contentPreview?: string;
    }> = [];

    const currentPaths = new Set<string>();

    for (const file of mdFiles) {
      currentPaths.add(file.path);

      try {
        const raw = await this.vault.readFile(file.path, vault);
        const contentHash = hashContent(raw);
        const { frontmatter } = parseFrontmatter(raw);

        // Apply filters
        if (options?.filter) {
          if (options.filter.tags && options.filter.tags.length > 0) {
            const noteTags = (frontmatter.tags as string[] | undefined) ?? [];
            const hasTag = options.filter.tags.some(t =>
              noteTags.some((nt: string) => nt === t || nt.startsWith(t + '/')),
            );
            if (!hasTag) continue;
          }

          if (options.filter.properties) {
            let match = true;
            for (const [key, value] of Object.entries(options.filter.properties)) {
              if (String(frontmatter[key]) !== String(value)) {
                match = false;
                break;
              }
            }
            if (!match) continue;
          }

          if (options.filter.modifiedSince) {
            const since = new Date(options.filter.modifiedSince).getTime();
            if (file.stat.mtime < since) continue;
          }
        }

        const existing = syncState[file.path];

        if (!existing) {
          // New note
          operations.push({
            action: 'create',
            path: file.path,
            reason: 'New note not yet synced',
            properties: mapProperties(frontmatter),
            contentPreview: raw.slice(0, 200),
          });
        } else if (existing.contentHash !== contentHash) {
          // Modified since last sync
          operations.push({
            action: 'update',
            path: file.path,
            reason: 'Content changed since last sync',
            properties: mapProperties(frontmatter),
            contentPreview: raw.slice(0, 200),
          });
        } else {
          operations.push({
            action: 'skip',
            path: file.path,
            reason: 'No changes since last sync',
          });
        }
      } catch {
        // Skip unreadable files
      }
    }

    // Detect deleted notes
    for (const path of Object.keys(syncState)) {
      if (!currentPaths.has(path)) {
        operations.push({
          action: 'skip',
          path,
          reason: 'Note deleted from vault (Notion page preserved)',
        });
      }
    }

    const creates = operations.filter(o => o.action === 'create');
    const updates = operations.filter(o => o.action === 'update');
    const skips = operations.filter(o => o.action === 'skip');

    return jsonResponse({
      summary: {
        total: mdFiles.length,
        toCreate: creates.length,
        toUpdate: updates.length,
        skipped: skips.length,
        databaseId: options?.databaseId,
      },
      operations: operations.filter(o => o.action !== 'skip'),
      propertyTypeMap: PROPERTY_TYPE_MAP,
    });
  }

  /**
   * Update sync state after successful sync operations.
   */
  async updateSyncState(
    vault?: string,
    options?: {
      syncStatePath?: string;
      entries: Array<{
        path: string;
        notionPageId?: string;
        status: 'synced' | 'error';
      }>;
    },
  ): Promise<ToolResponse> {
    if (!options?.entries) throw invalidParams('options.entries is required');

    const syncStatePath = options.syncStatePath ?? '.obsidian/sync-state.json';

    // Load existing state
    let syncState: Record<string, SyncEntry> = {};
    try {
      const raw = await this.vault.readFile(syncStatePath, vault);
      syncState = JSON.parse(raw);
    } catch {
      // Start fresh
    }

    let updated = 0;
    for (const entry of options.entries) {
      if (entry.status === 'synced') {
        try {
          const raw = await this.vault.readFile(entry.path, vault);
          const files = await this.vault.listFiles(vault);
          const file = files.find(f => f.path === entry.path);

          syncState[entry.path] = {
            path: entry.path,
            contentHash: hashContent(raw),
            mtime: file?.stat.mtime ?? Date.now(),
            lastSynced: new Date().toISOString(),
            notionPageId: entry.notionPageId || syncState[entry.path]?.notionPageId,
            status: 'synced',
          };
          updated++;
        } catch {
          // Skip
        }
      }
    }

    await this.vault.writeFile(syncStatePath, JSON.stringify(syncState, null, 2), vault);
    return textResponse(`Updated sync state: ${updated} entries`);
  }

  /**
   * Get current sync status overview.
   */
  async syncStatus(
    vault?: string,
    options?: { syncStatePath?: string; path?: string },
  ): Promise<ToolResponse> {
    const syncStatePath = options?.syncStatePath ?? '.obsidian/sync-state.json';

    let syncState: Record<string, SyncEntry> = {};
    try {
      const raw = await this.vault.readFile(syncStatePath, vault);
      syncState = JSON.parse(raw);
    } catch {
      return jsonResponse({
        initialized: false,
        message: 'No sync state found. Run sync_plan first.',
      });
    }

    const entries = Object.values(syncState);
    const synced = entries.filter(e => e.status === 'synced').length;
    const modified = entries.filter(e => e.status === 'modified').length;
    const newEntries = entries.filter(e => e.status === 'new').length;

    // Check for modifications since last sync
    let modifiedSinceSync = 0;
    const files = await this.vault.listFiles(vault, options?.path);
    for (const file of files.filter(f => f.extension === '.md')) {
      const entry = syncState[file.path];
      if (entry && file.stat.mtime > new Date(entry.lastSynced ?? 0).getTime()) {
        modifiedSinceSync++;
      }
    }

    return jsonResponse({
      initialized: true,
      totalTracked: entries.length,
      synced,
      modified,
      new: newEntries,
      modifiedSinceSync,
      lastSyncDate: entries
        .filter(e => e.lastSynced)
        .map(e => e.lastSynced!)
        .sort()
        .pop() ?? null,
    });
  }
}

function hashContent(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

function mapProperties(
  frontmatter: Record<string, unknown>,
): Record<string, unknown> {
  const mapped: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(frontmatter)) {
    const type = inferPropertyType(key, value);
    mapped[key] = {
      obsidianValue: value,
      notionType: PROPERTY_TYPE_MAP[type] ?? 'rich_text',
      notionValue: convertValue(value, type),
    };
  }

  return mapped;
}

function inferPropertyType(key: string, value: unknown): string {
  if (key === 'tags') return 'tags';
  if (key === 'aliases') return 'aliases';
  if (typeof value === 'boolean') return 'checkbox';
  if (typeof value === 'number') return 'number';
  if (value instanceof Date) return 'date';
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'date';
    if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(value)) return 'datetime';
    if (/^https?:\/\//.test(value)) return 'url';
  }
  if (Array.isArray(value)) return 'list';
  return 'text';
}

function convertValue(value: unknown, type: string): unknown {
  switch (type) {
    case 'tags':
    case 'list':
      return Array.isArray(value)
        ? (value as string[]).map(v => ({ name: String(v) }))
        : [];
    case 'checkbox':
      return Boolean(value);
    case 'number':
      return Number(value);
    case 'date':
    case 'datetime':
      return { start: String(value) };
    case 'url':
      return String(value);
    default:
      return String(value ?? '');
  }
}
