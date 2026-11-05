# Read lock owner birth without the ps program

Slug: coord-owner-birth-without-ps
Model: not applicable — reading a process start time is a stateless lookup with a fallback; the Build lock lifecycle and its kernel-lock state are unchanged
Acceptance:
- .kogen/intents/coord-owner-birth-without-ps/acceptance.feature
- features/steps/coord-owner-birth-without-ps__birth.js

The identity of a Build lock owner (its pid and its start time, the "birth") and the judgment of a lock left by an earlier Kogen stop depending on the `ps` program. The start time of a process is read from the operating system directly (the process table files on Linux, the `sysctl` system call on macOS); `ps` is only a fallback, and its wall time is bounded. The birth text stays byte-identical to what `ps -p <pid> -o lstart=` prints, so an owner birth recorded by an older build still matches the same live process. When neither source supplies a birth, the error names that cause and both attempts on one line.

This replaces the unbounded `ps -p <pid> -o lstart=` call in `project.Owner` (project/facts.go) and the unbounded `ps -p <pid> -o uid= -o comm= -o lstart=` call in the legacy owner judgment (`legacyHeld` in git/lock.go). It also replaces the README sentence saying those `ps` calls stay unbounded.

### New interface: `git.ProcessBirth`

`func ProcessBirth(pid int) (string, error)` in package `git` (`github.com/KogenAI/kogen-coordinator/git`) returns the start time of process `pid`. The format is Go layout `Mon Jan _2 15:04:05 2006` in `time.Local`, at whole seconds (fractions truncated). This is exactly the trimmed output of `LC_ALL=C ps -p <pid> -o lstart=`, for example `Thu Nov  5 04:11:23 2026`, with the day space-padded.

1. Operating-system source, tried first:
   - Linux: the birth is `btime` from `/proc/stat` plus field 22 (`starttime`, in clock ticks since boot) of `/proc/<pid>/stat`, divided by 100 ticks per second with the division truncated. The `stat` fields are counted after the last `)`, because the command name can contain spaces and parentheses.
   - macOS: `sysctl` with MIB `{CTL_KERN, KERN_PROC, KERN_PROC_PID, pid}` returns a `kinfo_proc`; the birth is `kp_proc.p_starttime.tv_sec`. The call goes through the standard library (`syscall.Syscall6(syscall.SYS___SYSCTL, ...)`) and adds no new module dependency. A zero-length answer means no such process.
   - Other operating systems have no OS source. That attempt fails with `no process table source on <GOOS>`.
   - The OS-specific code lives in files with build constraints (`linux`, `darwin`, others). `GOOS=darwin GOARCH=arm64` and `GOOS=freebsd GOARCH=amd64` builds and vets of `./git` and `./project`, test files included, keep succeeding.
2. Fallback: any failure of the OS source runs `ps`, including a pid that is absent from `/proc`. It runs with `LC_ALL=C`, in its own process group. Its wall time is bounded by an unexported 5-second constant in package `git`; no setting or exported seam changes it. At the bound the whole group is killed with SIGKILL, so a child of `ps` that still holds the output pipe cannot extend the wait. `ProcessBirth` therefore returns within 5 s plus scheduling slack, which acceptance checks as under 7 s. The fallback's failure texts are:
   - `ps -p <pid> timed out after 5s` on timeout.
   - `ps -p <pid>: <cause>` otherwise: the exec error such as `exec: "ps": executable file not found in $PATH`, `exit status 1`, or empty or unparsable output.
   - Output from `ps` and its stderr never appear in an error.
3. When both fail, the error is one line: `process <pid> start time could not be read: <OS attempt>; <ps attempt>`. On Linux the OS attempt names the file it could not read or parse, for example `open /proc/99999999/stat: no such file or directory`. On macOS it is `sysctl kern.proc.pid.<pid>: <cause>`.

The 5-second value of the bound was chosen in shaping: it is far above a normal `ps` run (milliseconds) and short enough that a stuck `ps` does not block a Build start.

### Owner facts

- `project.Owner(token)` sets `Birth` to `git.ProcessBirth(os.Getpid())` and returns that error unchanged; the old `ps -p N: ...` wrapper is gone.
- `OwnerFacts`, its JSON (`{"birth":...,"pid":...,"token":...}`) and the token handling are unchanged.
- Its doc comment says the birth is read from the operating system, with `ps` as a bounded fallback, in the `ps -o lstart=` text.
- A Build in a repository whose PATH has no `ps` acquires its lock (`git.AcquireBuild`), and `project.Owner(lock.Token())` succeeds with this pid, the lock's token and a non-empty birth.

### Legacy owner judgment (git/lock.go)

A legacy lock is a plain pid file, or a directory holding an owner file, left by an earlier Kogen. Judging it keeps its rule:

