# Confine Fetch reads to the project root

Slug: project-fetch-root-confinement
Model: not applicable — Fetch is a stateless path check and file read; there is no state machine to model
Acceptance:
- .kogen/intents/project-fetch-root-confinement/acceptance.feature
- features/steps/project-fetch-root-confinement__driver.js

`project.Fetch(root, overlay, rel)` must only read, and only look up in the overlay, clean project-relative paths whose resolved target stays under `root`. A path that is absolute, empty or has an empty, `.` or `..` component is an error, and so is a relative path whose symlinks resolve to a target outside `root`; in those cases no bytes are returned, and the overlay is not consulted for an unclean path. Valid nested project files, including through a symlink that stays inside `root`, are still read from disk, and an overlay entry for a clean path is still returned in preference to the disk content. The change is confined to `project/intent.go` and `project/intent_test.go`. Acceptance path rules (`acceptancePathRule`) are unchanged, and no caller gains any way to read files outside the project.

## Decisions
- Fetch returns a nil result and a non-nil error for an absolute path and for any path with an empty, `.` or `..` component, before consulting the overlay or the disk. (decision: D1, round 1) (evidence: project/intent.go) (source: request)
- For a clean relative path not in the overlay, the disk read uses the symlink-resolved target and returns a non-nil error with no bytes when that target is not under the symlink-resolved root; a symlinked root itself is accepted. (decision: D2, round 1) (constraint: a symlink resolving inside root is still readable) (evidence: project/intent.go) (source: request)
- An overlay entry for a clean path is returned in preference to the disk content, including when the path is absent on disk; an overlay entry keyed by an unclean path such as `../x` is not returned. (decision: D3, round 1) (evidence: project/intent.go) (source: request)
- The check lives in the shared internal `fetch`, so `ReadIntent`, the feature and model reads apply it too; a missing file still returns the underlying not-exist error, which `ReadIntent` already treats as a missing intent.md. (decision: D4, round 1) (evidence: project/intent.go) (assumption: confining the internal fetch is acceptable for its callers, which only pass Intent-relative paths) (source: request)
- Scope is `project/intent.go` and `project/intent_test.go`; `project/intent_test.go` gains a Fetch test with parent traversal, an absolute path, an escaping symlink, a valid nested file and an overlay-over-disk case. `acceptancePathRule` is not changed. (decision: D5, round 1) (evidence: project/intent.go; project/intent_test.go) (source: request)

## Source comparison
- Parent traversal and absolute paths: addressed; Fetch returns an error (D1; scenario "Parent traversal and absolute paths are rejected").
- Symlink resolving outside root: addressed; Fetch returns an error (D2; scenario "A symlink that resolves outside the project is rejected").
- Valid nested files and overlay precedence: addressed; preserved (D2, D3; scenario "Valid project files and overlay precedence are preserved").
- Changing acceptance path rules and allowing reads outside the project: out of scope, unchanged.

## Tests
- Traversal, absolute path and escaping symlink are rejected by Fetch: add a Fetch case to project/intent_test.go (unit)
- Valid nested files and overlay precedence are preserved: add overlay-over-disk and nested-file cases to project/intent_test.go (unit)
- All behaviors through the real project.Fetch entry point: acceptance.feature driven by a generated Go driver (scenario)

## Feasibility
- none
