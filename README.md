# GasRemoteDebug

Raw CDP remote debugging for Google Apps Script web apps.

## What it solves

Google Apps Script web apps can place the real app runtime inside an embedded panel target instead of the visible outer page. In that setup, higher-level automation tooling can attach to the wrong layer and miss the actual runtime helpers, DOM state, or execution context you need to inspect.

GasRemoteDebug focuses on that exact problem. It discovers existing Chrome DevTools Protocol targets, narrows to the embedded panel target commonly used by Google Apps Script web apps, probes runtime execution contexts, and evaluates read-only expressions in the most likely app context.

## Why this exists

In some Google Apps Script and OOPIF setups:

- `/json/version` responds normally
- `/json/list` shows the existing dev page
- the app is visibly open
- but a browser-level CDP attach may still fail or attach to the wrong layer

GasRemoteDebug uses raw CDP against the existing panel target instead of assuming the outer page is the real runtime.

## Scope

GasRemoteDebug is built for:

- read-only runtime inspection
- DOM text and count checks
- context discovery
- safe evaluation in the correct embedded app context

It is not a full Playwright replacement.

## Safety defaults

GasRemoteDebug is read-only by default.

It refuses obviously dangerous expressions unless `--allow-dangerous` is explicitly supplied. It also does not create targets, navigate, or close targets.

Blocked fragments include:

- `save`
- `update`
- `delete`
- `appendRow`
- `setValue`
- `setValues`
- `clear`
- `execute:true`
- `submit`
- `click`

Raw CDP can still mutate application state if used carelessly. Treat `--allow-dangerous` as an expert-only override.

## Start Chrome with remote debugging

Example on Windows:

```powershell
chrome.exe --remote-debugging-port=9222
```

Then confirm:

```powershell
curl http://127.0.0.1:9222/json/version
curl http://127.0.0.1:9222/json/list
```

## Basic commands

List targets:

```bash
gas-remote-debug targets
```

List contexts for the Google Apps Script panel target:

```bash
gas-remote-debug contexts --target-url-includes userCodeAppPanel
```

Probe for a likely Google Apps Script runtime:

```bash
gas-remote-debug probe --target-url-includes userCodeAppPanel --globals google,google.script
```

Evaluate a read-only expression:

```bash
gas-remote-debug eval "document.title" --target-url-includes userCodeAppPanel
```

Read DOM text:

```bash
gas-remote-debug dom-text ".selector" --target-url-includes userCodeAppPanel
```

Count DOM nodes:

```bash
gas-remote-debug dom-count ".selector" --target-url-includes userCodeAppPanel
```

## Google Apps Script target rule

GasRemoteDebug does not assume the outer dev page is the real app runtime. For many Google Apps Script web apps, the useful runtime lives in an existing target whose URL includes `userCodeAppPanel`.

The built-in Google Apps Script profile uses that as the default target filter and suggests `google` and `google.script` as the first globals to probe.

## Requirements

- Node with built-in `WebSocket` support is preferred
- if built-in `WebSocket` is unavailable, install `ws` manually
- no dependency is auto-installed

## Example docs

- `docs/google-apps-script.md`
- `docs/oopif-contexts.md`
- `docs/safety.md`

## License

MIT