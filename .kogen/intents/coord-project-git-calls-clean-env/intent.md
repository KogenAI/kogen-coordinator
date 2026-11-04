# Run project git calls through the repository layer

Slug: coord-project-git-calls-clean-env
Model: not applicable — each git call is a stateless subprocess whose environment and binary are fixed per call
Acceptance:
- .kogen/intents/coord-project-git-calls-clean-env/acceptance.feature
- features/steps/coord-project-git-calls-clean-env__git.js

Every git invocation in the `project` package goes through one unexported helper that runs git the way the repository layer (`git` package) does: the git binary resolved from the base environment's PATH (`Repo.gitBinary`) and the cleaned environment (`git.CleanEnv`, which removes GIT_DIR, GIT_INDEX_FILE, GIT_WORK_TREE and the other location variables). The helper is the repository layer's own runner for the target root with the process environment, `repogit.New(root, nil)` (not read-only, so arguments stay exactly as today); it is not a second copy of the resolution or cleaning logic.

Today `project.Protected` (project/baseline.go) runs `exec.Command("git", "ls-files", "-z", "--cached", "--others", "--exclude-standard")` with a bare `git` and the inherited environment, so a GIT_INDEX_FILE or GIT_DIR exported by a hook or wrapper silently changes the protected list and with it `project.Baseline` and the approval hash. `gitUserName` (project/intent.go) runs a bare `git config --get user.name` with `CleanEnv(os.Environ())` but its own binary resolution. Both are replaced by calls through the helper, as is the existing `repogit.New(i.Root, nil).Ignored(...)` call, so that no `os/exec` git invocation remains in the `project` package (the `ps` call in facts.go is not git and stays).

Unchanged: the arguments of each git call (`ls-files -z --cached --others --exclude-standard`, `config --get user.name`, `check-ignore --no-index -z --stdin`), the call order inside CheckIntent, the matching, sorting and diagnostics of `Protected`, `Protected` still returning an error when `git ls-files` fails (for example outside a repository; the error wording may now be the repository layer's `CommandError` text), an unset or unreadable user.name still yielding "" (no name rule), and every result in a normal environment, including the recorded approval hashes in project/testdata/parity.json and the other goldens. No public API is added or changed.

## Decisions
- The protected listing and the user-name lookup ignore inherited location variables: with GIT_INDEX_FILE (an empty index or a zero-byte file) or GIT_DIR (another repository) exported, the protected listing of a repository with tracked `a.txt` and `protect: [a.txt]` is still `a.txt`, and the user-name lookup returns the target repository's `user.name`, not the other repository's "Other". (source: request)
- The git binary is the one first on the base environment's PATH, the same one the repository layer executes; a recording `git` placed first on PATH logs the protected listing, the repository layer's discovery and the user-name lookup. (source: request)
- With a clean environment the listing and the name are byte-identical to today's. (source: request)

## Source comparison
- Addressed: Need "one helper ... resolves the git binary the same way the repository layer does and passes the cleaned environment" maps to the `repogit.New(root, nil)` helper used by Protected, gitUserName and the existing Ignored call; the bare `exec.Command("git", ...)` calls in project/baseline.go and project/intent.go are removed.
- Addressed: synthetic GIT_INDEX_FILE-empty-index example maps to the protected-listing outline rows "GIT_INDEX_FILE set to an empty index" and "GIT_INDEX_FILE set to a zero-byte file" (expected `a.txt`). The fixture's `a.txt` is tracked by force-add over a `.gitignore` that matches it, so only the target's own index lists it; without that, a redirected index would still report it as untracked and the example would not tell the fix from today's code (probe: today the empty index yields `[]` and the zero-byte file `git ls-files failed: exit status 128: fatal: ...: index file smaller than expected`).
- Addressed: synthetic GIT_DIR example maps to the rows "GIT_DIR set to the other repository" and "GIT_DIR and GIT_INDEX_FILE set to the other repository" (expected `a.txt` from the target root; today `[]`).
- Addressed: synthetic user-name example (other repository's `user.name` "Other") maps to the title outline through `project.CheckIntent`, the public entry point of the lookup: with GIT_DIR at the other repository, "Pat Owner adds retry" is refused naming "Pat Owner" and "Other adds retry" is accepted. This already holds today (gitUserName cleans the environment) and is pinned so the helper keeps it.
- Addressed: synthetic fake-git example maps to the recording-git outline: the log lists exactly `ls-files -z --cached --others --exclude-standard`, `rev-parse --show-toplevel` (the repository layer's `git.Open`), `config --get user.name` and `check-ignore --no-index -z --stdin`, each with GIT_DIR and GIT_INDEX_FILE absent, both with a clean environment and with both variables exported.
- Addressed: synthetic clean-environment equality maps to the "a clean environment" rows and to the existing Protected, Baseline, contract and parity golden tests, which must pass unchanged.
- Omitted: nothing requested. No setting, public function or new error shape is added.

## Tests
- The protected listing ignores inherited GIT_INDEX_FILE and GIT_DIR: add a project package test that sets them with t.Setenv (empty index, zero-byte file, other repository) on a repository with force-added tracked a.txt matched by .gitignore and asserts Protected returns [a.txt] (regression)
- The user-name lookup reads the target repository with GIT_DIR at another repository whose user.name is Other: add a CheckIntent test asserting the target name is used for the title rule (integration)
- Project-level git calls execute the same git as the repository layer and receive the cleaned environment: add a test with a recording git first on PATH asserting Protected, CheckIntent and git.Open all run it without GIT_DIR or GIT_INDEX_FILE (integration)
- Clean-environment listing, name and approval hashes are unchanged: existing Protected, Baseline, CheckIntent title, contract approval and parity golden tests pass unchanged (existing)

## Feasibility
- Today's Protected under a valid empty GIT_INDEX_FILE returns [] and under GIT_DIR of another repository returns [] for the force-added a.txt fixture, while a clean environment returns [a.txt]; the user-name lookup already ignores GIT_DIR; a recording git first on PATH logs the four expected calls. (scratch probe in /tmp, exit 0)
- evidence: {"id":"fixture-observer","kind":"observer","inputs":["features/steps/coord-project-git-calls-clean-env__git.js"],"observers":["features/steps/coord-project-git-calls-clean-env__git.js"],"checks":[{"name":"good","command":"NODE_PATH=\"$KOGEN_CUCUMBER\" \"$KOGEN_NODE\" features/steps/coord-project-git-calls-clean-env__git.js good","exit":0,"output":"match\n"},{"name":"bad","command":"NODE_PATH=\"$KOGEN_CUCUMBER\" \"$KOGEN_NODE\" features/steps/coord-project-git-calls-clean-env__git.js bad","exit":1,"output":"mismatch\n"}]}
