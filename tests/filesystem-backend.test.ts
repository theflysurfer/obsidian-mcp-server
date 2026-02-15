import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { FilesystemBackend } from '../src/backends/filesystem-backend.js';

let backend: FilesystemBackend;
let tmpDir: string;

beforeAll(async () => {
  // Create a temporary vault
  tmpDir = path.join(os.tmpdir(), `obsidian-test-${Date.now()}`);
  await fs.mkdir(tmpDir, { recursive: true });
  await fs.mkdir(path.join(tmpDir, '.obsidian'), { recursive: true });
  await fs.mkdir(path.join(tmpDir, 'subfolder'), { recursive: true });
  await fs.mkdir(path.join(tmpDir, 'deep', 'nested'), { recursive: true });

  // Create test notes
  await fs.writeFile(
    path.join(tmpDir, 'note1.md'),
    `---
title: Note One
tags:
  - test
  - first
---
# Note One

This is the first note with a [[note2]] link and #inline-tag.
`,
  );

  await fs.writeFile(
    path.join(tmpDir, 'note2.md'),
    `---
title: Note Two
---
# Note Two

This links back to [[note1]] and has a ![[image.png]] embed.
`,
  );

  await fs.writeFile(
    path.join(tmpDir, 'subfolder', 'note3.md'),
    `---
title: Subfolder Note
tags: [nested, test]
---
# Subfolder Note

A note in a subfolder with [[note1]] reference.
Status:: Draft
Priority:: High
`,
  );

  await fs.writeFile(
    path.join(tmpDir, 'deep', 'nested', 'note4.md'),
    '# Deep Note\n\nNo frontmatter here.',
  );

  await fs.writeFile(
    path.join(tmpDir, 'image.png'),
    Buffer.from('fake-png'),
  );

  backend = new FilesystemBackend();
  await backend.connect(tmpDir);
});

