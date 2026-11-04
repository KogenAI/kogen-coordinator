# Report Intent folder walk errors in the baseline

Slug: coord-baseline-intent-walk-errors-visible
Model: not applicable — a single deterministic filesystem listing with one error path, no workflow state
Acceptance:
- .kogen/intents/coord-baseline-intent-walk-errors-visible/acceptance.feature
- features/steps/coord-baseline-intent-walk-errors-visible__walk.js

`project.Baseline(root, slug string, cfg *Config) ([]string, error)` lists the Intent's own files by walking `.kogen/intents/<slug>/` with `filepath.WalkDir` (`project/baseline.go`). Today the walk callback ignores the error it is handed and the walk's own return value is discarded, so an unreadable subfolder or an entry that fails to stat is silently skipped: the baseline then lacks files the Intent owns, and the approval hash is computed over fewer files.

Change: when the walk of the Intent folder reports any error other than the Intent folder itself not existing, `Baseline` returns a nil list and a non-nil error, like its other failures (for example the existing `git ls-files failed: %w` from `Protected`). The error wraps the walk error (so `errors.Is(err, fs.ErrPermission)` holds for a permission failure) and its message contains the failing entry's path as the walk reports it, which contains `.kogen/intents/<slug>/<entry>` (for example `.kogen/intents/demo/fixtures` for an unreadable subfolder `fixtures`). A walk error is returned as soon as it is met; the protected-file listing is not needed after it.

Unchanged:
- An Intent folder that does not exist (the walk's error for the folder itself satisfies `errors.Is(err, fs.ErrNotExist)`) is not an error: the Intent contributes no files and the result is the same list as today (`.kogen/project.yaml`, `.kogen/models.yaml` plus protected files).
- Without walk errors, the files, their order (`intent.md`, `acceptance.feature`, the acceptance list, the remaining Intent files sorted, the project configuration, the team lineup, the protected files) and the deduplication are exactly as today. The recorded goldens (`contract/testdata/baseline.json`, `project/testdata/parity.json` and others) keep their values; do not regenerate them.
- Entries that are not regular files are still skipped without an error, using the existing `isRegular` check (`os.Stat` following symlinks). A dangling symlink inside the folder is listed by the walk without an error and stays skipped, without an error.
- `Hash`, `HashWithUnreadable` and every other baseline caller are unchanged; callers already propagate `Baseline` errors.

Out of scope: the other `filepath.WalkDir` in `git/pin.go`, and any approval UI or policy change.

## Decisions
- A walk error other than a missing Intent folder makes the baseline fail with an error naming the path; a missing folder still yields no Intent files; non-regular entries including dangling symlinks are still skipped silently (source: request)
- On error `Baseline` returns a nil list, and the error wraps the walk error with the failing path in its message, like other baseline failures (source: request)

## Source comparison
- Addressed: request Problem (callback ignores errors, shorter baseline, different hash later) by the error return above; replaces the ignored-error behavior in `project/baseline.go`.
- Addressed: Need "error other than the folder not existing ... error naming the path": unreadable-subfolder scenario asserts a failure whose message contains `.kogen/intents/demo/fixtures` and an empty list.
- Addressed: synthetic acceptance "Intent folder with `intent.md`, `acceptance.feature` and a subfolder `fixtures/` made unreadable (mode 000)": scenario 1 (the fixture also checks the folder really cannot be read).
- Addressed: "Same tree readable: the baseline lists the same files in the same order as today": scenario 2 with the exact ordered list, plus existing `TestBaselineOrderAndDuplicates`.
- Addressed: "Intent folder absent: the baseline succeeds with the same list as today": scenario 3 (`.kogen/project.yaml`, `.kogen/models.yaml`), plus existing `TestBaselineWithoutIntentFiles`.
- Addressed: "A dangling symlink inside the folder is still skipped as a non-regular file without an error": scenario 4.
- Omitted: none.

## Tests
- An unreadable subfolder of the Intent folder makes Baseline fail with an error naming its path and wrapping fs.ErrPermission: new test in `project/intent_test.go` with a mode-000 subfolder, plus acceptance scenario 1 (regression)
- A dangling symlink in the Intent folder is skipped without an error: new case in `project/intent_test.go`, plus acceptance scenario 4 (integration)
- Readable tree keeps files, order and deduplication: existing `TestBaselineOrderAndDuplicates` and the baseline goldens, plus acceptance scenario 2 (existing)
- Absent Intent folder still yields the configuration and lineup only: existing `TestBaselineWithoutIntentFiles`, plus acceptance scenario 3 (existing)

## Feasibility
- Local environment: Go 1.27.2 darwin/arm64, uid 502 (not root), so a mode-000 folder cannot be read; the fixture step asserts that precondition instead of assuming it.
- evidence: {"id":"walk-observer","kind":"observer","inputs":["features/steps/coord-baseline-intent-walk-errors-visible__walk.js"],"observers":["features/steps/coord-baseline-intent-walk-errors-visible__walk.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/coord-baseline-intent-walk-errors-visible__walk.js good","exit":0,"output":"match\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/coord-baseline-intent-walk-errors-visible__walk.js bad","exit":1,"output":"mismatch\n"}]}
