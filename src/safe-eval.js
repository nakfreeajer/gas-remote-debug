'use strict';

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

function assertSafeExpression(expression, allowDangerous) {
  if (allowDangerous) {
    return;
  }
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
  DANGEROUS_PATTERNS,
  assertSafeExpression,
  buildCountExpression,
  buildSerializedEvalExpression,
  buildTextExpression
};