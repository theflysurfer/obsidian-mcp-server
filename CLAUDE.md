# Obsidian MCP Server

## Architecture

Single meta-tool (`obsidian`) with action routing pattern (from HydraSpecter).
~2-3k tokens vs ~15-20k for individual tools.

### Key directories
- `src/backends/` - IVaultBackend interface + FilesystemBackend (primary)
- `src/vault/` - VaultManager (multi-vault orchestrator)
- `src/markdown/` - Frontmatter YAML parser, link resolver
- `src/tools/` - Tool implementations (vault, note, search, property, tag)
- `src/meta-tool.ts` - ACTION_MAP routing meta-tool calls to handlers
- `src/server.ts` - MCP Server (stdio transport)
- `src/index.ts` - CLI entry point (Commander)

### Build
```bash
npm run build   # tsc -> dist/
npm run dev      # tsc --watch
```

### Test
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

## Development phases
- Phase 1: Foundation (DONE) - filesystem backend, CRUD, search, tags, properties, meta-tool
- Phase 2: Graph operations - links, backlinks, neighbors, paths, orphans
- Phase 3: Bases support - .base YAML parsing, query engine, expression evaluator
- Phase 4: Notion export - dual-format markdown, property type mapping
- Phase 5: REST API backend + multi-vault polish
- Phase 6: MetaMcp HTTP transport integration

## Conventions
- ESM (`"type": "module"`)
- All imports use `.js` extension
- Log to stderr (console.error), stdout is MCP JSON-RPC
- Vault paths are always relative to vault root, forward slashes
- `.md` extension added automatically for note paths
