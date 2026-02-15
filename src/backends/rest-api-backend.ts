import type { IVaultBackend } from './types.js';
import type { VaultFile, NoteContent, SearchOptions, SearchResult } from '../types.js';
import { parseFrontmatter, stringifyNote } from '../markdown/frontmatter.js';
import { extractLinks, extractEmbeds, extractTags } from '../markdown/link-resolver.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('rest-api');

/**
 * REST API backend for Obsidian Local REST API plugin.
 * https://github.com/coddingtonbear/obsidian-local-rest-api
 *
 * Requires the plugin to be installed and running in Obsidian.
 * Default endpoint: https://127.0.0.1:27124
 */
export class RestApiBackend implements IVaultBackend {
  readonly backendType = 'rest-api' as const;
  readonly name = 'Obsidian Local REST API';

  private baseUrl = '';
  private apiKey = '';
  private vaultName = '';

  constructor(options?: { baseUrl?: string; apiKey?: string }) {
    this.baseUrl = options?.baseUrl || process.env.OBSIDIAN_REST_URL || 'https://127.0.0.1:27124';
    this.apiKey = options?.apiKey || process.env.OBSIDIAN_REST_API_KEY || '';
  }

  async isAvailable(): Promise<boolean> {
    try {
      const res = await this.request('GET', '/');
      return res.status === 200;
    } catch {
      return false;
    }
  }

  async connect(vaultPath: string): Promise<void> {
    // For REST API, vaultPath is used as vault name identifier
    // The actual vault path is managed by the Obsidian app
    this.vaultName = vaultPath.split('/').pop() || vaultPath.split('\\').pop() || vaultPath;

    const available = await this.isAvailable();
    if (!available) {
      throw new Error(
        `Cannot connect to Obsidian REST API at ${this.baseUrl}. ` +
        'Ensure Obsidian is running and the Local REST API plugin is enabled.',
      );
    }

    log.info(`Connected to Obsidian REST API: ${this.baseUrl}`);
  }

  async disconnect(): Promise<void> {
    this.vaultName = '';
  }

  async listFiles(directory?: string): Promise<VaultFile[]> {
    const endpoint = directory ? `/vault/${encodeURIPath(directory)}/` : '/vault/';
    const res = await this.request('GET', endpoint);
    const data = await res.json() as { files: string[] };

    const files: VaultFile[] = [];
    for (const filePath of data.files || []) {
      if (filePath.startsWith('.')) continue;
      const name = filePath.split('/').pop() || filePath;
      const ext = name.includes('.') ? `.${name.split('.').pop()}` : '';

      files.push({
        path: filePath,
        name: name.replace(/\.[^.]+$/, ''),
        extension: ext,
        stat: { size: 0, ctime: 0, mtime: 0 }, // REST API doesn't provide stat by default
      });
    }

    return files;
  }

  async listDirectories(directory?: string): Promise<string[]> {
    const files = await this.listFiles(directory);
    const dirs = new Set<string>();

    for (const file of files) {
      const parts = file.path.split('/');
      if (parts.length > 1) {
        dirs.add(parts.slice(0, -1).join('/'));
      }
    }

    return Array.from(dirs).sort();
  }

