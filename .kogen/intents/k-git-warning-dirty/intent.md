# Guard checkout status against Git warnings

Slug: k-git-warning-dirty
Model: not applicable — this is regression coverage of stateless Git observations, not a new workflow or state machine
Acceptance:
- .kogen/intents/k-git-warning-dirty/acceptance.feature
- features/steps/git_warning.js
- features/steps/git_warning_probe.go

Deliver coordinator-owned fixture-backed regression coverage for K-GIT-WARNING-DIRTY. Production already separates stdout and stderr; preserve that implementation unless a real fixture demonstrates a defect. Add focused regression coverage in git/git_test.go using the existing fixture helpers, replacing the misleading warning comment/test gap in TestRunnerKeepsStderrOutOfParsedOutput without removing its useful failure assertions. The independent acceptance harness also exercises the exported Repo.Run, Repo.OK and Repo.ChangedPaths APIs against real Git. Since the answer explicitly selects coverage of already-correct behavior, acceptance may already pass before Build; do not deliberately break production to manufacture red.

Successful status observations must contain only porcelain stdout. Clean status is empty; changed status is exactly ` M notes.txt\n?? untracked.txt\n`. ChangedPaths returns respectively no paths or notes.txt then untracked.txt. For the same tree, status and paths must be identical before, during and after a warning. Repo.Run retains stderr separately and reports nonzero status for a Git command failure; Repo.OK and ChangedPaths return errors for that failure, never a clean result. Retain helper stdout-only behavior.

Use isolated temporary repositories, HOME/XDG settings, configuration and attributes fixtures. A self-referential attributes symlink outside the worktree, configured as core.attributesFile, produces a real Git access warning even under privileged test users; verify the warning actually occurred. Do not depend on chmod denial under root, fake Git output or changes to host files. Keep useful existing tests. Regression tests must detect the historical successful-command combined-output implementation, as well as an implementation that silently treats failed status commands as clean. No new option, limit, timeout or retry, production abstraction or dependency is requested. Supported targets remain macOS Apple Silicon and Linux x86-64 glibc.

## Decisions
- Deliver coordinator regression coverage, preserving already-correct production behavior unless the fixture demonstrates a defect. (source: answer 1)
- Init, readiness, build/review and verify belong to other repositories after the 2 Nov split; any changes there are follow-up items, not this delivery. (source: request)
- No new user-facing configuration or behavior beyond diagnostic-independent status and truthful failures. (source: request)

## Source comparison
- Addressed: original K-GIT-WARNING-DIRTY need for clean/changed status, cleanliness and before/after comparisons independent of diagnostic text maps to the outcome prose and acceptance's clean/changed warning-off/on/off observations. The original changed-tree example ` M notes.txt\n?? untracked.txt\n` is retained exactly in executable acceptance.
- Addressed: real failure must not read as clean maps to Run status/diagnostic and OK/ChangedPaths error checks in acceptance and git regression tests.
- Addressed with portable equivalent: original Studio Mac report at kogen 5d93641, 30 Oct 05:45Z, fresh GOCACHE and `go test -count=1 ./...` in cli, reported `warning: unable to access '/opt/homebrew/etc/gitattributes': Permission denied`. The 05:55Z /usr/bin/git run passed. The warning/no-warning mismatch including readiness_test.go:391 is represented by off/on/off comparisons for both trees. The host path, user kogen-runner and logs ~/logs/xprot-20261030T0545Z/test.out and ~/logs/xprot-20261030T0555Z/test.out are historical evidence, not test dependencies; the portable fixture emits the same access-warning class with a symlink-loop reason rather than requiring that host or permission arrangement.
- Superseded scope: original init_test.go:678/:731, readiness_test.go:73/:391, verify_test.go:68 and TestDisposableSelfRepositoriesLeaveSourceHeadIndexAndEditsUntouched failures were in four packages plus init cases before the split. Request's 2 Nov ownership update and answer 1 limit implementation to coordinator git/project/durable; no cross-repository init/readiness/verify test edits are included.
- Addressed: answer 1's coverage-only settlement maps to focused Git regression tests and independent acceptance; no unnecessary production rewrite. No requested behavior is intentionally omitted within coordinator ownership.

## Tests
- Successful Git warnings cannot dirty a clean tree or contaminate changed-tree porcelain/path output: add real attributes-warning cases to git/git_test.go using temporary fixtures and the acceptance observation scenario (regression)
- Warning presence may change while repository state does not, without changing status/path comparisons: test clean and changed off/on/off observations in the same regression coverage and acceptance (regression)
- Actual Git failure remains a failure rather than a clean status: retain existing CommandError assertions and add failed status/ChangedPaths observations outside a repository (regression)
- Git helpers continue to return only stdout on success: exercise the existing helper with the warning fixture in the focused Git tests (integration)

## Feasibility
- Targeted local probes showed directory and non-directory attributes paths did not produce the needed warning; a self-referential attributes symlink did, with Git exit 0 and `warning: unable to access '<temporary path>/attrs': Too many levels of symbolic links`. These observations selected the portable fixture; they do not prove macOS execution.
- Documentation discovery for Git core.attributesFile and status porcelain returned unreachable with no sources; no documentation body or authoritative lookup success is claimed. Local real-Git fixture evidence supplies the needed capability check.
- evidence: {"id":"observer","kind":"observer","inputs":["features/steps/git_warning.js","features/steps/git_warning_probe.go"],"observers":["features/steps/git_warning.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/git_warning.js good","exit":0,"output":"accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/git_warning.js bad","exit":1,"output":"rejected\n"}]}
