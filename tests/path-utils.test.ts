import { describe, it, expect } from 'vitest';
import {
  normalizeVaultPath,
  ensureMdExtension,
  resolveVaultPath,
  vaultDirname,
  vaultBasename,
} from '../src/utils/path.js';

describe('normalizeVaultPath', () => {
  it('should convert backslashes to forward slashes', () => {
    expect(normalizeVaultPath('folder\\note.md')).toBe('folder/note.md');
  });

  it('should remove leading slash', () => {
    expect(normalizeVaultPath('/folder/note.md')).toBe('folder/note.md');
  });

  it('should handle already normalized paths', () => {
    expect(normalizeVaultPath('folder/note.md')).toBe('folder/note.md');
  });
});

describe('ensureMdExtension', () => {
  it('should add .md extension if missing', () => {
    expect(ensureMdExtension('note')).toBe('note.md');
  });

  it('should not double-add .md', () => {
    expect(ensureMdExtension('note.md')).toBe('note.md');
  });

  it('should handle paths with directories', () => {
    expect(ensureMdExtension('folder/note')).toBe('folder/note.md');
  });
});

describe('resolveVaultPath', () => {
  it('should resolve relative path from vault root', () => {
    const result = resolveVaultPath('/vault', 'notes/test.md');
    expect(result).toContain('notes');
    expect(result).toContain('test.md');
  });
});

describe('vaultDirname', () => {
  it('should return parent directory', () => {
    expect(vaultDirname('folder/note.md')).toBe('folder');
  });

  it('should return empty string for root files', () => {
    expect(vaultDirname('note.md')).toBe('');
  });

  it('should handle nested paths', () => {
    expect(vaultDirname('a/b/c.md')).toBe('a/b');
  });
});

describe('vaultBasename', () => {
  it('should return filename without extension', () => {
    expect(vaultBasename('note.md')).toBe('note');
  });

  it('should handle paths with directories', () => {
    expect(vaultBasename('folder/note.md')).toBe('note');
  });
});
