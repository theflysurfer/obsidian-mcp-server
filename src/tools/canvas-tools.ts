import type { VaultManager } from '../vault/vault-manager.js';
import type { ToolResponse } from '../utils/responses.js';
import { jsonResponse, textResponse } from '../utils/responses.js';
import { invalidParams } from '../utils/errors.js';

// Obsidian .canvas JSON format
interface CanvasNode {
  id: string;
  type: 'text' | 'file' | 'link' | 'group';
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  file?: string;
  url?: string;
  label?: string;
  color?: string;
}

interface CanvasEdge {
  id: string;
  fromNode: string;
  toNode: string;
  fromSide?: 'top' | 'right' | 'bottom' | 'left';
  toSide?: 'top' | 'right' | 'bottom' | 'left';
  label?: string;
  color?: string;
}

interface CanvasData {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

export class CanvasTools {
  constructor(private vault: VaultManager) {}

  /**
   * List all .canvas files in the vault.
   */
  async listCanvases(vault?: string): Promise<ToolResponse> {
    const files = await this.vault.listFiles(vault);
    const canvases = files
      .filter(f => f.extension === '.canvas')
      .map(f => ({
        path: f.path,
        name: f.name,
        size: f.stat.size,
        modified: new Date(f.stat.mtime).toISOString(),
      }));

    return jsonResponse({ count: canvases.length, canvases });
  }

  /**
   * Read and parse a .canvas file.
   */
  async readCanvas(path: string, vault?: string): Promise<ToolResponse> {
    const canvasPath = ensureCanvasExtension(path);
    const raw = await this.vault.readFile(canvasPath, vault);
    const data = JSON.parse(raw) as CanvasData;

    return jsonResponse({
      path: canvasPath,
      nodeCount: data.nodes.length,
      edgeCount: data.edges.length,
      nodes: data.nodes,
      edges: data.edges,
    });
  }

  /**
   * Create a new .canvas file.
   */
  async createCanvas(
    path: string,
    vault?: string,
    options?: { nodes?: CanvasNode[]; edges?: CanvasEdge[] },
  ): Promise<ToolResponse> {
    const canvasPath = ensureCanvasExtension(path);

    if (await this.vault.fileExists(canvasPath, vault)) {
      throw invalidParams(`Canvas already exists: ${canvasPath}`);
    }

    const data: CanvasData = {
      nodes: options?.nodes ?? [],
      edges: options?.edges ?? [],
    };

    await this.vault.writeFile(canvasPath, JSON.stringify(data, null, 2), vault);
    return textResponse(`Created canvas: ${canvasPath}`);
  }

  /**
   * Add a node to an existing canvas.
   */
  async addNode(
    path: string,
    vault?: string,
    options?: {
      type?: 'text' | 'file' | 'link' | 'group';
      text?: string;
      file?: string;
      url?: string;
      x?: number;
      y?: number;
      width?: number;
      height?: number;
      color?: string;
      label?: string;
    },
  ): Promise<ToolResponse> {
    const canvasPath = ensureCanvasExtension(path);
    const data = await this.readCanvasData(canvasPath, vault);

    const nodeType = options?.type ?? 'text';
    const node: CanvasNode = {
      id: generateId(),
      type: nodeType,
      x: options?.x ?? findNextX(data.nodes),
      y: options?.y ?? 0,
      width: options?.width ?? 250,
      height: options?.height ?? 60,
    };

    if (nodeType === 'text') node.text = options?.text ?? '';
    if (nodeType === 'file') node.file = options?.file ?? '';
    if (nodeType === 'link') node.url = options?.url ?? '';
    if (options?.color) node.color = options.color;
    if (options?.label) node.label = options.label;

    data.nodes.push(node);
    await this.vault.writeFile(canvasPath, JSON.stringify(data, null, 2), vault);

    return jsonResponse({ path: canvasPath, addedNode: node });
  }

