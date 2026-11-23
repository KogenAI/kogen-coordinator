# Reject approvals recorded for another slug

Slug: approval-slug-binding
Model: not applicable — ReadApproval is a stateless file read with one comparison; there is no state machine to model
Acceptance:
- .kogen/intents/approval-slug-binding/acceptance.feature
- features/steps/approval-slug-binding__driver.js

`project.ReadApproval(root, slug)` must refuse an approval file whose JSON records a slug other than the requested one, so one Intent's approval can never be read as another Intent's. The error names both the requested slug and the recorded slug. Matching approvals are still returned unchanged, and an absent approval file still yields nil without an error. Approval fields, encoding and the handling of missing files are out of scope. The change is confined to `project/baseline.go` and `project/intent_test.go`.

## Decisions
- ReadApproval returns a nil approval and a non-nil error when the decoded record's slug differs from the requested slug; the error text contains both the requested slug and the recorded slug. (evidence: project/baseline.go) (source: request)
- A valid approval whose recorded slug equals the requested slug is returned exactly as before, and an absent file still returns nil, nil. (decision: D2, round 1) (constraint: approval fields, encoding and missing-file handling are unchanged) (evidence: project/baseline.go; project/intent_test.go) (source: request)
- The slug check applies after a successful JSON decode, so malformed files keep their existing error. The exact wording of the error is not fixed beyond naming both slugs. (decision: D3, round 1) (assumption: the existing decode error wording for malformed files may stay as it is) (source: request)
- Scope is `project/baseline.go` and `project/intent_test.go`; `project/intent_test.go` gains a case in TestApprovalFiles for a file requested as one slug whose JSON records another, asserting a nil approval and an error naming both slugs. (decision: D4, round 1) (evidence: project/intent_test.go) (source: request)
- ReadApproval returns a nil approval and an error naming both the requested and recorded slugs when they differ; matching and absent behavior unchanged. (decision: D1, round 1) (constraint: approval fields, encoding and missing-file handling unchanged) (evidence: project/baseline.go; project/intent_test.go) (assumption: Probes in a scratch copy showed the three scenarios pass on the correct overlay and each wrong overlay fails its scenario; they are not Kogen's retained probes.) (source: request)

## Source comparison
- Mismatched recorded slug: addressed; ReadApproval rejects it with an error naming both slugs (Decisions D1; scenario "A file requested as one slug whose JSON records another slug is rejected naming both slugs").
- Matching record: addressed; still accepted (D2; scenario "A valid approval whose recorded slug matches the requested slug is still accepted").
- Absent file: addressed; still nil without an error (D2; scenario "An absent approval file still yields no approval and no error").
- Approval fields, encoding, missing-file handling: omitted by request, unchanged.

## Tests
- A requested slug differing from the recorded slug is rejected with an error naming both: add a mismatch case to TestApprovalFiles in project/intent_test.go (unit)
- A matching approval is still accepted: the existing matching-slug reads in TestApprovalFiles (existing)
- An absent approval file still returns nil without an error: the existing missing-approval check in TestApprovalFiles (existing)
- All three outcomes through the real ReadApproval entry point: acceptance.feature driven by a generated Go driver (scenario)

## Feasibility
- none
