# Bound the commit hook refusals to readable size

Slug: coord-commit-hook-failure-lines-bounded
Model: not applicable — two output-shaping rules (a tail of hook output lines and a prefix of a path list) in existing refusals; no new state, transitions or interacting rules
Acceptance:
- .kogen/intents/coord-commit-hook-failure-lines-bounded/acceptance.feature
- features/steps/coord-commit-hook-failure-lines-bounded__lines.js

When the user's commit hooks fail or rewrite the commit, the refusal a Build or `kogen init` shows is unbounded in two places, while the refusal for the commit-msg hook is already bounded. This Intent makes the three hook-related refusals of kogen-coordinator's `git` package (`git/commit.go`) equally bounded and readable.

Current code, which this Intent changes:
- `CheckCommitMsg` builds `environment/commit_rejected` with `Lines: strings.Split(tailLines(res.Output, 20), "\n")`, the last 20 lines. This stays.
- `Commit` and `CommitPaths` build `environment/commit_failed` with `Lines: strings.Split(strings.TrimSpace(res.Output), "\n")`, every line, oldest first.
- `landed` builds `candidate/hook_changed_commit` with `Detail: "a commit hook changed " + strings.Join(paths, ", ") + "; the commit was undone and the changes are left in place"`, where `paths` is every path `Changed(spec.Tree, tree)` returns, in `git diff --name-only` order (byte order of the path).

