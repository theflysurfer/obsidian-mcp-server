import type { VaultManager } from '../vault/vault-manager.js';
import type { ToolResponse } from '../utils/responses.js';
import { jsonResponse, textResponse } from '../utils/responses.js';
import { ensureMdExtension } from '../utils/path.js';
import { invalidParams } from '../utils/errors.js';
import { parseFrontmatter, stringifyNote } from '../markdown/frontmatter.js';

export class ContentTools {
  constructor(private vault: VaultManager) {}

  /**
   * Search and replace text within a note.
   */
  async searchReplace(
    path: string,
    vault?: string,
    options?: {
      search: string;
      replace: string;
      regex?: boolean;
      caseSensitive?: boolean;
      maxReplacements?: number;
    },
  ): Promise<ToolResponse> {
    if (!options?.search) throw invalidParams('options.search is required');
    if (options.replace === undefined) throw invalidParams('options.replace is required');

    const notePath = ensureMdExtension(path);
    const note = await this.vault.readNote(notePath, vault);
    const { frontmatter, body } = parseFrontmatter(note.content);

    const flags = options.caseSensitive ? 'g' : 'gi';
    const pattern = options.regex
      ? new RegExp(options.search, flags)
      : new RegExp(escapeRegex(options.search), flags);

    let count = 0;
    const max = options.maxReplacements ?? Infinity;

    const newBody = body.replace(pattern, (match) => {
      if (count >= max) return match;
      count++;
      return options!.replace;
    });

    if (count === 0) {
      return jsonResponse({ path: notePath, replacements: 0, message: 'No matches found' });
    }

    const newContent = Object.keys(frontmatter).length > 0
      ? stringifyNote(frontmatter, newBody)
      : newBody;

    await this.vault.updateNote(notePath, newContent, vault);
    return jsonResponse({ path: notePath, replacements: count });
  }

  /**
   * Insert content at a specific line number or relative to a heading.
   */
  async insertAt(
    path: string,
    content: string,
    vault?: string,
    options?: {
      line?: number;
      heading?: string;
      position?: 'before' | 'after' | 'end';
    },
  ): Promise<ToolResponse> {
    const notePath = ensureMdExtension(path);
    const note = await this.vault.readNote(notePath, vault);
    const lines = note.content.split('\n');

    let insertIndex: number;

    if (options?.line !== undefined) {
      insertIndex = Math.max(0, Math.min(options.line - 1, lines.length));
    } else if (options?.heading) {
      const headingTarget = options.heading.startsWith('heading:')
        ? options.heading.slice(8)
        : options.heading;

      const position = options.position ?? 'end';
      const { start, end } = findHeadingRange(lines, headingTarget);

      if (start === -1) throw invalidParams(`Heading not found: ${headingTarget}`);

      if (position === 'before') {
        insertIndex = start;
      } else if (position === 'after') {
        insertIndex = start + 1;
      } else {
        // 'end' - insert at end of section
        insertIndex = end;
      }
    } else {
      // Default: append at end
      insertIndex = lines.length;
    }

    lines.splice(insertIndex, 0, content);
    const newContent = lines.join('\n');

    await this.vault.updateNote(notePath, newContent, vault);
    return textResponse(`Inserted content at line ${insertIndex + 1} in ${notePath}`);
  }

  /**
   * List all headings in a note with their levels and line numbers.
   */
  async listHeadings(
    path: string,
    vault?: string,
    options?: { minLevel?: number; maxLevel?: number },
  ): Promise<ToolResponse> {
    const notePath = ensureMdExtension(path);
    const note = await this.vault.readNote(notePath, vault);
    const lines = note.body.split('\n');

    const minLevel = options?.minLevel ?? 1;
    const maxLevel = options?.maxLevel ?? 6;

    const headings: Array<{ level: number; text: string; line: number }> = [];

    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(/^(#{1,6})\s+(.+)$/);
      if (match) {
        const level = match[1].length;
        if (level >= minLevel && level <= maxLevel) {
          headings.push({ level, text: match[2].trim(), line: i + 1 });
        }
      }
    }

    return jsonResponse({ path: notePath, headings });
  }

  /**
   * Get content of a specific heading section.
   */
  async getSection(
    path: string,
    vault?: string,
    options?: { heading: string; includeHeading?: boolean; includeChildren?: boolean },
  ): Promise<ToolResponse> {
    if (!options?.heading) throw invalidParams('options.heading is required');

    const notePath = ensureMdExtension(path);
    const note = await this.vault.readNote(notePath, vault);
    const lines = note.content.split('\n');

    const headingTarget = options.heading.startsWith('heading:')
      ? options.heading.slice(8)
      : options.heading;

    const { start, end } = findHeadingRange(lines, headingTarget);
    if (start === -1) throw invalidParams(`Heading not found: ${headingTarget}`);

    const includeHeading = options.includeHeading !== false;
    const startLine = includeHeading ? start : start + 1;
    const sectionLines = lines.slice(startLine, end);

    return jsonResponse({
      path: notePath,
      heading: headingTarget,
      lineStart: startLine + 1,
      lineEnd: end,
      content: sectionLines.join('\n'),
    });
  }

  /**
   * Rename a heading within a note.
   */
  async renameHeading(
    path: string,
    vault?: string,
    options?: { oldHeading: string; newHeading: string },
  ): Promise<ToolResponse> {
    if (!options?.oldHeading) throw invalidParams('options.oldHeading is required');
    if (!options?.newHeading) throw invalidParams('options.newHeading is required');

    const notePath = ensureMdExtension(path);
    const note = await this.vault.readNote(notePath, vault);
    const lines = note.content.split('\n');

    let found = false;
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(/^(#{1,6})\s+(.+)$/);
      if (match && match[2].trim() === options.oldHeading) {
        lines[i] = `${match[1]} ${options.newHeading}`;
        found = true;
        break;
      }
    }

    if (!found) throw invalidParams(`Heading not found: ${options.oldHeading}`);

    await this.vault.updateNote(notePath, lines.join('\n'), vault);
    return textResponse(`Renamed heading "${options.oldHeading}" to "${options.newHeading}" in ${notePath}`);
  }
}

function findHeadingRange(
  lines: string[],
  headingTarget: string,
): { start: number; end: number; level: number } {
  let start = -1;
  let end = lines.length;
  let level = 0;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      if (match[2].trim() === headingTarget && start === -1) {
        start = i;
        level = match[1].length;
      } else if (start !== -1 && match[1].length <= level) {
        end = i;
        break;
      }
    }
  }

  return { start, end, level };
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
