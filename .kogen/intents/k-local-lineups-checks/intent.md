# Read host-local lineups and checks

Slug: k-local-lineups-checks
Model: not applicable — LoadConfig overlays files read once per call; it keeps no state between calls
Acceptance:
- .kogen/intents/k-local-lineups-checks/acceptance.feature
- features/steps/k-local-lineups-checks__load.js

`project.LoadConfig(root)` reads host-local role lineups from `.kogen/local/models.yaml` (the existing `project.LocalModelsPath`) and host-local check commands from the new `.kogen/local/checks.yaml` (new exported constant `project.LocalChecksPath = ".kogen/local/checks.yaml"`). It applies them over the committed `.kogen/project.yaml`. Every consumer that loads the project configuration through `LoadConfig` gets the host's values with no commit under the Build. kogen-build `build/build.go` calls `project.LoadConfig(repo.Dir)` before its HEAD read and before any model call, and kogen-shaping and kogen-review do the same. Without those files, `LoadConfig` returns exactly what it returns today. `.kogen/local/` is ignored by Kogen-initialized repositories (`.gitignore` holds `.kogen/local/`), so these files are never committed and never part of a candidate tree or a Build's change.

This replaces the README statement that existing configuration APIs use only the models in `.kogen/project.yaml`, and the contract README's "Legacy configuration remains independent of these files". `ParseConfig`, `ReadableConfig`, `LoadModels`, `ModelsTemplate`, `RenderConfig`, `Baseline`, `Hash` and `Protected` are unchanged. `LoadConfig` still does not read the team file `.kogen/models.yaml`. The local files are not added to the approval baseline, so changing them never changes an approval hash. Neither the committed configuration nor either local file is ever written.

Rules of `LoadConfig(root)`:
1. Read and validate `.kogen/project.yaml` exactly as today: same `not_initialized`, `old_kogen_config` and `project_config_invalid` errors, and they are reported first.
2. Read `.kogen/local/models.yaml` if it exists. Use the schema and validation `LoadModels` applies to its local file today: a root mapping whose only key is `models` (required); `models` is a mapping of the roles `shape`, `build` and `review`; `plan` is an unknown key; role rules are those of `project.yaml`, including executor, provider, base_url and effort checks and the rejection of `max_rounds`. Each role the file names replaces the whole committed role (for example a committed `{provider: chatgpt, model: gpt-6.1-sol, effort: low}` replaced by `{executor: claude-code, model: claude-opus-5-5, effort: high}` has an empty Provider). A role it does not name keeps the committed role, or the default.
3. Read `.kogen/local/checks.yaml` if it exists. It is a root mapping whose only key is `checks` (required): a list of `{name, run}` mappings, both strings. Each entry's `run` replaces the `Run` of the committed check with that name. `Config.Checks` keeps the committed names in the committed order, whatever the local order. A committed check the file does not name keeps its committed command, and `checks: []` changes nothing. Setup, fix, acceptance and protect are never overridden.
4. A local file that does not exist is skipped. A read error other than not-exist is `environment/project_config_invalid` (exit 3) with detail `read <root>/<path>: <error>`.
5. A malformed local file fails the load: `*sys.Error` `environment/project_config_invalid`, exit 3, Detail `filepath.Join(root, <path>)` (the same absolute form `LoadConfig` uses for `.kogen/project.yaml`) and one `line N: <message>` line per problem, sorted as today. The first failing file, in the order project.yaml, local models, local checks, is the only one reported, and no Config is returned. The Build therefore stops before any model call, before it computes a candidate and with no commit. The `checks.yaml` messages are: YAML reader errors as for `project.yaml` (for example `line 3: unclosed [`), `the file must be a mapping`, `unknown key <key>` (at the root or inside an entry), `checks is required` (line of the root mapping), `checks must be a list`, `a check must be {name, run}`, `a check needs a name and a run string`, `check name <name> is not in .kogen/project.yaml` and `check name <name> is used twice`. For an entry problem, the line is that of the entry's `-`.

With both files present, a Build starts on main's own commit with a clean checkout. `git.Repo.Tree(start, nil)` leaves out the ignored `.kogen/local/` files, and `git.Repo.Commit` lands a commit whose parent is exactly that start commit and whose `.kogen/project.yaml` is byte-identical to main's. Both behaviours already exist and must stay.