  /**
   * Add an edge between two nodes.
   */
  async addEdge(
    path: string,
    vault?: string,
    options?: {
      fromNode: string;
      toNode: string;
      fromSide?: 'top' | 'right' | 'bottom' | 'left';
      toSide?: 'top' | 'right' | 'bottom' | 'left';
      label?: string;
      color?: string;
    },
  ): Promise<ToolResponse> {
    if (!options?.fromNode) throw invalidParams('options.fromNode is required');
    if (!options?.toNode) throw invalidParams('options.toNode is required');

    const canvasPath = ensureCanvasExtension(path);
    const data = await this.readCanvasData(canvasPath, vault);

    // Validate nodes exist
    if (!data.nodes.some(n => n.id === options.fromNode)) {
      throw invalidParams(`Node not found: ${options.fromNode}`);
    }
    if (!data.nodes.some(n => n.id === options.toNode)) {
      throw invalidParams(`Node not found: ${options.toNode}`);
    }

    const edge: CanvasEdge = {
      id: generateId(),
      fromNode: options.fromNode,
      toNode: options.toNode,
    };

    if (options.fromSide) edge.fromSide = options.fromSide;
    if (options.toSide) edge.toSide = options.toSide;
    if (options.label) edge.label = options.label;
    if (options.color) edge.color = options.color;

    data.edges.push(edge);
    await this.vault.writeFile(canvasPath, JSON.stringify(data, null, 2), vault);

    return jsonResponse({ path: canvasPath, addedEdge: edge });
  }

  /**
   * Remove a node (and its connected edges) from a canvas.
   */
  async removeNode(
    path: string,
    vault?: string,
    options?: { nodeId: string },
  ): Promise<ToolResponse> {
    if (!options?.nodeId) throw invalidParams('options.nodeId is required');

    const canvasPath = ensureCanvasExtension(path);
    const data = await this.readCanvasData(canvasPath, vault);

    const nodeIndex = data.nodes.findIndex(n => n.id === options.nodeId);
    if (nodeIndex === -1) throw invalidParams(`Node not found: ${options.nodeId}`);

    data.nodes.splice(nodeIndex, 1);
    // Remove connected edges
    const removedEdges = data.edges.filter(
      e => e.fromNode === options!.nodeId || e.toNode === options!.nodeId,
    );
    data.edges = data.edges.filter(
      e => e.fromNode !== options!.nodeId && e.toNode !== options!.nodeId,
    );

    await this.vault.writeFile(canvasPath, JSON.stringify(data, null, 2), vault);

    return jsonResponse({
      path: canvasPath,
      removedNodeId: options.nodeId,
      removedEdgeCount: removedEdges.length,
    });
  }

  /**
   * Remove an edge from a canvas.
   */
  async removeEdge(
    path: string,
    vault?: string,
    options?: { edgeId: string },
  ): Promise<ToolResponse> {
    if (!options?.edgeId) throw invalidParams('options.edgeId is required');

    const canvasPath = ensureCanvasExtension(path);
    const data = await this.readCanvasData(canvasPath, vault);

    const edgeIndex = data.edges.findIndex(e => e.id === options.edgeId);
    if (edgeIndex === -1) throw invalidParams(`Edge not found: ${options.edgeId}`);

    data.edges.splice(edgeIndex, 1);
    await this.vault.writeFile(canvasPath, JSON.stringify(data, null, 2), vault);

    return textResponse(`Removed edge ${options.edgeId} from ${canvasPath}`);
  }

  // --- Private helpers ---

  private async readCanvasData(canvasPath: string, vault?: string): Promise<CanvasData> {
    const raw = await this.vault.readFile(canvasPath, vault);
    return JSON.parse(raw) as CanvasData;
  }
}

function ensureCanvasExtension(p: string): string {
  return p.endsWith('.canvas') ? p : `${p}.canvas`;
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 18);
}

function findNextX(nodes: CanvasNode[]): number {
  if (nodes.length === 0) return 0;
  const maxX = Math.max(...nodes.map(n => n.x + n.width));
  return maxX + 40;
}
