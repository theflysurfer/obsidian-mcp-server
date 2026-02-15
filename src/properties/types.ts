export type ObsidianPropertyType =
  | 'text'
  | 'list'
  | 'number'
  | 'checkbox'
  | 'date'
  | 'datetime'
  | 'tags'
  | 'aliases'
  | 'cssclasses';

export type NotionPropertyType =
  | 'title'
  | 'rich_text'
  | 'number'
  | 'checkbox'
  | 'date'
  | 'select'
  | 'multi_select'
  | 'url'
  | 'email'
  | 'relation'
  | 'files';

export interface PropertyMapping {
  obsidianKey: string;
  obsidianType: ObsidianPropertyType;
  notionType: NotionPropertyType;
}
