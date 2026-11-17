# Judge aliased commands in the Git runner guard

Slug: coord-git-guard-judges-aliased-commands
Model: not applicable — a pure decision of whether one Git call is allowed, with no state kept between calls
Acceptance:
- .kogen/intents/coord-git-guard-judges-aliased-commands/acceptance.feature
- features/steps/coord-git-guard-judges-aliased-commands__guard.js

The runner of kogen-coordinator's `git` package (`Repo.Run`, `RunEnv`, `OK`, `OKEnv`) promises never to push, fetch, rebase, merge, amend, stash or switch branches (GIT-7). Its guard checks `forbidden[subcommand(args)]`, only the literal first command word, so the same commands pass under another spelling. This Intent makes the guard judge the command Git would actually run.

Required behavior (all in `git/git.go`, the package comment and the guard):
1. `subcommand` skips the separate value of every global option that takes one in the installed Git's `git --help` list: `--config-env NAME=ENVVAR` and `--super-prefix PATH`, besides `-c`, `-C`, `--git-dir`, `--work-tree` and `--namespace`. `--exec-path` takes a value only as `--exec-path=value` (one word), so it is skipped like any other option word.
2. A call whose first command word is not a forbidden command and not a Git built-in is looked up as an alias. The alias value comes from the `-c alias.NAME=VALUE` and `--config-env alias.NAME=ENVVAR` options of the same call (ENVVAR read from the environment the call runs with; the last definition of a name wins) and otherwise from the repository's configuration, read by one `git config --get alias.NAME` through the unguarded internal runner. The first command word of the expansion (found the way `subcommand` finds it) is judged again, up to 5 alias expansions deep: if the word reached after 5 expansions is still an alias, the call is refused. An alias value starting with `!` is refused whatever it runs. A name that Git implements itself is never an alias (Git ignores an alias that shadows a built-in), and then no `git config` call is made. Built-ins are those Git lists (`git --list-cmds=builtins`).
3. `symbolic-ref`, `restore`, `clean`, `worktree` and `remote` join the forbidden list. The error stays `ErrForbidden` with the text `git command not allowed: git NAME`, NAME being the forbidden command Git would run (for example `reset` for an alias that expands to `reset --hard`); for a shell alias or a too deep chain NAME is the called name. The package comment names these additional commands too.

Unchanged: the commands the package runs itself through `ok`/`exec`, `Repo.Commit` and its undo, the read-only observation options, environment cleaning (`CleanEnv`), all exported names and signatures. An unusual spelling of an allowed command (`-c core.quotepath=off status --porcelain`) still runs, as do `rev-parse --show-toplevel` and `log -1 --format=%s`.

## Decisions
- Acceptance drives Repo.Run and Repo.OK through a Go driver built from the repository root, so it names no Go test the Build must invent; the Build adds the six named tests to git/git_test.go using newFixture(t) (evidence: git/git_test.go; git/helper_test.go) (assumption: the scratch observer control ran outside the checkout; the full cucumber scenarios were not run by this shaping) (source: request)
- Alias depth: up to 5 expansions are followed; a chain of 5 aliases ending in a built-in runs, a chain needing a sixth expansion is refused naming the called name (evidence: git/git.go) (assumption: the request's up to 5 levels deep is read as 5 expansions) (source: request)
- A shell alias or too deep chain is refused naming the called alias name (evidence: git/git.go) (assumption: the request does not fix the NAME for these cases) (source: request)
- Built-ins are known from git --list-cmds=builtins, not a hand list (evidence: git/git.go) (assumption: that listing exists on the installed Git; a scratch run on Git 2.54.0 listed 147 built-ins including status, push, remote) (source: request)

## Source comparison
- Addressed: value-taking options --config-env and --super-prefix (scenario 1); aliases from -c, repository configuration, shell and push-resolving (scenarios 2, 3), depth (scenario 5), shadowed built-in (scenario 4), five new forbidden commands (scenario 6), ordinary calls (scenario 7).
- Request literals, kept byte for byte: `git --config-env alias.p=ENVNAME push` (the old `subcommand` returns `alias.p=ENVNAME`); `git --config-env alias.q=Q status` answers `fatal: missing environment variable 'Q' for configuration 'alias.q'`; `git -c alias.p="reset --hard" p -q` resets the work tree; `Repo.Run("-c", "alias.p=reset --hard", "p")`; plain spellings already tested: `-c user.name=x commit` and `-C . push`.
- Request test calls: `Run("--config-env", "alias.p=NAMEDVAR", "push")`, `Run("--super-prefix", "x/", "reset", "--hard")`, `Run("-c", "alias.p=reset --hard", "p")`, `git config alias.p "push origin"`, `git config alias.s "!echo ran > shell-ran.txt"` with `Run("s")`, `git config alias.status "push"` with `OK("status", "--porcelain")`, `Run("symbolic-ref", "HEAD", "refs/heads/x")`, `Run("restore", "--", "README.md")`, `Run("clean", "-fd")`, `Run("worktree", "add", "../w")`, `Run("remote", "add", "o", "u")`, and the ordinary calls `-c core.quotepath=off status --porcelain`, `rev-parse --show-toplevel`, `log -1 --format=%s`.
- Omitted: nothing requested.

## Tests
- Forbidden command after --config-env or --super-prefix is refused: TestRunnerRefusesForbiddenCommandAfterValueTakingOption in git/git_test.go plus the acceptance scenario (unit)
- Alias of a forbidden command is refused from -c and from repository configuration: TestRunnerRefusesAliasOfForbiddenCommand in git/git_test.go plus the acceptance scenarios (unit)
- Shell alias is refused: TestRunnerRefusesShellAlias in git/git_test.go plus the acceptance scenario (unit)
- Alias shadowing a built-in is let through: TestRunnerLetsAliasShadowingABuiltinThrough in git/git_test.go plus the acceptance scenario (unit)
- The five added commands are refused: TestRunnerRefusesMovingHeadCommands in git/git_test.go plus the acceptance scenario (unit)
- Ordinary calls keep working: TestRunnerKeepsOrdinaryCallsWorking in git/git_test.go plus the acceptance scenario (unit)
- Plain spellings stay refused: TestRunnerRefusesRewritingAndSharingCommands (existing)

## Feasibility
- The step file builds a Go driver and makes several assertions, so its observer control runs the same driver and checks on two outcomes the feature leaves unchanged: a plain push refusal and an ordinary log call. good pairs each with its true outcome, bad with a wrong one. (probe: good exit 0, bad exit 1, about 1 s)
- evidence: {"id":"guard-observer","kind":"observer","inputs":["features/steps/coord-git-guard-judges-aliased-commands__guard.js"],"observers":["features/steps/coord-git-guard-judges-aliased-commands__guard.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/coord-git-guard-judges-aliased-commands__guard.js good","exit":0,"output":"plain: match\nordinary: match\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/coord-git-guard-judges-aliased-commands__guard.js bad","exit":1,"output":"plain: mismatch\nordinary: mismatch\n"}]}
