# Refuse third-person owner commit titles

Slug: coord-commit-message-first-person
Model: not applicable — title validation is a stateless rule
Acceptance:
- .kogen/intents/coord-commit-message-first-person/acceptance.feature
- features/steps/coord-commit-message-first-person__titles.js

Refuse Intent titles that name the repository user or narrate the owner's approval or authorization in the third person at project.CheckIntent, with an intent/lint problem line identifying the title and explaining the violation. Resolve the user from the target repository's effective Git user.name, not the coordinator checkout. Match the complete configured name case-insensitively at word boundaries, not arbitrary substrings or individual common given-name tokens. Recognize third-person owner/user approval and authorization phrasing case-insensitively, including passive “Approved by the owner”. Do not ban domain uses of owner. Missing user.name supplies no name to match; generic third-person authorization checks still apply. Keep public APIs compatible.

Kogen must add no owner/approval narration. Preserve git.CommitMessage exactly: title, empty line, Kogen-Intent: <slug>, final newline, and nothing else. Reject rather than rewrite offending titles so they can be repaired in Refine. Do not impose literal first-person pronouns: imperative titles remain valid. Existing non-empty, 50-grapheme and no-trailing-period checks and Elixir-parity golden behavior remain unchanged. No workflow, identity settings or commit trailer changes.

## Decisions
- Keep imperative titles and domain uses of owner valid; refuse owner naming and third-person authorization at lint rather than editing the message (source: request)

## Source comparison
- Addressed: request Problem and Need through CheckIntent rejection above; CommitMessage remains title plus trailer only.
- Addressed: all four Synthetic acceptance bullets in acceptance.feature: Pat Owner configured locally, exact message, all three rejected titles, domain owner counterexample, and existing title and golden checks retained by the configured Go suite.
- Addressed: the Almir approved and Owner authorized examples motivate identity-aware and generic authorization checks; no owner identity is hardcoded. No requested behavior is intentionally omitted or superseded.

## Tests
- Reject configured user names and third-person owner authorization: add focused title-rule tests and temporary-Git CheckIntent regression coverage for the three supplied titles (regression)
- Accept imperative and domain-owner titles using the target Git identity: exercise CheckIntent with local Pat Owner configuration (integration)
- Emit only title and unchanged trailer: compare git.CommitMessage bytes for Add retry to export (unit)
- Preserve non-empty, grapheme-length, period and Elixir parity behavior: retain TestCheckIntentRules, TestIntentCheckMatchesElixir and the existing golden/parity suite unchanged (existing)

## Feasibility
- none
