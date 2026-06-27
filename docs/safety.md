# Safety

GasRemoteDebug is intended for read-only validation by default.

Safe defaults:

- no target creation
- no navigation
- no target closing
- no click automation
- dangerous expression guard enabled

Use `--allow-dangerous` only when you explicitly intend to bypass those defaults and accept the risk.