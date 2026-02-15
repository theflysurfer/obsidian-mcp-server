import type { VaultManager } from '../vault/vault-manager.js';
import type { ToolResponse } from '../utils/responses.js';
import { VaultTools } from './vault-tools.js';
import { NoteTools } from './note-tools.js';
import { SearchTools } from './search-tools.js';
import { PropertyTools } from './property-tools.js';
import { TagTools } from './tag-tools.js';

export type ToolHandler = (args: Record<string, unknown>) => Promise<ToolResponse>;

export class ToolRegistry {
  private vaultTools: VaultTools;
  private noteTools: NoteTools;
  private searchTools: SearchTools;
  private propertyTools: PropertyTools;
  private tagTools: TagTools;

  constructor(vault: VaultManager) {
    this.vaultTools = new VaultTools(vault);
    this.noteTools = new NoteTools(vault);
    this.searchTools = new SearchTools(vault);
    this.propertyTools = new PropertyTools(vault);
    this.tagTools = new TagTools(vault);
  }

  getHandler(toolName: string): ToolHandler | null {
    const handlers: Record<string, ToolHandler> = {
      // Vault
      vault_list_files: (a) =>
        this.vaultTools.listFiles(a.vault as string, a.path as string),
      vault_list_dirs: (a) =>
        this.vaultTools.listDirs(a.vault as string, a.path as string),
      vault_info: (a) =>
        this.vaultTools.vaultInfo(a.vault as string),
      vault_stats: (a) =>
        this.vaultTools.vaultStats(a.vault as string),

      // Notes
      note_read: (a) =>
        this.noteTools.read(
          a.path as string,
          a.vault as string,
          a.options as Record<string, boolean>,
        ),
      note_create: (a) =>
        this.noteTools.create(
          a.path as string,
          a.content as string,
          a.vault as string,
          a.options as Record<string, unknown>,
        ),
      note_edit: (a) =>
        this.noteTools.edit(
          a.path as string,
          a.content as string,
          a.vault as string,
          a.options as Record<string, string>,
        ),
      note_delete: (a) =>
        this.noteTools.delete(a.path as string, a.vault as string),
      note_move: (a) => {
        const opts = a.options as Record<string, string> | undefined;
        return this.noteTools.move(
          a.path as string,
          (opts?.newPath || a.query) as string,
          a.vault as string,
        );
      },

      // Search
      search_content: (a) =>
        this.searchTools.searchContent(
          a.query as string,
          a.vault as string,
          a.options as Record<string, unknown>,
        ),
      search_filename: (a) =>
        this.searchTools.searchFilenames(a.query as string, a.vault as string),
      search_by_tags: (a) => {
        const opts = a.options as Record<string, unknown> | undefined;
        const tags = (opts?.tags as string[]) || (a.query as string).split(',').map(t => t.trim());
        return this.searchTools.searchByTags(tags, a.vault as string);
      },

      // Properties
      property_get: (a) => {
        const opts = a.options as Record<string, unknown>;
        return this.propertyTools.getProperty(
          a.path as string,
          opts.key as string,
          a.vault as string,
        );
      },
      property_set: (a) => {
        const opts = a.options as Record<string, unknown>;
        return this.propertyTools.setProperty(
          a.path as string,
          opts.key as string,
          opts.value,
          a.vault as string,
        );
      },
      property_delete: (a) => {
        const opts = a.options as Record<string, unknown>;
        return this.propertyTools.deleteProperty(
          a.path as string,
          opts.key as string,
          a.vault as string,
        );
      },
      property_get_all: (a) =>
        this.propertyTools.getAllProperties(a.path as string, a.vault as string),
      property_bulk_update: (a) => {
        const opts = a.options as Record<string, unknown>;
        return this.propertyTools.bulkUpdateProperties(
          opts.files as string[],
          opts.properties as Record<string, unknown>,
          a.vault as string,
        );
      },

      // Tags
      tag_add: (a) => {
        const opts = a.options as Record<string, unknown> | undefined;
        const tags = (opts?.tags as string[]) || [];
        return this.tagTools.addTags(a.path as string, tags, a.vault as string);
      },
      tag_remove: (a) => {
        const opts = a.options as Record<string, unknown> | undefined;
        const tags = (opts?.tags as string[]) || [];
        return this.tagTools.removeTags(a.path as string, tags, a.vault as string);
      },
      tag_rename: (a) => {
        const opts = a.options as Record<string, unknown>;
        return this.tagTools.renameTag(
          opts.oldTag as string,
          opts.newTag as string,
          a.vault as string,
        );
      },
      tag_list_all: (a) =>
        this.tagTools.listAllTags(a.vault as string),
    };

    return handlers[toolName] || null;
  }
}
