import type { GraphNode, VaultGraph } from './graph-builder.js';

/**
 * Get outgoing links from a note.
 */
export function getOutgoing(graph: VaultGraph, path: string): GraphNode[] {
  const node = graph.nodes.get(path);
  if (!node) return [];

  return node.outgoing
    .map(p => graph.nodes.get(p))
    .filter((n): n is GraphNode => n !== undefined);
}

/**
 * Get incoming links (backlinks) to a note.
 */
export function getIncoming(graph: VaultGraph, path: string): GraphNode[] {
  const node = graph.nodes.get(path);
  if (!node) return [];

  return node.incoming
    .map(p => graph.nodes.get(p))
    .filter((n): n is GraphNode => n !== undefined);
}

/**
 * Get neighbors up to N hops away.
 */
export function getNeighbors(
  graph: VaultGraph,
  path: string,
  depth: number = 1,
  direction: 'both' | 'outgoing' | 'incoming' = 'both',
  maxNodes: number = 50,
): GraphNode[] {
  const visited = new Set<string>();
  const queue: Array<{ path: string; currentDepth: number }> = [
    { path, currentDepth: 0 },
  ];
  visited.add(path);

  const result: GraphNode[] = [];

  while (queue.length > 0 && result.length < maxNodes) {
    const item = queue.shift()!;
    if (item.currentDepth >= depth) continue;

    const node = graph.nodes.get(item.path);
    if (!node) continue;

    const neighbors: string[] = [];
    if (direction === 'both' || direction === 'outgoing') {
      neighbors.push(...node.outgoing);
    }
    if (direction === 'both' || direction === 'incoming') {
      neighbors.push(...node.incoming);
    }

    for (const neighborPath of neighbors) {
      if (visited.has(neighborPath)) continue;
      visited.add(neighborPath);

      const neighborNode = graph.nodes.get(neighborPath);
      if (neighborNode) {
        result.push(neighborNode);
        queue.push({ path: neighborPath, currentDepth: item.currentDepth + 1 });
      }
    }
  }

  return result;
}

/**
 * Find shortest path(s) between two notes using BFS.
 */
export function findPath(
  graph: VaultGraph,
  fromPath: string,
  toPath: string,
  maxDepth: number = 10,
): string[][] {
  if (fromPath === toPath) return [[fromPath]];

  const fromNode = graph.nodes.get(fromPath);
  const toNode = graph.nodes.get(toPath);
  if (!fromNode || !toNode) return [];

  // BFS to find shortest paths
  const queue: Array<{ path: string; trail: string[] }> = [
    { path: fromPath, trail: [fromPath] },
  ];
  const visited = new Set<string>([fromPath]);
  const paths: string[][] = [];
  let shortestLength = Infinity;

  while (queue.length > 0) {
    const { path, trail } = queue.shift()!;

    if (trail.length > maxDepth) break;
    if (trail.length > shortestLength) break;

    const node = graph.nodes.get(path);
    if (!node) continue;

    // Check both directions
    const neighbors = [...node.outgoing, ...node.incoming];

    for (const neighborPath of neighbors) {
      if (visited.has(neighborPath) && neighborPath !== toPath) continue;

      const newTrail = [...trail, neighborPath];

      if (neighborPath === toPath) {
        if (newTrail.length <= shortestLength) {
          shortestLength = newTrail.length;
          paths.push(newTrail);
        }
        continue;
      }

      visited.add(neighborPath);
      queue.push({ path: neighborPath, trail: newTrail });
    }
  }

  return paths;
}

/**
 * Find orphan notes (no incoming or outgoing links).
 */
export function findOrphans(graph: VaultGraph): GraphNode[] {
  const orphans: GraphNode[] = [];

  for (const node of graph.nodes.values()) {
    if (node.outgoing.length === 0 && node.incoming.length === 0) {
      orphans.push(node);
    }
  }

  return orphans;
}

/**
 * Get graph-wide statistics.
 */
export function getGraphStats(graph: VaultGraph): {
  totalNodes: number;
  totalEdges: number;
  orphanCount: number;
  unresolvedCount: number;
  avgOutgoing: number;
  avgIncoming: number;
  mostLinked: Array<{ path: string; incomingCount: number }>;
  mostLinking: Array<{ path: string; outgoingCount: number }>;
  buildTimeMs: number;
} {
  let totalEdges = 0;
  let totalOutgoing = 0;
  let totalIncoming = 0;
  let orphanCount = 0;

  const byIncoming: Array<{ path: string; incomingCount: number }> = [];
  const byOutgoing: Array<{ path: string; outgoingCount: number }> = [];

  for (const node of graph.nodes.values()) {
    totalEdges += node.outgoing.length;
    totalOutgoing += node.outgoing.length;
    totalIncoming += node.incoming.length;

    if (node.outgoing.length === 0 && node.incoming.length === 0) {
      orphanCount++;
    }

    byIncoming.push({ path: node.path, incomingCount: node.incoming.length });
    byOutgoing.push({ path: node.path, outgoingCount: node.outgoing.length });
  }

  const nodeCount = graph.nodes.size || 1;

  return {
    totalNodes: graph.nodes.size,
    totalEdges,
    orphanCount,
    unresolvedCount: graph.unresolvedLinks.size,
    avgOutgoing: Math.round((totalOutgoing / nodeCount) * 100) / 100,
    avgIncoming: Math.round((totalIncoming / nodeCount) * 100) / 100,
    mostLinked: byIncoming.sort((a, b) => b.incomingCount - a.incomingCount).slice(0, 10),
    mostLinking: byOutgoing.sort((a, b) => b.outgoingCount - a.outgoingCount).slice(0, 10),
    buildTimeMs: graph.buildTime,
  };
}
