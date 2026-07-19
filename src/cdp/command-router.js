'use strict';

const { addWsListener, getMessageData } = require('./ws-compat');
const { redactSecrets } = require('./redaction');

const DEFAULT_COMMAND_TIMEOUT_MS = 15000;

class CommandRouter {
  constructor(wsUrl, WebSocketImpl, options = {}) {
    this.wsUrl = wsUrl;
    this.WebSocketImpl = WebSocketImpl;
    this.timeoutMs = Number(options.timeoutMs || DEFAULT_COMMAND_TIMEOUT_MS);
    this.socket = null;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    this.connected = false;
  }

  async connect() {
    this.socket = new this.WebSocketImpl(this.wsUrl);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('WebSocket connect timeout')), this.timeoutMs);
      const onOpen = () => {
        clearTimeout(timer);
        resolve();
      };
      const onError = (event) => {
        clearTimeout(timer);
        reject(new Error('WebSocket connect error: ' + redactSecrets(event && event.message ? event.message : 'unknown')));
      };
      addWsListener(this.socket, 'open', onOpen);
      addWsListener(this.socket, 'error', onError);
    });

    addWsListener(this.socket, 'message', this.onMessage.bind(this));
    addWsListener(this.socket, 'close', this.onClose.bind(this));
    this.connected = true;
  }

  on(method, handler) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(handler);
  }

  off(method, handler) {
    const listeners = this.listeners.get(method);
    if (!listeners) return;
    const index = listeners.indexOf(handler);
    if (index >= 0) listeners.splice(index, 1);
  }

  send(method, params = {}, sessionId = null, timeoutMs = this.timeoutMs) {
    if (!this.connected || !this.socket) {
      return Promise.reject(new Error('CDP router not connected'));
    }
    const id = this.nextId++;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('CDP timeout: ' + method));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify(payload));
    });
  }

  onMessage(raw) {
    let payload;
    try {
      payload = JSON.parse(String(getMessageData(raw)));
    } catch (_) {
      return;
    }
    if (payload.id && this.pending.has(payload.id)) {
      const entry = this.pending.get(payload.id);
      this.pending.delete(payload.id);
      clearTimeout(entry.timer);
      if (payload.error) {
        entry.reject(new Error(redactSecrets(payload.error.message || JSON.stringify(payload.error))));
      } else {
        entry.resolve(payload.result || {});
      }
      return;
    }
    if (!payload.method) return;
    const handlers = this.listeners.get(payload.method) || [];
    for (const handler of handlers) {
      try {
        handler(payload.params || {}, payload.sessionId || null);
      } catch (_) {}
    }
  }

  onClose() {
    this.connected = false;
    for (const [id, entry] of this.pending.entries()) {
      clearTimeout(entry.timer);
      entry.reject(new Error('CDP socket disconnected'));
      this.pending.delete(id);
    }
  }

  async disconnect() {
    if (!this.socket) return;
    const socket = this.socket;
    this.socket = null;
    this.connected = false;
    try {
      socket.close();
    } catch (_) {}
    this.onClose();
  }
}

module.exports = {
  DEFAULT_COMMAND_TIMEOUT_MS,
  CommandRouter
};
