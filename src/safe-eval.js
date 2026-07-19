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

const DANGEROUS_PATTERNS = [
  'save',
  'update',
  'delete',
  'appendrow',
  'setvalue',
  'setvalues',
  'clear',
  'execute:true',
  'submit',
  'click'
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

function assertSafeExpression(expression, allowDangerous) {
  if (allowDangerous) return;
  const lower = String(expression || '').toLowerCase();
  const matched = DANGEROUS_PATTERNS.find((pattern) => lower.indexOf(pattern) !== -1);
  if (matched) {
    throw new Error('Refusing potentially dangerous expression containing: ' + matched + '. Use --allow-dangerous to override.');
  }
}

function buildSerializedEvalExpression(expression) {
  return [
    '(async function () {',
    '  const __value = await (' + expression + ');',
    '  return JSON.parse(JSON.stringify(__value));',
    '})()'
  ].join('\n');
}

function buildTextExpression(selector) {
  return buildSerializedEvalExpression(
    '(Array.from(document.querySelectorAll(' + JSON.stringify(selector) + ')).map(function (node) { return (node.textContent || "").trim(); }).filter(Boolean))'
  );
}

function buildCountExpression(selector) {
  return buildSerializedEvalExpression(
    '(document.querySelectorAll(' + JSON.stringify(selector) + ').length)'
  );
}

module.exports = {
  ExpressionGuard,
  DEFAULT_BLOCKED,
  DANGEROUS_PATTERNS,
  assertSafeExpression,
  buildSerializedEvalExpression,
  buildTextExpression,
  buildCountExpression
};
