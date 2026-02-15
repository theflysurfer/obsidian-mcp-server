import type { IVaultBackend } from '../backends/types.js';
import type { VaultConfig, VaultFile, NoteContent, SearchOptions, SearchResult } from '../types.js';
import { createLogger } from '../utils/logger.js';
import { notFound, invalidParams } from '../utils/errors.js';

const log = createLogger('vault-manager');

export class VaultManager {
  private vaults: Map<string, { config: VaultConfig; backend: IVaultBackend }> = new Map();
  private defaultVault: string | null = null;

  constructor(
    private backendFactory: () => Promise<IVaultBackend>,
  ) {}

  async addVault(config: VaultConfig): Promise<void> {
    const backend = await this.backendFactory();
    await backend.connect(config.path);

    this.vaults.set(config.name, { config, backend });

    if (this.vaults.size === 1) {
      this.defaultVault = config.name;
    }

    log.info(`Vault registered: ${config.name} (${config.path})`);
  }

  getBackend(vaultName?: string): IVaultBackend {
    const name = vaultName || this.defaultVault;
    if (!name) {
      throw invalidParams('No vault specified and no default vault configured');
    }

    const vault = this.vaults.get(name);
    if (!vault) {
      throw notFound('Vault', name);
    }

    return vault.backend;
  }

  listVaults(): Array<{ name: string; path: string }> {
    return Array.from(this.vaults.entries()).map(([name, { config }]) => ({
      name,
      path: config.path,
    }));
  }

  getDefaultVaultName(): string | null {
    return this.defaultVault;
  }

  // Convenience methods that delegate to the appropriate backend

  async listFiles(vaultName?: string, directory?: string): Promise<VaultFile[]> {
    return this.getBackend(vaultName).listFiles(directory);
  }

  async listDirectories(vaultName?: string, directory?: string): Promise<string[]> {
    return this.getBackend(vaultName).listDirectories(directory);
  }

  async readNote(path: string, vaultName?: string): Promise<NoteContent> {
    return this.getBackend(vaultName).readNote(path);
  }

  async createNote(
    path: string,
    content: string,
    frontmatter?: Record<string, unknown>,
    vaultName?: string,
  ): Promise<void> {
    return this.getBackend(vaultName).createNote(path, content, frontmatter);
  }

  async updateNote(path: string, content: string, vaultName?: string): Promise<void> {
    return this.getBackend(vaultName).updateNote(path, content);
  }

  async deleteNote(path: string, vaultName?: string): Promise<void> {
    return this.getBackend(vaultName).deleteNote(path);
  }

  async moveNote(oldPath: string, newPath: string, vaultName?: string): Promise<void> {
    return this.getBackend(vaultName).moveNote(oldPath, newPath);
  }

  async searchContent(
    query: string,
    options?: SearchOptions,
    vaultName?: string,
  ): Promise<SearchResult[]> {
    return this.getBackend(vaultName).searchContent(query, options);
  }

  async searchFilenames(pattern: string, vaultName?: string): Promise<VaultFile[]> {
    return this.getBackend(vaultName).searchFilenames(pattern);
  }

  async getVaultInfo(vaultName?: string) {
    return this.getBackend(vaultName).getVaultInfo();
  }

  async fileExists(path: string, vaultName?: string): Promise<boolean> {
    return this.getBackend(vaultName).fileExists(path);
  }

  async readFile(path: string, vaultName?: string): Promise<string> {
    return this.getBackend(vaultName).readFile(path);
  }

  async writeFile(path: string, content: string, vaultName?: string): Promise<void> {
    return this.getBackend(vaultName).writeFile(path, content);
  }
}