Required behavior:
1. `Commit` and `CommitPaths` give `environment/commit_failed` the last 20 lines of the hook's output, the way `commit_rejected` does. The output is still trimmed of surrounding whitespace first and split on newlines as today, so output of at most 20 lines (and an empty output, which stays one empty line) is byte-identical to today. The `Detail` text and exit code stay as they are for both functions: `git commit failed (status N); the verified changes are left uncommitted` for `Commit`, `git commit failed (status N); the configuration is left uncommitted` for `CommitPaths`.
2. `landed` names at most the first 10 changed paths in the `candidate/hook_changed_commit` detail. Up to 10 paths the sentence is exactly as today. With more than 10 it lists the first 10 in the same order, joined by `, `, followed by ` and N more` where N is the number of paths left out, and then the same `; the commit was undone and the changes are left in place`. For 12 paths named hook-01.txt to hook-12.txt the detail is exactly `a commit hook changed hook-01.txt, hook-02.txt, hook-03.txt, hook-04.txt, hook-05.txt, hook-06.txt, hook-07.txt, hook-08.txt, hook-09.txt, hook-10.txt and 2 more; the commit was undone and the changes are left in place`. The `the commit itself` fallback when no path differs is unchanged.
3. README.md states the two limits next to the `git.CommitTimeout` bullet that already describes the commit hook commands (the last 20 lines of a failing commit's output, and the first 10 paths of a hook-changed commit).

Unchanged: which commits are undone, the undo itself, HEAD, the index and the files left in place, the `commit_rejected` refusal, the trailer refusal (the one whose detail starts `a commit hook changed the commit message`, which has no path list), and the exit codes. No byte bound is added for a single very long line (as for `commit_rejected`). No new configuration or exported name; `tailLines` is reused. `*sys.Error` keeps its fields, so no consumer needs to change.

Tests the Build adds, in `git/commit_test.go`, use the existing `candidate(t)` fixture, `f.hook`, `f.session()`, `f.write`, `wantSysError` and `equal` helpers; the `CommitPaths` test uses the plain `newFixture(t)` with a changed README.md and calls `f.CommitPaths(s, "Add Kogen configuration", []string{"README.md"}, true)`. Each is run alone with `go test ./git -run <pattern naming only that test>`.

## Decisions
- `Commit` and `CommitPaths` keep the last 20 lines of the trimmed hook output by reusing `tailLines`; `Detail` and exit stay (evidence: git/commit.go; git/commit_test.go) (source: request)
- `landed` lists at most the first 10 changed paths and appends ` and N more` (N = paths left out) only when more than 10 changed; exactly 10 are all listed with no suffix (evidence: git/commit.go) (source: request)
- The limits 20 and 10 are fixed values in `git/commit.go`, with no setting (evidence: git/commit.go) (source: request)
- The README states both limits next to the `git.CommitTimeout` bullet (evidence: README.md) (source: request)
- Acceptance drives `Commit` and `CommitPaths` through a Go driver built from the repository root rather than naming Go tests, so it does not depend on tests the Build must write; the four unit tests named under Tests are still added to `git/commit_test.go` (evidence: git/commit_test.go) (assumption: the scratch observer control ran outside the checkout; the full cucumber scenarios were not run by this shaping) (source: request)
- Commit and CommitPaths keep the last 20 lines of the trimmed hook output by reusing tailLines(strings.TrimSpace(res.Output), 20); Detail and exit stay (decision: D1, round 1) (constraint: output of at most 20 lines is byte-identical to today) (evidence: git/commit.go; git/commit_test.go) (source: request)
- landed lists at most the first 10 changed paths and appends ' and N more' only when more than 10 changed; exactly 10 are all listed with no suffix (decision: D2, round 1) (evidence: git/commit.go) (source: request)
- The limits 20 and 10 are constants in git/commit.go, not settings (decision: D3, round 1) (evidence: git/commit.go) (source: request)
- The README states both limits next to the git.CommitTimeout bullet (decision: D4, round 1) (evidence: README.md) (source: request)
- Acceptance drives Commit and CommitPaths through a Go driver built from the repository root rather than naming Go tests; the four unit tests are still added to git/commit_test.go (decision: D5, round 1) (evidence: git/commit_test.go) (assumption: The scratch observer control (good exit 0, bad exit 1) ran on the unchanged tree with a node run outside the checkout; the full cucumber scenarios were not run by this shaping.) (source: request)
- Commit and CommitPaths keep the last 20 lines of the trimmed hook output by reusing tailLines; Detail and exit stay (decision: D6, round 1) (evidence: git/commit.go; git/commit_test.go) (source: request)
- The limits 20 and 10 are fixed values in git/commit.go, with no setting (decision: D7, round 1) (evidence: git/commit.go) (source: request)
- Acceptance drives Commit and CommitPaths through a Go driver built from the repository root rather than naming Go tests; the four unit tests are still added to git/commit_test.go (decision: D8, round 1) (evidence: git/commit_test.go) (assumption: the scratch observer control ran outside the checkout; the full cucumber scenarios were not run by this shaping) (source: request)

## Source comparison
- Addressed: `Commit` and `CommitPaths` last 20 lines of `commit_failed`: acceptance scenarios "Commit failure keeps the last 20 hook lines" and "CommitPaths failure keeps the last 20 hook lines" in acceptance.feature carry the request's two examples with their exact details, 20 lines from `line 11` to `line 30`, HEAD at the start and nothing staged.
- Addressed: `landed` first 10 paths with ` and N more`: acceptance scenarios "More than 10 changed paths are counted" (12 paths, exact detail above) and "Exactly 10 changed paths are all listed" (no suffix) in acceptance.feature.
- Addressed: README.md states the two limits next to the `git.CommitTimeout` bullet; a documentation edit reviewed in the diff, since the request limits acceptance to four scenarios.
- Addressed: constraints (no change to the undo, `commit_rejected`, the trailer refusal, exit codes, no new names); each scenario checks class, reason and exit.
- Omitted: nothing requested.

## Tests
- `Commit` failure keeps the last 20 hook lines (30 printed gives `line 11` to `line 30`, exact detail, HEAD at the start): TestCommitFailureKeepsTheLast20HookLines in git/commit_test.go next to TestCommitFailureReportsGitOutputAndLeavesTheCommitUndone, plus the acceptance scenario (unit)
- `CommitPaths` failure keeps the last 20 hook lines (README.md, exact detail, nothing staged): TestCommitPathsFailureKeepsTheLast20HookLines in git/commit_test.go, plus the acceptance scenario (unit)
- More than 10 changed paths name the first 10 and count the rest (12 paths, HEAD at the start, files in the work tree): TestHookChangedCommitNamesTenPathsAndCountsTheRest in git/commit_test.go next to TestCommitUndoesACommitWhoseHookChangedTheTree, plus the acceptance scenario (unit)
- Exactly 10 changed paths are all listed with no suffix: TestHookChangedCommitWithTenPathsListsAllOfThem in git/commit_test.go, plus the acceptance scenario (unit)
- The README states both limits next to the `git.CommitTimeout` bullet: documentation edit checked in review; TestCheckCommitMsgHook, TestCommitUndoesACommitWhoseHookChangedTheTree and TestCommitPathsFailureUnstagesAndReportsOutput keep passing unchanged (existing)

## Feasibility
- The step file builds a Go driver from the repository root and makes several assertions per scenario, so its observer control runs the same driver and checks on three outcomes that behave the same before and after the change: a 3-line failing pre-commit hook through `Commit` and through `CommitPaths` (lines kept whole, `commit_failed`) and a hook that changed `app.txt` and `hook-made.txt` (existing two-path detail). good pairs each check with its true outcome; bad expects 20 lines ending in `line 30`, the other function's detail, and a ` and 0 more` suffix. On the unchanged tree this run printed the outputs below. (probe: good exit 0, bad exit 1, about 1 s)
- On the unchanged tree the scenario "Exactly 10 changed paths are all listed" already passes: it is a boundary of the new rule, and its wrong-implementation control (` and 0 more` appended at exactly 10) rejects it. The other three scenarios fail at their first Then step.
- evidence: {"id":"commit-lines-observer","kind":"observer","inputs":["features/steps/coord-commit-hook-failure-lines-bounded__lines.js"],"observers":["features/steps/coord-commit-hook-failure-lines-bounded__lines.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/coord-commit-hook-failure-lines-bounded__lines.js good","exit":0,"output":"commit: match\ncommitpaths: match\nchanged: match\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/coord-commit-hook-failure-lines-bounded__lines.js bad","exit":1,"output":"commit: mismatch\ncommitpaths: mismatch\nchanged: mismatch\n"}]}
