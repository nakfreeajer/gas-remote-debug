'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { sendScopedCdpCommand } = require('../src/cdp/scoped-control');

function makeState() {
  const sent = [];
  const contexts = new Map([
    ['session-a:91', { targetId: 'target-a', sessionId: 'session-a', executionContextId: 91, alive: true }],
    ['session-a:92', { targetId: 'target-a', sessionId: 'session-a', executionContextId: 92, alive: false }],
    ['session-b:91', { targetId: 'target-b', sessionId: 'session-b', executionContextId: 91, alive: true }]
  ]);
  const state = {
    connected: true,
    timeoutMs: 1234,
    router: { connected: true, async send(...args) { sent.push(args); return { ok: true }; } },
    registries: {
      targets: new Map([['target-a', { targetId: 'target-a' }], ['target-b', { targetId: 'target-b' }]]),
      sessions: new Map([
        ['session-a', { sessionId: 'session-a', targetId: 'target-a', detached: false }],
        ['session-detached', { sessionId: 'session-detached', targetId: 'target-a', detached: true }],
        ['session-b', { sessionId: 'session-b', targetId: 'target-b', detached: false }]
      ]),
      contexts
    }
  };
  return { state, sent };
}

test('public scoped command routes a read-only command only through the exact target session', async () => {
  const { state, sent } = makeState();
  const result = await sendScopedCdpCommand(state, {
    targetId: 'target-a', sessionId: 'session-a', method: 'DOM.getDocument', params: { depth: 1 }
  });
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(sent, [['DOM.getDocument', { depth: 1 }, 'session-a', 1234]]);
});

test('active input commands require target-bound TEST authorization', async () => {
  const { state, sent } = makeState();
  const request = { targetId: 'target-a', sessionId: 'session-a', method: 'Input.dispatchMouseEvent', params: { type: 'mousePressed' } };
  await assert.rejects(sendScopedCdpCommand(state, request), /explicit TEST authorization/);
  await assert.rejects(sendScopedCdpCommand(state, { ...request, testAuthorization: { mode: 'TEST', targetId: 'target-b', fixtureId: 'fixture-v1' } }), /does not match/);
  assert.equal(sent.length, 0);
  await sendScopedCdpCommand(state, { ...request, testAuthorization: { mode: 'TEST', targetId: 'target-a', fixtureId: 'fixture-v1' } });
  assert.equal(sent.length, 1);
});

test('rejects missing, mismatched, detached and destroyed target/session scope before routing', async () => {
  const { state, sent } = makeState();
  const base = { method: 'DOM.getDocument' };
  await assert.rejects(sendScopedCdpCommand(state, { ...base, targetId: 'target-a', sessionId: 'missing' }), /missing or detached/);
  await assert.rejects(sendScopedCdpCommand(state, { ...base, targetId: 'target-b', sessionId: 'session-a' }), /does not belong/);
  await assert.rejects(sendScopedCdpCommand(state, { ...base, targetId: 'target-a', sessionId: 'session-detached' }), /missing or detached/);
  state.registries.targets.get('target-a').destroyed = true;
  await assert.rejects(sendScopedCdpCommand(state, { ...base, targetId: 'target-a', sessionId: 'session-a' }), /missing or destroyed/);
  assert.equal(sent.length, 0);
});

test('Runtime evaluation requires exact live context ownership and TEST authorization', async () => {
  const { state, sent } = makeState();
  const auth = { mode: 'TEST', targetId: 'target-a', fixtureId: 'fixture-v1' };
  const base = { targetId: 'target-a', sessionId: 'session-a', method: 'Runtime.evaluate', testAuthorization: auth };
  await assert.rejects(sendScopedCdpCommand(state, { ...base, executionContextId: 91, params: { contextId: 92, expression: '1' } }), /must match/);
  await assert.rejects(sendScopedCdpCommand(state, { ...base, executionContextId: 92, params: { contextId: 92, expression: '1' } }), /missing, stale/);
  await assert.rejects(sendScopedCdpCommand(state, { ...base, testAuthorization: undefined, executionContextId: 91, params: { contextId: 91, expression: '1' } }), /TEST authorization/);
  assert.equal(sent.length, 0);
  await sendScopedCdpCommand(state, { ...base, executionContextId: 91, params: { contextId: 91, expression: 'document.readyState' } });
  assert.equal(sent.length, 1);
});

test('rejects disconnected state and invalid bounded timeout', async () => {
  const { state, sent } = makeState();
  state.connected = false;
  await assert.rejects(sendScopedCdpCommand(state, { targetId: 'target-a', sessionId: 'session-a', method: 'DOM.getDocument' }), /disconnected/);
  state.connected = true;
  await assert.rejects(sendScopedCdpCommand(state, { targetId: 'target-a', sessionId: 'session-a', method: 'DOM.getDocument', timeoutMs: -1 }), /timeoutMs/);
  assert.equal(sent.length, 0);
});
