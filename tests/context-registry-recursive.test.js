'use strict';

const assert = require('node:assert');
const { describe, it } = require('node:test');
const {
  recordExecutionContextCreated,
  markExecutionContextDestroyed,
  clearSessionContexts,
  listRuntimeContexts
} = require('../src/cdp/context-registry');

function createState() {
  return {
    lifecycleGeneration: 1,
    registries: {
      sessions: new Map([['S1', { targetId: 'T1' }]]),
      contexts: new Map()
    }
  };
}

describe('context registry lifecycle', () => {
  it('records and lists default contexts', () => {
    const state = createState();
    recordExecutionContextCreated(state, 'S1', { id: 7, origin: 'https://script.google.com', auxData: { isDefault: true, frameId: 'F1' } });
    const contexts = listRuntimeContexts(state, {});
    assert.strictEqual(contexts.length, 1);
    assert.strictEqual(contexts[0].executionContextId, 7);
  });

  it('marks destroyed and cleared contexts stale', () => {
    const state = createState();
    recordExecutionContextCreated(state, 'S1', { id: 7, origin: 'https://script.google.com', auxData: { isDefault: true, frameId: 'F1' } });
    markExecutionContextDestroyed(state, 'S1', 7);
    assert.strictEqual(listRuntimeContexts(state, {}).length, 0);
    recordExecutionContextCreated(state, 'S1', { id: 8, origin: 'https://script.google.com', auxData: { isDefault: true, frameId: 'F1' } });
    clearSessionContexts(state, 'S1');
    assert.strictEqual(listRuntimeContexts(state, {}).length, 0);
  });
});
