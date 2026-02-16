import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { FilesystemBackend } from '../src/backends/filesystem-backend.js';
import { VaultManager } from '../src/vault/vault-manager.js';
import { SearchTools } from '../src/tools/search-tools.js';

let vault: VaultManager;
let searchTools: SearchTools;
let tmpDir: string;

beforeAll(async () => {
  tmpDir = path.join(os.tmpdir(), `obsidian-search-test-${Date.now()}`);
  await fs.mkdir(tmpDir, { recursive: true });
  await fs.mkdir(path.join(tmpDir, '.obsidian'), { recursive: true });

  await fs.writeFile(
    path.join(tmpDir, 'note-alpha.md'),
    `---
title: Alpha Note
status: published
category: tech
tags:
  - typescript
  - mcp
---
# Alpha

This is about TypeScript and MCP servers.
`,
  );

  await fs.writeFile(
    path.join(tmpDir, 'note-beta.md'),
    `---
title: Beta Note
status: draft
category: tech
tags:
  - python
  - api
---
# Beta

This is about Python APIs.
`,
  );

  await fs.writeFile(
    path.join(tmpDir, 'note-gamma.md'),
    `---
title: Gamma Note
status: published
category: personal
rating: 5
---
# Gamma

A personal note with no code tags.
`,
  );

  vault = new VaultManager(async () => {
    const b = new FilesystemBackend();
    await b.connect(tmpDir);
    return b;
  });
  await vault.addVault({ name: 'test', path: tmpDir });
  searchTools = new SearchTools(vault);
});

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('SearchTools - Advanced', () => {
  describe('searchFuzzy', () => {
    it('should find notes by fuzzy matching', async () => {
      const result = await searchTools.searchFuzzy('alph');
      const data = JSON.parse(result.content[0].text);
      expect(data.results.length).toBeGreaterThanOrEqual(1);
      expect(data.results[0].name).toBe('note-alpha');
    });

    it('should rank exact substring matches higher', async () => {
      const result = await searchTools.searchFuzzy('beta');
      const data = JSON.parse(result.content[0].text);
      expect(data.results[0].name).toBe('note-beta');
      expect(data.results[0].score).toBe(1);
    });

    it('should return empty for no match', async () => {
      const result = await searchTools.searchFuzzy('zzzzz');
      const data = JSON.parse(result.content[0].text);
      expect(data.resultCount).toBe(0);
    });
  });

  describe('searchAdvanced', () => {
    it('should filter by property value', async () => {
      const result = await searchTools.searchAdvanced(undefined, {
        properties: { status: 'published' },
      });
      const data = JSON.parse(result.content[0].text);
      expect(data.resultCount).toBe(2);
      const paths = data.results.map((r: any) => r.path);
      expect(paths).toContain('note-alpha.md');
      expect(paths).toContain('note-gamma.md');
    });

    it('should filter by tags', async () => {
      const result = await searchTools.searchAdvanced(undefined, {
        tags: ['typescript'],
      });
      const data = JSON.parse(result.content[0].text);
      expect(data.resultCount).toBe(1);
      expect(data.results[0].path).toBe('note-alpha.md');
    });

    it('should combine tag and property filters', async () => {
      const result = await searchTools.searchAdvanced(undefined, {
        tags: ['python'],
        properties: { status: 'draft' },
      });
      const data = JSON.parse(result.content[0].text);
      expect(data.resultCount).toBe(1);
      expect(data.results[0].path).toBe('note-beta.md');
    });

    it('should filter by content query', async () => {
      const result = await searchTools.searchAdvanced(undefined, {
        query: 'TypeScript',
      });
      const data = JSON.parse(result.content[0].text);
      expect(data.resultCount).toBe(1);
      expect(data.results[0].path).toBe('note-alpha.md');
      expect(data.results[0].contentMatches).toBeGreaterThanOrEqual(1);
    });

    it('should return empty when filters exclude all', async () => {
      const result = await searchTools.searchAdvanced(undefined, {
        tags: ['typescript'],
        properties: { status: 'draft' },
      });
      const data = JSON.parse(result.content[0].text);
      expect(data.resultCount).toBe(0);
    });
  });

  describe('searchByProperty', () => {
    it('should find by property existence', async () => {
      const result = await searchTools.searchByProperty(undefined, {
        key: 'rating',
        operator: 'exists',
      });
      const data = JSON.parse(result.content[0].text);
      expect(data.resultCount).toBe(1);
      expect(data.results[0].path).toBe('note-gamma.md');
    });

    it('should find by property equality', async () => {
      const result = await searchTools.searchByProperty(undefined, {
        key: 'category',
        value: 'tech',
        operator: 'eq',
      });
      const data = JSON.parse(result.content[0].text);
      expect(data.resultCount).toBe(2);
    });

    it('should find by property inequality', async () => {
      const result = await searchTools.searchByProperty(undefined, {
        key: 'status',
        value: 'draft',
        operator: 'ne',
      });
      const data = JSON.parse(result.content[0].text);
      expect(data.resultCount).toBe(2);
    });

    it('should find by contains in array', async () => {
      const result = await searchTools.searchByProperty(undefined, {
        key: 'tags',
        value: 'mcp',
        operator: 'contains',
      });
      const data = JSON.parse(result.content[0].text);
      expect(data.resultCount).toBe(1);
      expect(data.results[0].path).toBe('note-alpha.md');
    });
  });
});
