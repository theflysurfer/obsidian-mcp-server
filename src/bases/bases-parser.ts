import YAML from 'yaml';
import type { BaseYAML } from './types.js';

/**
 * Parse a .base file (YAML format) into BaseYAML structure.
 */
export function parseBaseFile(content: string): BaseYAML {
  const parsed = YAML.parse(content);

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid .base file: not a YAML object');
  }

  // Ensure views array exists
  if (!parsed.views || !Array.isArray(parsed.views)) {
    parsed.views = [{
      type: 'table',
      name: 'Default',
    }];
  }

  return parsed as BaseYAML;
}

/**
 * Stringify a BaseYAML back to .base file content.
 */
export function stringifyBaseFile(base: BaseYAML): string {
  return YAML.stringify(base, { lineWidth: 0 });
}

/**
 * Create a new .base file with default table view.
 */
export function createDefaultBase(
  name: string,
  options?: {
    filters?: string;
    columns?: string[];
    folder?: string;
  },
): BaseYAML {
  const base: BaseYAML = {
    views: [{
      type: 'table',
      name: name,
      columns: options?.columns,
    }],
  };

  if (options?.filters) {
    base.filters = options.filters;
  }

  // Default filter: all markdown files in a specific folder
  if (options?.folder) {
    base.filters = `file.folder == "${options.folder}"`;
  }

  return base;
}
