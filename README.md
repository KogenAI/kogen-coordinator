# kogen-coordinator

Kogen's coordinator: the outer workflow's authority over a target repository.

It is a component of [Kogen](https://github.com/KogenAI/kogen), which pins an exact version of it and assembles the `kogen` program.

## Packages

- `project`: what Kogen keeps about a project: `.kogen/project.yaml` (commands, checks, protect patterns), the model lineup files `.kogen/models.yaml` and `.kogen/local/models.yaml`, Intents (`intent.md`, `acceptance.feature`, stages), the approval baseline and its hash, and Shape provenance receipts.
- `git`: Kogen's window on Git: repository discovery, the target-repository commit, locks, execution pins, candidate trees, diffs and the index.
- `durable`: the one place Kogen flushes a file to stable storage.
- `route`: the outer routing of a Build's candidate through its phases (verify, independent review with its repairs, the implementer's repair of a red candidate, commit) and the resume of a Build stopped at one of those steps. The phases are reached through narrow interfaces (`route.Steps`); each keeps its own policies and state.
- `contract`: the contract suite: what kogen-coordinator's consumers (kogen, kogen-executor, kogen-verification, kogen-shaping, kogen-review, kogen-build) use, pinned in tests that run in `go test ./...`: the exported API they call, the behaviours they rely on and the file and wire formats they read or write. An intended interface change edits it together with paired consumer items. See [contract/](contract/).

- `consumes/kogen-loop`: the coordinator’s consumer contract for its pinned kogen-loop dependency; see the [suite and use inventory](consumes/kogen-loop/README.md).

## Opt-in model lineup API

Model roles live only in the models files: the team file `.kogen/models.yaml`
(`project.ModelsPath`) and the host-local `.kogen/local/models.yaml` (`project.LocalModelsPath`).
`.kogen/project.yaml` no longer accepts a `models:` key: `ParseConfig`, `LoadConfig` and
`ReadableConfig`'s validation refuse it as `environment/project_config_invalid` (exit 3) with the
file and `line N: models is no longer read from .kogen/project.yaml; move the model lineup to
.kogen/models.yaml`, and there is no legacy read or migration. `ReadableConfig` returns the other
keys it could read and `DefaultModels()` for the roles. `project.LoadConfig` takes every role from
the files, later winning per whole role: `project.DefaultModels()`, then `.kogen/models.yaml` when
it exists, then `.kogen/local/models.yaml` when it exists, as described under
[Host-local lineups and checks](#host-local-lineups-and-checks). `RenderConfig` and
`project.Template()` write no `models:` block, whatever `Config.Models` holds.
Consumers may call `project.LoadModels(root)` to read the required team lineup at
`project.ModelsPath` (`.kogen/models.yaml`) and the optional machine override at
`project.LocalModelsPath` (`.kogen/local/models.yaml`). Both files contain only a root `models:`
mapping of shape, build and review roles using the existing role validation. Missing team roles
use `project.DefaultModels()`; a local role replaces the entire team role. The returned
`ModelLineup.Roles` holds the effective selections and `Sources` names the repository-relative
source of each role, including defaults. Invalid files report configuration errors with file and
line diagnostics; neither file is written by the loader. `project.ModelsTemplate()` returns a
team file with the defaults in `ModelRoles` order.

The approval baseline includes the team path immediately after the project configuration only
when the project has the team file (or a `protect` pattern lists it); a project without it gets
the baseline it had before the lineup existed. The local path is never added by this rule and is
not automatically protected; explicit `protect` patterns continue to apply. Thus local-only
changes do not affect the ordinary approval hash, while adding or changing the team file does.

## Host-local lineups and checks

`project.LoadConfig(root)` reads the model lineup from the team file `.kogen/models.yaml` and the
host-local `.kogen/local/models.yaml` (`project.LocalModelsPath`), and applies the check commands of
the host-local `.kogen/local/checks.yaml` (`project.LocalChecksPath`) over the committed
`.kogen/project.yaml`. Every consumer
that loads the configuration through `LoadConfig` (Build, Shape and Review at the checkout root)
gets the host's values with no commit. `.kogen/local/` is ignored by Kogen-initialized
repositories, so the files are never committed or part of a candidate tree. Without the local
files the roles are the team file's over the defaults; without the team file they are the defaults.

- Lineup: a root `models:` mapping with the schema and validation `LoadModels` applies to its files
  (roles `shape`, `build` and `review`; `plan` is unknown), the same for
  the team and the local file. Each role a file names replaces the whole role of the files before
  it, so no earlier provider survives; a role no file names keeps the default.
- Checks: a root `checks:` list of `{name, run}`. Each entry's `run` replaces the `Run` of the
  committed check with that name. `Config.Checks` keeps the committed names in the committed
  order, whatever the local order; a committed check the file does not name keeps its command,
  and `checks: []` changes nothing. A name not in `.kogen/project.yaml`, or used twice, is an
  error. Setup, fix, acceptance and protect are never overridden.
- Errors: a local file that exists but cannot be read is `environment/project_config_invalid`
  (exit 3) with detail `read <root>/<path>: <error>`. A malformed file fails the load with the same
  class and exit, the detail `<root>/<path>` and one `line N: <message>` line per problem. The
  committed file's errors come first, then the first failing of the team models file, the local
  models file and the local checks file, in that order; an unreadable team file is reported like an
  unreadable local file, with detail `read <root>/.kogen/models.yaml: <error>`; no Config is returned, so a Build stops before any model call.
- The local files are not in the approval baseline, so changing them never changes an approval
  hash. Neither they nor the committed configuration are ever written.

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
(for example `index.lock`) are not cleaned up. A process start time (the Build lock owner's
birth and the legacy owner judgment in `git/lock.go`) is not a Git command: it is read from the
operating system (the `/proc` files on Linux, `sysctl` on macOS), with `ps` as a fallback bounded
to 5 seconds, whose timeout reads `ps -p <pid> timed out after 5s`.

The seam is `git.OverrideTimeouts(command, commit)`: until the returned `restore` is called,
the bounds of every Repo in the process are the given positive durations. No setting or
configuration key changes them.

## Run records

`durable.RunStore` keeps one JSON record per run ID at `<root>/<id>.json`. `Append` and `Finish`
serialize the read, change and replace of a record per run ID across goroutines and processes
with an exclusive advisory `flock` on the lock file `<root>/<id>.lock`, next to the record. The
lock file is created when missing, never removed and not listed by `List`; the kernel drops the
lock when its holder ends in any way, so a lock file left by a dead process never blocks. Records
of different run IDs never wait for each other. `Read` takes no lock.

A call that has not obtained the lock within `durable.RunLockWait` (10 seconds) returns, without
reading or writing the record, the error `run record "<id>": lock still held after <wait>`, for
example `run record "held": lock still held after 300ms`. The seam is
`durable.OverrideRunLockWait(wait)`: until the returned `restore` is called, every `RunStore` in
the process waits at most the given positive duration. No setting or configuration key changes
the wait.

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
