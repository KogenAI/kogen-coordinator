# Reject duplicate Studio JSON keys

Slug: rules-reject-duplicate-json-keys
Model: not applicable — this adds an input validation rule; it does not add cache state or change the existing outage transitions.
Acceptance:
- .kogen/intents/rules-reject-duplicate-json-keys/acceptance.feature
- features/steps/rules-reject-duplicate-json-keys__driver.js
- features/steps/rules-reject-duplicate-json-keys__driver/main.go

Reject ambiguous Studio rules responses before a JSON object decoder can discard duplicate names. Replace last-value-wins for duplicate keys in the top-level response object and in each rule object. Limit implementation changes to `rules/rules.go` and `rules/rules_test.go`; leave the Studio response schema and cache format unchanged.

## Decisions
- Reject any duplicate decoded JSON member name in the top-level response object or within a single rule object, regardless of the values or whether the field is recognized. Check each object independently; leave nested field values, including raw revision and overrides, under existing validation. (decision: D1, round 1) (evidence: rules/rules.go) (source: request)
- Surface duplicate keys through the existing malformed_response outage path in rules.Load. Return the verified same-scope snapshot as cached with that fallback reason if present; otherwise return no snapshot and a *rules.Error with class rules/hold or rules/unavailable according to on_unavailable, and reason malformed_response. Do not save the rejected response as live. (decision: D2, round 1) (evidence: rules/rules.go; rules/config.go) (source: request)
- Preserve all existing response validation, including separate checks for duplicate rule IDs and topics. An otherwise valid response with unique keys in each object still produces a live snapshot; keep the schema, public API and cache format unchanged. (decision: D3, round 1) (evidence: rules/rules.go; rules/rules_test.go; contract/rules_test.go) (source: request)

## Source comparison
- Addressed: evidence ev-d087067b identifies last-value-wins in the two map decodes in `rules/rules.go:194–210`. D1 supersedes that behavior at both object levels. The top-level product and rule-field scenarios make the last value valid so the old parser would wrongly return a live snapshot. The decoded-name case also rejects duplicate names with equal values even for an otherwise ignored field.
- Addressed: request acceptance 3 and the README's Studio rule snapshots failure policy are retained in D2 and the verified-cache scenario, which primes from a live response and checks that the second load returns that same snapshot with cached provenance and `malformed_response`, not the replacement rule. The two no-cache rejection scenarios exercise the existing `hold` and `unavailable` outcomes.
- Addressed: request acceptance 4 and the README's Studio read contract are retained in D3 and the live scenario: two rule objects share field names but have distinct IDs and topics, and load in response order. The request's four wrong implementations are represented by the acceptance scenarios and `controls.json`.
- Omitted: no requested behavior. Conflicting: none. Superseded: only the permissive handling of duplicate keys in the specified response objects. Schema changes, cache format changes and new validation inside nested field values are outside scope.

## Tests
- Duplicate top-level product and decoded member names are malformed: extend `TestMalformedResponses` with otherwise valid bodies ending in an acceptable value for the duplicated member (regression)
- A duplicate field within a rule is malformed: add an otherwise valid rule with a repeated field to the `TestMalformedResponses` table (regression)
- A verified same-scope cache wins after a duplicate-key response: extend `TestOutageUsesVerifiedSameScopeCache` or add a focused test using its loopback fixture; compare against the seeded snapshot with only origin and fallback reason changed (integration)
- Unique keys in distinct rule objects still load live: add a two-rule case using the `TestLiveAndHash` fixture and check live provenance, empty fallback reason and both IDs in order (regression)
- Other validation and compatibility are unchanged: retain the remaining `rules` tests and the `contract` consumer fixture test (existing)

## Feasibility
- The configured Cucumber runner invokes the owned JS binding. In its Then step, Node builds the Go 1.27.2 module driver with `go build -o` in the checkout, placing the binary in a temporary directory. The driver accepts one JSON object on stdin (`policy`, optional `prime`, `body`), writes a temporary `.kogen/studio-rules.yaml`, and calls `rules.Load(context.Background(), root, opts)` with synthetic credentials and a fixed clock. The loopback fixture serves the `{product,repo,rules}` wire shape (including the fields in `rules/testdata/consumer/response.json`), sending DocStrings as raw body text so no fixture parser erases duplicates. The driver emits one JSON object with `snapshot`, typed `error` (`class`, `reason`) and optional seed snapshot represented by `seed` (null without priming). The binding checks the ordered rule IDs and provenance and compares the seeded and returned snapshots semantically, excluding only origin and fallback reason.
- `GOFLAGS=-trimpath go test -count=1 ./rules ./contract` passed on the unchanged tree with Go 1.27.2; both packages also passed with the correct scratch overlay. The driver and overlays passed their formatting and patch-application checks. The good and bad observer runs below exercised a real fallback on an already-malformed response; the bad run altered only the observed cached revision, leaving the other observable fields intact.
- evidence: {"id":"rules-load-observer","kind":"observer","inputs":["rules/rules.go","rules/config.go"],"observers":["features/steps/rules-reject-duplicate-json-keys__driver.js","features/steps/rules-reject-duplicate-json-keys__driver/main.go"],"checks":[{"name":"good","command":"\"${KOGEN_NODE:-node}\" features/steps/rules-reject-duplicate-json-keys__driver.js good","exit":0,"output":"accepted cache observation\n"},{"name":"bad","command":"\"${KOGEN_NODE:-node}\" features/steps/rules-reject-duplicate-json-keys__driver.js bad","exit":1,"output":"rejected altered cached revision\n"}]}
