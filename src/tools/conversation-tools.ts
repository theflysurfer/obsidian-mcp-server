import type { VaultManager } from '../vault/vault-manager.js';
import type { ToolResponse } from '../utils/responses.js';
import { jsonResponse, errorResponse } from '../utils/responses.js';
import { detectConversation, parseConversationMessages } from '../markdown/link-resolver.js';
import type { AISource } from '../markdown/link-resolver.js';
import { stringifyBaseFile } from '../bases/bases-parser.js';
import type { BaseYAML } from '../bases/types.js';

export class ConversationTools {
  constructor(private vault: VaultManager) {}

  /**
   * Search conversations with conversation-aware filtering.
   * Filters by source, date range, speaker, content query, callout types.
   */
  async searchConversations(
    vault?: string,
    options?: Record<string, unknown>,
  ): Promise<ToolResponse> {
    try {
      const allFiles = await this.vault.listFiles(vault);
      const mdFiles = allFiles.filter(f => f.extension === '.md');

      const sourceFilter = options?.source as string | undefined;
      const queryFilter = options?.query as string | undefined;
      const minMessages = options?.minMessages as number | undefined;
      const hasCalloutType = options?.calloutType as string | undefined;
      const dateFrom = options?.dateFrom as string | undefined;
      const dateTo = options?.dateTo as string | undefined;
      const maxResults = (options?.maxResults as number) || 50;
      const folder = options?.folder as string | undefined;

      const results: Array<{
        path: string;
        title: string;
        source: AISource | null;
        created: string | null;
        updated: string | null;
        messageCount: number;
        speakers: string[];
        tags: string[];
        calloutTypes: string[];
      }> = [];

      for (const file of mdFiles) {
        if (results.length >= maxResults) break;

        // Folder filter
        if (folder && !file.path.startsWith(folder)) continue;

        try {
          const note = await this.vault.readNote(file.path, vault);
          const meta = detectConversation(note.content, note.frontmatter);

          if (!meta.isConversation) continue;

          // Source filter
          if (sourceFilter && meta.source?.toLowerCase() !== sourceFilter.toLowerCase()) {
            continue;
          }

          // Min messages filter
          if (minMessages && meta.messageCount < minMessages) continue;

          // Callout type filter
          if (hasCalloutType && !meta.calloutTypes.includes(hasCalloutType.toUpperCase())) {
            continue;
          }

          // Date filters
          const created = note.frontmatter.created as string | undefined;
          if (dateFrom && created && created < dateFrom) continue;
          if (dateTo && created && created > dateTo) continue;

          // Content query filter
          if (queryFilter) {
            const lower = queryFilter.toLowerCase();
            const titleMatch = (note.frontmatter.title as string || '').toLowerCase().includes(lower);
            const bodyMatch = note.body.toLowerCase().includes(lower);
            if (!titleMatch && !bodyMatch) continue;
          }

          results.push({
            path: file.path,
            title: (note.frontmatter.title as string) || file.name,
            source: meta.source,
            created: created || null,
            updated: (note.frontmatter.updated as string) || null,
            messageCount: meta.messageCount,
            speakers: meta.speakers,
            tags: note.tags,
            calloutTypes: meta.calloutTypes,
          });
        } catch {
          // Skip unreadable files
        }
      }

      // Sort by created date descending
      results.sort((a, b) => {
        const da = a.created || '';
        const db = b.created || '';
        return db.localeCompare(da);
      });

      return jsonResponse({
        resultCount: results.length,
        filters: {
          source: sourceFilter || 'all',
          query: queryFilter || null,
          minMessages: minMessages || null,
          calloutType: hasCalloutType || null,
          dateFrom: dateFrom || null,
          dateTo: dateTo || null,
        },
        conversations: results,
      });
    } catch (err) {
      return errorResponse((err as Error).message);
    }
  }

