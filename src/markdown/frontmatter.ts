import YAML from 'yaml';

const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/**
 * Parse YAML frontmatter from a note's raw content.
 * Returns the frontmatter object and the body (content without frontmatter).
 */
export function parseFrontmatter(content: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  const match = content.match(FRONTMATTER_REGEX);

  if (!match) {
    return { frontmatter: {}, body: content };
  }

  let frontmatter: Record<string, unknown> = {};
  try {
    const parsed = YAML.parse(match[1]);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      frontmatter = parsed as Record<string, unknown>;
    }
  } catch {
    // Invalid YAML, treat as no frontmatter
    return { frontmatter: {}, body: content };
  }

  const body = content.slice(match[0].length);
  return { frontmatter, body };
}

/**
 * Stringify frontmatter + body back into a complete note.
 */
export function stringifyNote(
  frontmatter: Record<string, unknown>,
  body: string,
): string {
  const keys = Object.keys(frontmatter);
  if (keys.length === 0) {
    return body;
  }

  const yamlStr = YAML.stringify(frontmatter, { lineWidth: 0 }).trimEnd();
  return `---\n${yamlStr}\n---\n${body}`;
}

/**
 * Update a single frontmatter property in raw note content.
 * If the note has no frontmatter, it creates one.
 */
export function updateFrontmatterProperty(
  content: string,
  key: string,
  value: unknown,
): string {
  const { frontmatter, body } = parseFrontmatter(content);
  frontmatter[key] = value;
  return stringifyNote(frontmatter, body);
}

/**
 * Remove a frontmatter property from raw note content.
 */
export function removeFrontmatterProperty(
  content: string,
  key: string,
): string {
  const { frontmatter, body } = parseFrontmatter(content);
  delete frontmatter[key];
  return stringifyNote(frontmatter, body);
}

/**
 * Merge multiple properties into existing frontmatter.
 */
export function mergeFrontmatter(
  content: string,
  properties: Record<string, unknown>,
): string {
  const { frontmatter, body } = parseFrontmatter(content);
  Object.assign(frontmatter, properties);
  return stringifyNote(frontmatter, body);
}
