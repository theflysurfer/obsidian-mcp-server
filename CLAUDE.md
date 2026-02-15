# Obsidian MCP Server

## Architecture

Single meta-tool (`obsidian`) with action routing pattern (from HydraSpecter).
~2-3k tokens vs ~15-20k for individual tools. 40+ actions across 9 categories.

### Key directories
- `src/backends/` - IVaultBackend interface + FilesystemBackend (primary) + RestApiBackend
- `src/vault/` - VaultManager (multi-vault orchestrator)
- `src/markdown/` - Frontmatter YAML parser, link resolver, dual-format converter
- `src/properties/` - Obsidian-to-Notion property type mapping
- `src/graph/` - GraphBuilder (cached), graph-query algorithms (BFS, path finding)
- `src/bases/` - .base YAML parser, query engine with expression evaluator
- `src/tools/` - Tool implementations (vault, note, search, property, tag, graph, export, bases, conversation)
- `src/meta-tool.ts` - ACTION_MAP routing meta-tool calls to handlers
- `src/server.ts` - MCP Server (stdio + HTTP/StreamableHTTP transport)
- `src/index.ts` - CLI entry point (Commander)
- `tests/` - Vitest unit + integration tests (88 tests)

### Build & Test
```bash
npm run build   # tsc -> dist/
npm run dev      # tsc --watch
npm test         # vitest run (88 tests)
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
- Phase 7: Content operations - note_patch, search_replace, batch reads, create_directory
- Phase 8: Canvas support - .canvas JSON parsing, node/edge CRUD
- Phase 9: Periodic notes + templates - daily/weekly/monthly, template rendering
- Phase 10: Tasks - extract/query/toggle checkbox items
- Phase 11: Advanced search - fragment retrieval, semantic search
- Phase 12: Notion sync - bidirectional sync via Notion MCP/API

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
- Tests in `tests/` directory, excluded from tsc build