- a positive numeric pid that is alive (`kill -0`, or the existing per-Lock `alive` test hook),
- the same effective uid as `os.Geteuid()`,
- and either the process name equals the basename of `os.Executable()`, or the process start (whole seconds) is not later than the owner file's mtime.

What changes is where uid, name and start time come from:

- On Linux they come from the OS: the effective uid is the second field of the `Uid:` line of `/proc/<pid>/status`; the name is the `comm` between the first `(` and the last `)` of `/proc/<pid>/stat`; the start time is as above.
- On macOS they come from `kinfo_proc`: `kp_eproc.e_ucred.cr_uid`, `kp_proc.p_comm` and `p_starttime`.
- Only when that fails does it run the existing `ps -p <pid> -o uid= -o comm= -o lstart=` with `LC_ALL=C`, under the same 5-second bound and process-group kill.
- Any failure or incomplete observation still means not held.

As a result, a running same-user legacy owner is judged held (Held, LockOwner and Acquire report `Held`) even with no `ps` on PATH, and stale after it exits (Acquire removes it: `RemovedStale`). A live process whose start is later than the legacy file's mtime (a reused pid) stays stale.

The existing tests that use a fake `ps` with pid 424242 keep working, because that pid is absent from `/proc` and the fallback runs.

### Unchanged

- The Build lock file format (`kogen-build-lock 1`, `pid`, `token`): no birth is added to it.
- Kernel flock behaviour, tokens, Release, `environment/build_running` (exit 3), the stale-lock notice, signal-zero-only liveness.
- Git command deadlines.

### README

In "Git command deadlines", the sentence "The `ps` calls in `git/lock.go` and `project/facts.go` are not Git commands and stay unbounded." is replaced. The new text says a process start time is read from the operating system, with `ps` as a fallback bounded to 5 seconds whose timeout reads `ps -p <pid> timed out after 5s`.

## Decisions
- The OS is the first source of a process start time (the `/proc` files on Linux, the `sysctl` call on macOS); `ps` is only a fallback with a bounded wall time. (source: request)
- The birth text stays byte-identical to the `ps -o lstart=` text an older build recorded for the same process, so a live owner is still recognised. (source: request)
- When no source supplies a birth, the one-line error says the process start time could not be read and names both attempts; a timed-out fallback names `ps` and the timeout. (source: request)
- A `ps` fallback that does not finish returns within its bound plus 2 s. (source: request)

## Source comparison
- Problem: Owner fails with "ps -p N" when `ps` is absent. Addressed by `project.Owner` through `git.ProcessBirth`, in acceptance scenario "Acquire the Build lock in a fresh repository with no ps on PATH". It runs `git init` in a temporary repository, then empties PATH, runs `git.AcquireBuild` and `project.Owner(lock.Token())`, and checks the pid, the token, `git.LockOwner`, a birth equal to the real `ps -p <pid> -o lstart=` text, and empty stderr. On the unchanged tree it fails with `ps -p <pid>: exec: "ps": executable file not found in $PATH`.
- Problem: a legacy owner is always judged not held without `ps`, which lets a second Build in. Addressed by legacy judgment from the OS. Acceptance covers a live `sleep` child named by a plain pid file and by a directory owner file, with mtime one minute after its start: Held while it runs, RemovedStale after it exits. On the unchanged tree this is judged RemovedStale while running.
- Synthetic acceptance "With PATH empty of ps, acquiring the Build lock in a fresh temporary repository succeeds and records pid and a non-empty birth" is covered by the first scenario.
- Synthetic acceptance "A lock written with the ps format by the same process is still judged held while the process runs and stale after it exits" is covered by scenario "A birth recorded in the ps format ...". The birth of a live child and of the test process is recorded with real `ps`; with PATH emptied, `git.ProcessBirth` and `project.Owner` must return exactly that text (held), and after the child is killed and reaped it must not (stale). The legacy pid-lock scenario covers the same rule for earlier-Kogen locks.
- Synthetic acceptance "A fake ps that sleeps beyond the bound ..." is covered by scenario "A ps fallback that does not finish is stopped at its bound":
  - The fake `ps` runs a child `sleep 30` and only then prints a birth.
  - It runs for `git.ProcessBirth(99999999)`; pid 99999999 exceeds the largest Linux pid_max (4194304), so `/proc` never has it.
  - The call must return under 7 s with no birth and a one-line error naming `process 99999999 start time could not be read`, `/proc/99999999/stat`, `ps -p 99999999` and `timed out after 5s`.
