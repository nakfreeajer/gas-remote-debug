'use strict';

const http = require('http');

const DEFAULT_TIMEOUT_MS = 15000;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getWebSocketCtor() {
  if (typeof globalThis.WebSocket === 'function') {
    return { WebSocketImpl: globalThis.WebSocket, source: 'node-global' };
  }
  try {
    const ws = require('ws');
    return { WebSocketImpl: ws, source: 'ws-package' };
  } catch (error) {
    return { WebSocketImpl: null, source: 'unavailable' };
  }
}

function assertWebSocketAvailable() {
  const result = getWebSocketCtor();
  if (!result.WebSocketImpl) {
    throw new Error('No WebSocket implementation available. Use Node 22+ or install the ws package manually.');
  }
  return result;
}

function httpGetJson(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        body += chunk;
      });
      response.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(new Error('Failed to parse JSON from ' + url + ': ' + error.message));
        }
      });
    });
    request.on('error', reject);
    request.setTimeout(timeoutMs || DEFAULT_TIMEOUT_MS, () => {
      request.destroy(new Error('Timeout fetching ' + url));
    });
  });
}

class RawCdpClient {
  constructor(wsUrl, WebSocketImpl) {
    this.wsUrl = wsUrl;
    this.WebSocketImpl = WebSocketImpl;
    this.socket = null;
    this.nextId = 1;
    this.pending = new Map();
    this.eventHandlers = new Map();
  }

  async connect(timeoutMs) {
    this.socket = new this.WebSocketImpl(this.wsUrl);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('WebSocket connect timeout: ' + this.wsUrl)), timeoutMs || DEFAULT_TIMEOUT_MS);
      const onOpen = () => {
        clearTimeout(timer);
        resolve();
      };
      const onError = (event) => {
        clearTimeout(timer);
        reject(new Error('WebSocket connect error: ' + (event && event.message ? event.message : 'unknown')));
      };

      if (typeof this.socket.addEventListener === 'function') {
        this.socket.addEventListener('open', onOpen, { once: true });
        this.socket.addEventListener('error', onError, { once: true });
      } else {
        this.socket.once('open', onOpen);
        this.socket.once('error', onError);
      }
    });

    const onMessage = (raw) => {
      const text = raw && raw.data !== undefined ? raw.data : raw.toString();
      let payload;
      try {
        payload = JSON.parse(text);
      } catch (error) {
        return;
      }

      if (payload.id && this.pending.has(payload.id)) {
        const entry = this.pending.get(payload.id);
        this.pending.delete(payload.id);
        clearTimeout(entry.timer);
        if (payload.error) {
          entry.reject(new Error(JSON.stringify(payload.error)));
        } else {
          entry.resolve(payload);
        }
        return;
      }

      if (payload.method) {
        const handlers = this.eventHandlers.get(payload.method) || [];
        handlers.forEach((handler) => {
          try {
            handler(payload.params || {});
          } catch (error) {
            // Ignore event handler failures.
          }
        });
      }
    };

    if (typeof this.socket.addEventListener === 'function') {
      this.socket.addEventListener('message', onMessage);
    } else {
      this.socket.on('message', onMessage);
    }
  }

  on(method, handler) {
    if (!this.eventHandlers.has(method)) {
      this.eventHandlers.set(method, []);
    }
    this.eventHandlers.get(method).push(handler);
  }

  send(method, params, timeoutMs) {
    const id = this.nextId++;
    const payload = JSON.stringify({ id, method, params: params || {} });

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error('CDP timeout for ' + method));
        }
      }, timeoutMs || DEFAULT_TIMEOUT_MS);

      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(payload);
    });
  }

  async close() {
    if (!this.socket) {
      return;
    }
    try {
      this.socket.close();
    } catch (error) {
      // Ignore close failures.
    }
    await delay(50);
  }
}

module.exports = {
  DEFAULT_TIMEOUT_MS,
  RawCdpClient,
  assertWebSocketAvailable,
  delay,
  getWebSocketCtor,
  httpGetJson
};