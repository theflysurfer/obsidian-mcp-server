import type { BackendType } from '../types.js';
import type { IVaultBackend } from './types.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('backend-factory');

const backends: Map<BackendType, IVaultBackend> = new Map();

export class BackendFactory {
  static async getAsync(type: BackendType): Promise<IVaultBackend> {
    const existing = backends.get(type);
    if (existing) return existing;

    log.info(`Loading backend: ${type}`);

    let backend: IVaultBackend;

    switch (type) {
      case 'filesystem': {
        const { FilesystemBackend } = await import('./filesystem-backend.js');
        backend = new FilesystemBackend();
        break;
      }
      case 'rest-api': {
        const { RestApiBackend } = await import('./rest-api-backend.js');
        backend = new RestApiBackend();
        break;
      }
      default:
        throw new Error(`Unknown backend type: ${type}`);
    }

    backends.set(type, backend);
    return backend;
  }

  static async isAvailable(type: BackendType): Promise<boolean> {
    try {
      const backend = await this.getAsync(type);
      return backend.isAvailable();
    } catch {
      return false;
    }
  }

  static getDefault(): BackendType {
    return 'filesystem';
  }
}
