# Pin hook commands defined in Git configuration

Slug: coord-pin-config-hook-commands
Model: not applicable — a fixed classification of configuration keys inside an existing digest comparison; no workflow state or interacting rules change
Acceptance:
- .kogen/intents/coord-pin-config-hook-commands/acceptance.feature
- features/steps/coord-pin-config-hook-commands__pin.js

The Git execution pin (`git.Repo.TakePin` and `git.Pin.Changes` in `git/pin.go`) starts treating every `hook.<name>.command` configuration key, whatever `<name>` is, as a key that selects an executable. Newer Git defines hooks in configuration as `hook.<name>.command` with a matching `hook.<name>.event`, and `git hook run` (which Kogen uses for the user's commit-msg hook) executes them. Today the `hook` section is not in the pin's list, so a run can add or change such a hook without the pin noticing.

Behavior after the change:

- A key whose lower-cased section is `hook` and whose last variable is `command` is pinned exactly like the existing executable selectors. For each value Git lists, `digest(scope, value)` is recorded under the key. Scope and value are digested and the value is never kept. `<name>` is Git's subsection, everything between the first and the last dot, so it may contain dots: `hook.a.b.command` is covered. Git reports the key with the section and variable lower-cased and the subsection as written.
- Records of the `command` scope (`GIT_CONFIG_COUNT`/`GIT_CONFIG_KEY_n`/`GIT_CONFIG_PARAMETERS`, `git -c`) stay ignored, as for every other key. Every other scope (local, global, system, worktree, included files) counts, in both pin views (Kogen's environment and Git's default locations).
- Adding, removing, or changing the value or scope of such a key makes `Changes` report the key. It is one entry in the same sorted, de-duplicated list that reports a changed `core.hooksPath`, spelled as Git lists it, e.g. `hook.lint.command` or `hook.a.b.command`. `command` needs no `canonicalVars` entry because it is already Git's documented spelling. No value appears in the result.
- `hook.<name>.event`, `hook.<name>.enabled` and any other `hook` section variable are not pinned. Changing only those changes nothing unless an existing rule would already report it.
- Collecting and comparing the pin still runs only `git config --list --show-scope -z` and `git rev-parse --git-path hooks`. It never runs a hook or a configured command.
- Everything else stays as it is: the hooks directory pinning, every existing key and section, digest framing, both views, error handling, and the exported API (`TakePin`, `Changes`, no new exported names).

Implementation: add `"hook": {"command"}` to `executableVars` in `git/pin.go`, and update the `Pin` comment if it lists what is pinned. The existing pin tests in `git/pin_test.go` and `contract/git_pin_test.go` keep their names and keep passing. They are `TestPinHooksDirectory`, `TestPinEffectiveHooksDirectory`, `TestPinExecutableConfiguration`, `TestPinConditionalIncludeThroughSymlinkedCheckout`, `TestPinReadsDefaultConfigurationLocations`, `TestPinRunsNothing`, `TestPinUnreadableIsAnError` and `TestPinNamesWhatChanged`. Out of scope: other hook-section variables, how consumers render the list, goldens.

## Decisions
- Every `hook.<name>.command` key, for any name including dotted names, is program-selecting, with the same digest-only handling (scope and value digested, value never kept) (source: request)
- A change, addition or removal in any scope except the already-ignored command-line scope is reported through `Pin.Changes`, the path a changed `core.hooksPath` takes, naming the key as `hook.<name>.command` (source: request)
- `hook.<name>.event` and `hook.<name>.enabled` alone change nothing beyond today's rules (source: request)
- Nothing is executed to compute the pin (source: request)

## Source comparison
- Addressed: Need "every `hook.<name>.command` key ... program-selecting". The `executableVars` entry is decided above. Scenarios cover `hook.lint.command` and `hook.a.b.command`.
- Addressed: synthetic acceptance "no `hook.*` keys, pin taken, then `git config hook.lint.command ./x` added: reports `hook.lint.command`". Feature scenario "Adding a configuration-defined hook command is reported" checks the exact list `hook.lint.command`.
- Addressed: "same key with a different value later: reported again". The scenario starts with `./x`, then runs `git config hook.lint.command ./lint-secret-value`, and checks the exact list and that the value is not retained.
- Addressed: "key removed: reported". `git config --unset hook.lint.command` gives exactly `hook.lint.command`.
- Addressed: "`hook.lint.event` added alone: unchanged". A scenario adds `git config hook.lint.event pre-commit` and expects no change. Also covered from the Need: `hook.lint.enabled false` alone gives no change.
- Addressed: "`hook.a.b.command` covered". `git config hook.a.b.command ./x` gives exactly `hook.a.b.command`.
- Addressed: "two repositories differing only in hook values give different digests; digest text does not contain the value". The pins of two repositories that share one hooks directory and differ only in `hook.lint.command` (`./lint-secret-one`/`./lint-secret-two`) compare as exactly `hook.lint.command`. No string the pins retain (all fields walked by reflection) contains either value. The control with equal values compares as no change.
- Addressed: "in any scope except the command-line scope". A global-scope addition (`git config --global`, into the fixture's `GIT_CONFIG_GLOBAL` file) is reported. A command-scope `GIT_CONFIG_KEY_0=hook.lint.command` is not.
- Addressed: "nothing is executed". A scenario configures a recording script as `hook.lint.command` with event `pre-commit` and checks that it did not run.
- Addressed: "existing pin fixtures (hooks directory files, `core.hooksPath`, aliases) give unchanged results". A scenario runs the eight existing `TestPin*` tests by name. An outline checks `alias.audit` and `core.sshCommand` through the driver, and that `user.name` stays unpinned.
- Omitted: nothing requested.

## Tests
- A `hook.<name>.command` key (also a dotted name) added, changed or removed, in local or global scope, is reported by key without its value: add `hook.lint.command` and `hook.a.b.command` to the `keys` list of `TestPinExecutableConfiguration` in `git/pin_test.go`, plus the acceptance scenarios through `TakePin`/`Changes` in a Go driver (integration)
- `hook.<name>.event` and `hook.<name>.enabled` alone are not pinned: add a subtest to `TestPinExecutableConfiguration` that sets both and expects no change, plus the acceptance scenarios (integration)
- Command-scope `hook.<name>.command` stays ignored: acceptance scenario with `GIT_CONFIG_COUNT`/`GIT_CONFIG_KEY_0` (integration)
- Pins of two repositories that differ only in hook command values differ, and the pins retain no value: acceptance scenario with a reflective walk of the pins (integration)
- Taking and comparing the pin runs no configuration-defined hook: add a `hook.audit.command` entry to `TestPinRunsNothing` (adjusting its expected change count) and the recording-script acceptance scenario (integration)
- Existing hooks directory, `core.hooksPath`, alias and other selector results are unchanged: the existing `TestPin*` tests in `git` and `contract`, run by acceptance (existing)

## Feasibility
- A Go driver built from the repository root takes pins through `git.New(dir, env).TakePin()` and compares them with `Changes`. Reflection reads every string the pins retain, unexported fields included. On the unchanged tree, comparing around `git config hook.a.b.command ./x` reported `[]`, which is the missing-feature red. Command-scope configuration through `GIT_CONFIG_COUNT` reported nothing, and a `--global` `core.pager` addition reported `core.pager`. (probe: exit 0)
- `go test -count=1 -v -run '^TestPin' ./git ./contract` prints `--- PASS: <name> (<time>)` lines for the seven `git` tests and `TestPinNamesWhatChanged`, and exits 0 on the unchanged tree. (probe: exit 0, about 8 s)
- In the observer control, the bad fixture's list check passes and the value-retention check rejects it. (probe: "the pins retain \"hooks-secret\"")
- evidence: {"id":"pin-observer","kind":"observer","inputs":["features/steps/coord-pin-config-hook-commands__pin.js"],"observers":["features/steps/coord-pin-config-hook-commands__pin.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/coord-pin-config-hook-commands__pin.js good","exit":0,"output":"match\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/coord-pin-config-hook-commands__pin.js bad","exit":1,"output":"mismatch\n"}]}
