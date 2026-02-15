import type { VaultManager } from '../vault/vault-manager.js';
import type { ToolResponse } from '../utils/responses.js';
import { jsonResponse } from '../utils/responses.js';

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
  ): Promise<ToolResponse> {
    // Search for notes containing specific tags
    const allFiles = await this.vault.listFiles(vault);
    const mdFiles = allFiles.filter(f => f.extension === '.md');
    const matches: Array<{ path: string; matchedTags: string[] }> = [];

    for (const file of mdFiles) {
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
}
