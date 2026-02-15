import type { VaultManager } from '../vault/vault-manager.js';
import type { BaseYAML, NoteContext, BaseQueryResult } from './types.js';
import { ExpressionEvaluator } from './expression-evaluator.js';
import { extractTags, extractLinks } from '../markdown/link-resolver.js';

/**
 * Query engine for Obsidian Bases.
 * Evaluates filters against vault notes, applies sorting/grouping/limits.
 */
export class BasesQueryEngine {
  private evaluator = new ExpressionEvaluator();

  constructor(private vault: VaultManager) {}

  /**
   * Execute a base query: filter vault notes, sort, limit, return results.
   */
  async query(
    base: BaseYAML,
    viewIndex: number = 0,
    vaultName?: string,
  ): Promise<BaseQueryResult> {
    const view = base.views[viewIndex] || base.views[0];

    // 1. Load all markdown notes from the vault
    const allFiles = await this.vault.listFiles(vaultName);
    const mdFiles = allFiles.filter(f => f.extension === '.md');

    // 2. Build NoteContext for each note
    const contexts: NoteContext[] = [];
    for (const file of mdFiles) {
      try {
        const note = await this.vault.readNote(file.path, vaultName);
        const folder = file.path.includes('/')
          ? file.path.substring(0, file.path.lastIndexOf('/'))
          : '';

        contexts.push({
          path: file.path,
          name: file.name.replace(/\.md$/, ''),
          folder,
          extension: file.extension,
          size: file.stat.size,
          ctime: file.stat.ctime,
          mtime: file.stat.mtime,
          tags: extractTags(note.content, note.frontmatter),
          links: extractLinks(note.content),
          properties: note.frontmatter,
        });
      } catch {
        // Skip files that can't be parsed
      }
    }

    // 3. Apply global filters (base-level)
    let filtered = contexts;
    if (base.filters) {
      filtered = filtered.filter(ctx =>
        this.evaluator.evaluate(base.filters!, ctx),
      );
    }

    // 4. Apply view-level filters
    if (view.filters) {
      filtered = filtered.filter(ctx =>
        this.evaluator.evaluate(view.filters!, ctx),
      );
    }

    // 5. Apply formulas (add computed properties)
    if (base.formulas) {
      for (const ctx of filtered) {
        for (const [key, formula] of Object.entries(base.formulas)) {
          ctx.properties[`_formula_${key}`] = this.evaluateFormula(formula, ctx);
        }
      }
    }

    // 6. Sort
    if (view.order && view.order.length > 0) {
      filtered.sort((a, b) => {
        for (const orderDef of view.order!) {
          const cmp = this.compareValues(
            this.getPropertyValue(a, orderDef.property),
            this.getPropertyValue(b, orderDef.property),
          );
          if (cmp !== 0) {
            return orderDef.direction === 'desc' ? -cmp : cmp;
          }
        }
        return 0;
      });
    }

    // 7. Limit
    const total = filtered.length;
    if (view.limit && view.limit > 0) {
      filtered = filtered.slice(0, view.limit);
    }

    // 8. Build result with requested columns
    const notes = filtered.map(ctx => {
      const props: Record<string, unknown> = {};

      if (view.columns) {
        for (const col of view.columns) {
          props[col] = this.getPropertyValue(ctx, col);
        }
      } else {
        // Return all properties
        Object.assign(props, ctx.properties);
        props['file.name'] = ctx.name;
        props['file.path'] = ctx.path;
        props['file.folder'] = ctx.folder;
        props['file.tags'] = ctx.tags;
        props['file.mtime'] = ctx.mtime;
      }

      return {
        path: ctx.path,
        name: ctx.name,
        properties: props,
      };
    });

    return { notes, total, view };
  }

  /**
   * Get a property value from a NoteContext (supports file.* and frontmatter).
   */
  private getPropertyValue(ctx: NoteContext, key: string): unknown {
    if (key.startsWith('file.')) {
      const prop = key.slice(5);
      switch (prop) {
        case 'name': return ctx.name;
        case 'path': return ctx.path;
        case 'folder': return ctx.folder;
        case 'ext': return ctx.extension;
        case 'size': return ctx.size;
        case 'ctime': return ctx.ctime;
        case 'mtime': return ctx.mtime;
        case 'tags': return ctx.tags;
        case 'links': return ctx.links;
        default: return undefined;
      }
    }
    return ctx.properties[key];
  }

  /**
   * Simple formula evaluation (basic string interpolation and operations).
   */
  private evaluateFormula(formula: string, ctx: NoteContext): unknown {
    // Simple property reference
    if (!formula.includes('(') && !formula.includes('+') && !formula.includes('-')) {
      return this.getPropertyValue(ctx, formula.trim());
    }

    // concat(a, b) - string concatenation
    const concatMatch = formula.match(/^concat\((.+)\)$/);
    if (concatMatch) {
      const args = concatMatch[1].split(',').map(a => {
        const trimmed = a.trim();
        if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
          return trimmed.slice(1, -1);
        }
        return String(this.getPropertyValue(ctx, trimmed) ?? '');
      });
      return args.join('');
    }

    // length(property) - array/string length
    const lengthMatch = formula.match(/^length\((.+)\)$/);
    if (lengthMatch) {
      const val = this.getPropertyValue(ctx, lengthMatch[1].trim());
      if (Array.isArray(val)) return val.length;
      if (typeof val === 'string') return val.length;
      return 0;
    }

    // Fallback: return the formula string itself
    return formula;
  }

  /**
   * Compare two values for sorting.
   */
  private compareValues(a: unknown, b: unknown): number {
    if (a === b) return 0;
    if (a === null || a === undefined) return -1;
    if (b === null || b === undefined) return 1;

    if (typeof a === 'number' && typeof b === 'number') {
      return a - b;
    }

    return String(a).localeCompare(String(b));
  }
}
