# Make title user-name validation explicit

Slug: coord-title-user-name-explicit
Model: not applicable — deterministic title validation has no meaningful state
Acceptance:
- .kogen/intents/coord-title-user-name-explicit/acceptance.feature
- features/steps/coord-title-user-name-explicit__check.js

Make the title rule deterministic for direct callers and explain repository-derived refusals. Add `project.CheckTitle(title, userName string) []string`, returning title problems (empty for valid titles), including the existing length, period, name and narration rules. It must perform no Git/configuration reads. CheckIntent reads the effective target repository Git user.name once at its entry point and passes that explicit value through validation, including the malformed-feature diagnostic path. Remove the ambient read from lintIntent. Keep CheckIntent's public signature and other validation unchanged. Pin names in affected consumer fixtures rather than relying on host configuration; preserve useful tests and update paired contract coverage where applicable.

## Decisions
- Quote the matched configured name and identify its source with `(git user.name)`, e.g. `title: "Pat Owner adds retry" names the Git user "Pat Owner" (git user.name); use an owner-authored title instead`. This is the repository's effective Git configuration, not a new setting. (source: request)
- Preserve whole-word case-insensitive matching, no matching inside longer words, empty-name disabling and third-person approval/authorization rejection independently of names. (source: request)

## Source comparison
- Addressed: request Need 1 and synthetic Pat Owner refusal map to CheckIntent and the exact diagnostic asserted in acceptance.
- Addressed: Need 2 and direct Sam Lee examples map to the explicit CheckTitle interface and no-Git direct execution; the existing ambient lintIntent read is superseded by one entry-point read.
- Addressed: synthetic unset-name, Pat Ownership and narration cases map to the feature examples; existing matching and narration rules remain in scope, not replaced by a new matcher.
- Omitted: no requested behavior or settled non-secret examples. README golden regeneration and testing conventions remain applicable; no provider or unrelated historical work is requested.

## Tests
- Explain repository-name refusals and preserve configured-name outcomes: add CheckIntent regression cases for Pat Owner and Pat Ownership and isolated unset configuration (regression)
- Explicit title/name validation without Git: add focused CheckTitle cases for Sam Lee, Pat Owner, empty name, case-insensitive and longer-word boundaries (unit)
- Narration independent of name: preserve existing owner/authorization tests and add the exact The owner approved retry example with empty and nonempty names (unit)
- Single entry-point configuration wiring including parse errors: update CheckIntent tests to pin Git configuration and verify title diagnostics on malformed features (integration)

## Feasibility
- evidence: {"id":"comparison","kind":"observer","inputs":["features/steps/coord-title-user-name-explicit__check.js"],"observers":["features/steps/coord-title-user-name-explicit__check.js"],"checks":[{"name":"good","command":"NODE_PATH=\"$KOGEN_CUCUMBER\" \"$KOGEN_NODE\" features/steps/coord-title-user-name-explicit__check.js good","exit":0,"output":""},{"name":"bad","command":"NODE_PATH=\"$KOGEN_CUCUMBER\" \"$KOGEN_NODE\" features/steps/coord-title-user-name-explicit__check.js bad","exit":1,"output":""}]}
