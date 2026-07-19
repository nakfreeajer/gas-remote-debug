'use strict';

const {
  connectBrowserCdp,
  discoverTargets,
  attachRecursive,
  findRuntimeContext,
  evaluateInContext,
  disconnect,
  genericGasProfile
} = require('../../src');
const { summarizeTarget } = require('../../src/target-discovery');
const { summarizeRuntimeContext } = require('../../src/cdp/context-registry');

function parseArgs(argv) {
  const options = { host: '127.0.0.1', port: 9222, timeout: 30000, targetType: 'page' };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (token === '--host' && next) { options.host = next; index += 1; continue; }
    if (token === '--port' && next) { options.port = Number(next); index += 1; continue; }
    if (token === '--timeout' && next) { options.timeout = Number(next); index += 1; continue; }
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv);
  const state = await connectBrowserCdp({ host: options.host, port: options.port, timeoutMs: options.timeout });
  try {
    await discoverTargets(state);
    const attached = await attachRecursive(state, {
      targetType: options.targetType,
      targetSelector: (info) => genericGasProfile.targetSelector(info, options)
    });
    if (!attached) {
      throw new Error('RUNTIME_NOT_FOUND: no GAS-like target matched');
    }
    const runtime = await findRuntimeContext(
      state,
      (probe, context) => genericGasProfile.contextPredicate(probe, context, { globals: ['google', 'google.script'] }),
      {
        probeExpression: genericGasProfile.buildProbeExpression(['google', 'google.script']),
        timeoutMs: options.timeout
      }
    );
    if (!runtime) {
      throw new Error('RUNTIME_NOT_FOUND: no GAS runtime context matched');
    }
    const ready = await evaluateInContext(state, runtime, 'document.readyState', {
      awaitPromise: false,
      returnByValue: true,
      timeoutMs: options.timeout,
      stage: 'integration.readyState'
    });
    const googleType = await evaluateInContext(state, runtime, 'typeof google', {
      awaitPromise: false,
      returnByValue: true,
      timeoutMs: options.timeout,
      stage: 'integration.typeofGoogle'
    });
    process.stdout.write(JSON.stringify({
      selectedTarget: summarizeTarget(attached.targetInfo),
      selectedContext: summarizeRuntimeContext(runtime),
      readyState: ready.value,
      googleType: googleType.value
    }, null, 2) + '\n');
  } finally {
    await disconnect(state);
  }
}

main().catch((error) => {
  process.stderr.write(String(error && error.message ? error.message : error) + '\n');
  process.exitCode = 1;
});
