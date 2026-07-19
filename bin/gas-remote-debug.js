#!/usr/bin/env node

const path = require('path');

const pkg = require(path.join(__dirname, '..', 'package.json'));
const { TargetDiscovery, summarizeTarget: summarizeTargetCompat } = require('../src/target-discovery');
const { FramePairGate } = require('../src/frame-pair-gate');
const {
  connectBrowserCdp,
  discoverTargets,
  attachRecursive,
  listRuntimeContexts,
  findRuntimeContext,
  evaluateInContext,
  disconnect,
  genericGasProfile
} = require('../src');
const { summarizeRuntimeContext } = require('../src/cdp/context-registry');
const { summarizeTextList } = require('../src/dom-helpers');
const { buildCountExpression, buildTextExpression, assertSafeExpression, buildSerializedEvalExpression } = require('../src/safe-eval');

function showHelp() {
  console.log(`
  gas-remote-debug v${pkg.version}

Usage:
  gas-remote-debug <command> [options]

Commands:
  list          List CDP targets from /json/list
  scan          Scan all targets and probe execution contexts
  discover      Run full frame-pair gate discovery
  eval <expr>   [experimental] Evaluate expression in discovered runtime context
  targets       List browser-root recursive targets
  contexts      List discovered recursive runtime contexts
  probe         Find a recursive GAS runtime context
  dom-text      Read text from a selector in the selected runtime
  dom-count     Count nodes matching a selector in the selected runtime
  help          Show this help

Options:
  --host <host>     CDP host (default: 127.0.0.1)
  --port <port>     CDP port (default: 9222)
  --json            Output raw JSON
  --config <file>   Path to JSON config file
  --allow-dangerous Skip expression safety guard (use with caution)
  --helpers <list>  Comma-separated runtime helper names for discovery
  --selector <s>    CSS selector for DOM marker
  --text <t>        Text string for DOM marker
  --target-url-includes <text>  Require URL substring for recursive target selection
  --globals <list>              Comma-separated globals for recursive runtime probe
  --timeout <ms>                Command timeout for recursive mode
  --profile <name>              Runtime profile (default: google-apps-script)
  --target-type <type>          Target type for recursive attach (default: page)
  --include-ignored-contexts    Include isolated/ignored worlds in recursive listings
`);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    host: '127.0.0.1',
    port: 9222,
    json: false,
    allowDangerous: false,
    helpers: [],
    selectors: [],
    texts: [],
    globals: [],
    profile: 'google-apps-script',
    timeout: 30000,
    targetType: 'page',
    includeIgnoredContexts: false
  };

  let i = 0;
  while (i < args.length) {
    if (args[i] === '--host') { opts.host = args[++i]; i++; continue; }
    if (args[i] === '--port') { opts.port = parseInt(args[++i], 10); i++; continue; }
    if (args[i] === '--json') { opts.json = true; i++; continue; }
    if (args[i] === '--config') { opts.config = args[++i]; i++; continue; }
    if (args[i] === '--allow-dangerous') { opts.allowDangerous = true; i++; continue; }
    if (args[i] === '--helpers') { opts.helpers = args[++i].split(',').map(s => s.trim()).filter(Boolean); i++; continue; }
    if (args[i] === '--selector') { opts.selectors.push(args[++i]); i++; continue; }
    if (args[i] === '--text') { opts.texts.push(args[++i]); i++; continue; }
    if (args[i] === '--globals') { opts.globals = args[++i].split(',').map(s => s.trim()).filter(Boolean); i++; continue; }
    if (args[i] === '--target-url-includes') { opts.targetUrlIncludes = args[++i]; i++; continue; }
    if (args[i] === '--timeout') { opts.timeout = parseInt(args[++i], 10); i++; continue; }
    if (args[i] === '--profile') { opts.profile = args[++i]; i++; continue; }
    if (args[i] === '--target-type') { opts.targetType = args[++i]; i++; continue; }
    if (args[i] === '--include-ignored-contexts') { opts.includeIgnoredContexts = true; i++; continue; }
    if (args[i] === '--expression') { opts.expr = args[++i]; i++; continue; }
    if (args[i] === 'help' || args[i] === '--help') { showHelp(); process.exit(0); }
    if (!opts.command) { opts.command = args[i]; } else if (!opts.expr) { opts.expr = args[i]; }
    i++;
  }
  return opts;
}

