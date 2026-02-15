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

// ─── Conversation-aware extraction ────────────────────────

/** Known AI source names from conversation exports. */
const AI_SOURCES = ['Claude', 'ChatGPT', 'Perplexity', 'Mistral', 'DeepSeek', 'Gemini'] as const;
export type AISource = typeof AI_SOURCES[number];

export interface ConversationMessage {
  role: 'user' | 'assistant';
  speaker: string;           // "User", "Claude", "ChatGPT", etc.
  content: string;
  callouts: ConversationCallout[];
}

export interface ConversationCallout {
  type: string;              // NOTE, INFO, TIP, CAUTION, QUOTE, EXAMPLE, ABSTRACT
  title: string;
  content: string;
}

export interface ConversationMetadata {
  isConversation: boolean;
  source: AISource | null;
  messageCount: number;
  userMessageCount: number;
  assistantMessageCount: number;
  speakers: string[];
  hasCallouts: boolean;
  calloutTypes: string[];
}

/**
 * Detect if a note is an AI conversation export and extract metadata.
 * Looks for the fetch-gpt-chat unified format:
 * - Frontmatter with source: Claude|ChatGPT|Perplexity|...
 * - Tags containing conversation/research
 * - Role markers: **User**:, **Claude**:, **ChatGPT**:, etc.
 * - Message separators: ---
 */
export function detectConversation(
  content: string,
  frontmatter: Record<string, unknown>,
): ConversationMetadata {
  const result: ConversationMetadata = {
    isConversation: false,
    source: null,
    messageCount: 0,
    userMessageCount: 0,
    assistantMessageCount: 0,
    speakers: [],
    hasCallouts: false,
    calloutTypes: [],
  };

  // 1. Check frontmatter source field
  if (typeof frontmatter.source === 'string') {
    const src = frontmatter.source as string;
    if (AI_SOURCES.includes(src as AISource)) {
      result.source = src as AISource;
      result.isConversation = true;
    }
  }

  // 2. Check tags for conversation/research indicators
  const tags = extractTags(content, frontmatter);
  const convTags = ['conversation', 'research'];
  const sourceTags = AI_SOURCES.map(s => s.toLowerCase());
  if (tags.some(t => convTags.includes(t))) {
    result.isConversation = true;
  }
  if (!result.source) {
    for (const tag of tags) {
      const idx = sourceTags.indexOf(tag);
      if (idx >= 0) {
        result.source = AI_SOURCES[idx];
        result.isConversation = true;
        break;
      }
    }
  }

  // 3. Parse role markers
  const roleRegex = /^\*\*(\w+(?:\s*\(.*?\))?)\*\*\s*:/gm;
  const speakers = new Set<string>();
  const calloutTypes = new Set<string>();
  let match;

  while ((match = roleRegex.exec(content)) !== null) {
    const speaker = match[1].replace(/\s*\(.*?\)/, '').trim(); // strip "(tool call)" etc.
    speakers.add(speaker);
    result.messageCount++;
    if (speaker === 'User') {
      result.userMessageCount++;
    } else {
      result.assistantMessageCount++;
    }
  }

  result.speakers = Array.from(speakers);

  // Infer source from assistant speaker if not in frontmatter
  if (!result.source && speakers.size > 0) {
    for (const speaker of speakers) {
      if (AI_SOURCES.includes(speaker as AISource)) {
        result.source = speaker as AISource;
        result.isConversation = true;
        break;
      }
    }
  }

  // 4. Parse callouts
  const calloutRegex = /^>\s*\[!([\w]+)\]/gm;
  while ((match = calloutRegex.exec(content)) !== null) {
    calloutTypes.add(match[1].toUpperCase());
    result.hasCallouts = true;
  }
  result.calloutTypes = Array.from(calloutTypes);

  // 5. Final heuristic: if we found role markers with "User" + AI speaker
  if (result.messageCount >= 2 && speakers.has('User') && speakers.size >= 2) {
    result.isConversation = true;
  }

  return result;
}

/**
 * Parse conversation messages from a note body.
 * Splits on --- separators and extracts role markers + callouts.
 */
export function parseConversationMessages(body: string): ConversationMessage[] {
  const messages: ConversationMessage[] = [];
  // Split on horizontal rules (--- with optional surrounding blank lines)
  const sections = body.split(/\n\s*---\s*\n/);

  for (const section of sections) {
    const trimmed = section.trim();
    if (!trimmed) continue;

    // Match role marker: **Speaker**: or **Speaker (annotation)**:
    const roleMatch = trimmed.match(/^\*\*(\w+(?:\s*\(.*?\))?)\*\*\s*:\s*([\s\S]*)$/);
    if (!roleMatch) continue;

    const speaker = roleMatch[1].replace(/\s*\(.*?\)/, '').trim();
    const content = roleMatch[2].trim();

    // Extract callouts from content
    const callouts: ConversationCallout[] = [];
    const calloutRegex = /^>\s*\[!([\w]+)\]\s*(.*?)$\n((?:^>.*$\n?)*)/gm;
    let calloutMatch;
    while ((calloutMatch = calloutRegex.exec(content)) !== null) {
      const calloutContent = calloutMatch[3]
        .split('\n')
        .map(l => l.replace(/^>\s?/, ''))
        .join('\n')
        .trim();
      callouts.push({
        type: calloutMatch[1].toUpperCase(),
        title: calloutMatch[2].trim(),
        content: calloutContent,
      });
    }

    const role = speaker === 'User' ? 'user' : 'assistant';
    messages.push({ role, speaker, content, callouts });
  }

  return messages;
}
