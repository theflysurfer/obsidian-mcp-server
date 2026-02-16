# Obsidian MCP Server

## Architecture

Single meta-tool (`obsidian`) with action routing pattern (from HydraSpecter).
~2-3k tokens vs ~15-20k for individual tools. 60+ actions across 15 categories.

### Key directories
- `src/backends/` - IVaultBackend interface + FilesystemBackend (primary) + RestApiBackend
- `src/vault/` - VaultManager (multi-vault orchestrator)
- `src/markdown/` - Frontmatter YAML parser, link resolver, dual-format converter
- `src/properties/` - Obsidian-to-Notion property type mapping
- `src/graph/` - GraphBuilder (cached), graph-query algorithms (BFS, path finding)
- `src/bases/` - .base YAML parser, query engine with expression evaluator
- `src/tools/` - Tool implementations (15 tool classes)
  - vault, note, search, property, tag, graph, export, bases, conversation
  - content (search-replace, headings), canvas, periodic, task, sync
- `src/meta-tool.ts` - ACTION_MAP routing meta-tool calls to handlers
- `src/server.ts` - MCP Server (stdio + HTTP/StreamableHTTP transport)
- `src/index.ts` - CLI entry point (Commander)
- `tests/` - Vitest unit + integration tests (138 tests, 9 suites)

### Build & Test
```bash
npm run build   # tsc -> dist/
npm run dev      # tsc --watch
npm test         # vitest run (138 tests)
npx vitest       # watch mode
```

### Manual test
```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"obsidian","arguments":{"action":"vault_info"}}}' | node dist/index.js --vault "/path/to/vault"
```

### Claude Code config
```json
{
  "mcpServers": {
    "obsidian": {
      "type": "stdio",
      "command": "node",
      "args": ["dist/index.js", "--vault", "C:/path/to/vault"]
    }
  }
}
```

### HTTP transport (MetaMcp)
```bash
node dist/index.js --vault "/path/to/vault" --transport http --port 8750
```

## Development phases
- Phase 1: Foundation (DONE) - filesystem backend, CRUD, search, tags, properties, meta-tool
- Phase 2: Graph operations (DONE) - links, backlinks, neighbors, paths, orphans, components
- Phase 3: Bases support (DONE) - .base YAML parsing, query engine, expression evaluator
- Phase 4: Notion export (DONE) - dual-format markdown, property type mapping
- Phase 5: REST API backend (DONE) + multi-vault polish
- Phase 6: MetaMcp HTTP transport (DONE) - StreamableHTTPServerTransport, Express
- Phase 6.5: Conversation integration (DONE) - fetch-gpt-chat format, 4 actions
- Phase 6.6: Tests + performance (DONE) - 88 tests, cache, parallel walkDirectory
- Phase 7: Content operations (DONE) - search_replace, insert_at, list_headings, get_section, rename_heading
- Phase 8: Canvas support (DONE) - .canvas JSON CRUD, add/remove nodes and edges
- Phase 9: Periodic notes (DONE) - daily/weekly/monthly, navigation, listing
- Phase 10: Task management (DONE) - list_tasks, update_task, task_stats, priority/due/tag extraction
- Phase 11: Advanced search (DONE) - fuzzy matching, property search, combined multi-criteria filters
- Phase 12: Notion sync (DONE) - sync_plan, sync_update_state, sync_status, property type mapping

## Performance notes
- File listing cache: 30s TTL, invalidated on create/delete/move
- walkDirectory: parallel fs.stat + parallel subdirectory recursion
- Graph: built once and cached until invalidated
- searchByTags: maxResults limit (default 50) + directory scoping
- searchContent: maxResults + directory scoping

## Conventions
- ESM (`"type": "module"`)
- All imports use `.js` extension
- Log to stderr (console.error), stdout is MCP JSON-RPC
- Vault paths are always relative to vault root, forward slashes
- `.md` extension added automatically for note paths
- `.canvas` extension added automatically for canvas paths
- Tests in `tests/` directory, excluded from tsc build