function getGlobals(opts) {
  return opts.globals.length ? opts.globals : ['google', 'google.script'];
}

function classifyCliError(err) {
  const message = err && err.message ? String(err.message) : String(err);
  if (/Could not find a runtime context|No targets matched|No GAS runtime context found/i.test(message)) {
    return { classification: 'RUNTIME_NOT_FOUND', message };
  }
  if (/ECONNREFUSED|ECONNRESET|not reachable|Timeout fetching|WebSocket connect timeout|WebSocket connect error|socket disconnected/i.test(message)) {
    return { classification: 'CDP_CONNECTION_FAILED', message };
  }
  if (/Unknown command|requires a JavaScript expression|requires a CSS selector/i.test(message)) {
    return { classification: 'CLI_USAGE_ERROR', message };
  }
  return { classification: 'CLI_ERROR', message };
}

function writeJson(payload) {
  process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
}

function writeHuman(text) {
  process.stdout.write(String(text));
}

async function connectSelectedRuntime(opts) {
  const state = await connectBrowserCdp({
    host: opts.host,
    port: opts.port,
    timeoutMs: opts.timeout
  });
  try {
    await discoverTargets(state);
    const attached = await attachRecursive(state, {
      targetType: opts.targetType || 'page',
      targetSelector: (info) => genericGasProfile.targetSelector(info, opts)
    });
    if (!attached) {
      throw new Error('No targets matched the requested profile/filters.');
    }
    const globals = getGlobals(opts);
    const runtime = await findRuntimeContext(
      state,
      (probe, context) => genericGasProfile.contextPredicate(probe, context, { globals }),
      {
        probeExpression: genericGasProfile.buildProbeExpression(globals),
        timeoutMs: opts.timeout,
        includeIgnoredContexts: Boolean(opts.includeIgnoredContexts)
      }
    );
    if (!runtime) {
      throw new Error('Could not find a runtime context exposing all requested globals.');
    }
    return { state, attached, runtime, globals };
  } catch (error) {
    await disconnect(state);
    throw error;
  }
}

async function cmdList(opts) {
  const discovery = new TargetDiscovery({ host: opts.host, port: opts.port });
  const summary = await discovery.getSummary();
  if (opts.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(`Browser: ${summary.browser?.browser || 'unknown'}`);
    console.log(`Targets by type: ${JSON.stringify(summary.byType)}`);
    console.log('');
    for (const t of summary.targets) {
      console.log(`  [${t.type}] ${t.title}`);
      console.log(`         ${t.url}`);
      console.log(`         WS: ${t.hasWs ? 'yes' : 'no'}`);
      console.log('');
    }
  }
}

async function cmdScan(opts) {
  const discovery = new TargetDiscovery({ host: opts.host, port: opts.port });
  const targets = await discovery.listAppTargets();
  if (targets.length === 0) {
    console.log('No page/iframe targets found.');
    return;
  }
  console.log(`Found ${targets.length} app target(s):\n`);
  for (const t of targets) {
    console.log(`  Target: ${t.id}`);
    console.log(`  Type:   ${t.type}`);
    console.log(`  Title:  ${t.title}`);
    console.log(`  URL:    ${(t.url || '').substring(0, 120)}`);
    console.log('');
  }
}

