'use strict';

const assert = require('node:assert');
const { describe, it } = require('node:test');
const {
  createRegistries,
  recordAttachedSession,
  upsertFrame,
  recordFrameNavigation,
  markFrameDetached
} = require('../src/cdp/target-registry');

describe('target registry lifecycle', () => {
  it('tracks sessions and frame navigation generations', () => {
    const state = { lifecycleGeneration: 0, topSessionId: 'S1', registries: createRegistries() };
    recordAttachedSession(state, 'S1', { targetId: 'T1', type: 'page', url: 'https://script.google.com/dev' }, null);
    upsertFrame(state, 'F1', 'S1', '');
    recordFrameNavigation(state, { id: 'F1', url: 'https://script.google.com/dev' }, 'S1');
    assert.strictEqual(state.lifecycleGeneration, 1);
    markFrameDetached(state, 'F1');
    assert.strictEqual(state.registries.frames.get('F1').detached, true);
  });
});
