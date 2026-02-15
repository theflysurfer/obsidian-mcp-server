import type {
  ObsidianPropertyType,
  NotionPropertyType,
  PropertyMapping,
} from './types.js';

const OBSIDIAN_TO_NOTION: Record<ObsidianPropertyType, NotionPropertyType> = {
  text: 'rich_text',
  list: 'multi_select',
  number: 'number',
  checkbox: 'checkbox',
  date: 'date',
  datetime: 'date',
  tags: 'multi_select',
  aliases: 'rich_text',
  cssclasses: 'multi_select',
};

/**
 * Infer Obsidian property type from a key and value.
 */
export function inferPropertyType(
  key: string,
  value: unknown,
): ObsidianPropertyType {
  // Special keys
  if (key === 'tags') return 'tags';
  if (key === 'aliases') return 'aliases';
  if (key === 'cssclasses') return 'cssclasses';
  // AI conversation fields (fetch-gpt-chat unified format)
  if (key === 'source') return 'text';
  if (key === 'created') return 'datetime';
  if (key === 'updated') return 'datetime';

  // Type-based inference
  if (typeof value === 'boolean') return 'checkbox';
  if (typeof value === 'number') return 'number';
  if (Array.isArray(value)) return 'list';
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return 'datetime';
    // Match both "2025-06-15" and "2025-06-15 10:30:00" (fetch-gpt-chat format)
    if (/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}(:\d{2})?)?$/.test(value)) return 'date';
    return 'text';
  }

  return 'text';
}

/**
 * Map an Obsidian property type to its Notion equivalent.
 */
export function mapToNotionType(
  obsidianType: ObsidianPropertyType,
): NotionPropertyType {
  return OBSIDIAN_TO_NOTION[obsidianType];
}

/**
 * Detect properties containing [[wikilinks]] (candidates for Notion relations).
 */
export function detectLinkProperties(
  frontmatter: Record<string, unknown>,
): string[] {
  const linkKeys: string[] = [];
  for (const [key, value] of Object.entries(frontmatter)) {
    if (typeof value === 'string' && /\[\[.*\]\]/.test(value)) {
      linkKeys.push(key);
    }
    if (
      Array.isArray(value) &&
      value.some(v => typeof v === 'string' && /\[\[.*\]\]/.test(v))
    ) {
      linkKeys.push(key);
    }
  }
  return linkKeys;
}

/**
 * Map a full frontmatter object to Notion-compatible properties.
 */
export function mapFrontmatterToNotion(
  frontmatter: Record<string, unknown>,
): Array<PropertyMapping & { value: unknown; notionValue: unknown }> {
  const result: Array<PropertyMapping & { value: unknown; notionValue: unknown }> = [];

  for (const [key, value] of Object.entries(frontmatter)) {
    const obsidianType = inferPropertyType(key, value);
    const notionType = mapToNotionType(obsidianType);

    const notionValue = transformValue(value, obsidianType, notionType);

    result.push({
      obsidianKey: key,
      obsidianType,
      notionType,
      value,
      notionValue,
    });
  }

  return result;
}

/**
 * Transform a value from Obsidian format to Notion format.
 */
function transformValue(
  value: unknown,
  _obsidianType: ObsidianPropertyType,
  notionType: NotionPropertyType,
): unknown {
  switch (notionType) {
    case 'multi_select': {
      if (Array.isArray(value)) {
        return value.map(v => String(v));
      }
      if (typeof value === 'string') {
        return value.split(',').map(v => v.trim());
      }
      return [String(value)];
    }

    case 'date': {
      if (typeof value === 'string') {
        // Obsidian: "2025-06-15" or "2025-06-15T10:30:00"
        // fetch-gpt-chat: "2025-06-15 10:30:00" (no T, no timezone)
        // Notion: { start: "2025-06-15" } or { start: "2025-06-15T10:30:00" }
        const normalized = value.includes(' ') && !value.includes('T')
          ? value.replace(' ', 'T') // "2025-06-15 10:30:00" -> "2025-06-15T10:30:00"
          : value;
        return { start: normalized };
      }
      return null;
    }

    case 'rich_text': {
      if (Array.isArray(value)) {
        return value.join(', ');
      }
      // Strip wikilinks for Notion
      if (typeof value === 'string') {
        return value.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, target, display) =>
          display || target,
        );
      }
      return String(value);
    }

    case 'checkbox':
      return Boolean(value);

    case 'number':
      return Number(value);

    default:
      return value;
  }
}
