# OOPIF Contexts and Frame-Pair Discovery

## What is OOPIF?

OOPIF (Out-Of-Process Iframe) is a Chrome architecture where cross-origin iframes run in separate renderer processes.

That means:

- each OOPIF can have its own JavaScript execution contexts
- the parent page and the OOPIF do not share globals
- CDP can expose them as separate targets and sessions

## Sibling CDP target behavior

A key OOPIF behavior in CDP is that the useful iframe target may appear as a sibling of the outer page, not as a child frame of that page target.

```text
CDP target model
|- type: page   -> outer wrapper
|- type: iframe -> real app target
```

This is especially common with Google Apps Script sandbox targets such as `userCodeAppPanel`.

## Why context discovery matters

In OOPIF-based apps, two important capabilities may live in different execution contexts within the same target:

| Component | Location |
|-----------|----------|
| app runtime helpers | one execution context |
| visible DOM | another execution context |

If you evaluate in the wrong context, you can get empty or misleading results.

## Frame-Pair Gate

The compatibility frame-pair algorithm:

1. enumerates `/json/list`
2. filters page and iframe targets
3. connects to each target WebSocket
4. probes execution contexts for runtime helpers and DOM markers
5. groups findings by target and frame identity
6. selects the best single or paired context result

That path remains available for established workflows.

## Recursive browser-root discovery

The canonical low-level engine adds a deeper model:

1. connect to the browser-level WebSocket from `/json/version`
2. call `Target.getTargets`
3. explicitly attach with `Target.attachToTarget`
4. recursively apply `Target.setAutoAttach`
5. enable `Runtime` and `Page` for each attached session
6. track target, session, frame, and context registries
7. invalidate stale contexts after detach, context clear, or navigation
8. evaluate through exact `sessionId + executionContextId`

This matters for nested OOPIF, replacement-session, and late child-target scenarios where flat target enumeration alone is not enough.

## Context classifications

The runtime logic distinguishes contexts such as:

- runtime-bearing contexts
- DOM-bearing contexts
- ignored utility or isolated worlds
- stale contexts invalidated by detach or navigation

The recursive evaluator returns `STALE_RUNTIME_CONTEXT` when a previously valid context is no longer safe to reuse.

## Safe evaluation

Use the correct evaluation layer for the question you are asking:

- runtime helpers and state reads in the runtime-bearing context
- visible DOM reads in the DOM-bearing context
- exact `sessionId + executionContextId` evaluation when using the recursive engine

Avoid treating DOM frame hierarchy or Playwright frame enumeration as authoritative runtime truth for OOPIF-based apps.
