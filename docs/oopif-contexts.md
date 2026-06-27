# OOPIF and Embedded Runtime Contexts

Out-of-process iframe setups can expose multiple targets and multiple execution contexts for one visible page.

GasRemoteDebug handles this by:

1. listing existing targets from `/json/list`
2. filtering likely embedded targets
3. enabling `Runtime`
4. recording `Runtime.executionContextCreated`
5. probing default contexts for required globals

The visible tab is not always the real runtime.