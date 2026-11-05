# kogen-coordinator

Kogen's coordinator: the outer workflow's authority over a target repository.

It is a component of [Kogen](https://github.com/KogenAI/kogen), which pins an exact version of it and assembles the `kogen` program.

## Packages

- `project`: what Kogen keeps about a project: `.kogen/project.yaml` (commands, checks, roles and models, protect patterns), Intents (`intent.md`, `acceptance.feature`, stages), the approval baseline and its hash, and Shape provenance receipts.
- `git`: Kogen's window on Git: repository discovery, the target-repository commit, locks, execution pins, candidate trees, diffs and the index.
- `durable`: the one place Kogen flushes a file to stable storage.
- `route`: the outer routing of a Build's candidate through its phases (verify, independent review with its repairs, the implementer's repair of a red candidate, commit) and the resume of a Build stopped at one of those steps. The phases are reached through narrow interfaces (`route.Steps`); each keeps its own policies and state.
- `contract`: the contract suite: what kogen-coordinator's consumers (kogen, kogen-executor, kogen-verification, kogen-shaping, kogen-review, kogen-build) use, pinned in tests that run in `go test ./...`: the exported API they call, the behaviours they rely on and the file and wire formats they read or write. An intended interface change edits it together with paired consumer items. See [contract/](contract/).

- `consumes/kogen-loop`: the coordinator’s consumer contract for its pinned kogen-loop dependency; see the [suite and use inventory](consumes/kogen-loop/README.md).

## Opt-in model lineup API

Existing configuration APIs and consumers continue to use the models in `.kogen/project.yaml`.
Consumers may explicitly call `project.LoadModels(root)` to read the required team lineup at
`project.ModelsPath` (`.kogen/models.yaml`) and the optional machine override at
`project.LocalModelsPath` (`.kogen/local/models.yaml`). Both files contain only a root `models:`
mapping of shape, build and review roles using the existing role validation. Missing team roles
use `project.DefaultModels()`; a local role replaces the entire team role. The returned
`ModelLineup.Roles` holds the effective selections and `Sources` names the repository-relative
source of each role, including defaults. Invalid files report configuration errors with file and
line diagnostics; neither file is written by the loader. `project.ModelsTemplate()` returns a
team file with the defaults in `ModelRoles` order.

The former `models.<role>.max_rounds` setting is rejected in all three files. An external
executor's own round limit caps a role; when it supplies none, 6 caps a review role.
`Role.MaxRounds` remains available for consumers and is zero for loaded roles.

The former `shape_workers`, `shape_audit`, `shape_decision_check` and `review_material` settings are
ignored; `Config` holds their fixed defaults (workers off, audit off, decision check off, review
material `parts`).

The approval baseline includes the team path immediately after the project configuration, even
when the team file is absent. The local path is not automatically protected; explicit `protect`
patterns continue to apply. Thus local-only changes do not affect the ordinary approval hash,
while adding or changing the team file does.

## Git command deadlines

Every Git command the `git` package runs for a repository has a bounded wall time, so a stuck
hook, a lock held by a dead tool or a hung filesystem cannot block a Build silently.

- `git.CommandTimeout` (10 minutes) bounds every command run through the package's runner
  (`Run`, `RunEnv`, `OK`, `OKEnv` and every internal call), and each read from the
  `git cat-file --batch` blob stream (request, header and content of one blob, measured from
  its request), so a large materialization runs as long as every blob keeps arriving.
- `git.CommitTimeout` (1 hour) bounds the commands that run the user's commit hooks: the
  `git commit` of `Commit` and `CommitPaths`, and the `git hook run --ignore-missing commit-msg`
  of `CheckCommitMsg`.

Each command runs in its own process group. At its bound the whole group is killed with
SIGKILL, so Git and its children (hooks, `sleep`, ...) stop, and the caller receives a
`*git.TimeoutError` whose text is `git <first at most four arguments> timed out after <bound>`,
for example `git status --porcelain timed out after 1.5s`. The text never contains environment
values, stdout or stderr. `Run` and `RunEnv` also return `Result{Status: -1}`. A timed-out
`Commit` undoes a commit that landed anyway; `CommitPaths` unstages its paths. `Open` returns
the timeout rather than `environment/not_a_git_repo`. Lock files a killed Git leaves behind
(for example `index.lock`) are not cleaned up. The `ps` calls in `git/lock.go` and
`project/facts.go` are not Git commands and stay unbounded.

The seam is `git.OverrideTimeouts(command, commit)`: until the returned `restore` is called,
the bounds of every Repo in the process are the given positive durations. No setting or
configuration key changes them.

## Getting started

Install Go 1.27.2 or newer, as required by `go.mod`. Clone the public repository and enter it:

```sh
git clone https://github.com/KogenAI/kogen-coordinator.git
cd kogen-coordinator
```

Build, vet and run the race-enabled tests:

```sh
go build ./... && go vet ./... && go test -race -count=1 ./...
```

### Golden files

`project/testdata/golden.json`, `facts-golden.json` and `parity.json` hold recorded inputs and their recorded results, originally produced by the Elixir Kogen. Their golden tests compare the current Go output with them.

To regenerate them, run:

```sh
go test ./... -update
```

`-update` is a Go test flag, registered in `_test.go` files only; `kogen` has no such option. Use it after a deliberate change to an output a golden records, or to resolve a conflict in a golden on the combined tree. It replaces only the recorded results that no longer match with the current output: matching results and all recorded inputs stay as they are, and a golden with no drift is not written. A golden mismatch is recorded instead of failing the test; every other failure still fails it.

After it, review the golden diff (`git diff -- project/testdata`), then run `go test ./...` without the flag and the full checks above. A change to a recorded value is a deliberate, reviewed change, most of all the approval hashes in `parity.json`, the config digests and contract hashes in `facts-golden.json`, and the main-Elixir results in `golden.json`. Never edit recorded bytes or hashes by hand.

For inquiries, contact contact@kogen.dev.

## License

Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).

## Protect diagnostics

Config-check consumers can serialize the `project.LoadConfig(root)` result and read its
`ProtectDiagnostics` array. Each advisory record has `Entry`, `Severity` (`lint` or
`warning`), and `Message` JSON fields. Findings are in protect-entry order, lint before
warning. Unsupported character classes, brace alternatives, leading negation and backslash
escapes are not expanded; supported anchored forms are `**/`, `**`, `*`, and `?`, as well
as literal paths and trailing-slash folders. Exact existing literal bracket or brace files
are exempt from that syntax lint. Warnings identify entries matching no existing tracked or
untracked-not-ignored file. `project.Protected` refreshes the findings on its Config;
`project.ParseConfig` does not consult Git or the filesystem. Findings do not change protection
membership or reject the configuration.
