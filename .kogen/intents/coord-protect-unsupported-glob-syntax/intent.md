# Diagnose unsupported protection patterns

Slug: coord-protect-unsupported-glob-syntax
Model: not applicable — diagnostics are a deterministic projection of configuration and the current Git file inventory, not a workflow state machine
Acceptance:
- .kogen/intents/coord-protect-unsupported-glob-syntax/acceptance.feature
- features/steps/coord-protect-unsupported-glob-syntax__protect.js

Make silent protection mistakes visible without changing matching or approval-baseline membership. Report unsupported syntax and unmatched entries during LoadConfig and Protected. Retain the supported anchored forms **/, **, * and ?, literal paths and trailing-slash folders. Do not implement character classes, brace expansion, negation or backslash escaping.

## Decisions
- Findings are advisory, not load errors; unmatched entries are warnings. Unsupported syntax is lint, not an expansion request. (assumption: the request specifies reporting but does not explicitly specify fatal lint; preserving matching and the explicit non-error warning favors advisory findings) (source: request)
- Expose findings as Config.ProtectDiagnostics, a slice of records with exported Entry, Severity and Message fields, serialized with these same JSON keys. Severity is lint or warning. LoadConfig populates the findings against its root; Protected refreshes them on its supplied Config, including directly constructed Config values. Repeated calls replace findings rather than appending duplicates. Pure ParseConfig remains independent of Git and filesystem existence. (evidence: project/config.go, project/baseline.go) (source: request)
- The repository contains a library, not a config-check executable. Its machine-readable config-check result is the serialized loaded Config with ProtectDiagnostics. Preserve the request's consumer-facing requirement by documenting this field for config-check consumers and updating the paired contract inventory; no new CLI or changes to .kogen/project.yaml are required. (assumption: no consuming CLI implementation exists in this checkout; machine-readable diagnostics must be exposed at the available configuration boundary rather than written only to stderr) (source: request)
- Each protect entry gets at most one lint record, combining unsupported categories when necessary, and at most one no-match warning. Use configuration order, lint before warning for each entry. Name the original entry in Entry and in its Message. Lint messages name the applicable categories: character classes for [, brace alternatives for {, leading negation for an initial !, and backslash escapes for any backslash; also name all supported forms **/, **, * and ?. Warning messages contain matches no file. (source: request)
- Suppress syntax lint for an exact literal file path containing [ or { that exists in the Git inventory; that path remains protected. This exemption does not introduce expansion and does not exempt leading ! or backslashes. Determine no-match from actual existing matching tracked or untracked-not-ignored files, not directories or ignored files. (source: request)

## Source comparison
- Addressed: request Problem and Need's silent literal compilation, missing approval-hash members, syntax categories, supported forms and literal-file exception are covered by the outcome, Decisions and syntax/exception scenarios. No expansion or baseline-list change is intended.
- Addressed: synthetic tests/*.{js,ts} over tests/a.js, src/[ab].js without and with the exact literal file, absent/empty docs/, **/*.feature, .kogen/project.yaml and trailing-slash folder examples are executable scenarios below.
- Addressed: one machine-readable lint/warning per entry is asserted at load, protection, repeated protection and direct-Config protection. Both findings apply when an unsupported entry also matches nothing; supported entries with matches have none.
- Conflicting repository boundary: the request calls the config check existing, but project/config.go exports LoadConfig/ParseConfig and this checkout has no executable config-check boundary. The Decisions explicitly settle the repository-local JSON result and consumer contract documentation rather than claiming a CLI was exercised. No unsupported-syntax category, supplied example or matching guarantee is omitted.

## Tests
- Unsupported syntax is reported without implementing expansion: syntax and combined-entry integration scenarios plus focused category validation tests (regression)
- Literal [ and { files remain accepted while absent literal files lint: literal exception scenarios (integration)
- Every unmatched entry warns, including absent/empty folders and ignored-only matches: no-match scenarios (integration)
- Supported forms and tracked/untracked inventory retain exact sorted deduplicated membership: supported forms scenario and existing TestProtectedPathsFoldersAndGlobs/TestBaselineOrderAndProtectGlobs (integration)
- LoadConfig and Protected expose stable machine-readable findings, one per entry/category: every scenario checks serialized Config before and after repeated Protected and direct Config use; update contract/config_test.go and consumer inventory for the additive diagnostics contract (integration)

## Feasibility
- Minimal version: 1 plus protect configuration is accepted by ParseConfig with the project's Go toolchain. (probe: exit 0, 1.2 s; output [docs/])
- evidence: {"id":"diagnostic-observer","kind":"observer","inputs":["features/steps/coord-protect-unsupported-glob-syntax__protect.js"],"observers":["features/steps/coord-protect-unsupported-glob-syntax__protect.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/coord-protect-unsupported-glob-syntax__protect.js --control good","exit":0,"output":"observer accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/coord-protect-unsupported-glob-syntax__protect.js --control bad","exit":1,"output":"observer rejected\n"}]}
