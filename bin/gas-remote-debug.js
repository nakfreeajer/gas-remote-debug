#!/usr/bin/env node
'use strict';

const { assertWebSocketAvailable } = require('../src/cdp-client');
const { inspectTarget, runtimeEvaluate, selectRuntimeContext } = require('../src/context-prober');
const { normalizeTextList, summarizeTextList } = require('../src/dom-helpers');
const { buildCountExpression, buildSerializedEvalExpression, buildTextExpression, assertSafeExpression } = require('../src/safe-eval');
const { discoverTargets, filterTargets, summarizeTarget } = require('../src/target-discovery');
const gasProfile = require('../src/profiles/google-apps-script');

function printHelp() {
  console.log('GasRemoteDebug');
  console.log('');
  console.log('Usage:');
  console.log('  gas-remote-debug targets');
  console.log('  gas-remote-debug contexts --target-url-includes userCodeAppPanel');
  console.log('  gas-remote-debug probe --target-url-includes userCodeAppPanel --globals google,google.script');
  console.log('  gas-remote-debug eval "document.title" --target-url-includes userCodeAppPanel');
  console.log('  gas-remote-debug dom-text ".selector" --target-url-includes userCodeAppPanel');
  console.log('  gas-remote-debug dom-count ".selector" --target-url-includes userCodeAppPanel');
  console.log('');
  console.log('Defaults are read-only. Use --allow-dangerous only if you fully understand the risk.');
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const command = args[0] || '';
  const positionals = [];
  const options = {
    allowDangerous: false,
    targetUrlIncludes: '',
    globals: '',
    profile: 'google-apps-script'
  };

  for (let i = 1; i < args.length; i += 1) {
    const token = args[i];
    if (token === '--allow-dangerous') {
      options.allowDangerous = true;
      continue;
    }
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        options[key.replace(/-([a-z])/g, (_, char) => char.toUpperCase())] = next;
        i += 1;
      } else {
        options[key.replace(/-([a-z])/g, (_, char) => char.toUpperCase())] = true;
      }
      continue;
    }
    positionals.push(token);
  }

  return { command, positionals, options };
}

