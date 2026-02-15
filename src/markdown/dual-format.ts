import type { NoteContent } from '../types.js';
import { mapFrontmatterToNotion, detectLinkProperties } from '../properties/type-mapper.js';
import { extractInlineFields } from './link-resolver.js';
import { stringifyNote } from './frontmatter.js';

export interface DualFormatOptions {
  format: 'obsidian' | 'notion';
  convertWikilinks?: boolean;
  convertCallouts?: boolean;
  convertInlineFields?: boolean;
  convertEmbeds?: boolean;
  convertH4Plus?: boolean;
  includePropertyMapping?: boolean;
}

const DEFAULT_OPTIONS: DualFormatOptions = {
  format: 'notion',
  convertWikilinks: true,
  convertCallouts: true,
  convertInlineFields: true,
  convertEmbeds: true,
  convertH4Plus: true,
  includePropertyMapping: true,
};

/**
 * Convert a note to Notion-compatible markdown format.
 */
export function convertToNotionFormat(
  note: NoteContent,
  options?: Partial<DualFormatOptions>,
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  let body = note.body;
  const frontmatter = { ...note.frontmatter };

  // 1. Convert inline fields (key:: value) to frontmatter properties
  if (opts.convertInlineFields) {
    const inlineFields = extractInlineFields(body);
    for (const field of inlineFields) {
      frontmatter[field.key] = field.value;
    }
    // Remove inline fields from body
    body = removeInlineFields(body);
  }

  // 2. Convert wikilinks [[target]] and [[target|display]]
  if (opts.convertWikilinks) {
    body = convertWikilinks(body);
    // Also convert wikilinks in frontmatter values
    for (const [key, value] of Object.entries(frontmatter)) {
      if (typeof value === 'string' && /\[\[/.test(value)) {
        frontmatter[key] = value.replace(
          /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
          (_m, target, display) => display || target,
        );
      }
      if (Array.isArray(value)) {
        frontmatter[key] = value.map(v => {
          if (typeof v === 'string' && /\[\[/.test(v)) {
            return v.replace(
              /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
              (_m, target, display) => display || target,
            );
          }
          return v;
        });
      }
    }
  }

  // 3. Convert embeds ![[file]]
  if (opts.convertEmbeds) {
    body = convertEmbeds(body);
  }

  // 4. Convert Obsidian callouts > [!TYPE] to GFM callout format
  // (already compatible - both use > [!TYPE] syntax)
  // Just ensure the format is clean GFM
  if (opts.convertCallouts) {
    body = normalizeCallouts(body);
  }

  // 5. Convert H4+ to bold paragraphs (Notion only supports H1-H3)
  if (opts.convertH4Plus) {
    body = convertH4Plus(body);
  }

  // 6. Remove inline tags from body (already in frontmatter)
  body = removeInlineTags(body);

  return stringifyNote(frontmatter, body);
}

/**
 * Generate a property mapping report for the note.
 */
export function generatePropertyMapping(
  frontmatter: Record<string, unknown>,
): {
  properties: Array<{
    key: string;
    obsidianType: string;
    notionType: string;
    value: unknown;
    notionValue: unknown;
  }>;
  linkProperties: string[];
} {
  const mapped = mapFrontmatterToNotion(frontmatter);
  const linkProps = detectLinkProperties(frontmatter);

  return {
    properties: mapped.map(m => ({
      key: m.obsidianKey,
      obsidianType: m.obsidianType,
      notionType: m.notionType,
      value: m.value,
      notionValue: m.notionValue,
    })),
    linkProperties: linkProps,
  };
}

// ─── Transformation helpers ────────────────────────

/**
 * Convert [[wikilinks]] to standard markdown links.
 * [[Page Name]] -> [Page Name](Page%20Name.md)
 * [[Page Name|Display]] -> [Display](Page%20Name.md)
 */
function convertWikilinks(body: string): string {
  return body.replace(
    /(?<!!)\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
    (_match, target: string, display: string | undefined) => {
      const linkTarget = target.trim();
      const linkDisplay = display?.trim() || linkTarget;
      const encoded = encodeURIComponent(linkTarget + '.md').replace(/%2F/g, '/');
      return `[${linkDisplay}](${encoded})`;
    },
  );
}

/**
 * Convert ![[embeds]] to standard markdown.
 * ![[image.png]] -> ![image.png](image.png)
 * ![[note]] -> [Embedded: note](note.md)
 */
function convertEmbeds(body: string): string {
  return body.replace(
    /!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
    (_match, target: string, display: string | undefined) => {
      const trimmed = target.trim();
      const ext = trimmed.split('.').pop()?.toLowerCase() || '';
      const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp'];

      if (imageExts.includes(ext)) {
        const alt = display?.trim() || trimmed;
        return `![${alt}](${encodeURIComponent(trimmed)})`;
      }

      // Non-image embed -> link
      const linkDisplay = display?.trim() || trimmed;
      return `[${linkDisplay}](${encodeURIComponent(trimmed + '.md')})`;
    },
  );
}

/**
 * Normalize callouts to clean GFM format.
 * Obsidian: > [!NOTE] Title  ->  > [!NOTE]
 *           > content            > **Title**
 *                                > content
 */
function normalizeCallouts(body: string): string {
  const lines = body.split('\n');
  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const calloutMatch = lines[i].match(/^>\s*\[!([\w]+)\]\s*(.*)?$/);

    if (calloutMatch) {
      const type = calloutMatch[1].toUpperCase();
      const title = calloutMatch[2]?.trim();

      result.push(`> [!${type}]`);
      if (title) {
        result.push(`> **${title}**`);
      }
    } else {
      result.push(lines[i]);
    }
  }

  return result.join('\n');
}

/**
 * Convert H4-H6 to bold paragraphs (Notion only supports H1-H3).
 */
function convertH4Plus(body: string): string {
  return body.replace(
    /^(#{4,6})\s+(.+)$/gm,
    (_match, _hashes, title) => `**${title.trim()}**`,
  );
}

/**
 * Remove inline fields (key:: value) from body.
 */
function removeInlineFields(body: string): string {
  return body
    .split('\n')
    .filter(line => !/^[a-zA-Z_][\w\s]*?::/.test(line))
    .join('\n');
}

/**
 * Remove inline #tags from body text (they're already captured in frontmatter).
 */
function removeInlineTags(body: string): string {
  // Only remove standalone tags, not those in code blocks
  const lines = body.split('\n');
  let inCodeBlock = false;

  return lines
    .map(line => {
      if (line.startsWith('```')) {
        inCodeBlock = !inCodeBlock;
        return line;
      }
      if (inCodeBlock) return line;

      // Remove standalone tags but keep #heading references
      return line.replace(/(?:^|\s)#([a-zA-Z0-9_/\-]+)(?=\s|$)/g, '').trimEnd();
    })
    .join('\n');
}