  async fileExists(path: string): Promise<boolean> {
    try {
      const res = await this.request('GET', `/vault/${encodeURIPath(path)}`, {
        headers: { Accept: 'application/vnd.olrapi.note+json' },
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async readNote(filePath: string): Promise<NoteContent> {
    const res = await this.request('GET', `/vault/${encodeURIPath(filePath)}`, {
      headers: { Accept: 'text/markdown' },
    });

    if (!res.ok) {
      throw new Error(`Note not found: ${filePath} (${res.status})`);
    }

    const raw = await res.text();
    const { frontmatter, body } = parseFrontmatter(raw);
    const tags = extractTags(raw, frontmatter);
    const links = extractLinks(body);
    const embeds = extractEmbeds(body);

    return {
      path: filePath,
      content: raw,
      frontmatter,
      body,
      tags,
      links,
      embeds,
    };
  }

  async createNote(
    filePath: string,
    content: string,
    frontmatter?: Record<string, unknown>,
  ): Promise<void> {
    const fullContent = frontmatter
      ? stringifyNote(frontmatter, content)
      : content;

    const res = await this.request('PUT', `/vault/${encodeURIPath(filePath)}`, {
      headers: { 'Content-Type': 'text/markdown' },
      body: fullContent,
    });

    if (!res.ok) {
      throw new Error(`Failed to create note: ${filePath} (${res.status})`);
    }

    log.info(`Created note via REST API: ${filePath}`);
  }

  async updateNote(filePath: string, content: string): Promise<void> {
    const res = await this.request('PUT', `/vault/${encodeURIPath(filePath)}`, {
      headers: { 'Content-Type': 'text/markdown' },
      body: content,
    });

    if (!res.ok) {
      throw new Error(`Failed to update note: ${filePath} (${res.status})`);
    }

    log.info(`Updated note via REST API: ${filePath}`);
  }

  async deleteNote(filePath: string): Promise<void> {
    const res = await this.request('DELETE', `/vault/${encodeURIPath(filePath)}`);

    if (!res.ok) {
      throw new Error(`Failed to delete note: ${filePath} (${res.status})`);
    }

    log.info(`Deleted note via REST API: ${filePath}`);
  }

  async moveNote(oldPath: string, newPath: string): Promise<void> {
    // REST API doesn't have native move - read, create, delete
    const note = await this.readNote(oldPath);
    await this.createNote(newPath, note.content);
    await this.deleteNote(oldPath);

    log.info(`Moved note via REST API: ${oldPath} -> ${newPath}`);
  }

  async searchContent(
    query: string,
    options: SearchOptions = {},
  ): Promise<SearchResult[]> {
    const params = new URLSearchParams({ query });
    if (options.directory) params.set('contextLength', '100');

    const res = await this.request('POST', '/search/simple/', {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, contextLength: 100 }),
    });

    if (!res.ok) {
      // Fallback: do client-side search
      return this.clientSideSearch(query, options);
    }

    const data = await res.json() as Array<{
      filename: string;
      matches: Array<{ match: { start: number; end: number }; context: string }>;
    }>;

    const results: SearchResult[] = [];
    const maxResults = options.maxResults || 50;

    for (const item of data) {
      if (results.length >= maxResults) break;

      results.push({
        path: item.filename,
        matches: item.matches.map((m, i) => ({
          line: i + 1, // REST API doesn't provide line numbers
          text: m.context,
        })),
      });
    }

    return results;
  }

  async searchFilenames(pattern: string): Promise<VaultFile[]> {
    const allFiles = await this.listFiles();
    const lower = pattern.toLowerCase();
    return allFiles.filter(f => f.name.toLowerCase().includes(lower));
  }

  async readFile(filePath: string): Promise<string> {
    const res = await this.request('GET', `/vault/${encodeURIPath(filePath)}`, {
      headers: { Accept: 'text/markdown' },
    });

    if (!res.ok) {
      throw new Error(`File not found: ${filePath} (${res.status})`);
    }

    return res.text();
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    const res = await this.request('PUT', `/vault/${encodeURIPath(filePath)}`, {
      headers: { 'Content-Type': 'text/markdown' },
      body: content,
    });

    if (!res.ok) {
      throw new Error(`Failed to write file: ${filePath} (${res.status})`);
    }
  }

  async getVaultInfo(): Promise<{
    name: string;
    path: string;
    noteCount: number;
    fileCount: number;
  }> {
    const files = await this.listFiles();
    const noteCount = files.filter(f => f.extension === '.md').length;

    return {
      name: this.vaultName,
      path: this.baseUrl,
      noteCount,
      fileCount: files.length,
    };
  }

  // --- Private helpers ---

  private async request(
    method: string,
    endpoint: string,
    options?: { headers?: Record<string, string>; body?: string },
  ): Promise<Response> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      ...options?.headers,
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    return fetch(url, {
      method,
      headers,
      body: options?.body,
    });
  }

  private async clientSideSearch(
    query: string,
    options: SearchOptions = {},
  ): Promise<SearchResult[]> {
    const files = await this.listFiles(options.directory);
    const mdFiles = files.filter(f => f.extension === '.md');
    const results: SearchResult[] = [];
    const maxResults = options.maxResults || 50;
    const flags = options.caseSensitive ? 'g' : 'gi';
    const pattern = options.useRegex
      ? new RegExp(query, flags)
      : new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);

    for (const file of mdFiles) {
      if (results.length >= maxResults) break;

      try {
        const content = await this.readFile(file.path);
        const lines = content.split('\n');
        const matches: Array<{ line: number; text: string }> = [];

        for (let i = 0; i < lines.length; i++) {
          if (pattern.test(lines[i])) {
            matches.push({ line: i + 1, text: lines[i].trim() });
            pattern.lastIndex = 0;
          }
        }

        if (matches.length > 0) {
          results.push({ path: file.path, matches });
        }
      } catch {
        // Skip files that can't be read
      }
    }

    return results;
  }
}

/**
 * Encode path segments for the REST API URL.
 */
function encodeURIPath(p: string): string {
  return p.split('/').map(s => encodeURIComponent(s)).join('/');
}
