import type { VaultManager } from '../vault/vault-manager.js';
import type { ToolResponse } from '../utils/responses.js';
import { VaultTools } from './vault-tools.js';
import { NoteTools } from './note-tools.js';
import { SearchTools } from './search-tools.js';
import { PropertyTools } from './property-tools.js';
import { TagTools } from './tag-tools.js';
import { GraphTools } from './graph-tools.js';
import { ExportTools } from './export-tools.js';
import { BasesTools } from './bases-tools.js';
import { ConversationTools } from './conversation-tools.js';
import { ContentTools } from './content-tools.js';
import { CanvasTools } from './canvas-tools.js';
import { PeriodicTools } from './periodic-tools.js';
import { TaskTools } from './task-tools.js';
import { SyncTools } from './sync-tools.js';

export type ToolHandler = (args: Record<string, unknown>) => Promise<ToolResponse>;

export class ToolRegistry {
  private vaultTools: VaultTools;
  private noteTools: NoteTools;
  private searchTools: SearchTools;
  private propertyTools: PropertyTools;
  private tagTools: TagTools;
  private graphTools: GraphTools;
  private exportTools: ExportTools;
  private basesTools: BasesTools;
  private conversationTools: ConversationTools;
  private contentTools: ContentTools;
  private canvasTools: CanvasTools;
  private periodicTools: PeriodicTools;
  private taskTools: TaskTools;
  private syncTools: SyncTools;

