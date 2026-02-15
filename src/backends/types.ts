import type { BackendType, VaultFile, NoteContent, SearchOptions, SearchResult } from '../types.js';

export interface IVaultBackend {
  readonly backendType: BackendType;
  readonly name: string;

  // Connection
  isAvailable(): Promise<boolean>;
  connect(vaultPath: string): Promise<void>;
  disconnect(): Promise<void>;

  // File operations
  listFiles(directory?: string): Promise<VaultFile[]>;
  listDirectories(directory?: string): Promise<string[]>;
  fileExists(path: string): Promise<boolean>;

  // Note CRUD
  readNote(path: string): Promise<NoteContent>;
  createNote(path: string, content: string, frontmatter?: Record<string, unknown>): Promise<void>;
  updateNote(path: string, content: string): Promise<void>;
  deleteNote(path: string): Promise<void>;
  moveNote(oldPath: string, newPath: string): Promise<void>;

  // Search
  searchContent(query: string, options?: SearchOptions): Promise<SearchResult[]>;
  searchFilenames(pattern: string): Promise<VaultFile[]>;

  // Raw file access (for .base files, templates, etc.)
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;

  // Metadata
  getVaultInfo(): Promise<{ name: string; path: string; noteCount: number; fileCount: number }>;
}
