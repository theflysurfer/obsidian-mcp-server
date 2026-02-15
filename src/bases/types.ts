export interface BaseYAML {
  filters?: FilterExpression;
  formulas?: Record<string, string>;
  properties?: Record<string, { displayName?: string }>;
  views: ViewConfig[];
}

export type FilterExpression =
  | string
  | { and: FilterExpression[] }
  | { or: FilterExpression[] }
  | { not: FilterExpression[] };

export interface ViewConfig {
  type: 'table' | 'list' | 'cards';
  name: string;
  filters?: FilterExpression;
  order?: Array<{ property: string; direction: 'asc' | 'desc' }>;
  limit?: number;
  columns?: string[];
  groupBy?: { property: string; direction: 'asc' | 'desc' };
}

export interface NoteContext {
  path: string;
  name: string;
  folder: string;
  extension: string;
  size: number;
  ctime: number;
  mtime: number;
  tags: string[];
  links: string[];
  properties: Record<string, unknown>;
}

export interface BaseQueryResult {
  notes: Array<{
    path: string;
    name: string;
    properties: Record<string, unknown>;
  }>;
  total: number;
  view: ViewConfig;
}
