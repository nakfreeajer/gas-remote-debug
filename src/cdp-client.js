const WS = globalThis.WebSocket || (() => {
  try { return require('ws'); } catch { return null; }
})();

const { EvaluationFailedError } = require('./errors');

function addWsListener(ws, eventName, handler) {
  if (ws && typeof ws.addEventListener === 'function') {
    ws.addEventListener(eventName, handler);
    return;
  }
  if (ws && typeof ws.on === 'function') {
    ws.on(eventName, handler);
    return;
  }
  throw new Error('Unsupported WebSocket implementation: missing addEventListener() and on()');
}

function getMessageData(rawOrEvent) {
  if (rawOrEvent && typeof rawOrEvent === 'object' && 'data' in rawOrEvent) {
    return rawOrEvent.data;
  }
  return rawOrEvent;
}

class CdpClient {
  constructor(targetInfo) {
    this.info = targetInfo;
    this.ws = null;
    this._msgId = 0;
    this._pending = new Map();
    this._listeners = new Map();
    this.contexts = new Map();
    this._ready = false;
  }

  get id() { return this.info.id; }
  get url() { return this.info.url; }
  get title() { return this.info.title; }
  get type() { return this.info.type; }
  get connected() { return this._ready; }

  async connect() {
    if (!WS) throw new Error('No WebSocket available. Use Node 21+ or install ws.');

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`WS connect timeout: ${this.info.webSocketDebuggerUrl}`)), 8000);
      this.ws = new WS(this.info.webSocketDebuggerUrl);

      addWsListener(this.ws, 'open', async () => {
        clearTimeout(timer);
        try {
          await this._send('Runtime.enable');
          await this._send('Page.enable');
          await this._send('DOM.enable');
          await new Promise(r => setTimeout(r, 150));
          this._ready = true;
          resolve();
        } catch (e) { reject(e); }
      });

      addWsListener(this.ws, 'message', rawOrEvent => {
        try {
          const data = getMessageData(rawOrEvent);
          this._onMessage(JSON.parse(data.toString()));
        } catch {}
      });

      addWsListener(this.ws, 'error', errOrEvent => {
        clearTimeout(timer);
        if (!this._ready) {
          const msg = (errOrEvent && errOrEvent.message) ? errOrEvent.message : String(errOrEvent);
          reject(new Error(`WS error: ${msg}`));
        }
      });

      addWsListener(this.ws, 'close', () => { this._ready = false; });
    });
  }

  _onMessage(msg) {
    if (msg.id != null && this._pending.has(msg.id)) {
      const { resolve, timer } = this._pending.get(msg.id);
      clearTimeout(timer);
      this._pending.delete(msg.id);
      resolve(msg);
    }
    if (msg.method) {
      if (msg.method === 'Runtime.executionContextCreated') {
        this.contexts.set(msg.params.context.id, msg.params.context);
      }
      if (msg.method === 'Runtime.executionContextDestroyed') {
        this.contexts.delete(msg.params.executionContextId);
      }
      const fns = this._listeners.get(msg.method) || [];
      for (const fn of fns) { try { fn(msg.params); } catch {} }
    }
  }

  _send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this._msgId;
      const timer = setTimeout(() => {
        this._pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, 15000);
      this._pending.set(id, { resolve, timer });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  on(event, fn) {
    if (!this._listeners.has(event)) this._listeners.set(event, []);
    this._listeners.get(event).push(fn);
    return () => {
      const arr = this._listeners.get(event);
      if (arr) { const i = arr.indexOf(fn); if (i !== -1) arr.splice(i, 1); }
    };
  }

  async evaluate(expression, contextId, { awaitPromise = true, returnByValue = true, timeout = 15000 } = {}) {
    const resp = await this._send('Runtime.evaluate', {
      expression,
      contextId,
      awaitPromise,
      returnByValue,
      includeCommandLineAPI: true
    });

    if (!resp.result) throw new EvaluationFailedError(expression, 'No result object returned', contextId);
    if (resp.result.exceptionDetails) {
      const text = resp.result.exceptionDetails.text
        || resp.result.exceptionDetails.exception?.description
        || 'Unknown exception';
      throw new EvaluationFailedError(expression, text, contextId);
    }

    const inner = resp.result.result;
    if (!inner) return undefined;
    if (inner.type === 'undefined') return undefined;
    if (inner.type === 'null') return null;
    return inner.value !== undefined ? inner.value : inner;
  }

  async evaluateJson(expression, contextId, opts = {}) {
    const raw = await this.evaluate(expression, contextId, opts);
    if (typeof raw === 'string') {
      try { return JSON.parse(raw); } catch { return { _raw: raw }; }
    }
    return raw;
  }

  getContexts() {
    return Array.from(this.contexts.values());
  }

  close() {
    if (this.ws) { this.ws.close(); this.ws = null; }
    this._ready = false;
    this._pending.clear();
  }

  toString() {
    return `CdpTarget(id=${this.id}, type=${this.type}, ctx=${this.contexts.size}, url=${this.url?.substring(0, 60)})`;
  }
}

module.exports = { CdpClient, addWsListener, getMessageData };
