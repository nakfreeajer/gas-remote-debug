# GasRemoteDebug

Raw CDP remote debugging for Google Apps Script web apps and other OOPIF-based applications.

## The Problem

Google Apps Script web apps run inside an OOPIF (Out-Of-Process Iframe) sandbox. The browser shows a wrapper page from `script.googleusercontent.com`, while the actual application runtime lives inside the `userCodeAppPanel` iframe.

### Sibling CDP target, not a child frame

In Chrome DevTools Protocol, the GAS sandbox iframe does **not** appear as a child frame under the outer `/dev` page target. Instead, it appears as a **sibling target** at the same level in `/json/list`.

```
Chrome /json/list
├── outer GAS /dev page target     ← visible wrapper only
└── userCodeAppPanel iframe target ← real app sandbox
    ├── context A: runtime helpers
    └── context B: visible DOM
```

Tools that attach to the browser-level WebSocket, inspect only the first page target, or rely on `page.frames()` will miss the real app entirely. The iframe is not a child of the outer page — it is a separate CDP process sandbox exposed as an independent target.

### Split contexts within the same target

Even after the correct target is found, runtime helpers and visible DOM can live in different execution contexts inside the same target. One context may contain global API functions while another contains the rendered UI.

Most automation tools (including Playwright by default) attach to the outer wrapper page. The outer page does not expose your app's globals, API functions, or rendered UI. This produces false negatives: the tool reports the app as "not loaded" when the runtime is healthy inside the iframe.

## The Solution

GasRemoteDebug uses raw Chrome DevTools Protocol (CDP) to:

1. **Enumerate** all CDP targets directly from `/json/list`, not from frame hierarchy.
2. **Connect** to each page/iframe target via WebSocket — including sibling sandbox targets.
3. **Probe** every execution context for your app's globals and DOM markers.
4. **Correlate** runtime and DOM contexts using the Frame-Pair Gate algorithm.
5. **Return** either a `single-context` pair (runtime + DOM together) or a `paired-context` pair (split across contexts).

The core concept is the **Frame-Pair Gate** — a deterministic algorithm that groups findings by `targetId + frameId`, scores each context, and selects the best candidate for evaluation.

## Quick Start

### Prerequisites

- Node.js 18+
- Chrome/Chromium/Brave started with `--remote-debugging-port=9222`
- A Google Apps Script web app open in the browser

### List Targets

```bash
node bin/gas-remote-debug.js list
```

### Run Full Discovery

```bash
node bin/gas-remote-debug.js discover --helpers google,google.script --selector body
```

### Use the API

```js
const { GasRemoteDebugClient } = require('./src/index');

const client = await GasRemoteDebugClient.connect({
  runtimeHelpers: ['MY_APP_API', 'app'],
  domMarkers: {
    selectors: ['#app', '#content'],
    textStrings: ['Dashboard']
  }
});

console.log(`Runtime context: ${client.pair.runtimeContextId}`);
const title = await client.evalDom('document.title');
console.log(`Page title: ${title}`);

client.disconnect();
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `list` | List CDP targets from `/json/list` |
| `scan` | Scan all page/iframe targets |
| `discover` | Run full frame-pair gate discovery |
| `eval` | [experimental] Evaluate expression in discovered runtime context |
| `help`  | Show help |

### CLI Options

| Option | Description |
|--------|-------------|
| `--host <host>` | CDP host (default: 127.0.0.1) |
| `--port <port>` | CDP port (default: 9222) |
| `--json` | Output raw JSON |
| `--config <file>` | Path to JSON config file |
| `--allow-dangerous` | Skip expression safety guard |
| `--helpers <list>` | Comma-separated runtime helper names |
| `--selector <s>` | CSS selector for DOM marker |
| `--text <t>` | Text string for DOM marker |

## Package Structure

```
gas-remote-debug/
  README.md
  LICENSE
  package.json
  .gitignore
  src/
    index.js                # Public API
    errors.js               # Error types
    cdp-client.js           # Raw WebSocket CDP transport
    target-discovery.js     # /json/list enumeration
    context-prober.js       # Per-context probe expressions
    frame-pair-gate.js      # Core correlation algorithm
    safe-eval.js            # Expression safety guard
    profiles/
      google-apps-script.js # GAS defaults
  bin/
    gas-remote-debug.js     # CLI entry point
  examples/
    gas-probe.js            # Basic probe example
    dom-read.js             # DOM reading example
  docs/
    google-apps-script.md   # GAS-specific notes
    oopif-contexts.md       # OOPIF context discovery
    safety.md               # Safety model
```

## Safety

GasRemoteDebug defaults to read-only behavior:

- No target creation, closing, or navigation.
- No automation of clicks or input.
- Expressions are checked against a mutation pattern guard.
- The `--allow-dangerous` flag is required for potentially destructive expressions.

See [docs/safety.md](docs/safety.md) for details.

## Status

**Current: Active development.** 79 unit tests pass. Not yet production hardened. No CI pipeline. Not published to npm.

## License

MIT
