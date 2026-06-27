# Google Apps Script Profile

GasRemoteDebug includes a simple Google Apps Script profile aimed at web apps whose useful runtime lives in an existing panel target.

Default profile values:

- target URL contains `userCodeAppPanel`
- suggested globals: `google`, `google.script`

These are heuristics, not guarantees. Always inspect discovered targets and contexts if a probe does not match.