# Obsidian MCP Server

A high-performance MCP (Model Context Protocol) server for Obsidian vaults with a single meta-tool pattern, direct filesystem access, graph operations, Notion-compatible export, and AI conversation analysis.

## Features

- **Meta-tool pattern** -- Single `obsidian` tool with 40+ actions (~2-3k tokens vs ~15-20k for individual tools)
- **Direct filesystem access** -- No Obsidian app required, reads vault files directly
- **REST API backend** -- Optional connection via Obsidian Local REST API plugin
- **Dual transport** -- stdio (MCP standard) or HTTP (MetaMcp compatible)
- **Multi-vault support** -- Serve multiple vaults simultaneously
- **Graph operations** -- Links, backlinks, neighbors, shortest path, orphans, connected components
- **Notion export** -- Convert notes to Notion-compatible markdown with property type mapping
- **Bases support** -- Read/create/query Obsidian Bases (`.base` YAML files)
- **Conversation analysis** -- Detect and analyze AI conversation exports (fetch-gpt-chat format)
- **File listing cache** -- 30s TTL cache for vault scans, parallel directory traversal

## Quick Start

```bash
# Install dependencies
npm install

# Build
npm run build

# Run with stdio transport (standard MCP)
node dist/index.js --vault "/path/to/vault"

# Run with HTTP transport (MetaMcp)
node dist/index.js --vault "/path/to/vault" --transport http --port 8750
```

## Claude Code Configuration

Add to your `.mcp.json`:

```json
{
  "mcpServers": {
    "obsidian": {
      "type": "stdio",
      "command": "node",
      "args": ["dist/index.js", "--vault", "C:/path/to/your/vault"]
    }
  }
}
```

For HTTP transport (MetaMcp):

```json
{
  "mcpServers": {
    "obsidian": {
      "type": "http",
      "url": "http://127.0.0.1:8750/mcp"
    }
  }
}
```

## CLI Options

| Option | Default | Description |
|--------|---------|-------------|
| `--vault <paths...>` | (required) | Vault path(s). Format: `"path"` or `"name:path"` |
| `--backend <type>` | `filesystem` | `filesystem` or `rest-api` |
| `--transport <type>` | `stdio` | `stdio` or `http` |
| `--port <number>` | `8750` | HTTP port (when transport=http) |
| `--host <address>` | `127.0.0.1` | HTTP host |
| `--no-meta` | `false` | Expose individual tools instead of meta-tool |
| `--log-level <level>` | `info` | `debug`, `info`, `warn`, `error` |

Multiple vaults:

```bash
node dist/index.js --vault "personal:C:/Vaults/Personal" --vault "work:C:/Vaults/Work"
```

## Actions Reference

All actions are called through the single `obsidian` tool:

```json
{ "action": "read", "path": "my-note" }
```

### Vault

| Action | Description | Parameters |
|--------|-------------|------------|
| `list_files` | List files in vault/directory | `path?` (directory) |
| `list_dirs` | List subdirectories | `path?` (directory) |
| `vault_info` | Vault name, path, note/file count | |
| `vault_stats` | Notes, attachments, sizes, extension counts | |

### Notes

| Action | Description | Parameters |
|--------|-------------|------------|
| `read` | Read note content, frontmatter, links, tags | `path` |
| `create` | Create note with optional frontmatter | `path`, `content`, `options.frontmatter?`, `options.folder?` |
| `edit` | Modify note | `path`, `content`, `options.operation` (append/prepend/replace), `options.target?` |
| `delete` | Delete note | `path` |
| `move` / `rename` | Move or rename note | `path`, `options.newPath` |

### Search

| Action | Description | Parameters |
|--------|-------------|------------|
| `search` / `find` | Full-text search | `query`, `options.caseSensitive?`, `options.maxResults?`, `options.regex?`, `options.path?` |
| `search_files` | Find by filename | `query` |
| `search_tags` | Find notes by tags | `options.tags`, `options.maxResults?`, `options.path?` |

### Properties (Frontmatter)

| Action | Description | Parameters |
|--------|-------------|------------|
| `get_property` | Get a frontmatter value | `path`, `options.key` |
| `set_property` | Set a frontmatter value | `path`, `options.key`, `options.value` |
| `delete_property` | Remove a property | `path`, `options.key` |
| `get_properties` | Get all frontmatter | `path` |
| `bulk_properties` | Update many notes at once | `options.files`, `options.properties` |

### Tags

| Action | Description | Parameters |
|--------|-------------|------------|
| `add_tags` | Add tags to a note | `path`, `options.tags` |
| `remove_tags` | Remove tags | `path`, `options.tags` |
| `rename_tag` | Rename tag across vault | `options.oldTag`, `options.newTag` |
| `list_tags` | List all tags with counts | |

