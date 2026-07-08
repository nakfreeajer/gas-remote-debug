# Safety Model

## Design Principle

GasRemoteDebug defaults to **read-only, non-destructive behavior**. Every safety measure is designed to prevent accidental mutation of application state.

## Expression Guard

The `ExpressionGuard` class blocks expressions containing known dangerous patterns. By default, any expression containing these tokens is rejected:

### Blocked Mutation Patterns
```
setValue, setValues
appendRow, insertRow, deleteRow, removeRow
delete, clear, remove, destroy, truncate, drop
```

### Blocked Network Patterns
```
fetch(, XMLHttpRequest
.post(, .put(, .patch(, .delete(, .save(, .write(
```

### Blocked Code Execution Patterns
```
eval(, Function(, import(
require(, module.exports
```

### Blocked System Patterns
```
process.exit, child_process, execSync, exec(
```

## Bypassing the Guard

Explicit `--allow-dangerous` flag (CLI) or `allowDangerous: true` option (API) is required to skip the guard. The guard still returns warnings for any matched patterns.

## No Target Mutation

The tool never:
- Creates browser targets or tabs
- Closes browser targets or tabs
- Reloads or navigates pages
- Clicks UI elements
- Simulates user input

## CDP Safety Notes

Raw Chrome DevTools Protocol can mutate application state if misused. Even seemingly read-only `Runtime.evaluate` calls can trigger side effects if the evaluated expression calls mutation functions.

The safety guard is a first line of defense, not a guarantee. Always validate expressions in a development environment before running against production data.

## Best Practices

1. Always start with `list` or `scan` to verify connectivity.
2. Use `discover` to find the correct execution contexts.
3. Test expressions in a development deployment first.
4. Review the `--allow-dangerous` flag carefully before using it.
5. Disconnect the client when done to free CDP resources.
