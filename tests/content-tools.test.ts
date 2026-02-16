import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { FilesystemBackend } from '../src/backends/filesystem-backend.js';
import { VaultManager } from '../src/vault/vault-manager.js';
import { ContentTools } from '../src/tools/content-tools.js';

let vault: VaultManager;
let contentTools: ContentTools;
let tmpDir: string;

beforeAll(async () => {
  tmpDir = path.join(os.tmpdir(), `obsidian-content-test-${Date.now()}`);
  await fs.mkdir(tmpDir, { recursive: true });
  await fs.mkdir(path.join(tmpDir, '.obsidian'), { recursive: true });

  await fs.writeFile(
    path.join(tmpDir, 'headings.md'),
    `---
title: Headings Test
---
# Main Title

Some intro text.

## Section One

Content of section one.

### Sub Section

Sub content here.

## Section Two

Content of section two.
`,
  );

  await fs.writeFile(
    path.join(tmpDir, 'replace-test.md'),
    `---
title: Replace Test
---
# Replace Test

Hello world. Hello again. Hello once more.
This is a test note with repeated words.
`,
  );

  vault = new VaultManager(async () => {
    const b = new FilesystemBackend();
    await b.connect(tmpDir);
    return b;
  });
  await vault.addVault({ name: 'test', path: tmpDir });
  contentTools = new ContentTools(vault);
});

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('ContentTools', () => {
  describe('listHeadings', () => {
    it('should list all headings with levels and line numbers', async () => {
      const result = await contentTools.listHeadings('headings.md');
      const data = JSON.parse(result.content[0].text);
      expect(data.headings.length).toBe(4);
      expect(data.headings[0]).toMatchObject({ level: 1, text: 'Main Title' });
      expect(data.headings[1]).toMatchObject({ level: 2, text: 'Section One' });
      expect(data.headings[2]).toMatchObject({ level: 3, text: 'Sub Section' });
      expect(data.headings[3]).toMatchObject({ level: 2, text: 'Section Two' });
    });

    it('should filter headings by level', async () => {
      const result = await contentTools.listHeadings('headings.md', undefined, { minLevel: 2, maxLevel: 2 });
      const data = JSON.parse(result.content[0].text);
      expect(data.headings.length).toBe(2);
      expect(data.headings[0].text).toBe('Section One');
      expect(data.headings[1].text).toBe('Section Two');
    });
  });

  describe('getSection', () => {
    it('should get content of a heading section', async () => {
      const result = await contentTools.getSection('headings.md', undefined, { heading: 'Section One' });
      const data = JSON.parse(result.content[0].text);
      expect(data.content).toContain('Content of section one');
      expect(data.content).toContain('Sub Section');
    });

    it('should exclude heading when requested', async () => {
      const result = await contentTools.getSection('headings.md', undefined, {
        heading: 'Section Two',
        includeHeading: false,
      });
      const data = JSON.parse(result.content[0].text);
      expect(data.content).not.toContain('## Section Two');
      expect(data.content).toContain('Content of section two');
    });

    it('should throw for non-existent heading', async () => {
      await expect(
        contentTools.getSection('headings.md', undefined, { heading: 'Nonexistent' }),
      ).rejects.toThrow('Heading not found');
    });
  });

  describe('searchReplace', () => {
    it('should replace text in a note', async () => {
      // Create a temporary note for replacement
      await fs.writeFile(
        path.join(tmpDir, 'sr-test.md'),
        '# Test\n\nFoo bar baz. Foo again.',
      );
      const result = await contentTools.searchReplace('sr-test.md', undefined, {
        search: 'Foo',
        replace: 'Qux',
      });
      const data = JSON.parse(result.content[0].text);
      expect(data.replacements).toBe(2);

      // Verify content was actually replaced
      const content = await fs.readFile(path.join(tmpDir, 'sr-test.md'), 'utf-8');
      expect(content).toContain('Qux bar baz');
      expect(content).toContain('Qux again');
      expect(content).not.toContain('Foo');
    });

    it('should limit replacements with maxReplacements', async () => {
      await fs.writeFile(
        path.join(tmpDir, 'sr-limit.md'),
        '# Test\n\naaa aaa aaa',
      );
      const result = await contentTools.searchReplace('sr-limit.md', undefined, {
        search: 'aaa',
        replace: 'bbb',
        maxReplacements: 2,
      });
      const data = JSON.parse(result.content[0].text);
      expect(data.replacements).toBe(2);

      const content = await fs.readFile(path.join(tmpDir, 'sr-limit.md'), 'utf-8');
      expect(content).toContain('aaa'); // One remaining
    });

    it('should return 0 replacements when no match', async () => {
      const result = await contentTools.searchReplace('headings.md', undefined, {
        search: 'NONEXISTENT_STRING',
        replace: 'xxx',
      });
      const data = JSON.parse(result.content[0].text);
      expect(data.replacements).toBe(0);
    });
  });

  describe('renameHeading', () => {
    it('should rename a heading', async () => {
      await fs.writeFile(
        path.join(tmpDir, 'rename-heading.md'),
        '# Title\n\n## Old Name\n\nContent.',
      );
      await contentTools.renameHeading('rename-heading.md', undefined, {
        oldHeading: 'Old Name',
        newHeading: 'New Name',
      });

      const content = await fs.readFile(path.join(tmpDir, 'rename-heading.md'), 'utf-8');
      expect(content).toContain('## New Name');
      expect(content).not.toContain('## Old Name');
    });

    it('should throw for non-existent heading', async () => {
      await expect(
        contentTools.renameHeading('headings.md', undefined, {
          oldHeading: 'Nonexistent',
          newHeading: 'New',
        }),
      ).rejects.toThrow('Heading not found');
    });
  });

  describe('insertAt', () => {
    it('should insert at a line number', async () => {
      await fs.writeFile(
        path.join(tmpDir, 'insert-test.md'),
        'Line 1\nLine 2\nLine 3',
      );
      await contentTools.insertAt('insert-test.md', 'INSERTED', undefined, { line: 2 });

      const content = await fs.readFile(path.join(tmpDir, 'insert-test.md'), 'utf-8');
      const lines = content.split('\n');
      expect(lines[1]).toBe('INSERTED');
      expect(lines[2]).toBe('Line 2');
    });

    it('should insert after a heading', async () => {
      await fs.writeFile(
        path.join(tmpDir, 'insert-heading.md'),
        '# Title\n\nIntro\n\n## Target\n\nExisting content.',
      );
      await contentTools.insertAt('insert-heading.md', 'NEW LINE', undefined, {
        heading: 'Target',
        position: 'after',
      });

      const content = await fs.readFile(path.join(tmpDir, 'insert-heading.md'), 'utf-8');
      const lines = content.split('\n');
      const targetIdx = lines.findIndex(l => l.includes('## Target'));
      expect(lines[targetIdx + 1]).toBe('NEW LINE');
    });
  });
});
