import { describe, it, expect } from 'vitest';
import {
  getMetaToolDefinition,
  getAvailableActions,
} from '../src/meta-tool.js';

describe('getMetaToolDefinition', () => {
  it('should return a valid tool definition', () => {
    const def = getMetaToolDefinition();
    expect(def.name).toBe('obsidian');
    expect(def.description).toBeTruthy();
    expect(def.inputSchema).toBeDefined();
    expect(def.inputSchema.type).toBe('object');
    expect(def.inputSchema.required).toContain('action');
  });

  it('should have action property in schema', () => {
    const def = getMetaToolDefinition();
    const props = def.inputSchema.properties as Record<string, unknown>;
    expect(props.action).toBeDefined();
    expect(props.path).toBeDefined();
    expect(props.content).toBeDefined();
    expect(props.query).toBeDefined();
    expect(props.options).toBeDefined();
    expect(props.vault).toBeDefined();
  });

  it('should document all action categories', () => {
    const def = getMetaToolDefinition();
    const desc = def.description;
    expect(desc).toContain('VAULT:');
    expect(desc).toContain('NOTES:');
    expect(desc).toContain('SEARCH:');
    expect(desc).toContain('PROPERTIES:');
    expect(desc).toContain('TAGS:');
    expect(desc).toContain('GRAPH:');
    expect(desc).toContain('EXPORT:');
    expect(desc).toContain('BASES:');
    expect(desc).toContain('CONVERSATIONS:');
    expect(desc).toContain('CONTENT:');
    expect(desc).toContain('CANVAS:');
    expect(desc).toContain('PERIODIC:');
    expect(desc).toContain('TASKS:');
    expect(desc).toContain('ADVANCED SEARCH:');
    expect(desc).toContain('SYNC:');
  });
});

describe('getAvailableActions', () => {
  it('should return all mapped action names', () => {
    const actions = getAvailableActions();
    expect(actions.length).toBeGreaterThan(40);

    // Verify core actions exist
    expect(actions).toContain('read');
    expect(actions).toContain('create');
    expect(actions).toContain('edit');
    expect(actions).toContain('delete');
    expect(actions).toContain('move');
    expect(actions).toContain('search');
    expect(actions).toContain('list_files');
    expect(actions).toContain('list_dirs');
    expect(actions).toContain('vault_info');
  });

  it('should include graph actions', () => {
    const actions = getAvailableActions();
    expect(actions).toContain('links');
    expect(actions).toContain('backlinks');
    expect(actions).toContain('neighbors');
    expect(actions).toContain('path');
    expect(actions).toContain('orphans');
    expect(actions).toContain('graph_stats');
  });

  it('should include bases actions', () => {
    const actions = getAvailableActions();
    expect(actions).toContain('list_bases');
    expect(actions).toContain('read_base');
    expect(actions).toContain('create_base');
    expect(actions).toContain('query_base');
    expect(actions).toContain('update_base');
  });

  it('should include conversation actions', () => {
    const actions = getAvailableActions();
    expect(actions).toContain('search_conversations');
    expect(actions).toContain('analyze_conversation');
    expect(actions).toContain('conversation_stats');
    expect(actions).toContain('create_conversations_base');
  });

  it('should include content actions', () => {
    const actions = getAvailableActions();
    expect(actions).toContain('search_replace');
    expect(actions).toContain('insert_at');
    expect(actions).toContain('list_headings');
    expect(actions).toContain('get_section');
    expect(actions).toContain('rename_heading');
  });

  it('should include canvas actions', () => {
    const actions = getAvailableActions();
    expect(actions).toContain('list_canvases');
    expect(actions).toContain('read_canvas');
    expect(actions).toContain('create_canvas');
    expect(actions).toContain('add_canvas_node');
    expect(actions).toContain('add_canvas_edge');
    expect(actions).toContain('remove_canvas_node');
    expect(actions).toContain('remove_canvas_edge');
  });

  it('should include periodic actions', () => {
    const actions = getAvailableActions();
    expect(actions).toContain('daily_note');
    expect(actions).toContain('weekly_note');
    expect(actions).toContain('monthly_note');
    expect(actions).toContain('navigate_periodic');
    expect(actions).toContain('list_periodic');
  });

  it('should include task actions', () => {
    const actions = getAvailableActions();
    expect(actions).toContain('list_tasks');
    expect(actions).toContain('update_task');
    expect(actions).toContain('task_stats');
  });

  it('should include advanced search actions', () => {
    const actions = getAvailableActions();
    expect(actions).toContain('search_fuzzy');
    expect(actions).toContain('search_advanced');
    expect(actions).toContain('search_property');
  });

  it('should include sync actions', () => {
    const actions = getAvailableActions();
    expect(actions).toContain('sync_plan');
    expect(actions).toContain('sync_update_state');
    expect(actions).toContain('sync_status');
  });

  it('should include aliases', () => {
    const actions = getAvailableActions();
    expect(actions).toContain('find');       // alias for search
    expect(actions).toContain('rename');     // alias for move
    expect(actions).toContain('find_path');  // alias for path
    expect(actions).toContain('export_notion'); // alias for export
    expect(actions).toContain('periodic_note'); // alias for daily_note
  });
});
