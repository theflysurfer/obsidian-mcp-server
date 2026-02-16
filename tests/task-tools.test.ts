import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { FilesystemBackend } from '../src/backends/filesystem-backend.js';
import { VaultManager } from '../src/vault/vault-manager.js';
import { TaskTools } from '../src/tools/task-tools.js';

let vault: VaultManager;
let taskTools: TaskTools;
let tmpDir: string;

beforeAll(async () => {
  tmpDir = path.join(os.tmpdir(), `obsidian-task-test-${Date.now()}`);
  await fs.mkdir(tmpDir, { recursive: true });
  await fs.mkdir(path.join(tmpDir, '.obsidian'), { recursive: true });
  await fs.mkdir(path.join(tmpDir, 'projects'), { recursive: true });

  await fs.writeFile(
    path.join(tmpDir, 'tasks.md'),
    `# Tasks

- [ ] Buy groceries #shopping
- [x] Write report ✅ 2025-01-15
- [ ] Call dentist 📅 2025-02-01 #health
- [-] Cancelled task
- [/] In progress task
- [ ] High priority !!! #urgent
`,
  );

  await fs.writeFile(
    path.join(tmpDir, 'projects', 'project-a.md'),
    `# Project A

## TODO
- [ ] Design mockups
- [ ] Review PRD
- [x] Setup repo
`,
  );

  vault = new VaultManager(async () => {
    const b = new FilesystemBackend();
    await b.connect(tmpDir);
    return b;
  });
  await vault.addVault({ name: 'test', path: tmpDir });
  taskTools = new TaskTools(vault);
});

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('TaskTools', () => {
  describe('listTasks', () => {
    it('should list all todo tasks by default', async () => {
      const result = await taskTools.listTasks();
      const data = JSON.parse(result.content[0].text);
      // Only tasks with status 'todo' (default filter)
      expect(data.tasks.every((t: any) => t.status === 'todo')).toBe(true);
      expect(data.count).toBeGreaterThanOrEqual(5);
    });

    it('should list all tasks when status=all', async () => {
      const result = await taskTools.listTasks(undefined, { status: 'all' });
      const data = JSON.parse(result.content[0].text);
      expect(data.count).toBeGreaterThanOrEqual(9);
    });

    it('should filter by tag', async () => {
      const result = await taskTools.listTasks(undefined, { status: 'all', tag: 'shopping' });
      const data = JSON.parse(result.content[0].text);
      expect(data.count).toBe(1);
      expect(data.tasks[0].text).toContain('Buy groceries');
    });

    it('should filter by directory', async () => {
      const result = await taskTools.listTasks(undefined, { path: 'projects', status: 'all' });
      const data = JSON.parse(result.content[0].text);
      expect(data.tasks.every((t: any) => t.path.startsWith('projects/'))).toBe(true);
    });

    it('should extract due dates', async () => {
      const result = await taskTools.listTasks(undefined, { status: 'all' });
      const data = JSON.parse(result.content[0].text);
      const dentistTask = data.tasks.find((t: any) => t.text.includes('dentist'));
      expect(dentistTask?.due).toBe('2025-02-01');
    });

    it('should extract priority', async () => {
      const result = await taskTools.listTasks(undefined, { status: 'all' });
      const data = JSON.parse(result.content[0].text);
      const urgentTask = data.tasks.find((t: any) => t.text.includes('High priority'));
      expect(urgentTask?.priority).toBe('high');
    });

    it('should detect task statuses', async () => {
      const result = await taskTools.listTasks(undefined, { status: 'all' });
      const data = JSON.parse(result.content[0].text);
      const statuses = data.tasks.map((t: any) => t.status);
      expect(statuses).toContain('todo');
      expect(statuses).toContain('done');
      expect(statuses).toContain('cancelled');
      expect(statuses).toContain('in-progress');
    });
  });

  describe('updateTask', () => {
    it('should toggle a task to done', async () => {
      // Create a note with a task to toggle
      await fs.writeFile(
        path.join(tmpDir, 'toggle-test.md'),
        '# Toggle\n\n- [ ] Toggle me\n',
      );

      await taskTools.updateTask('toggle-test.md', undefined, {
        line: 3,
        status: 'done',
      });

      const content = await fs.readFile(path.join(tmpDir, 'toggle-test.md'), 'utf-8');
      expect(content).toContain('[x]');
      expect(content).toContain('✅');
    });

    it('should reject invalid line numbers', async () => {
      await expect(
        taskTools.updateTask('tasks.md', undefined, { line: 999, status: 'done' }),
      ).rejects.toThrow('out of range');
    });
  });

  describe('taskStats', () => {
    it('should return task statistics', async () => {
      const result = await taskTools.taskStats();
      const data = JSON.parse(result.content[0].text);
      expect(data.total).toBeGreaterThanOrEqual(9);
      expect(data.todo).toBeGreaterThanOrEqual(1);
      expect(data.done).toBeGreaterThanOrEqual(1);
      expect(data.completionRate).toBeGreaterThanOrEqual(0);
      expect(data.topFiles.length).toBeGreaterThanOrEqual(2);
    });

    it('should include tag breakdown', async () => {
      const result = await taskTools.taskStats();
      const data = JSON.parse(result.content[0].text);
      expect(data.byTag).toBeDefined();
      expect(data.byTag['shopping']).toBe(1);
    });
  });
});
