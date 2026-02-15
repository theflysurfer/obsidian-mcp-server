import path from 'path';

/**
 * Normalize a vault-relative path: forward slashes, no leading slash, .md extension if needed.
 */
export function normalizeVaultPath(filePath: string): string {
  let normalized = filePath.replace(/\\/g, '/');
  if (normalized.startsWith('/')) {
    normalized = normalized.slice(1);
  }
  return normalized;
}

/**
 * Ensure a note path has .md extension.
 */
export function ensureMdExtension(filePath: string): string {
  if (!filePath.endsWith('.md')) {
    return filePath + '.md';
  }
  return filePath;
}

/**
 * Resolve a vault-relative path to an absolute path.
 */
export function resolveVaultPath(vaultRoot: string, relativePath: string): string {
  const normalized = normalizeVaultPath(relativePath);
  return path.resolve(vaultRoot, normalized);
}

/**
 * Convert an absolute path back to vault-relative.
 */
export function toVaultRelative(vaultRoot: string, absolutePath: string): string {
  const rel = path.relative(vaultRoot, absolutePath);
  return normalizeVaultPath(rel);
}

/**
 * Get the parent directory of a vault-relative path.
 */
export function vaultDirname(filePath: string): string {
  const normalized = normalizeVaultPath(filePath);
  const dir = path.dirname(normalized);
  return dir === '.' ? '' : normalizeVaultPath(dir);
}

/**
 * Get filename without extension.
 */
export function vaultBasename(filePath: string): string {
  return path.basename(filePath, path.extname(filePath));
}
