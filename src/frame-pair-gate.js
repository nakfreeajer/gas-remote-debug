const { CdpClient } = require('./cdp-client');
const { TargetDiscovery } = require('./target-discovery');
const { buildRuntimeProbe, buildDomProbe, scoreContext } = require('./context-prober');
const {
  NoRuntimeContextError,
  NoDomContextError,
  StaleShellError
} = require('./errors');

class FramePairGate {
  constructor(config = {}) {
    this.host = config.host || '127.0.0.1';
    this.port = config.port || 9222;

    this.runtimeHelpers = config.runtimeHelpers || [];
    if (this.runtimeHelpers.length === 0) {
      throw new Error('FramePairGate requires runtimeHelpers — the global function/variable names that identify your app runtime');
    }

    this.domMarkers = {
      selectors: config.domMarkers?.selectors || [],
      textStrings: config.domMarkers?.textStrings || [],
      loadingPatterns: config.domMarkers?.loadingPatterns || ['^\\s*Loading\\.\\.\\.{0,3}\\s*$']
    };

    this.targetFilter = config.targetFilter || {};
    this.scanTimeout = config.scanTimeout || 10000;

    this._runtimeProbeExpr = buildRuntimeProbe(this.runtimeHelpers);
    this._domProbeExpr = buildDomProbe(this.domMarkers);

    this._findings = [];
    this._scannedTargets = [];
    this._result = null;
  }

  async discover() {
    const discovery = new TargetDiscovery({ host: this.host, port: this.port });

    await discovery.getBrowserVersion();

    let targets = await discovery.findTargets(this.targetFilter);
    if (targets.length === 0) {
      targets = await discovery.listAppTargets();
    }

    this._scannedTargets = targets.map(t => ({ id: t.id, type: t.type, url: t.url, title: t.title }));

    this._findings = [];

    for (const targetInfo of targets) {
      const transport = new CdpClient(targetInfo);
      try {
        await transport.connect();

        await new Promise(r => setTimeout(r, 200));

        const contexts = transport.getContexts();
        if (contexts.length === 0) {
          transport.close();
          continue;
        }

        for (const ctx of contexts) {
          const finding = await this._probeContext(transport, ctx, targetInfo);
          if (finding) this._findings.push(finding);
        }
      } catch {
      } finally {
        transport.close();
      }
    }

    const groups = this._groupByFrame();

    this._result = this._findBestPair(groups);

    return this._result;
  }

  async _probeContext(transport, ctx, targetInfo) {
    const contextId = ctx.id;

    let pingOk = false;
    try {
      const ping = await transport.evaluate('1 + 1', contextId, { timeout: 3000 });
      pingOk = ping === 2;
    } catch { return null; }
    if (!pingOk) return null;

    let runtimeResult = null;
    try {
      runtimeResult = await transport.evaluateJson(this._runtimeProbeExpr, contextId, { timeout: 5000 });
    } catch { runtimeResult = null; }

    let domResult = null;
    try {
      domResult = await transport.evaluateJson(this._domProbeExpr, contextId, { timeout: 5000 });
    } catch { domResult = null; }

    const { score, type, features } = scoreContext(runtimeResult, domResult, this.runtimeHelpers);

    const frameId = ctx.auxData?.frameId || runtimeResult?.href || null;

    return {
      targetId: targetInfo.id,
      targetUrl: targetInfo.url,
      targetTitle: targetInfo.title,
      frameId,
      contextId,
      score,
      type,
      features,
      runtime: runtimeResult,
      dom: domResult
    };
  }

  _groupByFrame() {
    const map = new Map();
    for (const f of this._findings) {
      const key = `${f.targetId}::${f.frameId || 'unknown'}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(f);
    }
    return map;
  }

  _findBestPair(groups) {
    const candidates = [];

    for (const [frameKey, findings] of groups) {
      const [targetId, frameId] = frameKey.split('::');

      const full = findings.find(f => f.type === 'full');
      if (full) {
        candidates.push({
          mode: 'single-context',
          runtimeContextId: full.contextId,
          domContextId: full.contextId,
          targetId,
          frameId,
          targetUrl: full.targetUrl,
          runtime: full.runtime,
          dom: full.dom,
          score: full.score,
          _findings: findings
        });
        continue;
      }

      const runtimeCtx = findings.find(f => f.type === 'runtime');
      const domCtx = findings.find(f => f.type === 'dom');

      if (runtimeCtx && domCtx) {
        candidates.push({
          mode: 'paired-context',
          runtimeContextId: runtimeCtx.contextId,
          domContextId: domCtx.contextId,
          targetId,
          frameId,
          targetUrl: runtimeCtx.targetUrl,
          runtime: runtimeCtx.runtime,
          dom: domCtx.dom,
          score: runtimeCtx.score + domCtx.score,
          _findings: findings
        });
      }
    }

    candidates.sort((a, b) => b.score - a.score);

    if (candidates.length === 0) {
      const hasRuntime = this._findings.some(f => f.type === 'runtime' || f.type === 'full');
      if (hasRuntime) {
        const rt = this._findings.find(f => f.type === 'runtime' || f.type === 'full');
        throw new NoDomContextError(rt.targetId, rt.frameId);
      }
      throw new NoRuntimeContextError(this._findings.length);
    }

    return candidates[0];
  }

  get result() { return this._result; }

  get findings() { return this._findings; }

  get scannedTargets() { return this._scannedTargets; }

  getSummary() {
    return {
      scannedTargets: this._scannedTargets,
      totalFindings: this._findings.length,
      findingsByType: this._findings.reduce((a, f) => { a[f.type] = (a[f.type] || 0) + 1; return a; }, {}),
      result: this._result ? {
        mode: this._result.mode,
        targetId: this._result.targetId,
        frameId: this._result.frameId,
        runtimeContextId: this._result.runtimeContextId,
        domContextId: this._result.domContextId,
        score: this._result.score
      } : null
    };
  }
}

module.exports = { FramePairGate };
