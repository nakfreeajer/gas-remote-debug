const { ExpressionBlockedError } = require('./errors');

const DEFAULT_BLOCKED = [
  'setValue', 'setValues',
  'appendRow', 'insertRow', 'deleteRow', 'removeRow',
  'delete', 'clear', 'remove', 'destroy', 'truncate', 'drop',
  'fetch(', 'XMLHttpRequest',
  'eval(', 'Function(', 'import(',
  'process.exit', 'child_process', 'execSync', 'exec(',
  '.save(', '.write(', '.post(', '.put(', '.patch(', '.delete(',
  'require(', 'module.exports',
];

class ExpressionGuard {
  constructor({ extraBlocked = [], permissive = false } = {}) {
    this.blocked = [...DEFAULT_BLOCKED, ...extraBlocked];
    this.permissive = permissive;
  }

  check(expression, forceAllow = false) {
    if (this.permissive || forceAllow) {
      return { safe: true, warnings: this._match(expression) };
    }
    const hits = this._match(expression);
    if (hits.length > 0) throw new ExpressionBlockedError(expression, hits);
    return { safe: true, warnings: [] };
  }

  _match(expr) {
    const lower = expr.toLowerCase();
    return this.blocked.filter(t => lower.includes(t.toLowerCase()));
  }

  static permissive() { return new ExpressionGuard({ permissive: true }); }

  static getDefaultBlocked() { return [...DEFAULT_BLOCKED]; }
}

module.exports = { ExpressionGuard, DEFAULT_BLOCKED };
