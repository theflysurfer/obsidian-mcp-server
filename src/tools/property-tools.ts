import type { VaultManager } from '../vault/vault-manager.js';
import type { ToolResponse } from '../utils/responses.js';
import { jsonResponse, textResponse } from '../utils/responses.js';
import { ensureMdExtension } from '../utils/path.js';
import {
  updateFrontmatterProperty,
  removeFrontmatterProperty,
  mergeFrontmatter,
} from '../markdown/frontmatter.js';

export class PropertyTools {
  constructor(private vault: VaultManager) {}

  async getProperty(
    path: string,
    key: string,
    vault?: string,
  ): Promise<ToolResponse> {
    const notePath = ensureMdExtension(path);
    const note = await this.vault.readNote(notePath, vault);
    const value = note.frontmatter[key];

    return jsonResponse({
      path: notePath,
      key,
      value: value ?? null,
      exists: key in note.frontmatter,
    });
  }

  async setProperty(
    path: string,
    key: string,
    value: unknown,
    vault?: string,
  ): Promise<ToolResponse> {
    const notePath = ensureMdExtension(path);
    const content = await this.vault.readFile(notePath, vault);
    const updated = updateFrontmatterProperty(content, key, value);
    await this.vault.updateNote(notePath, updated, vault);

    return textResponse(`Set property "${key}" on ${notePath}`);
  }

  async deleteProperty(
    path: string,
    key: string,
    vault?: string,
  ): Promise<ToolResponse> {
    const notePath = ensureMdExtension(path);
    const content = await this.vault.readFile(notePath, vault);
    const updated = removeFrontmatterProperty(content, key);
    await this.vault.updateNote(notePath, updated, vault);

    return textResponse(`Removed property "${key}" from ${notePath}`);
  }

  async getAllProperties(
    path: string,
    vault?: string,
  ): Promise<ToolResponse> {
    const notePath = ensureMdExtension(path);
    const note = await this.vault.readNote(notePath, vault);

    return jsonResponse({
      path: notePath,
      properties: note.frontmatter,
      propertyCount: Object.keys(note.frontmatter).length,
    });
  }

  async bulkUpdateProperties(
    files: string[],
    properties: Record<string, unknown>,
    vault?: string,
  ): Promise<ToolResponse> {
    const results: Array<{ path: string; success: boolean; error?: string }> = [];

    for (const file of files) {
      const notePath = ensureMdExtension(file);
      try {
        const content = await this.vault.readFile(notePath, vault);
        const updated = mergeFrontmatter(content, properties);
        await this.vault.updateNote(notePath, updated, vault);
        results.push({ path: notePath, success: true });
      } catch (err) {
        results.push({
          path: notePath,
          success: false,
          error: (err as Error).message,
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    return jsonResponse({
      updated: successCount,
      failed: results.length - successCount,
      total: results.length,
      results,
    });
  }
}
