'use strict';

const assert = require('node:assert');
const { describe, it } = require('node:test');
const { CommandRouter } = require('../src/cdp/command-router');

class MockSocket {
  constructor() {
    this.handlers = {};
    this.sent = [];
    queueMicrotask(() => this.emit('open'));
  }
  addEventListener(name, handler) {
    if (!this.handlers[name]) this.handlers[name] = [];
    this.handlers[name].push(handler);
  }
  send(payload) {
    this.sent.push(JSON.parse(payload));
  }
  close() {
    this.emit('close');
  }
  emit(name, payload) {
    for (const handler of this.handlers[name] || []) handler(payload);
  }
}

describe('CommandRouter recursive support', () => {
  it('routes flattened session commands', async () => {
    const router = new CommandRouter('ws://example', MockSocket, { timeoutMs: 1000 });
    await router.connect();
    const promise = router.send('Runtime.enable', {}, 'SESSION1');
    const message = router.socket.sent[0];
    assert.strictEqual(message.sessionId, 'SESSION1');
    router.socket.emit('message', { data: JSON.stringify({ id: message.id, result: {} }) });
    await promise;
  });

  it('rejects pending commands on disconnect', async () => {
    const router = new CommandRouter('ws://example', MockSocket, { timeoutMs: 1000 });
    await router.connect();
    const promise = router.send('Runtime.enable');
    await router.disconnect();
    await assert.rejects(promise, /disconnected/);
  });
});
