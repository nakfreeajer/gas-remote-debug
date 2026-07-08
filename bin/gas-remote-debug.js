#!/usr/bin/env node

const path = require('path');

const pkg = require(path.join(__dirname, '..', 'package.json'));
const { TargetDiscovery } = require('../src/target-discovery');
const { FramePairGate } = require('../src/frame-pair-gate');

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
`);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { host: '127.0.0.1', port: 9222, json: false, allowDangerous: false, helpers: [], selectors: [], texts: [] };

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
    if (args[i] === 'help' || args[i] === '--help') { showHelp(); process.exit(0); }
    if (!opts.command) { opts.command = args[i]; } else if (!opts.expr) { opts.expr = args[i]; }
    i++;
  }
  return opts;
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
    case 'eval':
      console.log('eval command requires a connected runtime. Use discover first, then call evalRuntime through the API.');
      console.log('Example: node -e \'require("./src/index.js").GasRemoteDebugClient.connect({...})\'');
      process.exit(0);
      break;
    default:
      console.error(`Unknown command: ${opts.command}`);
      showHelp();
      process.exit(1);
  }
}

main().catch(err => {
  console.error(`Fatal error: ${err.message}`);
  process.exit(1);
});