  constructor(vault: VaultManager) {
    this.vaultTools = new VaultTools(vault);
    this.noteTools = new NoteTools(vault);
    this.searchTools = new SearchTools(vault);
    this.propertyTools = new PropertyTools(vault);
    this.tagTools = new TagTools(vault);
    this.graphTools = new GraphTools(vault);
    this.exportTools = new ExportTools(vault);
    this.basesTools = new BasesTools(vault);
    this.conversationTools = new ConversationTools(vault);
    this.contentTools = new ContentTools(vault);
    this.canvasTools = new CanvasTools(vault);
    this.periodicTools = new PeriodicTools(vault);
    this.taskTools = new TaskTools(vault);
    this.syncTools = new SyncTools(vault);
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
        return this.searchTools.searchByTags(tags, a.vault as string, {
          maxResults: opts?.maxResults as number,
          directory: (opts?.path || a.path) as string,
        });
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

      // Graph
      graph_links: (a) =>
        this.graphTools.links(a.path as string, a.vault as string),
      graph_backlinks: (a) =>
        this.graphTools.backlinks(a.path as string, a.vault as string),
      graph_neighbors: (a) =>
        this.graphTools.neighbors(
          a.path as string,
          a.vault as string,
          a.options as Record<string, unknown>,
        ),
      graph_find_path: (a) => {
        const opts = a.options as Record<string, unknown> | undefined;
        return this.graphTools.findPathBetween(
          a.path as string,
          (opts?.to || a.query) as string,
          a.vault as string,
          opts?.maxDepth as number,
        );
      },
      graph_orphans: (a) =>
        this.graphTools.orphans(a.vault as string),
      graph_stats: (a) =>
        this.graphTools.graphStats(a.vault as string),

      // Export
      export_note: (a) =>
        this.exportTools.exportNote(
          a.path as string,
          a.vault as string,
          a.options as Record<string, unknown>,
        ),
      export_property_mapping: (a) =>
        this.exportTools.exportPropertyMapping(a.path as string, a.vault as string),

      // Bases
      bases_list: (a) =>
        this.basesTools.listBases(a.vault as string),
      bases_read: (a) =>
        this.basesTools.readBase(a.path as string, a.vault as string),
      bases_create: (a) =>
        this.basesTools.createBase(
          a.path as string,
          a.vault as string,
          a.options as Record<string, unknown>,
        ),
      bases_query: (a) =>
        this.basesTools.queryBase(
          a.path as string,
          a.vault as string,
          a.options as Record<string, unknown>,
        ),
      bases_update: (a) =>
        this.basesTools.updateBase(
          a.path as string,
          a.vault as string,
          a.options as Record<string, unknown>,
        ),

      // Conversations
      conversation_search: (a) =>
        this.conversationTools.searchConversations(
          a.vault as string,
          a.options as Record<string, unknown>,
        ),
      conversation_analyze: (a) =>
        this.conversationTools.analyzeConversation(
          a.path as string,
          a.vault as string,
        ),
      conversation_stats: (a) =>
        this.conversationTools.conversationStats(a.vault as string),
      conversation_create_base: (a) =>
        this.conversationTools.createConversationsBase(
          a.path as string,
          a.vault as string,
          a.options as Record<string, unknown>,
        ),

      // Content operations
      content_search_replace: (a) =>
        this.contentTools.searchReplace(
          a.path as string,
          a.vault as string,
          a.options as Record<string, unknown> as any,
        ),
      content_insert_at: (a) =>
        this.contentTools.insertAt(
          a.path as string,
          a.content as string,
          a.vault as string,
          a.options as Record<string, unknown> as any,
        ),
      content_list_headings: (a) =>
        this.contentTools.listHeadings(
          a.path as string,
          a.vault as string,
          a.options as Record<string, unknown> as any,
        ),
      content_get_section: (a) =>
        this.contentTools.getSection(
          a.path as string,
          a.vault as string,
          a.options as Record<string, unknown> as any,
        ),
      content_rename_heading: (a) =>
        this.contentTools.renameHeading(
          a.path as string,
          a.vault as string,
          a.options as Record<string, unknown> as any,
        ),

      // Canvas
      canvas_list: (a) =>
        this.canvasTools.listCanvases(a.vault as string),
      canvas_read: (a) =>
        this.canvasTools.readCanvas(a.path as string, a.vault as string),
      canvas_create: (a) =>
        this.canvasTools.createCanvas(
          a.path as string,
          a.vault as string,
          a.options as Record<string, unknown> as any,
        ),
      canvas_add_node: (a) =>
        this.canvasTools.addNode(
          a.path as string,
          a.vault as string,
          a.options as Record<string, unknown> as any,
        ),
      canvas_add_edge: (a) =>
        this.canvasTools.addEdge(
          a.path as string,
          a.vault as string,
          a.options as Record<string, unknown> as any,
        ),
      canvas_remove_node: (a) =>
        this.canvasTools.removeNode(
          a.path as string,
          a.vault as string,
          a.options as Record<string, unknown> as any,
        ),
      canvas_remove_edge: (a) =>
        this.canvasTools.removeEdge(
          a.path as string,
          a.vault as string,
          a.options as Record<string, unknown> as any,
        ),

      // Periodic notes
      periodic_get: (a) =>
        this.periodicTools.getOrCreatePeriodic(
          a.vault as string,
          a.options as Record<string, unknown> as any,
        ),
      periodic_navigate: (a) =>
        this.periodicTools.navigatePeriodic(
          a.vault as string,
          a.options as Record<string, unknown> as any,
        ),
      periodic_list: (a) =>
        this.periodicTools.listPeriodic(
          a.vault as string,
          a.options as Record<string, unknown> as any,
        ),

      // Tasks
      task_list: (a) =>
        this.taskTools.listTasks(
          a.vault as string,
          a.options as Record<string, unknown> as any,
        ),
      task_update: (a) =>
        this.taskTools.updateTask(
          a.path as string,
          a.vault as string,
          a.options as Record<string, unknown> as any,
        ),
      task_stats: (a) =>
        this.taskTools.taskStats(
          a.vault as string,
          a.options as Record<string, unknown> as any,
        ),

      // Advanced search
      search_fuzzy: (a) =>
        this.searchTools.searchFuzzy(
          a.query as string,
          a.vault as string,
          a.options as Record<string, unknown> as any,
        ),
      search_advanced: (a) =>
        this.searchTools.searchAdvanced(
          a.vault as string,
          a.options as Record<string, unknown> as any,
        ),
      search_by_property: (a) =>
        this.searchTools.searchByProperty(
          a.vault as string,
          a.options as Record<string, unknown> as any,
        ),

      // Notion sync
      sync_plan: (a) =>
        this.syncTools.syncPlan(
          a.vault as string,
          a.options as Record<string, unknown> as any,
        ),
      sync_update_state: (a) =>
        this.syncTools.updateSyncState(
          a.vault as string,
          a.options as Record<string, unknown> as any,
        ),
      sync_status: (a) =>
        this.syncTools.syncStatus(
          a.vault as string,
          a.options as Record<string, unknown> as any,
        ),
    };

    return handlers[toolName] || null;
  }
}
