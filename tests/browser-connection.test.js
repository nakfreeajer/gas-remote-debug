const assert = require('node:assert');
const http = require('node:http');
const net = require('node:net');
const { describe, it } = require('node:test');
const {
  DEFAULT_HOST,
  DEFAULT_PORT,
  httpGetJson,
  connectBrowserCdp
} = require('../src/cdp/browser-connection');

describe('browser connection endpoint errors', () => {
  it('reports the requested host and non-default port for connection-refused errors', async () => {
    try {
      await connectBrowserCdp({
        host: '127.0.0.1',
        port: 1,
        timeoutMs: 250
      });
      assert.fail('Expected BrowserNotReachableError');
    } catch (error) {
      assert.strictEqual(error.name, 'BrowserNotReachableError');
      assert.strictEqual(error.code, 'BROWSER_NOT_REACHABLE');
      assert.match(error.message, /127\.0\.0\.1:1/);
      assert.match(error.message, /--remote-debugging-port=1/);
      assert.doesNotMatch(error.message, /9222/);
    }
  });

  it('reports the actual requested endpoint for timeout errors', async () => {
    const sockets = new Set();
    const server = http.createServer((request, response) => {
      // Intentionally keep the socket open past the client timeout.
      void request;
      void response;
    });
    server.on('connection', (socket) => {
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
    });

    await new Promise((resolve, reject) => {
      server.listen(0, '127.0.0.1', (error) => {
        if (error) reject(error);
        else resolve();
      });
    });

    const address = server.address();
    assert.ok(address && typeof address === 'object');

    try {
      await httpGetJson(`http://127.0.0.1:${address.port}/json/version`, 100);
      assert.fail('Expected BrowserNotReachableError');
    } catch (error) {
      assert.strictEqual(error.name, 'BrowserNotReachableError');
      assert.strictEqual(error.code, 'BROWSER_NOT_REACHABLE');
      assert.match(error.message, new RegExp(`127\\.0\\.0\\.1:${address.port}`));
      assert.match(error.message, new RegExp(`--remote-debugging-port=${address.port}`));
      assert.doesNotMatch(error.message, /9222/);
    } finally {
      for (const socket of sockets) {
        if (socket instanceof net.Socket && !socket.destroyed) {
          socket.destroy();
        }
      }
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }
  });

  it('still defaults to port 9222 when no custom port is provided', async () => {
    const originalGet = http.get;
    let requestedUrl = '';

    http.get = (url, callback) => {
      requestedUrl = String(url);
      const request = {
        on(event, handler) {
          if (event === 'error') {
            setImmediate(() => handler(new Error('synthetic connection failure')));
          }
          return request;
        },
        setTimeout() {
          return request;
        },
        destroy() {}
      };
      if (typeof callback === 'function') {
        void callback({
          setEncoding() {},
          on() {}
        });
      }
      return request;
    };

    try {
      await connectBrowserCdp({
        host: DEFAULT_HOST,
        timeoutMs: 250
      });
      assert.fail('Expected BrowserNotReachableError');
    } catch (error) {
      assert.strictEqual(error.name, 'BrowserNotReachableError');
      assert.strictEqual(error.code, 'BROWSER_NOT_REACHABLE');
      assert.match(error.message, new RegExp(`${DEFAULT_HOST}:${DEFAULT_PORT}`.replace(/\./g, '\\.')));
      assert.match(error.message, new RegExp(`--remote-debugging-port=${DEFAULT_PORT}`));
      assert.strictEqual(requestedUrl, `http://${DEFAULT_HOST}:${DEFAULT_PORT}/json/version`);
    } finally {
      http.get = originalGet;
    }
  });
});
