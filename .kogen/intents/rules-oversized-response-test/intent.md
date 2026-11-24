# Cover oversized Studio response handling

Slug: rules-oversized-response-test
Model: not applicable — this test-only change introduces no new state or transitions; it covers the existing loader and outage behavior.
Acceptance:
- .kogen/intents/rules-oversized-response-test/acceptance.feature
- features/steps/rules-oversized-response-test__coverage.js

Add regression coverage in rules/rules_test.go for oversized Studio responses and their existing outage handling. Keep the response size limit and cache format unchanged. Preserve useful existing tests. No production changes are requested, and no existing behavior is replaced or removed.

## Decisions
- Limit implementation edits to rules/rules_test.go; do not change the response size limit or cache format. (source: request)
- A response larger than the limit is rejected as malformed_response and is not saved as a live snapshot. (source: request)
- With a verified same-scope cache, the oversized response returns that cached snapshot with malformed_response as its fallback reason. (source: request)
- Without a cache, the configured hold and unavailable policies return their corresponding failure classes for the oversized response. (source: request)
- Reuse the existing local httptest fixture and rules.Load entry point, with otherwise-valid JSON so malformed JSON cannot mask a missing size check. Assert the returned snapshot or error and on-disk cache effects, including preserving the verified cache. (evidence: rules/rules_test.go; rules/rules.go) (source: request)
- Cover the existing 16 MiB boundary and its adjacent byte sizes without changing it. Existing ordinary live-response and malformed-JSON tests remain useful. (evidence: rules/rules.go; rules/rules_test.go) (source: request)
- Verify the test-only change by running go test -json -count=1 ./rules in temporary module copies, both unchanged and with localized oversized-response mutations. Require actual executed tests, successful baseline tests, and test assertion failures rather than compilation failures for mutations. Do not require builder-invented test names. (evidence: features/steps/durable-sync-error-test__mutants.js; rules/rules_test.go) (source: request)

## Source comparison
- Addressed: request evidence ev-f0abae43 identifies the existing 16 MiB read limit in rules/rules.go and the missing coverage in rules/rules_test.go. The Decisions and acceptance.feature preserve that test-only scope and the existing loader as authority for the current boundary.
- Addressed: request acceptance 1 requires malformed_response rejection without a live snapshot or cache; acceptance.feature detects accepting an oversized body and saving a rejected body separately.
- Addressed: request acceptance 2 requires the verified same-scope cached snapshot and malformed_response fallback reason; acceptance.feature detects skipped fallback and an incorrect reason independently, as well as a bypassed size check.
- Addressed: request acceptance 3 requires both configured policies without cache; acceptance.feature detects incorrect rules/hold and rules/unavailable classes independently.
- Addressed: supplied wrong-implementation examples are represented by executable source mutations in the owned step file. The control implementation only adds regression tests in rules/rules_test.go; it is a proof artifact, not a production change delivered during shaping.
- Omitted: no requested behavior. Conflicting: none. Superseded: none. Response limit and cache format changes remain explicitly out of scope.

## Tests
- Oversized otherwise-valid responses are malformed_response, not live snapshots, and do not create a live cache: add focused local HTTP regression coverage asserting nil snapshot, typed reason and absent snapshot cache, and demonstrate detection of acceptance and cache-write mutations (regression)
- Verified same-scope cache survives oversized responses and is returned as cached with malformed_response: add a live-prime then oversized-response regression asserting the cached content identity, provenance and unchanged cache bytes, and detect skipped fallback or wrong reason (regression)
- Without cache, hold and unavailable select their corresponding classes for oversized responses: add both policy cases with typed class and reason assertions and detect each wrong-class mutation (regression)
- Existing size boundary remains unchanged: cover otherwise-valid responses at and immediately below the existing limit, and detect rejection at the limit (regression)
- Existing rules behavior remains intact: run the existing rules package tests together with the new tests on the unmodified loader (existing)

## Feasibility
- The existing rules package passed go test -json -count=1 ./rules; its real JSON events include test run/pass and package pass actions. The observer uses those events instead of guessed textual summaries. (evidence: ran go test -json -count=1 ./rules > /tmp/rules-test-output; status=$?; head -8 /tmp/rules-test-output; tail -4 /tmp/rules-test-output; exit "$status")
- evidence: {"id":"coverage-observer","kind":"observer","inputs":[".kogen/intents/rules-oversized-response-test/controls.json","rules/rules.go"],"observers":["features/steps/rules-oversized-response-test__coverage.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/rules-oversized-response-test__coverage.js good","exit":0,"output":"accepted accept oversized\naccepted save rejected body\naccepted skip verified fallback\naccepted wrong fallback reason\naccepted wrong hold class\naccepted wrong unavailable class\naccepted reject limit boundary\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/rules-oversized-response-test__coverage.js bad","exit":1,"output":"rejected accept oversized\nrejected save rejected body\nrejected skip verified fallback\nrejected wrong fallback reason\nrejected wrong hold class\nrejected wrong unavailable class\nrejected reject limit boundary\n"}]}
