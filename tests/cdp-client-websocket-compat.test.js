const assert = require('node:assert');
const { describe, it } = require('node:test');
const { addWsListener, getMessageData } = require('../src/cdp-client');

// EventEmitter-style mock (ws npm package)
class MockWsEmitter {
  constructor() {
    this._handlers = {};
  }
  on(event, handler) {
    if (!this._handlers[event]) this._handlers[event] = [];
    this._handlers[event].push(handler);
  }
  _emit(event, ...args) {
    const handlers = this._handlers[event] || [];
    for (const h of handlers) h(...args);
  }
  close() { this._closed = true; }
}

// EventTarget-style mock (native WebSocket)
class MockWsTarget {
  constructor() {
    this._handlers = {};
  }
  addEventListener(event, handler) {
    if (!this._handlers[event]) this._handlers[event] = [];
    this._handlers[event].push(handler);
  }
  _emit(event, ...args) {
    const handlers = this._handlers[event] || [];
    for (const h of handlers) h(...args);
  }
  close() { this._closed = true; }
}

class MockWsNeither {
  close() {}
}

describe('addWsListener', () => {
  it('uses addEventListener when available', () => {
    const ws = new MockWsTarget();
    let called = false;
    addWsListener(ws, 'open', () => { called = true; });
    ws._emit('open');
    assert.strictEqual(called, true);
  });

  it('falls back to .on when addEventListener absent', () => {
    const ws = new MockWsEmitter();
    let called = false;
    addWsListener(ws, 'open', () => { called = true; });
    ws._emit('open');
    assert.strictEqual(called, true);
  });

  it('throws clear error when neither API exists', () => {
    const ws = new MockWsNeither();
    assert.throws(
      () => addWsListener(ws, 'open', () => {}),
      /Unsupported WebSocket/
    );
  });

  it('passes arguments through with .on API', () => {
    const ws = new MockWsEmitter();
    let received = null;
    addWsListener(ws, 'message', arg => { received = arg; });
    ws._emit('message', 'hello');
    assert.strictEqual(received, 'hello');
  });

  it('passes arguments through with addEventListener API', () => {
    const ws = new MockWsTarget();
    let received = null;
    addWsListener(ws, 'message', arg => { received = arg; });
    ws._emit('message', 'world');
    assert.strictEqual(received, 'world');
  });
});

describe('getMessageData', () => {
  it('returns event.data for native-style message event', () => {
    const event = { data: '{"id":1}' };
    assert.strictEqual(getMessageData(event), '{"id":1}');
  });

  it('returns raw value for ws-style message', () => {
    assert.strictEqual(getMessageData('{"id":1}'), '{"id":1}');
  });

  it('handles Buffer-like raw value', () => {
    const buf = Buffer.from('{"id":2}');
    assert.strictEqual(getMessageData(buf), buf);
  });

  it('handles empty string raw value', () => {
    assert.strictEqual(getMessageData(''), '');
  });

  it('handles non-object truthy value as raw', () => {
    assert.strictEqual(getMessageData(42), 42);
  });

  it('handles null value', () => {
    assert.strictEqual(getMessageData(null), null);
  });

  it('handles undefined value', () => {
    assert.strictEqual(getMessageData(undefined), undefined);
  });

  it('discriminates objects with data property from raw buffers', () => {
    const event = { data: 'result' };
    assert.strictEqual(getMessageData(event), 'result');
  });

  it('returns full event object when data is not present', () => {
    const event = { type: 'open' };
    assert.strictEqual(getMessageData(event), event);
  });
});

describe('integration: addWsListener + getMessageData', () => {
  it('native-style: message handler receives parsed data', () => {
    const ws = new MockWsTarget();
    let parsed = null;
    addWsListener(ws, 'message', rawOrEvent => {
      const data = getMessageData(rawOrEvent);
      parsed = JSON.parse(data.toString());
    });
    ws._emit('message', { data: '{"ok":true}' });
    assert.deepStrictEqual(parsed, { ok: true });
  });

  it('ws-style: message handler receives parsed data', () => {
    const ws = new MockWsEmitter();
    let parsed = null;
    addWsListener(ws, 'message', rawOrEvent => {
      const data = getMessageData(rawOrEvent);
      parsed = JSON.parse(data.toString());
    });
    ws._emit('message', '{"ok":true}');
    assert.deepStrictEqual(parsed, { ok: true });
  });

  it('native-style: JSON parse failure does not throw', () => {
    const ws = new MockWsTarget();
    let threw = false;
    addWsListener(ws, 'message', rawOrEvent => {
      try {
        const data = getMessageData(rawOrEvent);
        JSON.parse(data.toString());
      } catch { threw = true; }
    });
    ws._emit('message', { data: 'not-json' });
    assert.strictEqual(threw, true);
  });

  it('ws-style: open handler fires', () => {
    const ws = new MockWsEmitter();
    let opened = false;
    addWsListener(ws, 'open', () => { opened = true; });
    ws._emit('open');
    assert.strictEqual(opened, true);
  });

  it('native-style: open handler fires', () => {
    const ws = new MockWsTarget();
    let opened = false;
    addWsListener(ws, 'open', () => { opened = true; });
    ws._emit('open');
    assert.strictEqual(opened, true);
  });
});
