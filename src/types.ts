export type BackendType = 'filesystem' | 'rest-api';

export interface ServerConfig {
  vaults: VaultConfig[];
  backend: BackendType;
  metaMode: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

export interface VaultConfig {
  name: string;
  path: string;
}

export interface VaultFile {
  path: string;
  name: string;
  extension: string;
  stat: {
    size: number;
    ctime: number;
    mtime: number;
  };
}

export interface NoteContent {
  path: string;
  content: string;
  frontmatter: Record<string, unknown>;
  body: string;
  tags: string[];
  links: string[];
  embeds: string[];
}

export interface SearchOptions {
  caseSensitive?: boolean;
  maxResults?: number;
  useRegex?: boolean;
  directory?: string;
}

export interface SearchResult {
  path: string;
  matches: Array<{
    line: number;
    text: string;
  }>;
}
