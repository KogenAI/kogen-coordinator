# Name the missing Intent and next command

Slug: k-coord-intent-not-found-names-next-command
Model: not applicable — one stateless refusal text computed from the slug and the folder names under .kogen/intents, with no workflow state
Acceptance:
- .kogen/intents/k-coord-intent-not-found-names-next-command/acceptance.feature
- features/steps/k-coord-intent-not-found-names-next-command__refusal.js

`kogen intent approve|refine|build <slug>` for a slug with no Intent folder is refused by `project.RequireIntentDir(root, slug)` as `intent/not_found` with exit 2. Today the first line is only `intent/not_found: Intent does not exist`: it does not say which slug or which folder was searched, and a typo in a slug looks the same as a request that was never shaped. The refusal keeps its class `intent`, reason `not_found` and exit code 2, and its text becomes, in this order:

1. The first line `intent/not_found: Intent does not exist: <slug> (looked in .kogen/intents/<slug>)`. The path is the real searched folder `project.IntentDir(slug)`, written with its separators (`.kogen/intents/other` for the slug `other`, never `.kogenother`).
2. One detail line (two-space indented by `Render`) naming the next commands, with the slug filled in: `kogen intent list shows existing Intents; kogen intent shape <slug> <request-file> creates one`. `<request-file>` stays literal.
3. When other Intent folders exist: one detail line `did you mean: <a>[, <b>]?` offering the one or two nearest folders by edit distance to the slug (nearest first, equal distances by name, at most two). When no other Intent folder exists there is no such line.

An Intent whose folder exists is accepted exactly as before. Nothing else about the refusal changes. The consumer tests that pin the old text in other modules (kogen-build TestRequireIntentDir and TestStartRefusals, kogen-shaping TestApproveMissingIntent and TestIntentExistsAndDir) are updated by their own rows and are not touched here. The two tests in this module that pin the old text, `TestIntentPathsAndExistence` in `project/intent_test.go` and `TestIntentExistsAndRequireIntentDir` in `contract/intent_test.go`, are updated to the new text.

## Decisions
- The refusal is built in `project.RequireIntentDir` only, the one producer of `intent/not_found` in this module: `Class` `intent`, `Reason` `not_found`, `Exit` 2 unchanged; `Detail` is `Intent does not exist: <slug> (looked in <project.IntentDir(slug)>)`; the next-commands text and the did-you-mean text are `Lines`, so `Render()` prints them as two-space-indented lines after the first line (decision: D1, round 1) (constraint: the searched path is built with `project.IntentDir`, never by joining `.kogen` and the slug) (evidence: project/intent.go; contract/intent_test.go; project/intent_test.go) (source: request)
- `RequireIntentDir` keeps judging only whether the Intent's folder exists (not `intent.md`), and an existing folder still returns nil (decision: D2, round 1) (evidence: project/intent.go) (source: request)
- The did-you-mean offer is the one or two directories directly under `.kogen/intents` nearest to the slug by edit distance, with no distance cut-off, as the line `did you mean: <a>[, <b>]?` after the next-commands line (decision: D3, round 1) (assumption: the request fixes only "the nearest by edit distance one or two names ... as did you mean"; please confirm the choices it leaves open: Levenshtein distance over runes, always two when two other Intents exist, ties by name, and the exact line wording and punctuation) (source: request)
- The refusal this module returns is the single error with the first line and detail lines above and carries no Build-specific second line (decision: D4, round 1) (assumption: please confirm that the Build's second line `no newly created Build run ...` is printed by the Build consumer, not by this module, so that removing or rewording it is that consumer's row; a search of this module's Go sources found the text nowhere) (evidence: contract/intent_test.go; project/intent_test.go) (source: request)

## Source comparison
- Addressed: first line extended with the slug and the searched path `.kogen/intents/<slug>`, class, reason and exit 2 kept (request Need; delivery note on `.kogenother`): scenarios "A missing Intent names the slug, the searched folder and the next commands" (slugs `greeting` and `other`) pin the exact rendered text including the separators.
- Addressed: one line naming `kogen intent list` and `kogen intent shape <slug> <request-file>`: same scenario.
- Addressed: nearest one or two existing Intents offered as "did you mean" (`greting` offers `greeting`): scenarios "A mistyped slug is offered the existing Intent it is closest to", "At most the two nearest Intents are offered, nearest first" and "The nearest Intent is offered even when it is not close".
- Addressed: with the Intent present the behavior is as before: scenario "An Intent that exists is accepted as before".
- Addressed through the one shared refusal: the synthetic acceptance for `approve`, `refine` and `build` with no Intents. This module has no command parser; all three commands refuse through `project.RequireIntentDir`, which the scenarios call.
- Open: the Build's second line (request Need) is handled by decision D4; the other-module consumer tests are updated by their own rows (delivery note).
- Superseded: the old detail `Intent does not exist` in `project/intent_test.go` and `contract/intent_test.go`.

## Tests
- A missing Intent's refusal names the slug, the real searched folder with its separators and the two next commands, with class `intent`, reason `not_found` and exit 2 unchanged: scenario "A missing Intent names the slug, the searched folder and the next commands", plus updating TestIntentPathsAndExistence in project/intent_test.go and TestIntentExistsAndRequireIntentDir in contract/intent_test.go to the new text (scenario)
- The nearest one or two existing Intents are offered as "did you mean", nearest first, whatever their distance, and nothing is offered when no other Intent exists: scenarios "A mistyped slug is offered the existing Intent it is closest to", "At most the two nearest Intents are offered, nearest first", "The nearest Intent is offered even when it is not close" and the no-Intents rows of the first scenario (scenario)
- An Intent that exists is still accepted: scenario "An Intent that exists is accepted as before" and the unchanged existing-Intent assertions of the updated tests (existing)

## Feasibility
- none
