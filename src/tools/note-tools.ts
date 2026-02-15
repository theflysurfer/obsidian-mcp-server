import type { VaultManager } from '../vault/vault-manager.js';
import type { ToolResponse } from '../utils/responses.js';
import { jsonResponse, textResponse } from '../utils/responses.js';
import { ensureMdExtension } from '../utils/path.js';
import { invalidParams } from '../utils/errors.js';
import {
  parseFrontmatter,
  stringifyNote,
} from '../markdown/frontmatter.js';

export class NoteTools {
  constructor(private vault: VaultManager) {}

  async read(
    path: string,
    vault?: string,
    options?: {
      includeContent?: boolean;
      includeFrontmatter?: boolean;
      includeLinks?: boolean;
    },
  ): Promise<ToolResponse> {
    const notePath = ensureMdExtension(path);
    const note = await this.vault.readNote(notePath, vault);

    const result: Record<string, unknown> = {
      path: note.path,
    };

    if (options?.includeFrontmatter !== false) {
      result.frontmatter = note.frontmatter;
    }

    if (options?.includeContent !== false) {
      result.content = note.body;
    }

    if (options?.includeLinks !== false) {
      result.links = note.links;
      result.embeds = note.embeds;
      result.tags = note.tags;
    }

    return jsonResponse(result);
  }

  async create(
    path: string,
    content: string,
    vault?: string,
    options?: {
      frontmatter?: Record<string, unknown>;
      folder?: string;
    },
  ): Promise<ToolResponse> {
    let notePath = ensureMdExtension(path);

    if (options?.folder) {
      notePath = `${options.folder}/${notePath}`;
    }

    await this.vault.createNote(notePath, content, options?.frontmatter, vault);
    return textResponse(`Created note: ${notePath}`);
  }

  async edit(
    path: string,
    content: string,
    vault?: string,
    options?: {
      operation?: 'append' | 'prepend' | 'replace';
      target?: string;
    },
  ): Promise<ToolResponse> {
    const notePath = ensureMdExtension(path);
    const operation = options?.operation || 'append';
    const note = await this.vault.readNote(notePath, vault);

    let newContent: string;

    switch (operation) {
      case 'append':
        newContent = note.content + '\n' + content;
        break;

      case 'prepend': {
        // Prepend after frontmatter if present
        const { frontmatter, body } = parseFrontmatter(note.content);
        const newBody = content + '\n' + body;
        newContent = Object.keys(frontmatter).length > 0
          ? stringifyNote(frontmatter, newBody)
          : newBody;
        break;
      }

      case 'replace': {
        if (options?.target) {
          // Replace within a specific heading section
          newContent = replaceInSection(note.content, options.target, content);
        } else {
          // Replace entire body, keep frontmatter
          const { frontmatter } = parseFrontmatter(note.content);
          newContent = Object.keys(frontmatter).length > 0
            ? stringifyNote(frontmatter, content)
            : content;
        }
        break;
      }

      default:
        throw invalidParams(`Invalid operation: ${operation}`);
    }

    await this.vault.updateNote(notePath, newContent, vault);
    return textResponse(`Updated note: ${notePath} (${operation})`);
  }

  async delete(path: string, vault?: string): Promise<ToolResponse> {
    const notePath = ensureMdExtension(path);
    await this.vault.deleteNote(notePath, vault);
    return textResponse(`Deleted note: ${notePath}`);
  }

  async move(
    oldPath: string,
    newPath: string,
    vault?: string,
  ): Promise<ToolResponse> {
    const oldNotePath = ensureMdExtension(oldPath);
    const newNotePath = ensureMdExtension(newPath);
    await this.vault.moveNote(oldNotePath, newNotePath, vault);
    return textResponse(`Moved note: ${oldNotePath} -> ${newNotePath}`);
  }
}

/**
 * Replace content under a specific heading.
 */
function replaceInSection(
  content: string,
  heading: string,
  replacement: string,
): string {
  const lines = content.split('\n');
  const headingTarget = heading.startsWith('heading:')
    ? heading.slice(8)
    : heading;

  let sectionStart = -1;
  let sectionEnd = lines.length;
  let headingLevel = 0;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      if (match[2].trim() === headingTarget && sectionStart === -1) {
        sectionStart = i;
        headingLevel = match[1].length;
      } else if (sectionStart !== -1 && match[1].length <= headingLevel) {
        sectionEnd = i;
        break;
      }
    }
  }

  if (sectionStart === -1) {
    throw invalidParams(`Heading not found: ${headingTarget}`);
  }

  const before = lines.slice(0, sectionStart + 1);
  const after = lines.slice(sectionEnd);

  return [...before, replacement, ...after].join('\n');
}
