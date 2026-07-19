# Google Apps Script Remote Debugging

## Why GAS Needs Special Handling

Google Apps Script is a powerful platform for internal tools, automation dashboards, and business applications, but debugging a deployed GAS web app is fundamentally different from working with a normal local web stack.

- There is no local dev server.
- The live app runs inside Google-controlled wrappers and sandbox targets.
- Many runtime, iframe, permission, and OOPIF issues can only be reproduced inside the live browser.
- Common browser automation often attaches to the wrong layer and misses the real runtime.

`gas-remote-debug` exists to address that gap.

## The OOPIF sandbox

When you open a GAS web app in Chrome, you commonly get:

1. an outer page, typically the `/dev` wrapper
2. an inner sandbox target such as `userCodeAppPanel`

The useful application runtime can live in the sandbox target rather than the visible wrapper.

## Common failure mode

Many tools attach to the visible outer page by default. That page often does not expose:

- your app globals
- your runtime helper APIs
- your rendered UI
- your real application state

### Sibling target, not a child frame

The GAS sandbox can appear as a sibling CDP target, not as a normal DOM child frame. That means a tool that treats `page.frames()` as runtime truth can report a healthy app as missing or blank.

## How GasRemoteDebug solves this

GasRemoteDebug supports both the established frame-pair workflow and the canonical recursive browser-root workflow.

The recursive workflow:

1. connects through `/json/version`
2. gets the browser-level `webSocketDebuggerUrl`
3. enumerates existing targets with `Target.getTargets`
4. explicitly attaches to the selected top target
5. recursively applies `Target.setAutoAttach`
6. enables `Runtime` and `Page` in each attached session
7. discovers live execution contexts
8. evaluates through the exact `sessionId + executionContextId`

This matters because the useful GAS runtime may live in a child target or replacement session even though the outer `/dev` page is the visible tab.

## Default GAS profile

The built-in `google-apps-script` profile remains backward-compatible and suggests:

- target focus on `userCodeAppPanel`
- runtime helpers `google` and `google.script`

The generic recursive core does not contain project-specific or business-specific logic.

## Quick start for GAS apps

```bash
# Legacy target listing
gas-remote-debug list

# Recursive target discovery
gas-remote-debug targets --port 9222
gas-remote-debug contexts --target-url-includes userCodeAppPanel --globals google,google.script --port 9222
gas-remote-debug probe --target-url-includes userCodeAppPanel --globals google,google.script --port 9222

# Frame-pair compatibility workflow
gas-remote-debug discover --helpers google,google.script --selector body
```

## Debug flags are app-specific

Chrome DevTools Protocol does not require app query flags by itself. But some applications intentionally expose runtime helpers only in a debug or test mode.

Examples:

- `?testMode=true`
- `?debug=true`
- a private application-specific flag

Those flags belong to the app, not to this library. If your app exposes helpers only in that mode, open the browser tab with the required flag before running discovery.

## Important notes

- `userCodeAppPanel` is a Google Apps Script-specific target convention and could change in future browser behavior.
- execution context IDs change after reloads and navigation
- recursive discovery is read-only by default
- the library disconnects without closing the browser or pages
