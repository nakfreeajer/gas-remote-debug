const http = require('http');
const { BrowserNotReachableError, NoTargetsFoundError } = require('./errors');

class TargetDiscovery {
  constructor({ host = '127.0.0.1', port = 9222 } = {}) {
    this.host = host;
    this.port = port;
    this.base = `http://${host}:${port}`;
  }

  async _fetchJson(path, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
      const req = http.get(`${this.base}${path}`, res => {
        let buf = '';
        res.on('data', c => buf += c);
        res.on('end', () => {
          try { resolve(JSON.parse(buf)); }
          catch { reject(new Error(`Invalid JSON from ${path}`)); }
        });
      });
      req.on('error', () => reject(new BrowserNotReachableError(this.host, this.port)));
      req.setTimeout(timeoutMs, () => { req.destroy(); reject(new BrowserNotReachableError(this.host, this.port)); });
    });
  }

  getBrowserVersion() { return this._fetchJson('/json/version'); }

  async listTargets() { return this._fetchJson('/json/list'); }

  async listAppTargets() {
    const all = await this.listTargets();
    return all.filter(t => t.type === 'page' || t.type === 'iframe');
  }

  async findTargets(filter = {}) {
    const targets = await this.listAppTargets();
    return targets.filter(t => {
      if (filter.type && t.type !== filter.type) return false;
      if (filter.urlContains && !t.url.toLowerCase().includes(filter.urlContains.toLowerCase())) return false;
      if (filter.titleContains && !t.title.toLowerCase().includes(filter.titleContains.toLowerCase())) return false;
      if (filter.urlMatches && !filter.urlMatches.test(t.url)) return false;
      if (filter.titleMatches && !filter.titleMatches.test(t.title)) return false;
      if (filter.urlExcludes && t.url.toLowerCase().includes(filter.urlExcludes.toLowerCase())) return false;
      return true;
    });
  }

  async findGasSandboxIframe() {
    let found = await this.findTargets({ titleContains: 'userCodeAppPanel' });
    if (found.length) return found[0];

    found = await this.findTargets({ urlContains: 'userCodeAppPanel' });
    if (found.length) return found[0];

    found = await this.findTargets({ type: 'iframe', urlContains: 'script.google.com', urlExcludes: 'testMode=true' });
    if (found.length) return found[0];

    found = await this.findTargets({ type: 'iframe', urlContains: 'script.google.com' });
    if (found.length) return found[0];

    found = await this.findTargets({ type: 'iframe' });
    if (found.length) return found[0];

    const all = await this.listTargets();
    throw new NoTargetsFoundError(all.length);
  }

  async getSummary() {
    const [version, targets] = await Promise.all([
      this.getBrowserVersion().catch(() => null),
      this.listTargets()
    ]);
    return {
      browser: version ? { browser: version.Browser, userAgent: version['User-Agent'] } : null,
      targets: targets.map(t => ({
        id: t.id,
        type: t.type,
        title: (t.title || '').substring(0, 80),
        url: (t.url || '').substring(0, 100),
        hasWs: !!t.webSocketDebuggerUrl
      })),
      byType: targets.reduce((a, t) => { a[t.type] = (a[t.type] || 0) + 1; return a; }, {})
    };
  }
}

module.exports = { TargetDiscovery };
