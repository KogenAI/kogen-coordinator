# kogen-loop consumer contract

This suite pins coordinator's reliance on `github.com/KogenAI/kogen-loop v0.0.0-20261103215300-3e292bb34b90`.
It tests the producer directly, using temporary roots and local subprocesses.
Run `go test -race -count=1 -trimpath ./consumes/kogen-loop`; it also runs in
`go test ./...`.

## Inventory and completeness

For this baseline, inspect all non-test Go files with
`rg -n 'kogen-loop|sys\.' --glob '*.go' -g '!**/*_test.go'`, then inspect
those files for selectors on values returned by the dependency and on session
receivers (including `Lines`, `Status`, `Output`, `Run`, `Err`, and `Progress`).
Use `go list -f '{{.Dir}}' github.com/KogenAI/kogen-loop/sys` and `go doc github.com/KogenAI/kogen-loop/sys` plus
`go doc` on its exported types to inspect the pinned public definitions.
Test-only imports are excluded; the comment naming `sys.Interrupted` in
`git/commit.go` is not a production use. All current production imports of
this dependency are `github.com/KogenAI/kogen-loop/sys`.

| Producer reliance | Coordinator production locations | Assertions |
| --- | --- | --- |
| `sys.Fail`, `sys.Error`, `Error.Class`, `Reason`, `Detail`, `Exit` | `project/config.go`, `project/intent.go`, `project/models.go`, `project/provenance.go`, `git/git.go`, `git/lock.go`, `git/commit.go` | `TestRefusal` |
| `Error.Lines` (assignment and accumulation) | `project/config.go`, `project/intent.go`, `git/commit.go` | `TestRefusal` |
| `sys.Session`, `Session.Run`, `sys.Options.KillGroupOnExit`, result `Status`, `Output` | `git/commit.go` | `TestRunResults`, `TestKillGroupOnExit` |
| `sys.Options.FinishOnInterrupt` | `git/commit.go` | `TestFinishOnInterrupt` |
| `Session.Err` | `git/commit.go` | `TestFinishOnInterrupt` |
| `Session.Progress` | `git/lock.go` | `TestProgress` |
| `sys.TmpPath` | `git/commit.go`, `git/snapshot.go` | `TestTmpPath` |
