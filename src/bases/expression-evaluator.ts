import type { FilterExpression, NoteContext } from './types.js';

/**
 * Safe expression evaluator for Bases filter expressions.
 * Parses and evaluates without using eval().
 *
 * Supports:
 * - Comparisons: ==, !=, >, <, >=, <=
 * - Boolean: &&, ||, !
 * - String functions: contains(), startsWith(), endsWith()
 * - File functions: file.hasTag(), file.inFolder(), file.hasLink()
 * - Property access: property_name, file.name, file.folder, etc.
 */
export class ExpressionEvaluator {
  evaluate(expression: FilterExpression, context: NoteContext): boolean {
    if (typeof expression === 'string') {
      return this.evaluateString(expression, context);
    }

    if ('and' in expression) {
      return expression.and.every(e => this.evaluate(e, context));
    }

    if ('or' in expression) {
      return expression.or.some(e => this.evaluate(e, context));
    }

    if ('not' in expression) {
      return !expression.not.some(e => this.evaluate(e, context));
    }

    return true;
  }

  private evaluateString(expr: string, ctx: NoteContext): boolean {
    const trimmed = expr.trim();

    // Handle boolean operators (split on && and ||)
    // Simple left-to-right evaluation (no operator precedence beyond grouping)
    if (trimmed.includes('&&')) {
      const parts = splitOnOperator(trimmed, '&&');
      return parts.every(p => this.evaluateString(p, ctx));
    }

    if (trimmed.includes('||')) {
      const parts = splitOnOperator(trimmed, '||');
      return parts.some(p => this.evaluateString(p, ctx));
    }

    // Handle negation
    if (trimmed.startsWith('!')) {
      return !this.evaluateString(trimmed.slice(1), ctx);
    }

    // Handle function calls
    const funcMatch = trimmed.match(/^([\w.]+)\((.+)\)$/);
    if (funcMatch) {
      return this.evaluateFunction(funcMatch[1], funcMatch[2], ctx);
    }

    // Handle comparisons
    const compMatch = trimmed.match(/^(.+?)\s*(==|!=|>=|<=|>|<)\s*(.+)$/);
    if (compMatch) {
      const left = this.resolveValue(compMatch[1].trim(), ctx);
      const op = compMatch[2];
      const right = this.resolveValue(compMatch[3].trim(), ctx);
      return this.compare(left, op, right);
    }

    // Truthy check: just a property name
    const val = this.resolveValue(trimmed, ctx);
    return isTruthy(val);
  }

  private evaluateFunction(
    name: string,
    argsStr: string,
    ctx: NoteContext,
  ): boolean {
    const args = parseArgs(argsStr);

    switch (name) {
      case 'file.hasTag':
        return ctx.tags.includes(stripQuotes(args[0]));

      case 'file.inFolder':
        return ctx.folder === stripQuotes(args[0]) ||
          ctx.folder.startsWith(stripQuotes(args[0]) + '/');

      case 'file.hasLink':
        return ctx.links.includes(stripQuotes(args[0]));

      case 'contains': {
        const haystack = String(this.resolveValue(args[0], ctx));
        const needle = stripQuotes(args[1]);
        return haystack.toLowerCase().includes(needle.toLowerCase());
      }

      case 'startsWith': {
        const str = String(this.resolveValue(args[0], ctx));
        const prefix = stripQuotes(args[1]);
        return str.startsWith(prefix);
      }

      case 'endsWith': {
        const str = String(this.resolveValue(args[0], ctx));
        const suffix = stripQuotes(args[1]);
        return str.endsWith(suffix);
      }

      default:
        return false;
    }
  }

  private resolveValue(
    token: string,
    ctx: NoteContext,
  ): unknown {
    const trimmed = token.trim();

    // String literal
    if (
      (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
      return trimmed.slice(1, -1);
    }

    // Number literal
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
      return Number(trimmed);
    }

    // Boolean literals
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;
    if (trimmed === 'null') return null;

    // File properties
    if (trimmed.startsWith('file.')) {
      const prop = trimmed.slice(5);
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

    // Note properties (frontmatter)
    if (trimmed in ctx.properties) {
      return ctx.properties[trimmed];
    }

    // Also try with "note." prefix stripped
    if (trimmed.startsWith('note.')) {
      const prop = trimmed.slice(5);
      if (prop in ctx.properties) {
        return ctx.properties[prop];
      }
    }

    return undefined;
  }

  private compare(left: unknown, op: string, right: unknown): boolean {
    // Coerce types for comparison
    const l = left ?? '';
    const r = right ?? '';

    switch (op) {
      case '==': return String(l) === String(r);
      case '!=': return String(l) !== String(r);
      case '>': return Number(l) > Number(r);
      case '<': return Number(l) < Number(r);
      case '>=': return Number(l) >= Number(r);
      case '<=': return Number(l) <= Number(r);
      default: return false;
    }
  }
}

// ─── Helpers ────────────────────────

function stripQuotes(s: string): string {
  const trimmed = s.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseArgs(argsStr: string): string[] {
  const args: string[] = [];
  let current = '';
  let depth = 0;
  let inString: string | null = null;

  for (const ch of argsStr) {
    if (inString) {
      current += ch;
      if (ch === inString) inString = null;
      continue;
    }

    if (ch === '"' || ch === "'") {
      inString = ch;
      current += ch;
    } else if (ch === '(') {
      depth++;
      current += ch;
    } else if (ch === ')') {
      depth--;
      current += ch;
    } else if (ch === ',' && depth === 0) {
      args.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }

  if (current.trim()) {
    args.push(current.trim());
  }

  return args;
}

function splitOnOperator(expr: string, op: string): string[] {
  const parts: string[] = [];
  let current = '';
  let depth = 0;
  let inString: string | null = null;

  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i];

    if (inString) {
      current += ch;
      if (ch === inString) inString = null;
      continue;
    }

    if (ch === '"' || ch === "'") {
      inString = ch;
      current += ch;
    } else if (ch === '(') {
      depth++;
      current += ch;
    } else if (ch === ')') {
      depth--;
      current += ch;
    } else if (depth === 0 && expr.slice(i, i + op.length) === op) {
      parts.push(current.trim());
      current = '';
      i += op.length - 1;
    } else {
      current += ch;
    }
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
}

function isTruthy(val: unknown): boolean {
  if (val === null || val === undefined) return false;
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val !== 0;
  if (typeof val === 'string') return val.length > 0;
  if (Array.isArray(val)) return val.length > 0;
  return true;
}
