# Test run record schema and ID rejection

Slug: run-record-schema-rejection-tests
Model: not applicable — this test-only change adds no state or transitions
Acceptance:
- .kogen/intents/run-record-schema-rejection-tests/acceptance.feature
- features/steps/run-record-schema-rejection-tests__coverage.js

Add direct regression tests for RunStore.Read rejecting unsupported record versions and mismatched embedded IDs. Confine implementation edits to durable/run_store_test.go. Write valid JSON records into temporary retention directories, open them with OpenRunStore, and call Read with the filename ID. Check errors for the two invalid cases and successful reading of a valid record. Keep useful existing tests. Do not change production code, the record schema, or migration behavior; no existing behavior is replaced or removed.

## Decisions
- Keep implementation edits confined to durable/run_store_test.go; exercise Read directly with on-disk JSON rather than testing rejection indirectly through Append or Finish. (decision: D1, round 1) (evidence: durable/run_store.go; durable/run_store_test.go) (source: request)
- Use the existing Go testing and temporary-file conventions, with disposable reader mutations to verify that the added coverage detects both missing rejection paths while valid records remain accepted. (decision: D2, round 1) (evidence: durable/run_store_test.go; features/steps/durable-sync-error-test__mutants.js) (source: request)

## Source comparison
- Addressed: request evidence ev-f1e40262 identifies the existing combined version/ID guard in durable/run_store.go and the coverage gap in durable/run_store_test.go. The proposed direct file-backed tests and acceptance scenario target that gap without changing Read.
- Addressed: request acceptance 1 requires rejection of valid JSON with version 2; acceptance.feature's future-version mutation check requires the tests to fail when the version guard is removed.
- Addressed: request acceptance 2 requires rejection of version 1 with a mismatched embedded ID; acceptance.feature's identity mutation check requires the tests to fail when the ID guard is removed.
- Addressed: request acceptance 3 preserves acceptance of a matching-ID version 1 record; acceptance.feature checks passing tests on the original reader and failing tests on a reader that rejects valid records as well.
- Addressed: the requested slug, Intent paths, prefixed bindings, and features/steps naming are retained in this package. Implementation scope remains durable/run_store_test.go; schema and migration changes are explicitly out of scope. Nothing requested is omitted, conflicting, or superseded.

## Tests
- Unsupported record versions: add a direct Read regression using valid JSON with the unsupported version and assert an error; mutation acceptance proves that accepting it is caught (regression)
- Mismatched embedded IDs: add a direct Read regression using valid JSON with the supported version and a different embedded ID and assert an error; mutation acceptance proves that trusting its contents is caught (regression)
- Valid records remain readable: exercise a supported-version record whose embedded ID matches its filename and assert a successful Read with the matching returned ID; reject a broad-rejection reader in acceptance (regression)

## Feasibility
- The focused file-list Go command ran successfully on the existing tests and emitted real test run/pass and package pass JSON events. (probe: exit 0)
- The final protected observer accepted the known-good test file and rejected the pre-regression file; its CLI evaluates every mutation even when one fails. No external dependency research is needed for this local test-only change.
- evidence: {"id":"schema-observer","kind":"observer","inputs":[".kogen/intents/run-record-schema-rejection-tests/controls.json","durable/durable.go","durable/run_store.go","durable/run_store_test.go","go.mod"],"observers":["features/steps/run-record-schema-rejection-tests__coverage.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/run-record-schema-rejection-tests__coverage.js good","exit":0,"output":"accepted future\naccepted identity\naccepted valid\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/run-record-schema-rejection-tests__coverage.js bad","exit":1,"output":"rejected future\nrejected identity\naccepted valid\n"}]}
