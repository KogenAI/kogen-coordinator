# Distinguish unreadable baseline hash inputs

Slug: coord-baseline-hash-unreadable-distinct
Model: not applicable — deterministic filesystem digest calculation, with no workflow state
Acceptance:
- .kogen/intents/coord-baseline-hash-unreadable-distinct/acceptance.feature
- features/steps/coord-baseline-hash-unreadable-distinct__hash.js

Keep `project.Hash(root string, paths []string) string` compatible. Add `project.HashWithUnreadable(root string, paths []string) (string, []string)`: the first result equals Hash and the second lists baseline paths whose ReadFile failed for a reason other than nonexistence, in sorted path order. Both APIs use the same classification and hash algorithm. An empty list may be nil. Use errors.Is(err, fs.ErrNotExist) to retain `missing` for absent files; every other read error contributes the fixed literal `unreadable`. Readable contributions remain lowercase SHA-256 of bytes. Preserve sorting, path spelling, NUL separators, newlines and duplicate-path semantics. Do not infer unreadability from mode bits: a successful read of mode 000 is readable. This exposes information for callers to refuse or warn; changing approval UI or policy is outside this request.

## Decisions
- Preserve existing readable and absent approval hashes; distinguish all other read failures using `unreadable`, and expose the affected paths through a companion API (source: request).

## Source comparison
- Addressed: request Problem and Need, through the two APIs and exact digest framing above; replaces baseline.go's treatment of every read error as missing.
- Addressed: synthetic acceptance readable, absent, permission-000 and directory inputs, sorted unreadable paths, and privileged successful reads, through the feature and fixture step. The permission expectation follows actual read access rather than mode alone.
- Addressed: existing golden cases retain their recorded values; keep existing parity and golden tests without regenerating hashes. Update TestHashFormat's conflicting directory-as-missing assertion to unreadable.
- Omitted: no requested behavior is deliberately omitted. The request's illustrative second return value is settled as a companion API to preserve existing callers. Approval refusal/warning is enabled, not mandated by the request, and no caller policy is added.

## Tests
- Distinguish absent from all other read failures including directories: fixture acceptance and updated TestHashFormat (regression)
- Return sorted unreadable paths, including permission-000 only when its read fails: fixture acceptance and focused filesystem tests (integration)
- Successful reads including privileged reads have no unreadable entry: readable fixture and actual-access permission fixture (integration)
- Readable and absent digests retain exact framing and golden values: fixture acceptance plus unchanged parity/golden coverage (existing)

## Feasibility
- Local tool discovery observed Go 1.27.2 and uid 1004; permission fixture must follow actual read success, not assume root restrictions. (probe: exit 0)
- evidence: {"id":"observer","kind":"observer","inputs":["features/steps/coord-baseline-hash-unreadable-distinct__hash.js"],"observers":["features/steps/coord-baseline-hash-unreadable-distinct__hash.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/coord-baseline-hash-unreadable-distinct__hash.js good","exit":0,"output":"match\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/coord-baseline-hash-unreadable-distinct__hash.js bad","exit":1,"output":"mismatch\n"}]}
