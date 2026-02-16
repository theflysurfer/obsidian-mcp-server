import type { VaultManager } from '../vault/vault-manager.js';
import type { ToolResponse } from '../utils/responses.js';
import { jsonResponse } from '../utils/responses.js';
import { parseFrontmatter } from '../markdown/frontmatter.js';

export class SearchTools {
  constructor(private vault: VaultManager) {}

  async searchContent(
    query: string,
    vault?: string,
    options?: {
      caseSensitive?: boolean;
      maxResults?: number;
      regex?: boolean;
      path?: string;
    },
  ): Promise<ToolResponse> {
    const results = await this.vault.searchContent(
      query,
      {
        caseSensitive: options?.caseSensitive,
        maxResults: options?.maxResults,
        useRegex: options?.regex,
        directory: options?.path,
      },
      vault,
    );

    return jsonResponse({
      query,
      resultCount: results.length,
      results: results.map(r => ({
        path: r.path,
        matchCount: r.matches.length,
        matches: r.matches.slice(0, 5),
      })),
    });
  }

  async searchFilenames(
    query: string,
    vault?: string,
  ): Promise<ToolResponse> {
    const files = await this.vault.searchFilenames(query, vault);
    return jsonResponse({
      query,
      resultCount: files.length,
      files: files.map(f => ({
        path: f.path,
        name: f.name,
        extension: f.extension,
      })),
    });
  }

  async searchByTags(
    tags: string[],
    vault?: string,
    options?: {
      maxResults?: number;
      directory?: string;
    },
  ): Promise<ToolResponse> {
    const maxResults = options?.maxResults ?? 50;
    // Search for notes containing specific tags
    const allFiles = await this.vault.listFiles(vault, options?.directory);
    const mdFiles = allFiles.filter(f => f.extension === '.md');
    const matches: Array<{ path: string; matchedTags: string[] }> = [];

    for (const file of mdFiles) {
      if (matches.length >= maxResults) break;

      try {
        const note = await this.vault.readNote(file.path, vault);
        const matchedTags = tags.filter(t =>
          note.tags.some(nt => nt === t || nt.startsWith(t + '/'))
        );

        if (matchedTags.length > 0) {
          matches.push({ path: file.path, matchedTags });
        }
      } catch {
        // Skip unreadable files
      }
    }

    return jsonResponse({
      searchedTags: tags,
      resultCount: matches.length,
      results: matches,
    });
  }

  /**
   * Fuzzy filename search using character-level matching.
   */
  async searchFuzzy(
    query: string,
    vault?: string,
    options?: { maxResults?: number; threshold?: number },
  ): Promise<ToolResponse> {
    const maxResults = options?.maxResults ?? 20;
    const threshold = options?.threshold ?? 0.3;

    const files = await this.vault.listFiles(vault);
    const mdFiles = files.filter(f => f.extension === '.md');

    const scored = mdFiles
      .map(f => ({ file: f, score: fuzzyScore(query.toLowerCase(), f.name.toLowerCase()) }))
      .filter(s => s.score >= threshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);

    return jsonResponse({
      query,
      resultCount: scored.length,
      results: scored.map(s => ({
        path: s.file.path,
        name: s.file.name,
        score: Math.round(s.score * 100) / 100,
      })),
    });
  }