function getGlobals(options) {
  if (options.globals) {
    return String(options.globals)
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return gasProfile.globals.slice();
}

function getTargetFilter(options) {
  return options.targetUrlIncludes || gasProfile.targetUrlIncludes;
}

async function connectSelectedRuntime(options) {
  const discovery = await discoverTargets();
  const ws = assertWebSocketAvailable();
  const targetUrlIncludes = getTargetFilter(options);
  const globals = getGlobals(options);
  const candidateTargets = filterTargets(discovery.targets, targetUrlIncludes);
  if (!candidateTargets.length) {
    throw new Error('No targets matched targetUrlIncludes=' + targetUrlIncludes);
  }
  const selection = await selectRuntimeContext(candidateTargets, ws.WebSocketImpl, globals);
  return {
    browserVersion: discovery.version.Browser || '',
    websocketSource: ws.source,
    globals,
    targetUrlIncludes,
    selection
  };
}

async function runTargets(options) {
  const discovery = await discoverTargets();
  const targetUrlIncludes = getTargetFilter(options);
  const filtered = filterTargets(discovery.targets, targetUrlIncludes);
  console.log(JSON.stringify({
    browserVersion: discovery.version.Browser || '',
    targetUrlIncludes,
    count: filtered.length,
    targets: filtered.map(summarizeTarget)
  }, null, 2));
}

async function runContexts(options) {
  const discovery = await discoverTargets();
  const ws = assertWebSocketAvailable();
  const targetUrlIncludes = getTargetFilter(options);
  const candidateTargets = filterTargets(discovery.targets, targetUrlIncludes);
  if (!candidateTargets.length) {
    throw new Error('No targets matched targetUrlIncludes=' + targetUrlIncludes);
  }
  const globals = getGlobals(options);
  const inspections = [];
  for (const target of candidateTargets) {
    inspections.push(await inspectTarget(target, ws.WebSocketImpl, globals));
  }
  console.log(JSON.stringify({
    browserVersion: discovery.version.Browser || '',
    websocketSource: ws.source,
    targetUrlIncludes,
    globals,
    inspections
  }, null, 2));
}

async function runProbe(options) {
  const selected = await connectSelectedRuntime(options);
  console.log(JSON.stringify({
    browserVersion: selected.browserVersion,
    websocketSource: selected.websocketSource,
    globals: selected.globals,
    targetUrlIncludes: selected.targetUrlIncludes,
    selectedTarget: selected.selection.selectedTarget,
    selectedContext: selected.selection.selectedContext,
    selectedProbe: selected.selection.selectedProbe,
    inspectedTargets: selected.selection.inspection.length
  }, null, 2));
}

async function runEval(expression, options) {
  assertSafeExpression(expression, options.allowDangerous);
  const selected = await connectSelectedRuntime(options);
  const ws = assertWebSocketAvailable();
  const { RawCdpClient } = require('../src/cdp-client');
  const client = new RawCdpClient(selected.selection.selectedTarget.webSocketDebuggerUrl, ws.WebSocketImpl);
  try {
    await client.connect();
    const result = await runtimeEvaluate(client, selected.selection.selectedContext.id, buildSerializedEvalExpression(expression), {
      awaitPromise: true,
      returnByValue: true
    });
    console.log(JSON.stringify({
      selectedTarget: selected.selection.selectedTarget,
      selectedContext: selected.selection.selectedContext,
      result: result.value
    }, null, 2));
  } finally {
    await client.close();
  }
}

async function runDomText(selector, options) {
  const selected = await connectSelectedRuntime(options);
  const ws = assertWebSocketAvailable();
  const { RawCdpClient } = require('../src/cdp-client');
  const client = new RawCdpClient(selected.selection.selectedTarget.webSocketDebuggerUrl, ws.WebSocketImpl);
  try {
    await client.connect();
    const result = await runtimeEvaluate(client, selected.selection.selectedContext.id, buildTextExpression(selector), {
      awaitPromise: true,
      returnByValue: true
    });
    console.log(JSON.stringify({
      selectedTarget: selected.selection.selectedTarget,
      selectedContext: selected.selection.selectedContext,
      selector,
      summary: summarizeTextList(normalizeTextList(result.value), 20)
    }, null, 2));
  } finally {
    await client.close();
  }
}

async function runDomCount(selector, options) {
  const selected = await connectSelectedRuntime(options);
  const ws = assertWebSocketAvailable();
  const { RawCdpClient } = require('../src/cdp-client');
  const client = new RawCdpClient(selected.selection.selectedTarget.webSocketDebuggerUrl, ws.WebSocketImpl);
  try {
    await client.connect();
    const result = await runtimeEvaluate(client, selected.selection.selectedContext.id, buildCountExpression(selector), {
      awaitPromise: true,
      returnByValue: true
    });
    console.log(JSON.stringify({
      selectedTarget: selected.selection.selectedTarget,
      selectedContext: selected.selection.selectedContext,
      selector,
      count: result.value
    }, null, 2));
  } finally {
    await client.close();
  }
}

async function main() {
  const parsed = parseArgs(process.argv);
  const command = parsed.command;
  if (!command || command === '--help' || command === '-h' || parsed.options.help) {
    printHelp();
    return;
  }

  if (command === 'targets') {
    await runTargets(parsed.options);
    return;
  }
  if (command === 'contexts') {
    await runContexts(parsed.options);
    return;
  }
  if (command === 'probe') {
    await runProbe(parsed.options);
    return;
  }
  if (command === 'eval') {
    const expression = parsed.positionals[0];
    if (!expression) {
      throw new Error('eval requires a JavaScript expression.');
    }
    await runEval(expression, parsed.options);
    return;
  }
  if (command === 'dom-text') {
    const selector = parsed.positionals[0];
    if (!selector) {
      throw new Error('dom-text requires a CSS selector.');
    }
    await runDomText(selector, parsed.options);
    return;
  }
  if (command === 'dom-count') {
    const selector = parsed.positionals[0];
    if (!selector) {
      throw new Error('dom-count requires a CSS selector.');
    }
    await runDomCount(selector, parsed.options);
    return;
  }

  throw new Error('Unknown command: ' + command);
}

main().catch((error) => {
  console.error('GasRemoteDebug error:', error.message);
  process.exitCode = 1;
});