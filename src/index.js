const { FramePairGate } = require('./frame-pair-gate');
const { CdpClient } = require('./cdp-client');
const { TargetDiscovery } = require('./target-discovery');
const { ExpressionGuard } = require('./safe-eval');
const { buildRuntimeProbe, buildDomProbe, scoreContext } = require('./context-prober');

const errors = require('./errors');

class GasRemoteDebugClient {
  static async connect(config) {
    const client = new GasRemoteDebugClient(config);
    await client._init();
    return client;
  }

  constructor(config) {
    this.gate = new FramePairGate(config);
    this.guard = new ExpressionGuard();
    this._transport = null;
    this._pair = null;
  }

  async _init() {
    this._pair = await this.gate.discover();

    const discovery = new TargetDiscovery({ host: this.gate.host, port: this.gate.port });
    const targets = await discovery.listTargets();
    const targetInfo = targets.find(t => t.id === this._pair.targetId);
    if (!targetInfo) throw new Error(`Target ${this._pair.targetId} no longer in /json/list`);

    this._transport = new CdpClient(targetInfo);
    await this._transport.connect();
  }

  get pair() { return this._pair; }
  get transport() { return this._transport; }

  async evalRuntime(expression, opts = {}) {
    this.guard.check(expression, opts.allowDangerous);
    return this._transport.evaluate(expression, this._pair.runtimeContextId, opts);
  }

  async evalRuntimeJson(expression, opts = {}) {
    this.guard.check(expression, opts.allowDangerous);
    return this._transport.evaluateJson(expression, this._pair.runtimeContextId, opts);
  }

  async evalDom(expression, opts = {}) {
    this.guard.check(expression, opts.allowDangerous);
    return this._transport.evaluate(expression, this._pair.domContextId, opts);
  }

  async evalDomJson(expression, opts = {}) {
    this.guard.check(expression, opts.allowDangerous);
    return this._transport.evaluateJson(expression, this._pair.domContextId, opts);
  }

  disconnect() { this._transport?.close(); }
}

module.exports = {
  GasRemoteDebugClient,
  FramePairGate,
  CdpClient,
  TargetDiscovery,
  ExpressionGuard,
  buildRuntimeProbe,
  buildDomProbe,
  scoreContext,
  errors
};
