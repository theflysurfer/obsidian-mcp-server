import type { VaultManager } from '../vault/vault-manager.js';
import type { ToolResponse } from '../utils/responses.js';
import { jsonResponse } from '../utils/responses.js';
import { ensureMdExtension } from '../utils/path.js';
import { GraphBuilder } from '../graph/graph-builder.js';
import {
  getOutgoing,
  getIncoming,
  getNeighbors,
  findPath,
  findOrphans,
  getGraphStats,
} from '../graph/graph-query.js';

export class GraphTools {
  private builders: Map<string, GraphBuilder> = new Map();

  constructor(private vault: VaultManager) {}

  private getBuilder(vaultName?: string): GraphBuilder {
    const backend = this.vault.getBackend(vaultName);
    const key = vaultName || '__default__';

    let builder = this.builders.get(key);
    if (!builder) {
      builder = new GraphBuilder(backend);
      this.builders.set(key, builder);
    }

    return builder;
  }

  async links(path: string, vault?: string): Promise<ToolResponse> {
    const notePath = ensureMdExtension(path);
    const builder = this.getBuilder(vault);
    const graph = await builder.getGraph();
    const outgoing = getOutgoing(graph, notePath);

    return jsonResponse({
      path: notePath,
      outgoingCount: outgoing.length,
      links: outgoing.map(n => ({
        path: n.path,
        title: n.title,
        tags: n.tags,
      })),
    });
  }

  async backlinks(path: string, vault?: string): Promise<ToolResponse> {
    const notePath = ensureMdExtension(path);
    const builder = this.getBuilder(vault);
    const graph = await builder.getGraph();
    const incoming = getIncoming(graph, notePath);

    return jsonResponse({
      path: notePath,
      backlinkCount: incoming.length,
      backlinks: incoming.map(n => ({
        path: n.path,
        title: n.title,
        tags: n.tags,
      })),
    });
  }

  async neighbors(
    path: string,
    vault?: string,
    options?: {
      depth?: number;
      direction?: 'both' | 'outgoing' | 'incoming';
      maxNodes?: number;
    },
  ): Promise<ToolResponse> {
    const notePath = ensureMdExtension(path);
    const builder = this.getBuilder(vault);
    const graph = await builder.getGraph();

    const depth = options?.depth ?? 2;
    const direction = options?.direction ?? 'both';
    const maxNodes = options?.maxNodes ?? 50;

    const nodes = getNeighbors(graph, notePath, depth, direction, maxNodes);

    return jsonResponse({
      path: notePath,
      depth,
      direction,
      neighborCount: nodes.length,
      neighbors: nodes.map(n => ({
        path: n.path,
        title: n.title,
        tags: n.tags,
        outgoingCount: n.outgoing.length,
        incomingCount: n.incoming.length,
      })),
    });
  }

  async findPathBetween(
    fromPath: string,
    toPath: string,
    vault?: string,
    maxDepth?: number,
  ): Promise<ToolResponse> {
    const from = ensureMdExtension(fromPath);
    const to = ensureMdExtension(toPath);
    const builder = this.getBuilder(vault);
    const graph = await builder.getGraph();

    const paths = findPath(graph, from, to, maxDepth ?? 10);

    return jsonResponse({
      from,
      to,
      pathsFound: paths.length,
      shortestLength: paths.length > 0 ? paths[0].length : null,
      paths: paths.map(p => ({
        length: p.length,
        steps: p,
      })),
    });
  }

  async orphans(vault?: string): Promise<ToolResponse> {
    const builder = this.getBuilder(vault);
    const graph = await builder.getGraph();
    const orphanNodes = findOrphans(graph);

    return jsonResponse({
      orphanCount: orphanNodes.length,
      orphans: orphanNodes.map(n => ({
        path: n.path,
        title: n.title,
        tags: n.tags,
      })),
    });
  }

  async graphStats(vault?: string): Promise<ToolResponse> {
    const builder = this.getBuilder(vault);
    const graph = await builder.getGraph();
    const stats = getGraphStats(graph);

    return jsonResponse(stats);
  }
}
