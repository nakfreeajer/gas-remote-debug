const WS = globalThis.WebSocket || (() => {
  try { return require('ws'); } catch { return null; }
})();

const { EvaluationFailedError } = require('./errors');

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

      this.ws.on('open', async () => {
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

      this.ws.on('message', raw => {
        try { this._onMessage(JSON.parse(raw.toString())); } catch {}
      });

      this.ws.on('error', err => {
        clearTimeout(timer);
        if (!this._ready) reject(new Error(`WS error: ${err.message}`));
      });

      this.ws.on('close', () => { this._ready = false; });
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

module.exports = { CdpClient };
