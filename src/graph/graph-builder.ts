import type { IVaultBackend } from '../backends/types.js';
import { extractLinks, extractEmbeds, extractTags } from '../markdown/link-resolver.js';
import { parseFrontmatter } from '../markdown/frontmatter.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('graph');

export interface GraphNode {
  path: string;
  title: string;
  tags: string[];
  outgoing: string[];
  incoming: string[];
  embeds: string[];
}

export interface VaultGraph {
  nodes: Map<string, GraphNode>;
  unresolvedLinks: Set<string>;
  buildTime: number;
}

export class GraphBuilder {
  private graph: VaultGraph | null = null;
  private backend: IVaultBackend;

  constructor(backend: IVaultBackend) {
    this.backend = backend;
  }

  async getGraph(): Promise<VaultGraph> {
    if (!this.graph) {
      await this.buildGraph();
    }
    return this.graph!;
  }

  async buildGraph(): Promise<VaultGraph> {
    const start = Date.now();
    const nodes = new Map<string, GraphNode>();
    const unresolvedLinks = new Set<string>();

    const files = await this.backend.listFiles();
    const mdFiles = files.filter(f => f.extension === '.md');

    // Build a lookup: lowercase name (without .md) -> path
    const nameLookup = new Map<string, string>();
    for (const f of mdFiles) {
      nameLookup.set(f.name.toLowerCase(), f.path);
      // Also map the full path without extension
      const pathNoExt = f.path.replace(/\.md$/, '');
      nameLookup.set(pathNoExt.toLowerCase(), f.path);
    }

    // Phase 1: Parse all files, extract outgoing links
    for (const file of mdFiles) {
      try {
        const content = await this.backend.readFile(file.path);
        const { frontmatter, body } = parseFrontmatter(content);
        const links = extractLinks(body);
        const embeds = extractEmbeds(body);
        const tags = extractTags(content, frontmatter);

        const title = (frontmatter.title as string) || file.name;

        // Resolve link targets to actual file paths
        const resolvedLinks: string[] = [];
        for (const link of links) {
          const resolved = resolveLink(link, nameLookup);
          if (resolved) {
            resolvedLinks.push(resolved);
          } else {
            unresolvedLinks.add(link);
          }
        }

        nodes.set(file.path, {
          path: file.path,
          title,
          tags,
          outgoing: resolvedLinks,
          incoming: [], // filled in Phase 2
          embeds,
        });
      } catch {
        // Skip unreadable files
      }
    }

    // Phase 2: Build incoming links (backlinks)
    for (const [sourcePath, node] of nodes) {
      for (const targetPath of node.outgoing) {
        const targetNode = nodes.get(targetPath);
        if (targetNode) {
          targetNode.incoming.push(sourcePath);
        }
      }
    }

    this.graph = {
      nodes,
      unresolvedLinks,
      buildTime: Date.now() - start,
    };

    log.info(
      `Graph built: ${nodes.size} nodes, ${unresolvedLinks.size} unresolved links, ${this.graph.buildTime}ms`,
    );

    return this.graph;
  }

  invalidate(): void {
    this.graph = null;
  }
}

/**
 * Resolve a wikilink target to an actual file path.
 * Obsidian resolves [[Note]] to the shortest unambiguous match.
 */
function resolveLink(
  target: string,
  nameLookup: Map<string, string>,
): string | null {
  // Strip any heading anchor (#heading)
  const cleanTarget = target.split('#')[0].trim();
  if (!cleanTarget) return null;

  // Try exact match (with and without .md)
  const lower = cleanTarget.toLowerCase();
  const direct = nameLookup.get(lower);
  if (direct) return direct;

  const withMd = nameLookup.get(lower.replace(/\.md$/, ''));
  if (withMd) return withMd;

  // Try matching just the filename part
  const baseName = lower.split('/').pop() || lower;
  const byName = nameLookup.get(baseName);
  if (byName) return byName;

  return null;
}