- Synthetic acceptance "When both sources fail ..." is covered by scenario "When neither source supplies a birth ...": with PATH empty, `git.ProcessBirth(99999999)` gives a one-line error naming `process 99999999 start time could not be read`, `/proc/99999999/stat` and `ps -p 99999999`.
- Synthetic acceptance "Two lock owners with the same pid but different births are told apart (pid reuse)" is covered by scenario "Owners with the same pid but different births ...":
  - The birth now read for a live child equals its recorded ps birth (held) and differs from a birth one hour earlier with the same pid (stale).
  - A legacy lock naming that pid with a 2020 mtime is stale (RemovedStale) in both legacy formats.
- Need, macOS system-call source: specified above. Here only cross-compilation can be checked (`go vet` for darwin/arm64 and freebsd/amd64 in acceptance); macOS runtime behaviour is not verified in this environment, and a failure there falls back to bounded `ps`.
- Superseded: the README statement that the `ps` calls stay unbounded, and the `ps -p N: ...` error wrapper of `project.Owner`.
- Omitted: nothing from the request. No new setting, exported timeout seam, lock-file field or module dependency is added.

## Tests
- The OS-read birth equals the `ps -o lstart=` text for the same process (self and a child), and is unavailable once the child has exited: add a `git.ProcessBirth` test in git (integration)
- `project.Owner` succeeds with no `ps` on PATH and keeps the `ps` text: update `TestOwnerNamesThisProcessAndLockToken` in project/facts_test.go to also run with an empty PATH (integration)
- A running same-user legacy owner is held without `ps` and stale after it exits, in plain and directory formats: add to git/lock_test.go (regression)
- A live pid whose start is later than the legacy mtime stays stale without `ps`: add to git/lock_test.go (regression)
- The `ps` fallback is bounded: a fake `ps` with a sleeping child makes `ProcessBirth` and the legacy judgment (via the `alive` hook and a pid absent from `/proc`) return within the bound plus 2 s with `ps -p <pid> timed out after 5s` (integration)
- When both sources fail, the error is one line, starts with `process <pid> start time could not be read: ` and names the OS attempt and the `ps` attempt (integration)
- Legacy judgment through the fake-`ps` fallback for a pid absent from the OS keeps its uid, name and mtime rules: existing TestLegacyOwnershipMetadata, TestLegacyDirectoryOwnerMtimeStale and TestLegacyMissingMetadataIsStale in git/lock_test.go (existing)
- The darwin and other-OS sources compile: acceptance `go vet ./git ./project` for darwin/arm64 and freebsd/amd64 (scenario)

## Feasibility
- Local probe (Linux, procps-ng 4.0.4, `getconf CLK_TCK` = 100): for all 133 processes readable on the machine, `btime` from `/proc/stat` plus field 22 of `/proc/<pid>/stat` divided by 100 (truncated), formatted `%a %b %e %H:%M:%S %Y` in local time, equals `ps -p <pid> -o lstart=`, with no difference. (probe: exit 0, under 2 s)
- Local probe: on the unchanged tree, `GOOS=darwin GOARCH=arm64 go vet ./git ./project` and `GOOS=freebsd GOARCH=amd64 go vet ./git ./project` succeed. Go 1.27.2's `syscall` for darwin exports `Syscall6` and `SYS___SYSCTL`. `golang.org/x/sys` is not in the module cache, so the macOS source uses the standard library only. No macOS host was available: runtime `sysctl` behaviour there is untested. (probe: exit 0)
- Scratch run of this acceptance in a copy of the repository, outside the checkout:
  - The dot-prefixed scratch package `./.owner-birth-*` compiles against the module's `git`, `project` and `kogen-loop/sys` packages.
  - On the unchanged tree, acquire-without-ps fails with owner error `ps -p <pid>: exec: "ps": executable file not found in $PATH`, and legacy judges the running owner `RemovedStale`. The `ProcessBirth` cases fail with `undefined: git.ProcessBirth`.
  - With a compile-only stub of `ProcessBirth` that returns an error, every case driver compiles and reaches its assertions; ps births such as `Thu Nov  5 04:18:08 2026` parse with layout `Mon Jan _2 15:04:05 2006`.
  - The stub was removed and is not part of this Intent. (probe: exit 1, about 60 s)
- evidence: {"id":"birth-observer","kind":"observer","inputs":["features/steps/coord-owner-birth-without-ps__birth.js"],"observers":["features/steps/coord-owner-birth-without-ps__birth.js"],"checks":[{"name":"good","command":"NODE_PATH=\"$KOGEN_CUCUMBER\" \"$KOGEN_NODE\" features/steps/coord-owner-birth-without-ps__birth.js good","exit":0,"output":"accepted\n"},{"name":"bad","command":"NODE_PATH=\"$KOGEN_CUCUMBER\" \"$KOGEN_NODE\" features/steps/coord-owner-birth-without-ps__birth.js bad","exit":1,"output":"rejected\n"}]}