async function cmdDiscover(opts) {
  const helpers = opts.helpers.length > 0 ? opts.helpers : ['MY_APP_API', 'app'];

  const gate = new FramePairGate({
    host: opts.host,
    port: opts.port,
    runtimeHelpers: helpers,
    domMarkers: {
      selectors: opts.selectors.length > 0 ? opts.selectors : ['body', '#app', '#main', '#content'],
      textStrings: opts.texts,
    }
  });

  try {
    const result = await gate.discover();
    const summary = gate.getSummary();

    if (opts.json) {
      console.log(JSON.stringify({ result, summary, findings: gate.findings, scannedTargets: gate.scannedTargets }, null, 2));
    } else {
      console.log('Frame-Pair Gate Discovery Result:\n');
      console.log(`  Mode:              ${result.mode}`);
      console.log(`  Target:            ${result.targetId}`);
      console.log(`  Frame:             ${result.frameId || 'unknown'}`);
      console.log(`  Runtime Context:   ${result.runtimeContextId}`);
      console.log(`  DOM Context:       ${result.domContextId}`);
      console.log(`  Score:             ${result.score}`);
      console.log(`  Target URL:        ${(result.targetUrl || '').substring(0, 100)}`);
      console.log('');
      console.log(`  Scanned targets:   ${summary.scannedTargets.length}`);
      console.log(`  Total findings:    ${summary.totalFindings}`);
      console.log(`  Findings by type:  ${JSON.stringify(summary.findingsByType)}`);
      if (result.runtime?.helpers) {
        console.log('');
        console.log('  Runtime helpers found:');
        for (const [name, found] of Object.entries(result.runtime.helpers)) {
          if (found) console.log(`    - ${name}`);
        }
      }
    }
  } catch (err) {
    if (opts.json) {
      console.log(JSON.stringify({ error: err.message, code: err.code }, null, 2));
    } else {
      console.error(`Discovery failed: ${err.message}`);
      if (err.code) console.error(`Error code: ${err.code}`);
    }
    process.exit(1);
  }
}

async function cmdTargets(opts) {
  const state = await connectBrowserCdp({
    host: opts.host,
    port: opts.port,
    timeoutMs: opts.timeout
  });
  try {
    const result = await discoverTargets(state);
    const payload = {
      browserVersion: state.version.Browser || '',
      websocketSource: state.websocketSource,
      count: result.length,
      targets: result.map(summarizeTargetCompat)
    };
    if (opts.json) return writeJson(payload);
    writeHuman(JSON.stringify(payload, null, 2) + '\n');
  } finally {
    await disconnect(state);
  }
}

async function cmdContexts(opts) {
  const selected = await connectSelectedRuntime(opts);
  try {
    const contexts = listRuntimeContexts(selected.state, {
      includeIgnoredContexts: Boolean(opts.includeIgnoredContexts)
    });
    const payload = {
      globals: selected.globals,
      selectedTarget: summarizeTargetCompat(selected.attached.targetInfo),
      contexts: contexts.map(summarizeRuntimeContext)
    };
    if (opts.json) return writeJson(payload);
    writeHuman(JSON.stringify(payload, null, 2) + '\n');
  } finally {
    await disconnect(selected.state);
  }
}

async function cmdProbe(opts) {
  const selected = await connectSelectedRuntime(opts);
  try {
    const payload = {
      globals: selected.globals,
      selectedTarget: summarizeTargetCompat(selected.attached.targetInfo),
      selectedContext: summarizeRuntimeContext(selected.runtime),
      selectedProbe: genericGasProfile.summarizeRuntimeState(selected.runtime.probe, selected.runtime)
    };
    if (opts.json) return writeJson(payload);
    writeHuman(JSON.stringify(payload, null, 2) + '\n');
  } finally {
    await disconnect(selected.state);
  }
}

