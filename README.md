# GasRemoteDebug

Raw CDP remote debugging for Google Apps Script web apps and other OOPIF-based applications.

## Status

Active development. The package is not published to npm yet.

Current validated line:

- Node `>=18`
- native `WebSocket` when available
- optional `ws` peer dependency fallback
- browser-root recursive CDP discovery
- read-only CLI and API defaults
- 91 passing tests in the current canonical reconciliation worktree

## Why this tool exists

Google Apps Script is a fast way to build internal tools, admin panels, automation dashboards, and lightweight business applications. But deployed GAS web apps do not behave like a normal local web app with a complete IDE-debugging loop. Many runtime, iframe, permission, sandbox, and OOPIF issues can only be confirmed inside the live browser.

That makes validation slow and fragile unless you can inspect the real runtime directly.

`gas-remote-debug` exists to close that gap. It gives you a raw Chrome DevTools Protocol path to inspect an already-open browser session, discover the real sandboxed app runtime, read runtime state, and inspect visible DOM without relying on Playwright frame enumeration as the source of truth.

## The problem

Google Apps Script web apps commonly involve:

- an outer `/dev` wrapper page
- a `userCodeAppPanel` sandbox target
- multiple execution contexts inside the same target
- runtime helpers and visible DOM that may not live in the same context

### Sibling CDP target, not a child frame

In many GAS setups, the real app runtime does not show up as a normal child frame of the outer page. In CDP, the useful GAS sandbox can appear as a sibling target.

```text
Chrome target model
|- outer GAS /dev page target
|- userCodeAppPanel iframe target
   |- runtime-bearing execution context
   |- visible DOM execution context
```

Tools that assume the first page target is the app, or that `page.frames()` is sufficient runtime truth, can miss the real sandbox entirely.

### Split contexts within the same target

Even after the correct target is found, one context may expose runtime helpers while another contains the rendered UI. A correct debugger must evaluate in the exact owning `sessionId + executionContextId`.

## The solution

GasRemoteDebug now supports two complementary discovery layers:

1. Frame-Pair Gate compatibility helpers for existing `/json/list`-oriented workflows.
2. Canonical browser-root recursive Raw CDP discovery through `/json/version`, `Target.getTargets`, explicit `Target.attachToTarget`, and recursive `Target.setAutoAttach`.

The recursive engine:

- connects to the browser-level CDP WebSocket from `/json/version`
- enumerates existing targets with `Target.getTargets`
- explicitly attaches to the selected top target
- recursively auto-attaches child targets and sessions
- maintains live target, session, frame, and execution-context registries
- filters ignored and utility worlds
- invalidates stale contexts after detach or navigation
- evaluates through the exact owning `sessionId + executionContextId`
- disconnects without closing the browser or pages

## Quick start

### Prerequisites

- Node.js 18+
- Chrome, Chromium, or Brave started with `--remote-debugging-port=9222`
- an already-open target you want to inspect

### Start Chrome with remote debugging

Example on Windows:

```powershell
chrome.exe --remote-debugging-port=9222
```

### Basic commands

List targets:

```bash
gas-remote-debug list
gas-remote-debug targets --port 9222
```

Run frame-pair discovery:

```bash
gas-remote-debug discover --helpers google,google.script --selector body
```

List recursively discovered contexts:

```bash
gas-remote-debug contexts --target-url-includes userCodeAppPanel --globals google,google.script --port 9222
```

Probe for a likely GAS runtime:

```bash
gas-remote-debug probe --target-url-includes userCodeAppPanel --globals google,google.script --port 9222
```

Evaluate a read-only expression:

```bash
gas-remote-debug eval --expression "document.title" --target-url-includes userCodeAppPanel --port 9222
```

Read DOM text:

```bash
gas-remote-debug dom-text --selector ".selector" --target-url-includes userCodeAppPanel --port 9222
```

Count DOM nodes:

```bash
gas-remote-debug dom-count --selector ".selector" --target-url-includes userCodeAppPanel --port 9222
```

## Package import

```js
const {
  connectBrowserCdp,
  attachRecursive,
  waitForRuntimeContext,
  evaluateInContext,
  disconnect,
  genericGasProfile
} = require('gas-remote-debug');
```