  /**
   * Advanced search with combined filters: content, tags, properties, dates.
   */
  async searchAdvanced(
    vault?: string,
    options?: {
      query?: string;
      tags?: string[];
      properties?: Record<string, unknown>;
      dateFrom?: string;
      dateTo?: string;
      path?: string;
      maxResults?: number;
      sortBy?: 'name' | 'modified' | 'created';
      sortOrder?: 'asc' | 'desc';
    },
  ): Promise<ToolResponse> {
    const maxResults = options?.maxResults ?? 50;
    const allFiles = await this.vault.listFiles(vault, options?.path);
    let mdFiles = allFiles.filter(f => f.extension === '.md');

    // Date range filter on file modification time
    if (options?.dateFrom) {
      const from = new Date(options.dateFrom).getTime();
      mdFiles = mdFiles.filter(f => f.stat.mtime >= from);
    }
    if (options?.dateTo) {
      const to = new Date(options.dateTo).getTime() + 86400000; // inclusive
      mdFiles = mdFiles.filter(f => f.stat.mtime <= to);
    }

    // Sort
    const sortBy = options?.sortBy ?? 'modified';
    const sortOrder = options?.sortOrder ?? 'desc';
    mdFiles.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'name') cmp = a.name.localeCompare(b.name);
      else if (sortBy === 'modified') cmp = a.stat.mtime - b.stat.mtime;
      else if (sortBy === 'created') cmp = a.stat.ctime - b.stat.ctime;
      return sortOrder === 'desc' ? -cmp : cmp;
    });

    const results: Array<{
      path: string;
      name: string;
      modified: string;
      matchedTags?: string[];
      matchedProperties?: Record<string, unknown>;
      contentMatches?: number;
    }> = [];

    for (const file of mdFiles) {
      if (results.length >= maxResults) break;

      try {
        const note = await this.vault.readNote(file.path, vault);
        const result: (typeof results)[number] = {
          path: file.path,
          name: file.name,
          modified: new Date(file.stat.mtime).toISOString(),
        };

        // Tag filter
        if (options?.tags && options.tags.length > 0) {
          const matchedTags = options.tags.filter(t =>
            note.tags.some(nt => nt === t || nt.startsWith(t + '/')),
          );
          if (matchedTags.length === 0) continue;
          result.matchedTags = matchedTags;
        }

        // Property filter
        if (options?.properties && Object.keys(options.properties).length > 0) {
          const matchedProps: Record<string, unknown> = {};
          let allMatch = true;
          for (const [key, value] of Object.entries(options.properties)) {
            const noteVal = note.frontmatter[key];
            if (value === '*') {
              // Property exists check
              if (noteVal === undefined) { allMatch = false; break; }
            } else if (Array.isArray(value)) {
              // Any of values
              if (!value.some(v => noteVal === v || (Array.isArray(noteVal) && noteVal.includes(v)))) {
                allMatch = false; break;
              }
            } else {
              if (String(noteVal) !== String(value)) { allMatch = false; break; }
            }
            matchedProps[key] = noteVal;
          }
          if (!allMatch) continue;
          result.matchedProperties = matchedProps;
        }

        // Content filter
        if (options?.query) {
          const lowerQuery = options.query.toLowerCase();
          const lowerContent = note.body.toLowerCase();
          if (!lowerContent.includes(lowerQuery)) continue;

          // Count matches
          let count = 0;
          let idx = 0;
          while ((idx = lowerContent.indexOf(lowerQuery, idx)) !== -1) {
            count++;
            idx += lowerQuery.length;
          }
          result.contentMatches = count;
        }

        results.push(result);
      } catch {
        // Skip unreadable files
      }
    }

    return jsonResponse({
      filters: {
        query: options?.query,
        tags: options?.tags,
        properties: options?.properties,
        dateFrom: options?.dateFrom,
        dateTo: options?.dateTo,
      },
      resultCount: results.length,
      results,
    });
  }

  /**
   * Search by frontmatter property values.
   */
  async searchByProperty(
    vault?: string,
    options?: {
      key: string;
      value?: unknown;
      operator?: 'eq' | 'ne' | 'gt' | 'lt' | 'contains' | 'exists';
      path?: string;
      maxResults?: number;
    },
  ): Promise<ToolResponse> {
    if (!options?.key) {
      return jsonResponse({ error: 'options.key is required' });
    }

    const maxResults = options.maxResults ?? 50;
    const operator = options.operator ?? (options.value !== undefined ? 'eq' : 'exists');
    const allFiles = await this.vault.listFiles(vault, options.path);
    const mdFiles = allFiles.filter(f => f.extension === '.md');

    const matches: Array<{ path: string; value: unknown }> = [];

    for (const file of mdFiles) {
      if (matches.length >= maxResults) break;

      try {
        const raw = await this.vault.readFile(file.path, vault);
        const { frontmatter } = parseFrontmatter(raw);
        const propVal = frontmatter[options.key];

        let match = false;
        switch (operator) {
          case 'exists':
            match = propVal !== undefined;
            break;
          case 'eq':
            match = String(propVal) === String(options.value);
            break;
          case 'ne':
            match = propVal !== undefined && String(propVal) !== String(options.value);
            break;
          case 'gt':
            match = propVal !== undefined && propVal !== null && Number(propVal) > Number(options.value);
            break;
          case 'lt':
            match = propVal !== undefined && propVal !== null && Number(propVal) < Number(options.value);
            break;
          case 'contains':
            if (Array.isArray(propVal)) {
              match = propVal.includes(options.value);
            } else if (typeof propVal === 'string') {
              match = propVal.includes(String(options.value));
            }
            break;
        }

        if (match) {
          matches.push({ path: file.path, value: propVal });
        }
      } catch {
        // Skip unreadable files
      }
    }

    return jsonResponse({
      key: options.key,
      operator,
      value: options.value,
      resultCount: matches.length,
      results: matches,
    });
  }
}

/**
 * Simple fuzzy matching score. Returns 0-1.
 */
function fuzzyScore(query: string, target: string): number {
  if (query.length === 0) return 0;
  if (target.includes(query)) return 1;

  let qi = 0;
  let consecutiveBonus = 0;
  let totalScore = 0;

  for (let ti = 0; ti < target.length && qi < query.length; ti++) {
    if (target[ti] === query[qi]) {
      qi++;
      consecutiveBonus++;
      totalScore += consecutiveBonus;
    } else {
      consecutiveBonus = 0;
    }
  }

  if (qi < query.length) return 0; // Not all chars matched

  const maxPossible = (query.length * (query.length + 1)) / 2;
  return totalScore / maxPossible;
}
