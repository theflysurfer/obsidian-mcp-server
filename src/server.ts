import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import type { ServerConfig } from './types.js';
import { BackendFactory } from './backends/backend-factory.js';
import { VaultManager } from './vault/vault-manager.js';
import { ToolRegistry } from './tools/index.js';
import { getMetaToolDefinition, executeMetaAction } from './meta-tool.js';
import { createLogger, setLogLevel } from './utils/logger.js';

const log = createLogger('server');

export class ObsidianMcpServer {
  private server: Server;
  private vaultManager: VaultManager;
  private toolRegistry: ToolRegistry;
  private useMetaMode: boolean;

  constructor(private config: ServerConfig) {
    setLogLevel(config.logLevel);

    this.server = new Server(
      { name: 'obsidian-mcp-server', version: '0.1.0' },
      { capabilities: { tools: {} } },
    );

    this.useMetaMode = config.metaMode;

    this.vaultManager = new VaultManager(
      () => BackendFactory.getAsync(config.backend),
    );

    this.toolRegistry = new ToolRegistry(this.vaultManager);
    this.setupHandlers();
    this.setupSignalHandlers();
  }

  async initialize(): Promise<void> {
    for (const vaultConfig of this.config.vaults) {
      try {
        await this.vaultManager.addVault(vaultConfig);
      } catch (err) {
        log.error(`Failed to connect vault ${vaultConfig.name}: ${(err as Error).message}`);
      }
    }
  }

  async run(): Promise<void> {
    await this.initialize();

    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    log.info('Obsidian MCP Server running on stdio');
    log.info(`Meta-tool mode: ${this.useMetaMode ? 'ON' : 'OFF'}`);
    log.info(`Vaults: ${this.vaultManager.listVaults().map(v => v.name).join(', ')}`);
  }

  private setupHandlers(): void {
    // List tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      if (this.useMetaMode) {
        return { tools: [getMetaToolDefinition()] };
      }

      // Standard mode: expose individual tools
      // TODO: Phase 2 - expose individual tool definitions
      return { tools: [getMetaToolDefinition()] };
    });

    // Call tool
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      if (this.useMetaMode || name === 'obsidian') {
        const result = await executeMetaAction(
          this.toolRegistry,
          (args || {}) as Record<string, unknown>,
        );
        return result as { content: Array<{ type: "text"; text: string }>; isError?: boolean; [key: string]: unknown };
      }

      // Standard mode: direct tool call
      const handler = this.toolRegistry.getHandler(name);
      if (!handler) {
        return {
          content: [{ type: 'text' as const, text: `Unknown tool: ${name}` }],
          isError: true,
        };
      }

      const result = await handler((args || {}) as Record<string, unknown>);
      return result as { content: Array<{ type: "text"; text: string }>; isError?: boolean; [key: string]: unknown };
    });
  }

  private setupSignalHandlers(): void {
    const shutdown = async () => {
      log.info('Shutting down...');
      await this.server.close();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  }
}
