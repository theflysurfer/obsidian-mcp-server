import fs from 'fs/promises';
import path from 'path';
import type { IVaultBackend } from './types.js';
import type { VaultFile, NoteContent, SearchOptions, SearchResult } from '../types.js';
import { parseFrontmatter, stringifyNote } from '../markdown/frontmatter.js';
import { extractLinks, extractEmbeds, extractTags } from '../markdown/link-resolver.js';
import { resolveVaultPath, toVaultRelative, normalizeVaultPath } from '../utils/path.js';
import { assertWithinVault } from '../utils/security.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('filesystem');

export class FilesystemBackend implements IVaultBackend {
  readonly backendType = 'filesystem' as const;
  readonly name = 'Direct Filesystem';

  private vaultPath = '';
  private vaultName = '';

  async isAvailable(): Promise<boolean> {
    if (!this.vaultPath) return false;
    try {
      await fs.access(path.join(this.vaultPath, '.obsidian'));
      return true;
    } catch {
      return false;
    }
  }

  async connect(vaultPath: string): Promise<void> {
    const resolved = path.resolve(vaultPath);
    try {
      const stat = await fs.stat(resolved);
      if (!stat.isDirectory()) {
        throw new Error(`Not a directory: ${resolved}`);
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`Vault path does not exist: ${resolved}`);
      }
      throw err;
    }

    // Check for .obsidian directory (optional warning, not blocking)
    try {
      await fs.access(path.join(resolved, '.obsidian'));
    } catch {
      log.warn(`No .obsidian directory found in ${resolved} - this may not be an Obsidian vault`);
    }