### Graph

| Action | Description | Parameters |
|--------|-------------|------------|
| `links` | Outgoing links from a note | `path` |
| `backlinks` | Incoming links to a note | `path` |
| `neighbors` | N-hop connections | `path`, `options.depth?`, `options.direction?`, `options.maxNodes?` |
| `path` / `find_path` | Shortest path between notes | `path` (from), `options.to`, `options.maxDepth?` |
| `orphans` | Notes with no links | |
| `graph_stats` | Vault graph statistics | |

### Export

| Action | Description | Parameters |
|--------|-------------|------------|
| `export` / `export_notion` | Export to Notion-compatible format | `path`, `options.format?`, `options.convertWikilinks?`, `options.convertCallouts?` |
| `property_mapping` | Show Obsidian-to-Notion type mapping | `path` |

### Bases

| Action | Description | Parameters |
|--------|-------------|------------|
| `list_bases` | List all `.base` files | |
| `read_base` | Parse a `.base` file | `path` |
| `create_base` | Create a new base | `path`, `options.filters?`, `options.columns?` |
| `query_base` | Execute a base query | `path`, `options.viewIndex?` |
| `update_base` | Update base config | `path`, `options.filters?`, `options.views?` |

### Conversations

Compatible with [fetch-gpt-chat](https://github.com/theflysurfer/fetch-gpt-chat) unified format.

| Action | Description | Parameters |
|--------|-------------|------------|
| `search_conversations` | Search AI conversations | `options.source?`, `options.query?`, `options.dateFrom?`, `options.dateTo?` |
| `analyze_conversation` | Analyze a conversation note | `path` |
| `conversation_stats` | Stats by source and month | |
| `create_conversations_base` | Create a base for indexing conversations | `path`, `options.source?`, `options.folder?` |

## Architecture

```
src/
  index.ts              CLI entry point (Commander)
  server.ts             MCP Server (stdio + HTTP transport)
  meta-tool.ts          ACTION_MAP routing meta-tool calls
  types.ts              Shared types
  backends/
    types.ts            IVaultBackend interface
    filesystem-backend.ts   Direct filesystem (primary)
    rest-api-backend.ts     Obsidian REST API plugin
    backend-factory.ts      Backend creation factory
  vault/
    vault-manager.ts    Multi-vault orchestrator
  markdown/
    frontmatter.ts      YAML frontmatter parser
    link-resolver.ts    Wikilinks, embeds, tags, conversations
    dual-format.ts      Obsidian/Notion dual format converter
  properties/
    type-mapper.ts      Obsidian-to-Notion property type mapping
  graph/
    graph-builder.ts    Vault-wide link graph builder (cached)
    graph-query.ts      Graph algorithms (BFS, path finding)
  bases/
    bases-parser.ts     .base YAML parser
    bases-query.ts      Query engine with expression evaluator
  tools/
    index.ts            ToolRegistry (all handlers)
    vault-tools.ts      Vault operations
    note-tools.ts       Note CRUD
    search-tools.ts     Content/filename/tag search
    property-tools.ts   Frontmatter operations
    tag-tools.ts        Tag management
    graph-tools.ts      Graph operations
    export-tools.ts     Notion export
    bases-tools.ts      Bases operations
    conversation-tools.ts  Conversation analysis
  utils/
    path.ts             Path normalization
    security.ts         Vault path traversal protection
    responses.ts        MCP response formatting
    errors.ts           MCP error helpers
    logger.ts           Stderr logger
```

## Testing

```bash
# Run all tests
npm test

# Run with watch mode
npx vitest

# Run specific test file
npx vitest run tests/frontmatter.test.ts
```

88 tests across 5 test suites:
- `frontmatter.test.ts` -- YAML parsing, stringify, property operations
- `link-resolver.test.ts` -- Wikilinks, embeds, tags, inline fields, conversations
- `path-utils.test.ts` -- Path normalization, extension handling
- `meta-tool.test.ts` -- Tool definition, action routing, completeness
- `filesystem-backend.test.ts` -- Integration tests with temp vault (CRUD, search, cache)

## Manual Testing

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"obsidian","arguments":{"action":"vault_info"}}}' | node dist/index.js --vault "/path/to/vault"
```

## Performance

- **File listing cache**: 30-second TTL cache for full vault scans; invalidated on write operations
- **Parallel directory traversal**: `walkDirectory` stats files in parallel batches
- **Graph caching**: Graph is built once and cached until invalidated
- **Search limits**: `maxResults` (default 50) prevents unbounded scans
- **Directory scoping**: All search operations accept `path`/`directory` to scope to a subfolder

## License

MIT
