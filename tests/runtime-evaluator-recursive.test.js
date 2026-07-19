'use strict';

const assert = require('node:assert');
const { describe, it } = require('node:test');
const { evaluateInContext } = require('../src/cdp/runtime-evaluator');

function createState() {
  return {
    timeoutMs: 1000,
    router: {
      async send() {
        return { result: { value: 2 } };
      }
    },
    registries: {
      contexts: new Map([
        ['S1:7', { sessionId: 'S1', executionContextId: 7, alive: true, generation: 1 }]
      ])
    }
  };
}

describe('runtime evaluator exact-context behavior', () => {
  it('evaluates in exact session/context', async () => {
    const state = createState();
    const result = await evaluateInContext(state, { sessionId: 'S1', executionContextId: 7, generation: 1 }, '1 + 1');
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.value, 2);
  });

  it('rejects stale runtime contexts', async () => {
    const state = createState();
    state.registries.contexts.get('S1:7').alive = false;
    const result = await evaluateInContext(state, { sessionId: 'S1', executionContextId: 7, generation: 1 }, '1 + 1');
    assert.strictEqual(result.classification, 'STALE_RUNTIME_CONTEXT');
  });
});
