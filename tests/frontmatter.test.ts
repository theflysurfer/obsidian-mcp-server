import { describe, it, expect } from 'vitest';
import {
  parseFrontmatter,
  stringifyNote,
  updateFrontmatterProperty,
  removeFrontmatterProperty,
  mergeFrontmatter,
} from '../src/markdown/frontmatter.js';

describe('parseFrontmatter', () => {
  it('should parse valid YAML frontmatter', () => {
    const content = `---
title: Test Note
tags:
  - test
  - example
---
# Content here`;

    const { frontmatter, body } = parseFrontmatter(content);
    expect(frontmatter.title).toBe('Test Note');
    expect(frontmatter.tags).toEqual(['test', 'example']);
    expect(body).toBe('# Content here');
  });

  it('should handle notes without frontmatter', () => {
    const content = '# Just a heading\n\nSome content.';
    const { frontmatter, body } = parseFrontmatter(content);
    expect(frontmatter).toEqual({});
    expect(body).toBe(content);
  });

  it('should handle empty frontmatter', () => {
    // The regex requires content between --- delimiters, so ---\n--- is not matched
    const content = '---\n---\n# Content';
    const { frontmatter, body } = parseFrontmatter(content);
    expect(frontmatter).toEqual({});
    // Empty frontmatter is treated as no frontmatter
    expect(body).toBe(content);
  });

  it('should handle frontmatter with only whitespace', () => {
    const content = '---\n \n---\n# Content';
    const { frontmatter, body } = parseFrontmatter(content);
    expect(frontmatter).toEqual({});
    expect(body).toBe('# Content');
  });

  it('should handle invalid YAML gracefully', () => {
    const content = '---\n: invalid: yaml: here\n---\n# Content';
    const { frontmatter, body } = parseFrontmatter(content);
    expect(frontmatter).toEqual({});
    expect(body).toBe(content);
  });

  it('should handle frontmatter with dates', () => {
    const content = `---
created: 2025-01-15 10:30:00
updated: 2025-02-10
---
Body text`;

    const { frontmatter } = parseFrontmatter(content);
    expect(frontmatter.created).toBeDefined();
    expect(frontmatter.updated).toBeDefined();
  });

  it('should handle Windows line endings (CRLF)', () => {
    const content = '---\r\ntitle: Test\r\n---\r\n# Content';
    const { frontmatter, body } = parseFrontmatter(content);
    expect(frontmatter.title).toBe('Test');
    expect(body).toBe('# Content');
  });
});

describe('stringifyNote', () => {
  it('should create note with frontmatter and body', () => {
    const fm = { title: 'Test', tags: ['a', 'b'] };
    const body = '# Content\n\nText here.';
    const result = stringifyNote(fm, body);
    expect(result).toMatch(/^---\n/);
    expect(result).toContain('title: Test');
    expect(result).toContain('# Content');
  });

  it('should return body only when frontmatter is empty', () => {
    const result = stringifyNote({}, '# Content');
    expect(result).toBe('# Content');
  });
});

describe('updateFrontmatterProperty', () => {
  it('should add property to existing frontmatter', () => {
    const content = '---\ntitle: Test\n---\n# Content';
    const result = updateFrontmatterProperty(content, 'status', 'draft');
    const { frontmatter } = parseFrontmatter(result);
    expect(frontmatter.title).toBe('Test');
    expect(frontmatter.status).toBe('draft');
  });

  it('should create frontmatter if none exists', () => {
    const content = '# Content only';
    const result = updateFrontmatterProperty(content, 'title', 'New Title');
    const { frontmatter, body } = parseFrontmatter(result);
    expect(frontmatter.title).toBe('New Title');
    expect(body).toBe('# Content only');
  });

  it('should override existing property', () => {
    const content = '---\ntitle: Old\n---\n# Content';
    const result = updateFrontmatterProperty(content, 'title', 'New');
    const { frontmatter } = parseFrontmatter(result);
    expect(frontmatter.title).toBe('New');
  });
});

describe('removeFrontmatterProperty', () => {
  it('should remove an existing property', () => {
    const content = '---\ntitle: Test\nstatus: draft\n---\n# Content';
    const result = removeFrontmatterProperty(content, 'status');
    const { frontmatter } = parseFrontmatter(result);
    expect(frontmatter.title).toBe('Test');
    expect(frontmatter.status).toBeUndefined();
  });
});

describe('mergeFrontmatter', () => {
  it('should merge multiple properties', () => {
    const content = '---\ntitle: Test\n---\n# Content';
    const result = mergeFrontmatter(content, { status: 'published', author: 'Me' });
    const { frontmatter } = parseFrontmatter(result);
    expect(frontmatter.title).toBe('Test');
    expect(frontmatter.status).toBe('published');
    expect(frontmatter.author).toBe('Me');
  });
});
