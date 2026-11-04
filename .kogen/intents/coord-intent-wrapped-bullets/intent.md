# Parse wrapped Intent bullets

Slug: coord-intent-wrapped-bullets
Model: not applicable — deterministic text parsing and linting have no meaningful evolving state
Acceptance:
- .kogen/intents/coord-intent-wrapped-bullets/acceptance.feature
- features/steps/coord-intent-wrapped-bullets__parse.js

Replace line-only bullet extraction in project/intent.go with logical bullet reading for Decisions, Feasibility, Tests and Acceptance. After a bullet, trim continuation lines and join them with one space, whether indented or unindented. Stop continuation at a blank line, next bullet or heading. A paragraph directly after a bullet is part of that bullet; text after a blank is not. Section lists may still collect later bullets before the next heading; Acceptance retains its existing stop-at-blank-after-first-item boundary and leading-blank allowance. Preserve column-zero marker recognition, including the existing recorded indented-marker case; this request does not introduce nested lists. Preserve Intent.Text and stored/rendered Markdown byte-for-byte. ReadIntent and CheckIntent are the public acceptance boundaries.

Recognize column-zero `* ` and `+ ` items in all four lists sufficiently to report a section-specific lint line identifying the required `- ` bullet marker. Do not silently drop these items or diagnose an all-unsupported-marker section as missing or empty. Do not normalize them into valid bullets. Preserve existing valid single-line results and missing-layer rejection. Diagnostic wording is otherwise unconstrained.

Delivery decision supersedes strict Elixir parity for unindented continuation inputs. The Go rewrite is a redesign from Gherkin behaviour, not a 1:1 Elixir port. In project/testdata/golden.json, TestIntentReadMatchesElixir cases 1, 3 and 6 (zero-based) are the existing affected cases: case 1 Acceptance `b` gains `not bullet` and then includes `c`; case 3 Acceptance `a` gains `ordinary text` and then includes `unrelated`; case 6 Decisions `- d1` gains `prose`. Update only these existing recorded results, leaving all other recorded cases and every input unchanged. Name each changed case in the commit message. Regenerate through `go test ./... -update`, never by hand; review `git diff -- project/testdata`, then run `go test ./...` and configured checks without -update. New regression cases may be added in focused Go tests without expanding recorded golden inputs. No paused Build is resumed by this Intent.

## Decisions
- Support wrapped and directly adjacent unindented bullet text in all four lists, without rewriting source Markdown. (source: request)
- Diagnose `* ` and `+ ` using the required `- ` marker rather than reporting missing content. (source: request)
- Let the new continuation behaviour win over the conflicting Elixir records only for the identified unindented cases, naming changed cases in the commit. (source: request)

## Source comparison
- Addressed: Request Problem and Need are covered by the logical-bullet, lint-marker and unchanged-text contract above and the feature's joined, missing-layer, boundary and marker scenarios.
- Addressed: synthetic Retry twice before failing the call / with a short pause (source: request), wrapped (unit), missing layer, star-only sections, adjacent paragraphs and blank boundaries are literal executable examples in acceptance.feature. Plus markers and all four sections are also exercised.
- Superseded: original synthetic requirement to keep all old parity results unchanged conflicts with the delivery decision after build_blocked Build 4890c828. That later request wins only for TestIntentReadMatchesElixir cases 1, 3 and 6; every other recorded parity case remains unchanged. The delivery paragraph defines exact allowed changes and commit naming, and the existing golden suite checks recorded expectations.
- Addressed: README regeneration commands and docs/testing-rules.md require focused Go regression tests, relevant configured checks and acceptance. No external dependency or protocol change is requested. No product scope is omitted.

## Tests
- Join indented and unindented logical bullets in Decisions, Tests, Feasibility and Acceptance: add focused ReadIntent regression cases and run the joined and boundary acceptance scenarios (regression)
- Preserve source text while parsing logical bullets: assert Intent.Text equals input in acceptance and focused ReadIntent tests (unit)
- Accept wrapped source/layer annotations but reject absent layers: add CheckIntent regression cases and run the clean and missing-layer scenarios (regression)
- Diagnose unsupported star and plus markers in each list: add focused CheckIntent cases and run the marker scenario outline (regression)
- Stop joining at blanks, bullets and headings while preserving list boundaries: add focused ReadIntent cases matching the feature boundary fixture (unit)
- Preserve valid single-line parsing and all unrelated parity: retain existing tests, update only TestIntentReadMatchesElixir recorded cases 1, 3 and 6 using the documented regeneration command, and run the single-line scenario (existing)

## Feasibility
- Local inspection found all necessary implementation edits outside the protection baseline: project/intent.go, focused Go tests and project/testdata/golden.json. Existing TestIntentReadMatchesElixir passed unchanged in a scratch probe (exit 0); inspection identified affected zero-based cases 1, 3 and 6. No external technical facts are material.
- evidence: {"id":"comparison-control","kind":"observer","inputs":["features/steps/coord-intent-wrapped-bullets__parse.js"],"observers":["features/steps/coord-intent-wrapped-bullets__parse.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/coord-intent-wrapped-bullets__parse.js '{\"tests\":[\"- Retry: add coverage (unit)\"],\"unchanged\":true,\"lines\":[]}' '{\"tests\":[\"- Retry: add coverage (unit)\"],\"unchanged\":true,\"lines\":[]}'","exit":0,"output":"match\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/coord-intent-wrapped-bullets__parse.js '{\"tests\":[\"- Retry: add coverage\"],\"unchanged\":true,\"lines\":[]}' '{\"tests\":[\"- Retry: add coverage (unit)\"],\"unchanged\":true,\"lines\":[]}'","exit":1,"output":"mismatch\n"}]}
