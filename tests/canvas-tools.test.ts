import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { FilesystemBackend } from '../src/backends/filesystem-backend.js';
import { VaultManager } from '../src/vault/vault-manager.js';
import { CanvasTools } from '../src/tools/canvas-tools.js';

let vault: VaultManager;
let canvasTools: CanvasTools;
let tmpDir: string;

beforeAll(async () => {
  tmpDir = path.join(os.tmpdir(), `obsidian-canvas-test-${Date.now()}`);
  await fs.mkdir(tmpDir, { recursive: true });
  await fs.mkdir(path.join(tmpDir, '.obsidian'), { recursive: true });

  // Create a test canvas
  await fs.writeFile(
    path.join(tmpDir, 'test.canvas'),
    JSON.stringify({
      nodes: [
        { id: 'node1', type: 'text', x: 0, y: 0, width: 200, height: 50, text: 'Hello' },
        { id: 'node2', type: 'text', x: 300, y: 0, width: 200, height: 50, text: 'World' },
      ],
      edges: [
        { id: 'edge1', fromNode: 'node1', toNode: 'node2' },
      ],
    }, null, 2),
  );

  vault = new VaultManager(async () => {
    const b = new FilesystemBackend();
    await b.connect(tmpDir);
    return b;
  });
  await vault.addVault({ name: 'test', path: tmpDir });
  canvasTools = new CanvasTools(vault);
});

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('CanvasTools', () => {
  describe('listCanvases', () => {
    it('should list canvas files', async () => {
      const result = await canvasTools.listCanvases();
      const data = JSON.parse(result.content[0].text);
      expect(data.count).toBe(1);
      expect(data.canvases[0].path).toBe('test.canvas');
    });
  });

  describe('readCanvas', () => {
    it('should read and parse a canvas file', async () => {
      const result = await canvasTools.readCanvas('test');
      const data = JSON.parse(result.content[0].text);
      expect(data.nodeCount).toBe(2);
      expect(data.edgeCount).toBe(1);
      expect(data.nodes[0].text).toBe('Hello');
      expect(data.edges[0].fromNode).toBe('node1');
    });
  });

  describe('createCanvas', () => {
    it('should create an empty canvas', async () => {
      const result = await canvasTools.createCanvas('new-canvas');
      expect(result.content[0].text).toContain('Created canvas');

      const raw = await fs.readFile(path.join(tmpDir, 'new-canvas.canvas'), 'utf-8');
      const data = JSON.parse(raw);
      expect(data.nodes).toEqual([]);
      expect(data.edges).toEqual([]);
    });

    it('should reject creating duplicate canvas', async () => {
      await expect(canvasTools.createCanvas('test')).rejects.toThrow('already exists');
    });
  });

  describe('addNode', () => {
    it('should add a text node to a canvas', async () => {
      const result = await canvasTools.addNode('test', undefined, {
        type: 'text',
        text: 'New node',
      });
      const data = JSON.parse(result.content[0].text);
      expect(data.addedNode.type).toBe('text');
      expect(data.addedNode.text).toBe('New node');
      expect(data.addedNode.id).toBeTruthy();
    });
  });

  describe('addEdge', () => {
    it('should add an edge between nodes', async () => {
      const result = await canvasTools.addEdge('test', undefined, {
        fromNode: 'node1',
        toNode: 'node2',
        label: 'connects',
      });
      const data = JSON.parse(result.content[0].text);
      expect(data.addedEdge.fromNode).toBe('node1');
      expect(data.addedEdge.toNode).toBe('node2');
      expect(data.addedEdge.label).toBe('connects');
    });

    it('should reject edges with invalid node IDs', async () => {
      await expect(
        canvasTools.addEdge('test', undefined, {
          fromNode: 'nonexistent',
          toNode: 'node1',
        }),
      ).rejects.toThrow('Node not found');
    });
  });

  describe('removeNode', () => {
    it('should remove a node and connected edges', async () => {
      // First create a node to remove
      const addResult = await canvasTools.addNode('new-canvas', undefined, {
        type: 'text',
        text: 'To remove',
      });
      const nodeId = JSON.parse(addResult.content[0].text).addedNode.id;

      const result = await canvasTools.removeNode('new-canvas', undefined, { nodeId });
      const data = JSON.parse(result.content[0].text);
      expect(data.removedNodeId).toBe(nodeId);
    });

    it('should reject removing non-existent node', async () => {
      await expect(
        canvasTools.removeNode('test', undefined, { nodeId: 'nonexistent' }),
      ).rejects.toThrow('Node not found');
    });
  });
});
