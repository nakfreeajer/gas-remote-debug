'use strict';

const assert = require('node:assert');
const { describe, it } = require('node:test');
const { createRegistries } = require('../src/cdp/target-registry');
const { attachRecursive } = require('../src/cdp/recursive-attach');

describe('recursive attach', () => {
  it('attaches top target once and reuses existing session', async () => {
    const calls = [];
    const state = {
      timeoutMs: 1000,
      lifecycleGeneration: 0,
      registries: createRegistries(),
      router: {
        on() {},
        async send(method) {
          calls.push(method);
          if (method === 'Target.getTargets') {
            return { targetInfos: [{ targetId: 'T1', type: 'page', url: 'https://script.google.com/dev', title: 'App' }] };
          }
          if (method === 'Target.attachToTarget') return { sessionId: 'S1' };
          return {};
        }
      }
    };
    const first = await attachRecursive(state, { targetUrlIncludes: 'script.google.com' });
    const second = await attachRecursive(state, { targetUrlIncludes: 'script.google.com' });
    assert.strictEqual(first.sessionId, 'S1');
    assert.strictEqual(second.sessionId, 'S1');
    assert.strictEqual(calls.filter((call) => call === 'Target.attachToTarget').length, 1);
  });
});
