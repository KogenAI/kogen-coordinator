# Remove obsolete configuration representations

Slug: simplify-coordinator-obsolete-config
Model: not applicable — deleting dead code and tests; no state or interacting rules.
Acceptance:
- .kogen/intents/simplify-coordinator-obsolete-config/acceptance.feature
- features/steps/simplify-coordinator-obsolete-config__obsolete.js

This feature removes the ghosts of removed features from kogen-coordinator: the removed `shape_workers`, `shape_audit`, `shape_decision_check`, `review_material` and `max_rounds` options (types, fixed fields, ignored YAML handling and MaxRounds remnants, serialization, tests and docs), and the `FormerBaseline` API. The retained removed types and fields are in `project/config.go` (about lines 61-96), their hashing is in `project/provenance.go` (about lines 682-688), and `FormerBaseline` is exported from `project/baseline.go` (about lines 94-105); it has no production caller. Fixed policies stay constants with no configuration or override scaffolding; test controls must not create configurable product behaviour. Nothing is replaced: no compatibility alias, migration or legacy mention remains. In-repo consumers, fixtures and docs are updated together. Genuine configuration loading, approval-baseline behaviour and the provenance hash of current fields are unchanged. The full `go test ./...` suite must pass after the Build (the configured go-test check).

## Decisions
- Acceptance greps tracked Go sources and README.md (not recorded testdata JSON, which `-update` regenerates, nor `.kogen/` history nor `features/`) for the removed names. (assumption: recorded golden JSON, regenerated only with -update, may still carry a removed name) (source: request)
- Tests that only asserted rejection or ignoring of removed keys are deleted, with the golden_test regex branches for `shape_workers`. (evidence: project/config_test.go; project/golden_test.go; contract/config_test.go; contract/models_test.go) (source: request)
- The configuration digest hashes only current Config fields, pinned by a test. (evidence: project/provenance.go) (source: request)
- Acceptance runs go vet (which compiles all tests) rather than the whole suite to stay inside the step time limit; the full suite is the configured go-test check. (evidence: .kogen/project.yaml) (source: request)

## Source comparison
- Addressed: removal of types, fields, YAML keys, FormerBaseline in `project/config.go`, `project/provenance.go`, `project/baseline.go`: scenario 1.
- Addressed: loading, baseline and the full test suite still pass: scenario 2 and the go-test check.
- Addressed: provenance covers current fields only: Tests line.
- Addressed: no configurable test controls: no new options or environment variables are introduced.

## Tests
- Removed names are absent from Go sources and README: scenario (scenario)
- Code and tests compile after removal: go vet scenario (scenario)
- Config loading and baseline behaviour unchanged: existing project and contract tests (existing)
- Provenance config digest covers only current fields: a test in project/ asserting the digest changes with each current field and not with anything else (unit)

## Feasibility
- none