  /**
   * Analyze a single conversation note: extract messages, metadata, stats.
   */
  async analyzeConversation(
    path: string,
    vault?: string,
  ): Promise<ToolResponse> {
    try {
      const note = await this.vault.readNote(path, vault);
      const meta = detectConversation(note.content, note.frontmatter);

      if (!meta.isConversation) {
        return jsonResponse({
          path,
          isConversation: false,
          message: 'This note does not appear to be an AI conversation export.',
        });
      }

      const messages = parseConversationMessages(note.body);

      // Compute stats
      const wordCount = messages.reduce(
        (sum, m) => sum + m.content.split(/\s+/).length,
        0,
      );
      const avgMessageLength = messages.length > 0
        ? Math.round(wordCount / messages.length)
        : 0;

      return jsonResponse({
        path,
        isConversation: true,
        source: meta.source,
        title: note.frontmatter.title || note.path.split('/').pop(),
        created: note.frontmatter.created || null,
        updated: note.frontmatter.updated || null,
        tags: note.tags,
        messageCount: messages.length,
        userMessages: messages.filter(m => m.role === 'user').length,
        assistantMessages: messages.filter(m => m.role === 'assistant').length,
        speakers: meta.speakers,
        wordCount,
        avgMessageLength,
        hasCallouts: meta.hasCallouts,
        calloutTypes: meta.calloutTypes,
        calloutCount: messages.reduce((sum, m) => sum + m.callouts.length, 0),
      });
    } catch (err) {
      return errorResponse((err as Error).message);
    }
  }

  /**
   * Get conversation statistics across the vault.
   */
  async conversationStats(vault?: string): Promise<ToolResponse> {
    try {
      const allFiles = await this.vault.listFiles(vault);
      const mdFiles = allFiles.filter(f => f.extension === '.md');

      const bySources: Record<string, number> = {};
      const byMonth: Record<string, number> = {};
      let totalConversations = 0;
      let totalMessages = 0;

      for (const file of mdFiles) {
        try {
          const note = await this.vault.readNote(file.path, vault);
          const meta = detectConversation(note.content, note.frontmatter);

          if (!meta.isConversation) continue;

          totalConversations++;
          totalMessages += meta.messageCount;

          const source = meta.source || 'unknown';
          bySources[source] = (bySources[source] || 0) + 1;

          const created = note.frontmatter.created as string | undefined;
          if (created) {
            const month = created.substring(0, 7); // YYYY-MM
            byMonth[month] = (byMonth[month] || 0) + 1;
          }
        } catch {
          // Skip
        }
      }

      return jsonResponse({
        totalConversations,
        totalMessages,
        avgMessagesPerConversation: totalConversations > 0
          ? Math.round(totalMessages / totalConversations)
          : 0,
        bySource: bySources,
        byMonth,
      });
    } catch (err) {
      return errorResponse((err as Error).message);
    }
  }

  /**
   * Create a .base file pre-configured for indexing AI conversations.
   * Generates filters and views optimized for the fetch-gpt-chat format.
   */
  async createConversationsBase(
    path: string,
    vault?: string,
    options?: Record<string, unknown>,
  ): Promise<ToolResponse> {
    try {
      const filePath = path.endsWith('.base') ? path : `${path}.base`;
      const sourceFilter = options?.source as string | undefined;
      const folder = options?.folder as string | undefined;

      // Build filters
      const filterParts: string[] = [];
      if (sourceFilter) {
        filterParts.push(`source == "${sourceFilter}"`);
      }
      if (folder) {
        filterParts.push(`file.inFolder("${folder}")`);
      }
      // Always filter to conversation notes via tag
      filterParts.push('file.hasTag("conversation") || file.hasTag("research")');

      const filterExpr = filterParts.length > 1
        ? filterParts.join(' && ')
        : filterParts[0];

      const base: BaseYAML = {
        filters: filterExpr,
        formulas: {
          messageCount: 'length(tags)',
        },
        properties: {
          title: { displayName: 'Title' },
          source: { displayName: 'Source' },
          created: { displayName: 'Created' },
          updated: { displayName: 'Updated' },
        },
        views: [
          {
            type: 'table',
            name: 'All Conversations',
            columns: ['file.name', 'source', 'created', 'updated', 'file.tags'],
            order: [{ property: 'created', direction: 'desc' }],
          },
          {
            type: 'table',
            name: 'By Source',
            columns: ['file.name', 'source', 'created', 'file.tags'],
            order: [{ property: 'source', direction: 'asc' }],
            groupBy: { property: 'source', direction: 'asc' },
          },
          {
            type: 'list',
            name: 'Recent',
            columns: ['file.name', 'source', 'created'],
            order: [{ property: 'created', direction: 'desc' }],
            limit: 20,
          },
        ],
      };

      const content = stringifyBaseFile(base);
      await this.vault.writeFile(filePath, content, vault);

      return jsonResponse({
        created: filePath,
        config: base,
        description: 'Base configured for AI conversation indexing (fetch-gpt-chat compatible)',
      });
    } catch (err) {
      return errorResponse((err as Error).message);
    }
  }
}
