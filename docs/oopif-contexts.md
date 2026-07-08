# OOPIF Contexts and Frame-Pair Discovery

## What is OOPIF?

OOPIF (Out-Of-Process Iframe) is a Chrome architecture where cross-origin iframes run in separate renderer processes. This means:

- Each OOPIF has its own JavaScript execution context.
- The parent page and the OOPIF cannot directly access each other's globals.
- CDP sees them as separate targets with separate execution contexts.

## Why Context Discovery Matters

When validating a web app inside an OOPIF sandbox (like Google Apps Script), two critical pieces may live in different CDP execution contexts within the same target:

| Component | Location |
|-----------|----------|
| App runtime (globals, API functions) | One execution context |
| Visible DOM (rendered UI, text) | Another execution context |

This is the **split-context** problem. If you evaluate an expression in the wrong context, you get incorrect or empty results.

## Frame-Pair Discovery Algorithm

The Frame-Pair Gate implements a deterministic algorithm:

```
1. Enumerate CDP targets from /json/list.
2. Filter to page and iframe targets.
3. Connect to each target via WebSocket.
4. Enable Runtime, Page, and DOM domains.
5. Collect all execution contexts.
6. For each context:
   a. Ping (1+1) to verify connectivity.
   b. Run runtime probe — check for configured helper globals.
   c. Run DOM probe — check for configured CSS selectors and text markers.
   d. Score the context based on findings.
7. Group findings by targetId + frameId.
8. Find the best candidate:
   - Priority 1: Single context with both runtime helpers and DOM markers.
   - Priority 2: Paired context — one with runtime, another with DOM.
9. Return context IDs for evaluation.
```

## Context Types

After probing, each context is classified as:

- **full** — Has both runtime helpers and DOM markers. The ideal case.
- **runtime** — Has runtime helpers but no DOM markers. Use for API calls and state inspection.
- **dom** — Has DOM markers but no runtime helpers. Use for UI text extraction and element counting.
- **empty** — Neither runtime helpers nor DOM markers. Skip.
- **loading-shell** — Shows the loading indicator but no real content. Treated as stale.

## Safe Evaluation

Once the correct contexts are identified:

- Use `evalRuntime()` to call API functions and read application state.
- Use `evalDom()` to read titles, text content, table counts, and other visible UI elements.
- Both methods check the expression safety guard before evaluation.
