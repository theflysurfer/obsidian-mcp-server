import type { VaultManager } from '../vault/vault-manager.js';
import type { ToolResponse } from '../utils/responses.js';
import { jsonResponse } from '../utils/responses.js';

export class VaultTools {
  constructor(private vault: VaultManager) {}

  async listFiles(
    vault?: string,
    directory?: string,
  ): Promise<ToolResponse> {
    const files = await this.vault.listFiles(vault, directory);
    return jsonResponse({
      count: files.length,
      files: files.map(f => ({
        path: f.path,
        name: f.name,
        extension: f.extension,
        size: f.stat.size,
        modified: new Date(f.stat.mtime).toISOString(),
      })),
    });
  }

  async listDirs(
    vault?: string,
    directory?: string,
  ): Promise<ToolResponse> {
    const dirs = await this.vault.listDirectories(vault, directory);
    return jsonResponse({ count: dirs.length, directories: dirs });
  }

  async vaultInfo(vault?: string): Promise<ToolResponse> {
    const info = await this.vault.getVaultInfo(vault);
    return jsonResponse(info);
  }

  async vaultStats(vault?: string): Promise<ToolResponse> {
    const files = await this.vault.listFiles(vault);
    const mdFiles = files.filter(f => f.extension === '.md');
    const otherFiles = files.filter(f => f.extension !== '.md');

    const extensions: Record<string, number> = {};
    for (const f of otherFiles) {
      extensions[f.extension] = (extensions[f.extension] || 0) + 1;
    }

    const totalSize = files.reduce((sum, f) => sum + f.stat.size, 0);

    return jsonResponse({
      notes: mdFiles.length,
      attachments: otherFiles.length,
      totalFiles: files.length,
      totalSizeBytes: totalSize,
      totalSizeMB: Math.round(totalSize / 1024 / 1024 * 100) / 100,
      extensionCounts: extensions,
    });
  }
}
