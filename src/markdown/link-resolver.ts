/**
 * Extract wikilinks [[target]] and [[target|display]] from markdown body.
 */
export function extractLinks(body: string): string[] {
  const regex = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
  const links: Set<string> = new Set();
  let match;

  while ((match = regex.exec(body)) !== null) {
    // Exclude embeds (![[...]]) - those start with ! which won't be in capture group
    links.add(match[1].trim());
  }

  // Also remove any that came from embed syntax by checking the character before
  return Array.from(links);
}

/**
 * Extract embeds ![[target]] from markdown body.
 */
export function extractEmbeds(body: string): string[] {
  const regex = /!\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
  const embeds: Set<string> = new Set();
  let match;

  while ((match = regex.exec(body)) !== null) {
    embeds.add(match[1].trim());
  }

  return Array.from(embeds);
}

/**
 * Extract all tags from content and frontmatter.
 * - Frontmatter: tags property (array or string)
 * - Inline: #tag and #tag/subtag
 */
export function extractTags(
  content: string,
  frontmatter: Record<string, unknown>,
): string[] {
  const tags: Set<string> = new Set();

  // From frontmatter
  if (frontmatter.tags) {
    if (Array.isArray(frontmatter.tags)) {
      for (const tag of frontmatter.tags) {
        if (typeof tag === 'string') {
          tags.add(normalizeTag(tag));
        }
      }
    } else if (typeof frontmatter.tags === 'string') {
      tags.add(normalizeTag(frontmatter.tags));
    }
  }

  // From inline content (skip code blocks and frontmatter)
  const bodyWithoutCode = content
    .replace(/^---[\s\S]*?---\n?/, '') // Remove frontmatter
    .replace(/```[\s\S]*?```/g, '')     // Remove code blocks
    .replace(/`[^`]+`/g, '');           // Remove inline code

  const tagRegex = /(?:^|\s)#([a-zA-Z0-9_/\-]+)/g;
  let match;

  while ((match = tagRegex.exec(bodyWithoutCode)) !== null) {
    tags.add(normalizeTag(match[1]));
  }

  return Array.from(tags);
}

/**
 * Extract Dataview inline fields (key:: value) from content.
 */
export function extractInlineFields(
  body: string,
): Array<{ key: string; value: string; line: number }> {
  const fields: Array<{ key: string; value: string; line: number }> = [];
  const lines = body.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^([a-zA-Z_][\w\s]*?)::(.*)$/);
    if (match) {
      fields.push({
        key: match[1].trim(),
        value: match[2].trim(),
        line: i + 1,
      });
    }
  }

  return fields;
}

function normalizeTag(tag: string): string {
  return tag.startsWith('#') ? tag.slice(1) : tag;
}
