'use strict';

const http = require('http');
const { BrowserNotReachableError } = require('../errors');
const { CommandRouter, DEFAULT_COMMAND_TIMEOUT_MS } = require('./command-router');
const { createRegistries } = require('./target-registry');

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 9222;

function getWebSocketCtor(WebSocketImpl) {
  if (WebSocketImpl) {
    return { WebSocketImpl, source: 'injected' };
  }
  if (typeof globalThis.WebSocket === 'function') {
    return { WebSocketImpl: globalThis.WebSocket, source: 'node-global' };
  }
  try {
    const ws = require('ws');
    return { WebSocketImpl: ws, source: 'ws-package' };
  } catch (_) {
    return { WebSocketImpl: null, source: 'unavailable' };
  }
}

function assertWebSocketAvailable(WebSocketImpl) {
  const result = getWebSocketCtor(WebSocketImpl);
  if (!result.WebSocketImpl) {
    throw new Error('No WebSocket implementation available. Use native WebSocket or install optional peer dependency ws.');
  }
  return result;
}

function httpGetJson(url, timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(new Error('Invalid JSON from ' + url + ': ' + error.message));
        }
      });
    });
    request.on('error', () => reject(new BrowserNotReachableError(DEFAULT_HOST, DEFAULT_PORT)));
    request.setTimeout(timeoutMs, () => {
      request.destroy();
      reject(new BrowserNotReachableError(DEFAULT_HOST, DEFAULT_PORT));
    });
  });
}

async function connectBrowserCdp(options = {}) {
  const host = options.host || DEFAULT_HOST;
  const port = Number(options.port || DEFAULT_PORT);
  const timeoutMs = Number(options.timeoutMs || DEFAULT_COMMAND_TIMEOUT_MS);
  const progress = typeof options.progress === 'function' ? options.progress : null;
  const versionUrl = `http://${host}:${port}/json/version`;
  const version = await httpGetJson(versionUrl, timeoutMs);
  const websocket = assertWebSocketAvailable(options.WebSocketImpl);
  const router = new CommandRouter(version.webSocketDebuggerUrl, websocket.WebSocketImpl, { timeoutMs });
  await router.connect();
  const state = {
    host,
    port,
    timeoutMs,
    version,
    browserWsUrl: version.webSocketDebuggerUrl,
    websocketSource: websocket.source,
    router,
    registries: createRegistries(),
    topTargetId: '',
    topSessionId: '',
    lifecycleGeneration: 0,
    latestTopLevelLoadMs: Date.now(),
    progress,
    connected: true
  };
  if (progress) progress({ stage: 'browser-connected', host, port });
  return state;
}

async function disconnect(state) {
  if (!state || !state.router) return;
  state.connected = false;
  await state.router.disconnect();
}

module.exports = {
  DEFAULT_HOST,
  DEFAULT_PORT,
  DEFAULT_COMMAND_TIMEOUT_MS,
  getWebSocketCtor,
  assertWebSocketAvailable,
  httpGetJson,
  connectBrowserCdp,
  disconnect
};
