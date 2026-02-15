import type { VaultManager } from '../vault/vault-manager.js';
import type { ToolResponse } from '../utils/responses.js';
import { jsonResponse, textResponse } from '../utils/responses.js';
import { ensureMdExtension } from '../utils/path.js';
import {
  convertToNotionFormat,
  generatePropertyMapping,
} from '../markdown/dual-format.js';

export class ExportTools {
  constructor(private vault: VaultManager) {}

  async exportNote(
    path: string,
    vault?: string,
    options?: {
      format?: 'notion' | 'obsidian';
      convertWikilinks?: boolean;
      convertCallouts?: boolean;
      convertInlineFields?: boolean;
      convertEmbeds?: boolean;
      convertH4Plus?: boolean;
      includePropertyMapping?: boolean;
    },
  ): Promise<ToolResponse> {
    const notePath = ensureMdExtension(path);
    const note = await this.vault.readNote(notePath, vault);

    const format = options?.format ?? 'notion';

    if (format === 'obsidian') {
      // Return as-is
      return textResponse(note.content);
    }

    // Notion export
    const converted = convertToNotionFormat(note, options);

    const result: Record<string, unknown> = {
      path: notePath,
      format: 'notion',
      content: converted,
    };

    if (options?.includePropertyMapping !== false) {
      result.propertyMapping = generatePropertyMapping(note.frontmatter);
    }

    return jsonResponse(result);
  }

  async exportPropertyMapping(
    path: string,
    vault?: string,
  ): Promise<ToolResponse> {
    const notePath = ensureMdExtension(path);
    const note = await this.vault.readNote(notePath, vault);
    const mapping = generatePropertyMapping(note.frontmatter);

    return jsonResponse({
      path: notePath,
      ...mapping,
    });
  }
}