## Public API

The public API exported from `src/index.js` includes:

- `GasRemoteDebugClient`
- `FramePairGate`
- `CdpClient`
- `TargetDiscovery`
- `ExpressionGuard`
- `buildRuntimeProbe`
- `buildDomProbe`
- `scoreContext`
- `connectBrowserCdp`
- `discoverTargets`
- `attachRecursive`
- `waitForDefaultContexts`
- `listRuntimeContexts`
- `findRuntimeContext`
- `waitForRuntimeContext`
- `evaluateInContext`
- `refreshRegistries`
- `disconnect`
- `redactSecrets`
- `genericGasProfile`
- `errors`

## CLI commands

Legacy commands remain available:

| Command | Description |
|---------|-------------|
| `list` | List CDP targets from `/json/list` |
| `scan` | Scan all page and iframe targets |
| `discover` | Run full frame-pair gate discovery |
| `eval` | Evaluate in the discovered recursive runtime |
| `help` | Show help |

Recursive read-only commands:

| Command | Description |
|---------|-------------|
| `targets` | List browser-root targets discovered through recursive CDP |
| `contexts` | List runtime contexts from the recursive engine |
| `probe` | Find and summarize a likely runtime context |
| `dom-text` | Read text from a selector |
| `dom-count` | Count nodes matching a selector |

### CLI options

| Option | Description |
|--------|-------------|
| `--host <host>` | CDP host, default `127.0.0.1` |
| `--port <port>` | CDP port, default `9222` |
| `--json` | Emit JSON to stdout |
| `--config <file>` | Load legacy discovery config |
| `--allow-dangerous` | Bypass the expression guard |
| `--helpers <list>` | Legacy frame-pair runtime helper list |
| `--selector <s>` | DOM selector for frame-pair or DOM commands |
| `--text <t>` | DOM text marker for frame-pair discovery |
| `--target-url-includes <text>` | Recursive target filter |
| `--globals <list>` | Comma-separated globals for recursive probing |
| `--timeout <ms>` | Timeout for recursive operations |
| `--profile <name>` | Runtime profile selector |
| `--target-type <type>` | Target type for recursive attach |
| `--include-ignored-contexts` | Include ignored or isolated contexts |

## Google Apps Script notes

The built-in `google-apps-script` profile remains backward-compatible and suggests:

- target focus on `userCodeAppPanel`
- runtime helpers `google` and `google.script`

The generic recursive core does not contain project-specific business logic.

### App-specific debug flags

`gas-remote-debug` does not require `testMode=true` by itself.

Some apps expose debug helpers only when loaded with an application-specific query flag, for example:

```text
/dev?testMode=true
```

That flag belongs to your application, not to this library. If your app requires such a flag to expose runtime helpers, open the browser tab with that flag before running discovery.

## Package structure

```text
gas-remote-debug/
  README.md
  LICENSE
  package.json
  src/
    index.js
    errors.js
    cdp-client.js
    target-discovery.js
    context-prober.js
    frame-pair-gate.js
    safe-eval.js
    dom-helpers.js
    cdp/
      browser-connection.js
      command-router.js
      target-registry.js
      context-registry.js
      recursive-attach.js
      runtime-evaluator.js
      redaction.js
      ws-compat.js
    profiles/
      google-apps-script.js
      generic-gas.js
  bin/
    gas-remote-debug.js
  examples/
    gas-probe.js
    dom-read.js
  docs/
    google-apps-script.md
    oopif-contexts.md
    safety.md
```

## Safety

GasRemoteDebug defaults to read-only behavior:

- no target creation
- no browser or page close
- no navigation
- no clicks or typed input
- expression safety checks before evaluation
- clean disconnect-only lifecycle

See [docs/safety.md](docs/safety.md) for details.

## Manual live integration test

To validate a running browser without navigating or closing it:

```bash
node tests/integration/live-gas-runtime.js --port 9222
```

## Additional docs

- [docs/google-apps-script.md](docs/google-apps-script.md)
- [docs/oopif-contexts.md](docs/oopif-contexts.md)
- [docs/safety.md](docs/safety.md)

## License

MIT
