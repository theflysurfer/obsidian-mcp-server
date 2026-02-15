import type { ToolRegistry } from './tools/index.js';
import type { ToolResponse } from './utils/responses.js';
import { methodNotFound, invalidParams } from './utils/errors.js';
import { errorResponse } from './utils/responses.js';

/**
 * Maps meta-tool action names to internal tool names.
 * This is the HydraSpecter-inspired "one tool for all tools" pattern.
 */
const ACTION_MAP: Record<string, string> = {
  // ===== VAULT =====
  'list_files':       'vault_list_files',
  'list_dirs':        'vault_list_dirs',
  'vault_info':       'vault_info',
  'vault_stats':      'vault_stats',

  // ===== NOTES =====
  'read':             'note_read',
  'create':           'note_create',
  'edit':             'note_edit',
  'delete':           'note_delete',
  'move':             'note_move',
  'rename':           'note_move',

  // ===== SEARCH =====
  'search':           'search_content',
  'find':             'search_content',
  'search_files':     'search_filename',
  'search_tags':      'search_by_tags',

  // ===== PROPERTIES =====
  'get_property':     'property_get',
  'set_property':     'property_set',
  'delete_property':  'property_delete',
  'get_properties':   'property_get_all',
  'bulk_properties':  'property_bulk_update',

  // ===== TAGS =====
  'add_tags':         'tag_add',
  'remove_tags':      'tag_remove',
  'rename_tag':       'tag_rename',
  'list_tags':        'tag_list_all',

  // ===== GRAPH =====
  'links':            'graph_links',
  'backlinks':        'graph_backlinks',
  'neighbors':        'graph_neighbors',
  'path':             'graph_find_path',
  'find_path':        'graph_find_path',
  'orphans':          'graph_orphans',
  'graph_stats':      'graph_stats',

  // ===== EXPORT =====
  'export':           'export_note',
  'export_notion':    'export_note',
  'property_mapping': 'export_property_mapping',

  // ===== BASES =====
  'list_bases':       'bases_list',
  'read_base':        'bases_read',
  'create_base':      'bases_create',
  'query_base':       'bases_query',
  'update_base':      'bases_update',

  // ===== CONVERSATIONS =====
  'search_conversations':     'conversation_search',
  'analyze_conversation':     'conversation_analyze',
  'conversation_stats':       'conversation_stats',
  'create_conversations_base': 'conversation_create_base',
};

/**
 * Returns the MCP tool definition for the single "obsidian" meta-tool.
 * ~2-3k tokens instead of ~15-20k for individual tools.
 */
