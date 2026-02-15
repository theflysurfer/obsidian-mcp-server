import type { VaultManager } from '../vault/vault-manager.js';
import type { ToolResponse } from '../utils/responses.js';
import { jsonResponse, textResponse } from '../utils/responses.js';
import { ensureMdExtension } from '../utils/path.js';
import { parseFrontmatter, stringifyNote } from '../markdown/frontmatter.js';

export class TagTools {
  constructor(private vault: VaultManager) {}

  async addTags(
    path: string,
    tags: string[],
    vault?: string,
  ): Promise<ToolResponse> {
    const notePath = ensureMdExtension(path);
    const content = await this.vault.readFile(notePath, vault);
    const { frontmatter, body } = parseFrontmatter(content);

    const existingTags: string[] = Array.isArray(frontmatter.tags)
      ? frontmatter.tags.map(String)
      : frontmatter.tags
        ? [String(frontmatter.tags)]
        : [];

    const normalizedNew = tags.map(t => t.startsWith('#') ? t.slice(1) : t);
    const merged = [...new Set([...existingTags, ...normalizedNew])];

    frontmatter.tags = merged;
    const updated = stringifyNote(frontmatter, body);
    await this.vault.updateNote(notePath, updated, vault);

    return textResponse(`Added tags [${normalizedNew.join(', ')}] to ${notePath}`);
  }

  async removeTags(
    path: string,
    tags: string[],
    vault?: string,
  ): Promise<ToolResponse> {
    const notePath = ensureMdExtension(path);
    const content = await this.vault.readFile(notePath, vault);
    const { frontmatter, body } = parseFrontmatter(content);

    const existingTags: string[] = Array.isArray(frontmatter.tags)
      ? frontmatter.tags.map(String)
      : [];

    const normalizedRemove = new Set(
      tags.map(t => t.startsWith('#') ? t.slice(1) : t),
    );

    const filteredTags = existingTags.filter(t => !normalizedRemove.has(t));
    if (filteredTags.length === 0) {
      delete frontmatter.tags;
    } else {
      frontmatter.tags = filteredTags;
    }

    const updated = stringifyNote(frontmatter, body);
    await this.vault.updateNote(notePath, updated, vault);

    return textResponse(`Removed tags [${tags.join(', ')}] from ${notePath}`);
  }

  async renameTag(
    oldTag: string,
    newTag: string,
    vault?: string,
  ): Promise<ToolResponse> {
    const oldNormalized = oldTag.startsWith('#') ? oldTag.slice(1) : oldTag;
    const newNormalized = newTag.startsWith('#') ? newTag.slice(1) : newTag;

    const allFiles = await this.vault.listFiles(vault);
    const mdFiles = allFiles.filter(f => f.extension === '.md');
    let updatedCount = 0;

    for (const file of mdFiles) {
      try {
        const content = await this.vault.readFile(file.path, vault);
        const { frontmatter, body } = parseFrontmatter(content);
        let changed = false;

        // Update frontmatter tags
        if (Array.isArray(frontmatter.tags)) {
          const idx = frontmatter.tags.indexOf(oldNormalized);
          if (idx !== -1) {
            frontmatter.tags[idx] = newNormalized;
            changed = true;
          }
        }

        // Update inline tags in body
        const tagRegex = new RegExp(
          `(^|\\s)#${escapeRegex(oldNormalized)}(?=[\\s,;.!?)\\]]|$)`,
          'gm',
        );
        const newBody = body.replace(tagRegex, `$1#${newNormalized}`);
        if (newBody !== body) {
          changed = true;
        }

        if (changed) {
          const updated = stringifyNote(frontmatter, newBody);
          await this.vault.updateNote(file.path, updated, vault);
          updatedCount++;
        }
      } catch {
        // Skip unreadable files
      }
    }

    return textResponse(
      `Renamed tag #${oldNormalized} -> #${newNormalized} in ${updatedCount} files`,
    );
  }

  async listAllTags(vault?: string): Promise<ToolResponse> {
    const allFiles = await this.vault.listFiles(vault);
    const mdFiles = allFiles.filter(f => f.extension === '.md');
    const tagCounts: Map<string, number> = new Map();

    for (const file of mdFiles) {
      try {
        const note = await this.vault.readNote(file.path, vault);
        for (const tag of note.tags) {
          tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
        }
      } catch {
        // Skip unreadable files
      }
    }

    const sorted = Array.from(tagCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([tag, count]) => ({ tag, count }));

    return jsonResponse({
      totalUniqueTags: sorted.length,
      tags: sorted,
    });
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
