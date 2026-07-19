# Safety Model

## Design principle

GasRemoteDebug defaults to read-only, non-destructive behavior.

Its safety model is designed to reduce accidental mutation of application state while still allowing low-level runtime inspection.

## Expression guard

The `ExpressionGuard` blocks expressions containing obviously dangerous patterns.

Examples include:

### Mutation patterns

```text
setValue, setValues
appendRow, insertRow, deleteRow, removeRow
delete, clear, remove, destroy, truncate, drop
```

### Network or write-like patterns

```text
fetch(, XMLHttpRequest
.post(, .put(, .patch(, .delete(, .save(, .write(
```

### Dynamic code execution

```text
eval(, Function(, import(
require(, module.exports
```

### System patterns

```text
process.exit, child_process, execSync, exec(
```

## Bypassing the guard

You must explicitly supply `--allow-dangerous` in the CLI, or the equivalent API option, to bypass the guard.

That override should be treated as expert-only.

## No target mutation by default

The normal library flow does not:

- create targets or tabs
- close tabs or the browser
- reload or navigate pages
- click UI controls
- simulate user input

## Disconnect-only lifecycle

The canonical recursive engine attaches to existing browser targets and disconnects cleanly when done.

By default it does not:

- recover by navigating to a new state
- recreate a target
- close pages as cleanup
- silently mutate the browser session

## CDP safety notes

Raw Chrome DevTools Protocol can mutate application state if misused. Even a `Runtime.evaluate` call can cause side effects if the expression calls mutation functions.

The safety guard is a first line of defense, not a guarantee. Always validate expressions against a safe environment before using them on sensitive data.

## Best practices

1. Start with target or context discovery to verify connectivity.
2. Prefer read-only expressions and DOM inspection first.
3. Use application-specific debug flags only when your app requires them.
4. Review `--allow-dangerous` carefully before using it.
5. Disconnect when done to free the CDP session.