export function getMetaToolDefinition() {
  return {
    name: 'obsidian',
    description: `Unified Obsidian vault tool. Use { action, path?, content?, query?, vault?, options? }.

ACTIONS:

VAULT: list_files, list_dirs, vault_info, vault_stats
  list_files: List files. path=directory (optional). Returns name, path, size, modified.
  list_dirs: List subdirectories. path=directory (optional).
  vault_info: Get vault name, path, note count, file count.
  vault_stats: Get statistics (notes, attachments, sizes, extensions).

NOTES: read, create, edit, delete, move
  read: Read note. path=note path. options: { includeContent, includeFrontmatter, includeLinks }.
  create: Create note. path=note name, content=body. options: { frontmatter: {...}, folder: "..." }.
  edit: Modify note. path=note, content=new text. options: { operation: append|prepend|replace, target: "heading:Name" }.
  delete: Delete note. path=note path.
  move: Move/rename. path=old path. options: { newPath: "new/path.md" }.

SEARCH: search, search_files, search_tags
  search: Full-text search. query=search term. options: { caseSensitive, maxResults, regex, path }.
  search_files: Find by filename. query=pattern.
  search_tags: Find notes by tags. options: { tags: ["tag1", "tag2"] }.

PROPERTIES: get_property, set_property, delete_property, get_properties, bulk_properties
  get_property: Get frontmatter value. path=note. options: { key: "property_name" }.
  set_property: Set frontmatter value. path=note. options: { key: "name", value: ... }.
  delete_property: Remove property. path=note. options: { key: "name" }.
  get_properties: Get all frontmatter. path=note.
  bulk_properties: Update many notes. options: { files: [...], properties: {...} }.

TAGS: add_tags, remove_tags, rename_tag, list_tags
  add_tags: Add tags to note. path=note. options: { tags: ["tag1"] }.
  remove_tags: Remove tags. path=note. options: { tags: ["tag1"] }.
  rename_tag: Rename across vault. options: { oldTag: "old", newTag: "new" }.
  list_tags: List all tags with counts.

GRAPH: links, backlinks, neighbors, path, orphans, graph_stats
  links: Get outgoing links. path=note.
  backlinks: Get incoming links. path=note.
  neighbors: Get N-hop connections. path=note. options: { depth: 2, direction: both|outgoing|incoming, maxNodes: 50 }.
  path: Find path between notes. path=from note. options: { to: "target.md", maxDepth: 10 }.
  orphans: Find notes with no links in or out.
  graph_stats: Vault graph statistics (nodes, edges, most linked, etc).

EXPORT: export, property_mapping
  export: Export note in Notion-compatible format. path=note. options: { format: notion|obsidian, convertWikilinks, convertCallouts, convertInlineFields, convertEmbeds, convertH4Plus, includePropertyMapping }.
    Converts: [[wikilinks]]->markdown links, ![[embeds]]->images/links, H4+->bold, key::value->frontmatter, inline #tags->frontmatter.
    Property mapping: text->rich_text, number->number, checkbox->checkbox, date->date, list/tags->multi_select, [[links]]->relation candidates.
  property_mapping: Show Obsidian->Notion property type mapping for a note. path=note.

BASES: list_bases, read_base, create_base, query_base, update_base
  list_bases: List all .base files in the vault.
  read_base: Read and parse a .base file. path=base file.
  create_base: Create a new .base file. path=name. options: { filters, columns: [...], folder: "..." }.
  query_base: Execute a base query against vault notes. path=base file. options: { viewIndex: 0 }.
  update_base: Update a .base file config. path=base file. options: { filters, formulas, views, properties }.

CONVERSATIONS: search_conversations, analyze_conversation, conversation_stats, create_conversations_base
  Compatible with fetch-gpt-chat unified format (ChatGPT, Claude, Perplexity, Mistral, DeepSeek, Gemini exports).
  Detects: frontmatter source field, role markers (**User**:/**Claude**:), tags (conversation/research), callouts.
  search_conversations: Search AI conversations. options: { source: "Claude"|"ChatGPT"|..., query, dateFrom, dateTo, minMessages, calloutType, folder, maxResults }.
  analyze_conversation: Analyze a conversation note. path=note. Returns messages, speakers, word count, callout stats.
  conversation_stats: Vault-wide conversation statistics by source and month.
  create_conversations_base: Create a .base for indexing conversations. path=base name. options: { source, folder }.`,

    inputSchema: {
      type: 'object' as const,
      properties: {
        action: {
          type: 'string',
          description: 'Action to perform',
        },
        vault: {
          type: 'string',
          description: 'Vault name (optional if single vault)',
        },
        path: {
          type: 'string',
          description: 'Note or directory path (vault-relative)',
        },
        content: {
          type: 'string',
          description: 'Content for create/edit',
        },
        query: {
          type: 'string',
          description: 'Search query',
        },
        options: {
          type: 'object',
          description: 'Action-specific options',
          additionalProperties: true,
        },
      },
      required: ['action'],
    },
  };
}

/**
 * Route a meta-tool call to the appropriate internal tool handler.
 */
export async function executeMetaAction(
  registry: ToolRegistry,
  args: Record<string, unknown>,
): Promise<ToolResponse> {
  const action = args.action as string;
  if (!action) {
    throw invalidParams('Missing required parameter: action');
  }

  const toolName = ACTION_MAP[action];
  if (!toolName) {
    throw methodNotFound(action);
  }

  const handler = registry.getHandler(toolName);
  if (!handler) {
    throw methodNotFound(action);
  }

  try {
    return await handler(args);
  } catch (err) {
    if (err instanceof Error && 'code' in err) {
      throw err; // Re-throw MCP errors
    }
    return errorResponse((err as Error).message);
  }
}

/**
 * Get the list of available actions (for completions/help).
 */
export function getAvailableActions(): string[] {
  return Object.keys(ACTION_MAP);
}