async function cmdEvalRecursive(opts) {
  if (!opts.expr) throw new Error('eval requires a JavaScript expression.');
  assertSafeExpression(opts.expr, opts.allowDangerous);
  const selected = await connectSelectedRuntime(opts);
  try {
    const result = await evaluateInContext(
      selected.state,
      selected.runtime,
      buildSerializedEvalExpression(opts.expr),
      {
        awaitPromise: true,
        returnByValue: true,
        timeoutMs: opts.timeout,
        stage: 'cli.eval'
      }
    );
    const payload = {
      selectedTarget: summarizeTargetCompat(selected.attached.targetInfo),
      selectedContext: summarizeRuntimeContext(selected.runtime),
      result
    };
    if (opts.json) return writeJson(payload);
    writeHuman(JSON.stringify(payload, null, 2) + '\n');
  } finally {
    await disconnect(selected.state);
  }
}

async function cmdDomText(opts) {
  const selector = opts.selectors[0] || opts.expr;
  if (!selector) throw new Error('dom-text requires a CSS selector.');
  const selected = await connectSelectedRuntime(opts);
  try {
    const result = await evaluateInContext(
      selected.state,
      selected.runtime,
      buildTextExpression(selector),
      { awaitPromise: true, returnByValue: true, timeoutMs: opts.timeout, stage: 'cli.dom-text' }
    );
    const payload = {
      selector,
      selectedTarget: summarizeTargetCompat(selected.attached.targetInfo),
      selectedContext: summarizeRuntimeContext(selected.runtime),
      summary: summarizeTextList(result.value, 20)
    };
    if (opts.json) return writeJson(payload);
    writeHuman(JSON.stringify(payload, null, 2) + '\n');
  } finally {
    await disconnect(selected.state);
  }
}

async function cmdDomCount(opts) {
  const selector = opts.selectors[0] || opts.expr;
  if (!selector) throw new Error('dom-count requires a CSS selector.');
  const selected = await connectSelectedRuntime(opts);
  try {
    const result = await evaluateInContext(
      selected.state,
      selected.runtime,
      buildCountExpression(selector),
      { awaitPromise: true, returnByValue: true, timeoutMs: opts.timeout, stage: 'cli.dom-count' }
    );
    const payload = {
      selector,
      selectedTarget: summarizeTargetCompat(selected.attached.targetInfo),
      selectedContext: summarizeRuntimeContext(selected.runtime),
      count: result.value
    };
    if (opts.json) return writeJson(payload);
    writeHuman(JSON.stringify(payload, null, 2) + '\n');
  } finally {
    await disconnect(selected.state);
  }
}

async function main() {
  const opts = parseArgs();

  if (!opts.command) {
    showHelp();
    process.exit(0);
  }

  if (opts.config) {
    try {
      const fs = require('fs');
      const cfg = JSON.parse(fs.readFileSync(opts.config, 'utf-8'));
      if (cfg.host) opts.host = cfg.host;
      if (cfg.port) opts.port = cfg.port;
      if (cfg.helpers) opts.helpers = cfg.helpers;
      if (cfg.selectors) opts.selectors = cfg.selectors;
      if (cfg.texts) opts.texts = cfg.texts;
    } catch (err) {
      console.error(`Failed to load config: ${err.message}`);
      process.exit(1);
    }
  }

    switch (opts.command) {
      case 'list':
        await cmdList(opts);
        break;
      case 'scan':
        await cmdScan(opts);
        break;
      case 'discover':
        await cmdDiscover(opts);
        break;
      case 'targets':
        await cmdTargets(opts);
        break;
      case 'contexts':
        await cmdContexts(opts);
        break;
      case 'probe':
        await cmdProbe(opts);
        break;
      case 'eval':
        await cmdEvalRecursive(opts);
        break;
      case 'dom-text':
        await cmdDomText(opts);
        break;
      case 'dom-count':
        await cmdDomCount(opts);
        break;
      default:
        throw new Error(`Unknown command: ${opts.command}`);
  }
}

main().catch(err => {
  const failure = classifyCliError(err);
  console.error(`GasRemoteDebug ${failure.classification}: ${failure.message}`);
  process.exit(1);
});
