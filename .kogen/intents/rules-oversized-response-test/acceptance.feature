Feature: Add regression coverage for oversized Studio responses
  This feature covers evidence ev-f0abae43: rules/rules.go already limits Studio
  reads to 16 MiB and treats larger bodies as malformed_response, but
  rules/rules_test.go lacks that regression coverage. Only rules/rules_test.go
  changes in the implementation; the response size limit and cache format stay unchanged.
  Otherwise-valid same-scope JSON at 16 MiB minus one byte and at 16 MiB remains live.
  At 16 MiB plus one byte, no live snapshot or cache is created. A verified same-scope
  cache returns origin cached with malformed_response as fallback_reason and preserves
  its content. Without cache, hold returns rules/hold and unavailable returns
  rules/unavailable, each with reason malformed_response and no snapshot.
  Accepting or caching an oversized response, bypassing the size check, skipping the
  documented fallback, or selecting the wrong policy class must be caught by tests.

  Scenario: Detect oversized Studio response regressions
    When rules-oversized-response-test: the rules tests run on the original loader and oversized-response mutations
    Then rules-oversized-response-test: the rules tests pass on the original loader
    Then rules-oversized-response-test: the rules tests detect "accept oversized"
    Then rules-oversized-response-test: the rules tests detect "save rejected body"
    Then rules-oversized-response-test: the rules tests detect "skip verified fallback"
    Then rules-oversized-response-test: the rules tests detect "wrong fallback reason"
    Then rules-oversized-response-test: the rules tests detect "wrong hold class"
    Then rules-oversized-response-test: the rules tests detect "wrong unavailable class"
    Then rules-oversized-response-test: the rules tests detect "reject limit boundary"