    this.vaultPath = resolved;
    this.vaultName = path.basename(resolved);
    log.info(`Connected to vault: ${this.vaultName} (${resolved})`);
  }

  async disconnect(): Promise<void> {
    this.vaultPath = '';
    this.vaultName = '';
  }

  async listFiles(directory?: string): Promise<VaultFile[]> {
    const dir = directory
      ? resolveVaultPath(this.vaultPath, directory)
      : this.vaultPath;

    assertWithinVault(this.vaultPath, dir);
    return this.walkDirectory(dir);
  }

  async listDirectories(directory?: string): Promise<string[]> {
    const dir = directory
      ? resolveVaultPath(this.vaultPath, directory)
      : this.vaultPath;

    assertWithinVault(this.vaultPath, dir);
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const dirs: string[] = [];

    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        dirs.push(toVaultRelative(this.vaultPath, path.join(dir, entry.name)));
      }
    }

    return dirs.sort();
  }

  async fileExists(filePath: string): Promise<boolean> {
    const resolved = resolveVaultPath(this.vaultPath, filePath);
    assertWithinVault(this.vaultPath, resolved);
    try {
      await fs.access(resolved);
      return true;
    } catch {
      return false;
    }
  }

  async readNote(filePath: string): Promise<NoteContent> {
    const resolved = resolveVaultPath(this.vaultPath, filePath);
    assertWithinVault(this.vaultPath, resolved);

    const raw = await fs.readFile(resolved, 'utf-8');
    const { frontmatter, body } = parseFrontmatter(raw);

    const tags = extractTags(raw, frontmatter);
    const links = extractLinks(body);
    const embeds = extractEmbeds(body);

    return {
      path: normalizeVaultPath(filePath),
      content: raw,
      frontmatter,
      body,
      tags,
      links,
      embeds,
    };
  }

  async createNote(
    filePath: string,
    content: string,
    frontmatter?: Record<string, unknown>,
  ): Promise<void> {
    const normalized = normalizeVaultPath(filePath);
    const resolved = resolveVaultPath(this.vaultPath, normalized);
    assertWithinVault(this.vaultPath, resolved);

    // Ensure parent directory exists
    const dir = path.dirname(resolved);
    await fs.mkdir(dir, { recursive: true });

    // Check if file already exists
    try {
      await fs.access(resolved);
      throw new Error(`Note already exists: ${normalized}`);
    } catch (err) {
      if ((err as Error).message.includes('already exists')) throw err;
      // File doesn't exist, good
    }

    const fullContent = frontmatter
      ? stringifyNote(frontmatter, content)
      : content;

    await fs.writeFile(resolved, fullContent, 'utf-8');
    log.info(`Created note: ${normalized}`);
  }

  async updateNote(filePath: string, content: string): Promise<void> {
    const resolved = resolveVaultPath(this.vaultPath, filePath);
    assertWithinVault(this.vaultPath, resolved);

    // Verify file exists
    await fs.access(resolved);
    await fs.writeFile(resolved, content, 'utf-8');
    log.info(`Updated note: ${filePath}`);
  }

  async deleteNote(filePath: string): Promise<void> {
    const resolved = resolveVaultPath(this.vaultPath, filePath);
    assertWithinVault(this.vaultPath, resolved);

    await fs.access(resolved);
    await fs.unlink(resolved);
    log.info(`Deleted note: ${filePath}`);
  }

  async moveNote(oldPath: string, newPath: string): Promise<void> {
    const resolvedOld = resolveVaultPath(this.vaultPath, oldPath);
    const resolvedNew = resolveVaultPath(this.vaultPath, newPath);
    assertWithinVault(this.vaultPath, resolvedOld);
    assertWithinVault(this.vaultPath, resolvedNew);

    // Ensure target directory exists
    await fs.mkdir(path.dirname(resolvedNew), { recursive: true });

    await fs.rename(resolvedOld, resolvedNew);
    log.info(`Moved note: ${oldPath} -> ${newPath}`);
  }

  async searchContent(
    query: string,
    options: SearchOptions = {},
  ): Promise<SearchResult[]> {
    const {
      caseSensitive = false,
      maxResults = 50,
      useRegex = false,
      directory,
    } = options;

    const files = await this.listFiles(directory);
    const mdFiles = files.filter(f => f.extension === '.md');
    const results: SearchResult[] = [];

    const pattern = useRegex
      ? new RegExp(query, caseSensitive ? 'g' : 'gi')
      : new RegExp(escapeRegex(query), caseSensitive ? 'g' : 'gi');

    for (const file of mdFiles) {
      if (results.length >= maxResults) break;

      const resolved = resolveVaultPath(this.vaultPath, file.path);
      const content = await fs.readFile(resolved, 'utf-8');
      const lines = content.split('\n');
      const matches: Array<{ line: number; text: string }> = [];

      for (let i = 0; i < lines.length; i++) {
        if (pattern.test(lines[i])) {
          matches.push({ line: i + 1, text: lines[i].trim() });
          pattern.lastIndex = 0;
        }
      }

      if (matches.length > 0) {
        results.push({ path: file.path, matches });
      }
    }

    return results;
  }

  async searchFilenames(pattern: string): Promise<VaultFile[]> {
    const files = await this.listFiles();
    const lowerPattern = pattern.toLowerCase();
    return files.filter(f => f.name.toLowerCase().includes(lowerPattern));
  }

  async readFile(filePath: string): Promise<string> {
    const resolved = resolveVaultPath(this.vaultPath, filePath);
    assertWithinVault(this.vaultPath, resolved);
    return fs.readFile(resolved, 'utf-8');
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    const resolved = resolveVaultPath(this.vaultPath, filePath);
    assertWithinVault(this.vaultPath, resolved);
    await fs.mkdir(path.dirname(resolved), { recursive: true });
    await fs.writeFile(resolved, content, 'utf-8');
  }

  async getVaultInfo(): Promise<{
    name: string;
    path: string;
    noteCount: number;
    fileCount: number;
  }> {
    const files = await this.listFiles();
    const noteCount = files.filter(f => f.extension === '.md').length;
    return {
      name: this.vaultName,
      path: this.vaultPath,
      noteCount,
      fileCount: files.length,
    };
  }

  // --- Private helpers ---

  private async walkDirectory(dir: string): Promise<VaultFile[]> {
    const results: VaultFile[] = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      // Skip hidden dirs and .obsidian
      if (entry.name.startsWith('.')) continue;
      // Skip node_modules
      if (entry.name === 'node_modules') continue;

      if (entry.isDirectory()) {
        const subFiles = await this.walkDirectory(fullPath);
        results.push(...subFiles);
      } else if (entry.isFile()) {
        const stat = await fs.stat(fullPath);
        results.push({
          path: toVaultRelative(this.vaultPath, fullPath),
          name: path.basename(entry.name, path.extname(entry.name)),
          extension: path.extname(entry.name),
          stat: {
            size: stat.size,
            ctime: stat.ctimeMs,
            mtime: stat.mtimeMs,
          },
        });
      }
    }

    return results;
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
