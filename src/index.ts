#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { ObsidianMcpServer } from './server.js';
import type { ServerConfig, BackendType, TransportType } from './types.js';

const program = new Command();

program
  .name('obsidian-mcp')
  .description('MCP server for Obsidian vaults with meta-tool pattern')
  .version('0.1.0')
  .requiredOption(
    '--vault <paths...>',
    'Vault path(s) to serve. Format: "path" or "name:path"',
  )
  .option(
    '--backend <type>',
    'Backend type: filesystem (default) or rest-api',
    'filesystem',
  )
  .option(
    '--transport <type>',
    'Transport: stdio (default) or http',
    'stdio',
  )
  .option('--port <number>', 'HTTP port (default: 8750)', '8750')
  .option('--host <address>', 'HTTP host (default: 127.0.0.1)', '127.0.0.1')
  .option('--no-meta', 'Disable meta-tool mode (expose individual tools)')
  .option(
    '--log-level <level>',
    'Log level: debug, info, warn, error',
    'info',
  )
  .action(async (options) => {
    const vaults = parseVaultArgs(options.vault as string[]);
    const backend = options.backend as BackendType;
    const transport = options.transport as TransportType;
    const metaMode = options.meta !== false;
    const logLevel = options.logLevel as ServerConfig['logLevel'];
    const httpPort = parseInt(options.port as string, 10);
    const httpHost = options.host as string;

    // Display startup banner
    console.error(chalk.cyan.bold('\n  Obsidian MCP Server v0.1.0'));
    console.error(chalk.gray('  ─────────────────────────────'));
    console.error(`  ${chalk.white('Transport:')} ${chalk.green(transport)}${transport === 'http' ? chalk.gray(` (${httpHost}:${httpPort})`) : ''}`);
    console.error(`  ${chalk.white('Backend:')}   ${chalk.green(backend)}`);
    console.error(`  ${chalk.white('Meta-tool:')} ${metaMode ? chalk.green('ON (single "obsidian" tool)') : chalk.yellow('OFF (individual tools)')}`);
    console.error(`  ${chalk.white('Log level:')} ${chalk.gray(logLevel)}`);
    console.error(`  ${chalk.white('Vaults:')}`);
    for (const v of vaults) {
      console.error(`    ${chalk.cyan('•')} ${chalk.white(v.name)} ${chalk.gray('→')} ${chalk.gray(v.path)}`);
    }
    if (transport === 'http') {
      console.error(`  ${chalk.white('MetaMcp:')}   ${chalk.cyan(`http://${httpHost}:${httpPort}/mcp`)}`);
    }
    console.error(chalk.gray('  ─────────────────────────────\n'));

    const config: ServerConfig = {
      vaults,
      backend,
      metaMode,
      logLevel,
      transport,
      httpPort,
      httpHost,
    };

    const server = new ObsidianMcpServer(config);
    await server.run();
  });

program.parse();

function parseVaultArgs(
  args: string[],
): Array<{ name: string; path: string }> {
  return args.map((arg) => {
    const colonIdx = arg.indexOf(':');

    // Check if this is a Windows absolute path (e.g., C:\...)
    if (colonIdx === 1 && /^[a-zA-Z]$/.test(arg[0])) {
      // Single letter before colon = drive letter, treat whole arg as path
      const name = arg.split(/[\\/]/).pop() || 'vault';
      return { name, path: arg };
    }

    if (colonIdx > 0) {
      // name:path format
      return {
        name: arg.slice(0, colonIdx),
        path: arg.slice(colonIdx + 1),
      };
    }

    // Just a path, extract name from last segment
    const name = arg.split(/[\\/]/).pop() || 'vault';
    return { name, path: arg };
  });
}