Update README.md (the "Opt-in model lineup API" section, plus a short section on host-local lineups and checks with the two paths, the whole-role and per-name rules, the unchanged names and order, the error shape and the approval-baseline exclusion) and contract/README.md (`models-lineup` and a new `config-local-overlay` item). Add no dependency: go.mod and go.sum stay unchanged. No CLI command or flag is involved.

## Decisions
- The overlay lives in `project.LoadConfig`, the call every Build, Shape and Review already makes at the checkout root, so the requested behaviour reaches consumers through adoption alone without CLI or consumer code changes (source: request).
- The host-local check file is `.kogen/local/checks.yaml` with a root `checks:` list of `{name, run}`; it can only replace the command of a committed check by name and never adds, removes, renames or reorders checks (source: request).
- A local lineup role replaces the whole committed role, like LoadModels' local override (source: request).
- A local file that names an unknown check, or is otherwise malformed, fails the load with its absolute path and line; the committed configuration's own errors are reported before the local files (source: request).
- Without local files nothing changes, and no file is ever written (source: request).

## Source comparison
- Addressed: "reads host-local role lineups from .kogen/local/models.yaml". Rule 2 applies them in LoadConfig, reusing the existing LocalModelsPath and the LoadModels schema (Evidence: "LocalModelsPath ... LoadModels, but no caller uses them"). Scenarios: lineup replaces roles, Build.
- Addressed: "host-local check commands from a file under .kogen/local/" is `.kogen/local/checks.yaml` (rule 3). "names and order stay the committed ones" and "replaces the committed check commands for that run only" mean the per-name Run replacement in committed order. "project.yaml is never edited" is checked by bytes and git status in scenarios.
- Addressed: "Build runs on main's own commit with nothing committed under it; result's parent is exactly that main commit". The Build scenario loads the effective config, builds the candidate with git.Repo.Tree and lands with git.Repo.Commit on a fixture whose only commit is main. The real Build driver is kogen-build (outside this repository); its `build.go` loads LoadConfig(repo.Dir) and then reads HEAD. Inspected in the module cache at kogen-build v0.0.0-20261103154529-b9990a3d0903.
- Addressed: "Without those files, behaviour is unchanged". Scenario without local files; existing TestConfigPathAndLoad (LoadConfig equals ParseConfig).
- Addressed: "malformed local file stops the Build before any model call and names the file and line". Rule 5; scenarios for the models file (the host's own `max_rounds: 6`, line 6) and the checks file. In the Build scenario no commit lands. Model calls happen only in consumers, after LoadConfig succeeds.
- Addressed: ".kogen/local/ is never committed and never part of the change". The landed commit's exact file list excludes it, given the `.gitignore` entry Kogen projects keep.
- Out of scope, preserved: CLI commands and flags; kogen cli/go.mod and go.sum (pins move by adoption); this module's go.mod and go.sum are also unchanged. The checkout's existing commit "Local lineup override (not for push)" is host state, not part of this change.
- Consumer note: kogen-verification compares a pass's check names and commands with cfg.Checks from the same LoadConfig, so local commands are compared consistently.
- Probe: the line numbers of the existing YAML reader and validator (an entry's `-` line, `line N: unclosed [`, root-mapping line 1) were observed by running ParseConfig and LoadModels in a scratch program.

## Tests
- A local lineup replaces each named role as a whole and leaves others committed: add a LoadConfig integration test in project/config_test.go and a contract case in contract/config_test.go (integration).
- A local check list replaces commands by committed name, keeping committed names and order, and keeps unnamed committed commands: add LoadConfig integration tests in project/config_test.go and the contract case (integration).
- Without local files LoadConfig is unchanged: existing TestConfigPathAndLoad and the project LoadConfig tests (existing).
- Malformed local models file fails with its absolute path and line (max_rounds, unknown role, YAML error): table test in project/config_test.go (integration).
- Malformed local checks file fails with each listed message and line: table test in project/config_test.go (integration).
- Committed configuration errors are reported before local files: integration test in project/config_test.go (integration).
- Neither the committed nor the local files are written: assert file bytes in the integration tests above (integration).
- LocalChecksPath is `.kogen/local/checks.yaml` and local files stay outside the approval baseline: extend contract/models_test.go TestModelsBaselineHash with the checks file (integration).
- A Build with host-local files starts on main's commit and lands a commit whose parent is main, without .kogen/local: acceptance scenario, plus the existing contract commit test (scenario).

## Feasibility
- none