afterAll(async () => {
  await backend.disconnect();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('FilesystemBackend', () => {
  describe('connect', () => {
    it('should connect to a valid vault', async () => {
      expect(await backend.isAvailable()).toBe(true);
    });

    it('should reject non-existent paths', async () => {
      const b = new FilesystemBackend();
      await expect(b.connect('/nonexistent/path')).rejects.toThrow('does not exist');
    });
  });

  describe('listFiles', () => {
    it('should list all files recursively', async () => {
      const files = await backend.listFiles();
      const paths = files.map(f => f.path);
      expect(paths).toContain('note1.md');
      expect(paths).toContain('note2.md');
      expect(paths).toContain('subfolder/note3.md');
      expect(paths).toContain('deep/nested/note4.md');
      expect(paths).toContain('image.png');
    });

    it('should list files in a specific directory', async () => {
      const files = await backend.listFiles('subfolder');
      expect(files).toHaveLength(1);
      expect(files[0].path).toBe('subfolder/note3.md');
    });

    it('should not list hidden directories', async () => {
      const files = await backend.listFiles();
      const paths = files.map(f => f.path);
      expect(paths.every(p => !p.includes('.obsidian'))).toBe(true);
    });

    it('should include file stats', async () => {
      const files = await backend.listFiles();
      const note1 = files.find(f => f.path === 'note1.md');
      expect(note1).toBeDefined();
      expect(note1!.stat.size).toBeGreaterThan(0);
      expect(note1!.stat.mtime).toBeGreaterThan(0);
      expect(note1!.extension).toBe('.md');
    });

    it('should cache full vault scans', async () => {
      const files1 = await backend.listFiles();
      const files2 = await backend.listFiles();
      // Same reference means cache hit
      expect(files1).toBe(files2);
    });
  });

  describe('listDirectories', () => {
    it('should list root directories', async () => {
      const dirs = await backend.listDirectories();
      expect(dirs).toContain('subfolder');
      expect(dirs).toContain('deep');
    });

    it('should not list hidden directories', async () => {
      const dirs = await backend.listDirectories();
      expect(dirs).not.toContain('.obsidian');
    });
  });

  describe('readNote', () => {
    it('should read note with frontmatter', async () => {
      const note = await backend.readNote('note1.md');
      expect(note.frontmatter.title).toBe('Note One');
      expect(note.tags).toContain('test');
      expect(note.tags).toContain('first');
      expect(note.tags).toContain('inline-tag');
      expect(note.links).toContain('note2');
      expect(note.body).toContain('# Note One');
    });

    it('should read note without frontmatter', async () => {
      const note = await backend.readNote('deep/nested/note4.md');
      expect(note.frontmatter).toEqual({});
      expect(note.body).toContain('# Deep Note');
    });

    it('should extract embeds', async () => {
      const note = await backend.readNote('note2.md');
      expect(note.embeds).toContain('image.png');
    });

    it('should throw for non-existent notes', async () => {
      await expect(backend.readNote('nonexistent.md')).rejects.toThrow();
    });
  });

  describe('createNote / deleteNote', () => {
    it('should create and delete a note', async () => {
      await backend.createNote('new-note.md', '# New Note', { title: 'New' });
      expect(await backend.fileExists('new-note.md')).toBe(true);

      const note = await backend.readNote('new-note.md');
      expect(note.frontmatter.title).toBe('New');
      expect(note.body).toContain('# New Note');

      await backend.deleteNote('new-note.md');
      expect(await backend.fileExists('new-note.md')).toBe(false);
    });

    it('should reject creating duplicate notes', async () => {
      await expect(
        backend.createNote('note1.md', 'duplicate'),
      ).rejects.toThrow('already exists');
    });

    it('should create parent directories as needed', async () => {
      await backend.createNote('new-folder/new-note.md', '# Test');
      expect(await backend.fileExists('new-folder/new-note.md')).toBe(true);
      await backend.deleteNote('new-folder/new-note.md');
    });
  });

  describe('updateNote', () => {
    it('should update note content', async () => {
      await backend.createNote('update-test.md', '# Original');
      await backend.updateNote('update-test.md', '# Updated content');

      const note = await backend.readNote('update-test.md');
      expect(note.body).toContain('# Updated content');

      await backend.deleteNote('update-test.md');
    });
  });

  describe('moveNote', () => {
    it('should move a note to a new location', async () => {
      await backend.createNote('move-source.md', '# Move Me');
      await backend.moveNote('move-source.md', 'moved-note.md');

      expect(await backend.fileExists('move-source.md')).toBe(false);
      expect(await backend.fileExists('moved-note.md')).toBe(true);

      await backend.deleteNote('moved-note.md');
    });
  });

  describe('searchContent', () => {
    it('should find text matches', async () => {
      const results = await backend.searchContent('first note');
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].path).toBe('note1.md');
    });

    it('should respect maxResults', async () => {
      const results = await backend.searchContent('note', { maxResults: 1 });
      expect(results.length).toBe(1);
    });

    it('should search within a directory', async () => {
      const results = await backend.searchContent('subfolder', { directory: 'subfolder' });
      expect(results.every(r => r.path.startsWith('subfolder/'))).toBe(true);
    });

    it('should support case-insensitive search by default', async () => {
      const results = await backend.searchContent('NOTE ONE');
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('should support regex search', async () => {
      const results = await backend.searchContent('note\\d', { useRegex: true });
      expect(results.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('searchFilenames', () => {
    it('should find files by name pattern', async () => {
      const results = await backend.searchFilenames('note1');
      expect(results).toHaveLength(1);
      expect(results[0].path).toBe('note1.md');
    });

    it('should find files case-insensitively', async () => {
      const results = await backend.searchFilenames('NOTE');
      expect(results.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('getVaultInfo', () => {
    it('should return vault statistics', async () => {
      const info = await backend.getVaultInfo();
      expect(info.name).toBeTruthy();
      expect(info.noteCount).toBeGreaterThanOrEqual(4);
      expect(info.fileCount).toBeGreaterThanOrEqual(5);
    });
  });
});
