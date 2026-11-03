# Migrate coordinator to the real loop module path

Slug: k-coordinator-loop-module-path
Model: not applicable — dependency wiring only, with no behavioral state change
Acceptance:
- .kogen/intents/k-coordinator-loop-module-path/acceptance.feature
- features/steps/k-coordinator-loop-module-path__commands.js

Replace the bare kogen-loop dependency and its replacement with the real github.com/KogenAI/kogen-loop module. Pin current main as observed during shaping: 3e292bb34b9002d14e1297c4e8fa7c7d9fb23874. Remove the old requirement and replacement, then run `go get github.com/KogenAI/kogen-loop@3e292bb34b9002d14e1297c4e8fa7c7d9fb23874`; Go resolves this to v0.0.0-20261103215300-3e292bb34b90. Preserve Go's generated go.sum. Do not introduce go.work or replacement-based resolution. Update every bare import in production, tests, embedded Go source in JavaScript steps, and Go driver templates. Update the consumer inventory's obsolete dependency and command references. Do not change behavior or weaken existing tests.

## Decisions
- Use the real module path with a main-SHA pseudo-version, no replace and no go.work; retain behavior unchanged. (source: request)

## Source comparison
- Addressed: request K-COORDINATOR-LOOP-MODULE-PATH Problem and Need: the replacement and bare v0.0.0 requirement in go.mod are removed by the migration above; the exact current-main SHA and generated pseudo-version are settled by the live repository and go get observations.
- Addressed: request every import from `kogen-loop/...` includes embedded drivers as well as .go files; acceptance scans .go, .go.txt and step JavaScript sources.
- Addressed: request Acceptance `go build ./... && go vet ./... && go test ./...`, no loop replacement, and `grep -rn "\"kogen-loop/" --include=*.go .` finding nothing are executable below. No behavior change is checked by the existing full suite unchanged.
- Omitted: no requested behavior. No conflicting or superseded requirements.

## Tests
- Resolve the canonical module at the settled main revision without the old requirement, replacement or workspace: acceptance manifest and checksum commands (integration)
- Remove all bare imports including embedded driver imports: acceptance source scan (integration)
- Preserve behavior and build/vet compatibility: existing `go build ./... && go vet ./... && go test ./...` (existing)

## Feasibility
- Live `git ls-remote https://github.com/KogenAI/kogen-loop.git refs/heads/main` returned 3e292bb34b9002d14e1297c4e8fa7c7d9fb23874; unchanged build, vet and full tests passed. (probe 1: exit 0, 22.3 s)
- Removing the old requirement/replacement and running the exact go get in a scratch copy succeeded and generated v0.0.0-20261103215300-3e292bb34b90. The indirect annotation observed before imports migrate is not required in the final manifest. (probe 2: exit 0, 7.5 s)
- Documentation search retrieved sources; fetch of https://go.dev/ref/mod returned retrieved, untrusted reference content describing Go's automatic conversion of commit hashes to canonical pseudo-versions. This supports using go get rather than hand-writing a version.
