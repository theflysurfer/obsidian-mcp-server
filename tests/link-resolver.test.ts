import { describe, it, expect } from 'vitest';
import {
  extractLinks,
  extractEmbeds,
  extractTags,
  extractInlineFields,
  detectConversation,
  parseConversationMessages,
} from '../src/markdown/link-resolver.js';

describe('extractLinks', () => {
  it('should extract simple wikilinks', () => {
    const body = 'See [[Note A]] and [[Note B]].';
    expect(extractLinks(body)).toEqual(['Note A', 'Note B']);
  });

  it('should extract aliased wikilinks', () => {
    const body = 'Read [[Long Note Name|short]] for info.';
    expect(extractLinks(body)).toEqual(['Long Note Name']);
  });

  it('should extract links with paths', () => {
    const body = 'In [[folder/Note C]] we discuss...';
    expect(extractLinks(body)).toEqual(['folder/Note C']);
  });

  it('should deduplicate links', () => {
    const body = '[[A]] and [[A]] again.';
    expect(extractLinks(body)).toEqual(['A']);
  });

  it('should return empty for no links', () => {
    expect(extractLinks('Just plain text.')).toEqual([]);
  });

  it('should extract links with heading anchors', () => {
    const body = 'See [[Note#heading]] for details.';
    expect(extractLinks(body)).toEqual(['Note#heading']);
  });
});

describe('extractEmbeds', () => {
  it('should extract image embeds', () => {
    const body = 'Look at ![[image.png]] here.';
    expect(extractEmbeds(body)).toEqual(['image.png']);
  });

  it('should extract note embeds', () => {
    const body = 'Embedded: ![[Other Note]]';
    expect(extractEmbeds(body)).toEqual(['Other Note']);
  });

  it('should not confuse embeds with links', () => {
    const body = '[[Link]] and ![[Embed]]';
    expect(extractEmbeds(body)).toEqual(['Embed']);
    expect(extractLinks(body)).toContain('Link');
  });
});

describe('extractTags', () => {
  it('should extract frontmatter tags array', () => {
    const tags = extractTags('', { tags: ['tech', 'coding'] });
    expect(tags).toContain('tech');
    expect(tags).toContain('coding');
  });

  it('should extract frontmatter tags string', () => {
    const tags = extractTags('', { tags: 'single-tag' });
    expect(tags).toContain('single-tag');
  });

  it('should extract inline tags', () => {
    const content = 'This is about #javascript and #web-dev.';
    const tags = extractTags(content, {});
    expect(tags).toContain('javascript');
    expect(tags).toContain('web-dev');
  });

  it('should extract nested tags', () => {
    const content = 'Topic: #lang/french and #lang/spanish';
    const tags = extractTags(content, {});
    expect(tags).toContain('lang/french');
    expect(tags).toContain('lang/spanish');
  });

  it('should not extract tags from code blocks', () => {
    const content = '```\n#not-a-tag\n```\nBut #real-tag is.';
    const tags = extractTags(content, {});
    expect(tags).not.toContain('not-a-tag');
    expect(tags).toContain('real-tag');
  });

  it('should not extract tags from inline code', () => {
    const content = 'Use `#selector` in CSS but #valid-tag.';
    const tags = extractTags(content, {});
    expect(tags).not.toContain('selector');
    expect(tags).toContain('valid-tag');
  });

  it('should normalize # prefix from frontmatter tags', () => {
    const tags = extractTags('', { tags: ['#prefixed', 'unprefixed'] });
    expect(tags).toContain('prefixed');
    expect(tags).toContain('unprefixed');
  });

  it('should merge frontmatter and inline tags', () => {
    const content = '---\ntags:\n  - fm-tag\n---\nInline #body-tag here.';
    const tags = extractTags(content, { tags: ['fm-tag'] });
    expect(tags).toContain('fm-tag');
    expect(tags).toContain('body-tag');
  });
});

describe('extractInlineFields', () => {
  it('should extract Dataview inline fields', () => {
    const body = 'Status:: In Progress\nPriority:: High\nNormal text.';
    const fields = extractInlineFields(body);
    expect(fields).toHaveLength(2);
    expect(fields[0]).toEqual({ key: 'Status', value: 'In Progress', line: 1 });
    expect(fields[1]).toEqual({ key: 'Priority', value: 'High', line: 2 });
  });

  it('should not match single colon', () => {
    const body = 'Key: value with single colon';
    expect(extractInlineFields(body)).toHaveLength(0);
  });
});

describe('detectConversation', () => {
  it('should detect by frontmatter source', () => {
    const result = detectConversation('Some content', { source: 'Claude' });
    expect(result.isConversation).toBe(true);
    expect(result.source).toBe('Claude');
  });

  it('should detect by conversation tag', () => {
    const content = '---\ntags:\n  - conversation\n---\nContent here.';
    const result = detectConversation(content, { tags: ['conversation'] });
    expect(result.isConversation).toBe(true);
  });

  it('should detect by role markers', () => {
    const content = '**User**: Hello\n\n---\n\n**Claude**: Hi there!';
    const result = detectConversation(content, {});
    expect(result.isConversation).toBe(true);
    expect(result.source).toBe('Claude');
    expect(result.messageCount).toBe(2);
    expect(result.userMessageCount).toBe(1);
    expect(result.assistantMessageCount).toBe(1);
  });

  it('should detect ChatGPT conversations', () => {
    const content = '**User**: Question\n\n---\n\n**ChatGPT**: Answer';
    const result = detectConversation(content, { source: 'ChatGPT' });
    expect(result.isConversation).toBe(true);
    expect(result.source).toBe('ChatGPT');
  });

  it('should detect callouts', () => {
    const content = '> [!NOTE] Important\n> This is a callout\n\n> [!TIP] Advice\n> Do this';
    const result = detectConversation(content, {});
    expect(result.hasCallouts).toBe(true);
    expect(result.calloutTypes).toContain('NOTE');
    expect(result.calloutTypes).toContain('TIP');
  });

  it('should not detect regular notes as conversations', () => {
    const content = '# Regular Note\n\nJust some text with no role markers.';
    const result = detectConversation(content, {});
    expect(result.isConversation).toBe(false);
  });
});

describe('parseConversationMessages', () => {
  it('should parse messages separated by ---', () => {
    const body = '**User**: Hello, how are you?\n\n---\n\n**Claude**: I am doing well!';
    const messages = parseConversationMessages(body);
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('user');
    expect(messages[0].speaker).toBe('User');
    expect(messages[0].content).toContain('Hello, how are you?');
    expect(messages[1].role).toBe('assistant');
    expect(messages[1].speaker).toBe('Claude');
  });

  it('should extract callouts from messages', () => {
    const body = `**Claude**: Here is my response.

> [!NOTE] Key Point
> This is important information.

More text after.`;
    const messages = parseConversationMessages(body);
    expect(messages).toHaveLength(1);
    expect(messages[0].callouts).toHaveLength(1);
    expect(messages[0].callouts[0].type).toBe('NOTE');
    expect(messages[0].callouts[0].title).toBe('Key Point');
  });

  it('should handle empty sections', () => {
    const body = '---\n\n---\n\n**User**: Only message';
    const messages = parseConversationMessages(body);
    expect(messages).toHaveLength(1);
  });
});
