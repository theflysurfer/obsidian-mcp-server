import path from 'path';

/**
 * Validate that a resolved path stays within the vault root.
 * Prevents path traversal attacks (../../etc/passwd).
 */
export function assertWithinVault(vaultRoot: string, targetPath: string): void {
  const resolvedVault = path.resolve(vaultRoot);
  const resolvedTarget = path.resolve(targetPath);

  if (!resolvedTarget.startsWith(resolvedVault + path.sep) && resolvedTarget !== resolvedVault) {
    throw new Error(`Path traversal detected: ${targetPath} escapes vault root`);
  }
}

/**
 * Check if a filename is safe (no hidden files starting with ., no system files).
 */
export function isSafePath(filePath: string): boolean {
  const parts = filePath.replace(/\\/g, '/').split('/');
  for (const part of parts) {
    if (part === '..') return false;
    if (part.startsWith('.') && part !== '.obsidian') return false;
  }
  return true;
}

/**
 * Sanitize a filename for safe filesystem use.
 */
export function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
}
