# Google Apps Script Remote Debugging

## Why GAS Needs Special Handling

Google Apps Script web apps use an OOPIF (Out-Of-Process Iframe) sandbox architecture. When you open a GAS web app deployment URL in Chrome, the browser actually creates two rendering contexts:

1. **Outer page** — the `script.googleusercontent.com` wrapper that shows the GAS loading shell.
2. **Inner iframe (userCodeAppPanel)** — the OOPIF sandbox that runs your actual web app code.

## The Common Failure Mode

Most browser automation tools (including Playwright in default mode) attach to the **outer page** because that's the visible top-level document. The outer page does not expose:

- Your app's global functions or variables
- Your rendered UI components
- Your application state

This leads to false negatives during validation: the tool reports that the app is "not loaded" or "blank" when the real runtime is actually healthy inside the OOPIF.

## How GasRemoteDebug Solves This

GasRemoteDebug uses raw Chrome DevTools Protocol (CDP) to:

1. Enumerate all CDP targets via `/json/list`.
2. Filter for the GAS sandbox iframe by URL or title pattern (`userCodeAppPanel`).
3. Connect directly to the iframe target via WebSocket.
4. Enable `Runtime` domain and collect all execution contexts.
5. Probe each context for expected globals (e.g., `google`, `google.script`).
6. Score contexts based on runtime helpers and DOM markers.
7. Return the correct context IDs for your app runtime and visible DOM.

## Default GAS Profile

The built-in `google-apps-script` profile targets:

- **Target:** `userCodeAppPanel` iframe
- **Runtime helpers:** `google`, `google.script`
- **DOM context:** Default (`:0`) context

## Quick Start for GAS Apps

```bash
# List all targets
gas-remote-debug list

# Run discovery with the GAS profile
gas-remote-debug discover --helpers google,google.script --selector body

# Or use the API
node -e "
  const { GasRemoteDebugClient } = require('./src/index');
  GasRemoteDebugClient.connect({
    runtimeHelpers: ['google', 'google.script'],
    domMarkers: { selectors: ['body'] }
  }).then(client => {
    console.log('Mode:', client.pair.mode);
    console.log('Runtime context:', client.pair.runtimeContextId);
    client.disconnect();
  }).catch(err => console.error(err));
"
```

## Important Notes

- The `userCodeAppPanel` target name is specific to Google Apps Script and may change in future Chrome versions.
- Execution context IDs change on every page reload. Run discovery again after reload.
- GAS serves pages inside a sandbox iframe with `sandbox` attribute restrictions. Some operations may be limited.
