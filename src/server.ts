import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
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
  private vaultManager: VaultManager;
  private toolRegistry: ToolRegistry;
  private useMetaMode: boolean;

  constructor(private config: ServerConfig) {
    setLogLevel(config.logLevel);

    this.useMetaMode = config.metaMode;

    this.vaultManager = new VaultManager(
      () => BackendFactory.getAsync(config.backend),
    );

    this.toolRegistry = new ToolRegistry(this.vaultManager);
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

    if (this.config.transport === 'http') {
      await this.runHttp();
    } else {
      await this.runStdio();
    }
  }

  private async runStdio(): Promise<void> {
    const server = this.createServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);

    log.info('Obsidian MCP Server running on stdio');
    this.logStartup();

    this.setupSignalHandlers(server);
  }

  private async runHttp(): Promise<void> {
    const { createMcpExpressApp } = await import(
      '@modelcontextprotocol/sdk/server/express.js'
    );

    const host = this.config.httpHost;
    const port = this.config.httpPort;

    const app = createMcpExpressApp({ host });

    // Stateless mode: each request gets a fresh server + transport
    // This is the pattern MetaMcp expects
    app.post('/mcp', async (req: import('express').Request, res: import('express').Response) => {
      const server = this.createServer();

      try {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined, // Stateless
        });

        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);

        res.on('close', () => {
          transport.close();
          server.close();
        });
      } catch (error) {
        log.error(`HTTP request error: ${(error as Error).message}`);
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: '2.0',
            error: { code: -32603, message: 'Internal server error' },
            id: null,
          });
        }
      }
    });

    // Method not allowed for GET/DELETE
    app.get('/mcp', (_req: import('express').Request, res: import('express').Response) => {
      res.status(405).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Method not allowed. Use POST.' },
        id: null,
      });
    });

    app.delete('/mcp', (_req: import('express').Request, res: import('express').Response) => {
      res.status(405).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Method not allowed.' },
        id: null,
      });
    });

    // Health check endpoint
    app.get('/health', (_req: import('express').Request, res: import('express').Response) => {
      res.json({
        status: 'ok',
        server: 'obsidian-mcp-server',
        version: '0.1.0',
        vaults: this.vaultManager.listVaults().map(v => v.name),
        metaMode: this.useMetaMode,
      });
    });

    app.listen(port, host, () => {
      log.info(`Obsidian MCP Server running on http://${host}:${port}/mcp`);
      this.logStartup();
      log.info(`Health check: http://${host}:${port}/health`);
      log.info(`MetaMcp URL: http://${host}:${port}/mcp`);
    });

    process.on('SIGINT', () => {
      log.info('Shutting down HTTP server...');
      process.exit(0);
    });
    process.on('SIGTERM', () => {
      log.info('Shutting down HTTP server...');
      process.exit(0);
    });
  }

  /**
   * Create a new Server instance with handlers configured.
   * For HTTP stateless mode, a new server is created per request.
   */
  private createServer(): Server {
    const server = new Server(
      { name: 'obsidian-mcp-server', version: '0.1.0' },
      { capabilities: { tools: {} } },
    );

    // List tools
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      if (this.useMetaMode) {
        return { tools: [getMetaToolDefinition()] };
      }
      return { tools: [getMetaToolDefinition()] };
    });

    // Call tool
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      if (this.useMetaMode || name === 'obsidian') {
        const result = await executeMetaAction(
          this.toolRegistry,
          (args || {}) as Record<string, unknown>,
        );
        return result as { content: Array<{ type: "text"; text: string }>; isError?: boolean; [key: string]: unknown };
      }

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

    return server;
  }

  private logStartup(): void {
    log.info(`Meta-tool mode: ${this.useMetaMode ? 'ON' : 'OFF'}`);
    log.info(`Backend: ${this.config.backend}`);
    log.info(`Vaults: ${this.vaultManager.listVaults().map(v => v.name).join(', ')}`);
  }

  private setupSignalHandlers(server: Server): void {
    const shutdown = async () => {
      log.info('Shutting down...');
      await server.close();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  }
}
