# Fix ignored-path checks for quoted names

Slug: coord-ignored-check-quoted-paths
Model: not applicable — independent Git queries have no meaningful workflow state
Acceptance:
- .kogen/intents/coord-ignored-check-quoted-paths/acceptance.feature
- features/steps/quoted_ignore.js
- features/steps/quoted_ignore_driver.go.txt

Make every check-ignore invocation use `git check-ignore --no-index -z --stdin`, with NUL-terminated input paths and NUL-delimited output. Preserve byte-exact paths, including Unicode, spaces, double quotes, backslashes and control bytes. Exit 1 means no ignored paths, not a failure; process startup errors and other statuses must be surfaced. For lint, report `acceptance: Git ignore check could not run` (additional diagnostic detail may follow). For git.Repo.Ignored, change the exported method to return ([]string, error), update consumers and paired contract coverage accordingly. Empty input remains a successful empty result. Never convert an actual failure into an empty successful result.

Repository discovery corrects the request's caller name: git.Repo.Unignored uses ls-files, not check-ignore; git.Repo.Ignored is the second affected caller. Leave Unignored's behavior unchanged. Keep --no-index semantics for tracked files. Do not change ignore rules or Git configuration to suppress quoting. Preserve existing ASCII results and recorded Elixir-parity goldens without regeneration. Existing lint fixtures that intended a working Git check must initialize a repository rather than relying on the old silent failure.

## Decisions
- Ignored Acceptance files remain lint errors with their exact listed path (source: request)
- Real ignore-check failures are visible, not clean results (source: request)

## Source comparison
- Addressed: request Problem and Need map to the NUL input/output protocol, exit-status handling and both actual check-ignore callers above.
- Addressed: Synthetic acceptance maps to the executable examples for café.skip.js, a space, a double quote, nonignored Unicode, nonrepository failure and ASCII; existing goldens remain unchanged under configured Go checks.
- Addressed: backslash and control-byte causes named in Problem receive focused git.Repo.Ignored integration regressions; multiline paths are not newly supported in the line-oriented Intent format.
- Superseded: request's attribution to Unignored conflicts with git/git.go:432-454; Ignored is the actual second caller. No requested behavior is omitted.

## Tests
- Ignored quoted and non-ASCII Acceptance paths are rejected byte-exactly: temp Git repository CheckIntent examples (regression)
- Nonignored Unicode and existing ASCII behavior remain correct: clean and ignored acceptance examples plus existing golden tests (integration)
- A nonrepository or unavailable Git cannot silently pass lint: failure examples and startup-error integration coverage (regression)
- Every check-ignore caller preserves path bytes and exposes genuine failures: add Repo.Ignored integration tests for mixed ignored/nonignored paths, quotes, spaces, Unicode, backslashes, newline, exit 1, nonrepository and startup failure; retain empty and tracked-file cases (integration)
- Elixir parity remains unchanged: existing project golden tests and configured go-test check (existing)

## Feasibility
- Git documentation search retrieved git-scm.com; fetched https://git-scm.com/docs/git-check-ignore (retrieved, untrusted documentation). OPTIONS/OUTPUT specify -z with --stdin as NUL input/output; EXIT STATUS specifies 0 ignored, 1 none, 128 fatal. Documentation is protocol evidence only.
