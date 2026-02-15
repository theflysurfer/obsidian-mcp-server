import type { VaultManager } from '../vault/vault-manager.js';
import type { ToolResponse } from '../utils/responses.js';
import { jsonResponse, errorResponse } from '../utils/responses.js';
import { parseBaseFile, stringifyBaseFile, createDefaultBase } from '../bases/bases-parser.js';
import { BasesQueryEngine } from '../bases/bases-query.js';

export class BasesTools {
  private queryEngine: BasesQueryEngine;

  constructor(private vault: VaultManager) {
    this.queryEngine = new BasesQueryEngine(vault);
  }

  /**
   * List all .base files in the vault.
   */
  async listBases(vaultName?: string): Promise<ToolResponse> {
    try {
      const files = await this.vault.listFiles(vaultName);
      const bases = files
        .filter(f => f.extension === '.base')
        .map(f => ({
          path: f.path,
          name: f.name.replace(/\.base$/, ''),
          size: f.stat.size,
          modified: new Date(f.stat.mtime).toISOString(),
        }));

      return jsonResponse({ bases, count: bases.length });
    } catch (err) {
      return errorResponse((err as Error).message);
    }
  }

  /**
   * Read and parse a .base file.
   */
  async readBase(path: string, vaultName?: string): Promise<ToolResponse> {
    try {
      const filePath = path.endsWith('.base') ? path : `${path}.base`;
      const content = await this.vault.readFile(filePath, vaultName);
      const base = parseBaseFile(content);

      return jsonResponse({
        path: filePath,
        config: base,
        viewCount: base.views.length,
        hasFilters: !!base.filters,
        hasFormulas: !!base.formulas,
      });
    } catch (err) {
      return errorResponse((err as Error).message);
    }
  }

  /**
   * Create a new .base file.
   */
  async createBase(
    path: string,
    vaultName?: string,
    options?: Record<string, unknown>,
  ): Promise<ToolResponse> {
    try {
      const filePath = path.endsWith('.base') ? path : `${path}.base`;
      const name = filePath.replace(/\.base$/, '').split('/').pop() || 'Untitled';

      const base = createDefaultBase(name, {
        filters: options?.filters as string,
        columns: options?.columns as string[],
        folder: options?.folder as string,
      });

      // Allow custom views override
      if (options?.views) {
        base.views = options.views as typeof base.views;
      }

      const content = stringifyBaseFile(base);
      await this.vault.writeFile(filePath, content, vaultName);

      return jsonResponse({
        created: filePath,
        config: base,
      });
    } catch (err) {
      return errorResponse((err as Error).message);
    }
  }

  /**
   * Query a base: evaluate filters against vault notes, return matching results.
   */
  async queryBase(
    path: string,
    vaultName?: string,
    options?: Record<string, unknown>,
  ): Promise<ToolResponse> {
    try {
      const filePath = path.endsWith('.base') ? path : `${path}.base`;
      const content = await this.vault.readFile(filePath, vaultName);
      const base = parseBaseFile(content);

      const viewIndex = (options?.viewIndex as number) ?? 0;
      const result = await this.queryEngine.query(base, viewIndex, vaultName);

      return jsonResponse({
        path: filePath,
        viewName: result.view.name,
        viewType: result.view.type,
        total: result.total,
        returned: result.notes.length,
        notes: result.notes,
      });
    } catch (err) {
      return errorResponse((err as Error).message);
    }
  }

  /**
   * Update a .base file configuration.
   */
  async updateBase(
    path: string,
    vaultName?: string,
    options?: Record<string, unknown>,
  ): Promise<ToolResponse> {
    try {
      const filePath = path.endsWith('.base') ? path : `${path}.base`;
      const content = await this.vault.readFile(filePath, vaultName);
      const base = parseBaseFile(content);

      // Apply updates
      if (options?.filters !== undefined) {
        base.filters = options.filters as typeof base.filters;
      }
      if (options?.formulas !== undefined) {
        base.formulas = options.formulas as typeof base.formulas;
      }
      if (options?.views !== undefined) {
        base.views = options.views as typeof base.views;
      }
      if (options?.properties !== undefined) {
        base.properties = options.properties as typeof base.properties;
      }

      const updated = stringifyBaseFile(base);
      await this.vault.writeFile(filePath, updated, vaultName);

      return jsonResponse({
        updated: filePath,
        config: base,
      });
    } catch (err) {
      return errorResponse((err as Error).message);
    }
  }
}
