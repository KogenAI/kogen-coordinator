# Check legacy lock PID ownership

Slug: coord-legacy-lock-pid-ownership
Model: not applicable — this changes a stateless classification of legacy owner metadata; the existing kernel-lock lifecycle is unchanged
Acceptance:
- .kogen/intents/coord-legacy-lock-pid-ownership/acceptance.feature
- features/steps/coord-legacy-lock-pid-ownership__ownership.js

Replace legacy PID-only liveness in git/lock.go with ownership-qualified liveness, for both directory owner files and plain PID files. Held requires a positive numeric live PID, the same effective user, and either the same executable basename as the current program or process start time less than or equal to the legacy owner file's mtime. Unknown ownership or unavailable plausibility evidence cannot establish Held. Preserve PID diagnostics. Acquire replaces a stale legacy lock with its normal kernel-held lock and returns RemovedStale. Held and LockOwner use the same classification without deleting stale locks. Remove Acquire's special exception that treats this process's own legacy PID as stale.

Use local ps metadata (uid, comm, lstart), in the C locale, with the command `ps -p <pid> -o uid= -o comm= -o lstart=`; compare its effective UID to os.Geteuid(), and parse the date in local time. Preserve the existing per-Lock alive test hook for synthetic liveness; metadata is still checked when that hook returns true. Do not add an exported API or dependency. For directory locks use the owner file's mtime, not the directory's. Keep nonrecursive directory removal. Kernel flock contention, token format, inode checks, release, errors and kernel-owner death behavior remain unchanged. No nonzero signal may be sent to a PID read from a lock; git/lock.go may only use Kill with signal 0. EPERM alone is not ownership evidence.

AcquireBuild must retain `kogen: removed the lock of a Build that is no longer running\n` on stderr for removed legacy locks, including live unrelated owners. Retain environment/build_running, exit 3, and existing PID diagnostics for Held locks. Empty, nonnumeric and zero legacy files are stale, as requested (empty files currently return Acquired; the requested stale result takes precedence).

## Decisions
- Treat a live unrelated or foreign-user process as stale, not build_running; never terminate a recorded PID. (source: request)
- Same executable name OR start time not later than the lock mtime establishes plausibility, only after same-user liveness. Equality is held. (source: request)
- Preserve kernel-held lock behavior and existing stale-lock notice. (source: request)

## Source comparison
- Addressed: request Problem and Need, replacing git/lock.go legacyDirectory/isAlive and Acquire's self-PID exception with the classification above; acceptance covers plain and directory formats, self, unrelated-after, same-name-after, before/equal, dead and foreign-user facts.
- Addressed: synthetic alive/start-time hook cases use existing l.alive and synthetic ps output; foreign UID with alive=true represents the EPERM/existence case without accessing or signaling another user's process. Current test PID uses real metadata. Empty, nonnumeric and zero cases are executable acceptance rows.
- Addressed: exact slug, Intent paths, step naming/prefix restrictions, stderr notice, status and PID diagnostics are preserved in this package. Source signal prohibition has a focused executable check plus required implementation regression coverage.
- Conflicting current behavior: empty plain files currently yield Acquired and current-PID plain files yield RemovedStale; requested stale empty and Held self behavior supersedes those branches. No requested behavior is omitted. Existing older-process plausibility intentionally allows a differently named process started before the file; this follows the request's OR, not a stronger Build-identity policy.
- Technical evidence: ps invocation and output shape were observed locally with Go 1.27.2/Linux. Documentation search returned irrelevant sources, not successful discovery; retrieved untrusted man7 pages https://man7.org/linux/man-pages/man5/proc_pid_stat.5.html and https://man7.org/linux/man-pages/man1/ps.1.html document process naming/start-time data and ps formatting. They are technical references, not scope authority. No foreign PID was probed: a shell kill-zero probe was refused by the tool.

## Tests
- Live same-user unrelated process started after mtime is stale in both legacy formats: generated Acquire/Held regression rows (regression)
- Same-name process remains held even if newer; older/equal start remains held even with another name: generated metadata boundary rows (integration)
- Current process's legacy file is held and reports its PID: real-process Acquire/Held row (regression)
- Foreign-user live/EPERM-equivalent existence is insufficient: synthetic foreign UID rows (regression)
- Empty, nonnumeric, zero and dead PID locks are stale: legacy input rows (integration)
- Removed stale owners preserve the exact Build stderr notice: AcquireBuild row and update TestAcquireBuildMessages for live unrelated ownership (integration)
- No recorded PID receives a nonzero signal: source check and add Go AST regression covering Kill/Signal calls in git/lock.go (regression)
- Kernel locks, release, diagnostics, contention and killed-owner behavior remain unchanged: existing git/lock_test.go kernel-lock tests (existing)
- LockOwner agrees with Held and directory classification uses owner mtime: add focused tests in git/lock_test.go (integration)

## Feasibility
- Local tool probe: Go 1.27.2, Linux, ps available; `ps -p $$ -o uid= -o comm= -o lstart=` returned UID, executable name and `Tue Nov  3 21:23:30 2026`. Foreign-process signal-zero probe was refused; no conclusion about an actual foreign PID is claimed.
- evidence: {"id":"ownership-observer","kind":"observer","inputs":["features/steps/coord-legacy-lock-pid-ownership__ownership.js"],"observers":["features/steps/coord-legacy-lock-pid-ownership__ownership.js"],"checks":[{"name":"good","command":"NODE_PATH=\"$KOGEN_CUCUMBER\" \"$KOGEN_NODE\" features/steps/coord-legacy-lock-pid-ownership__ownership.js good","exit":0,"output":"accepted\n"},{"name":"bad","command":"NODE_PATH=\"$KOGEN_CUCUMBER\" \"$KOGEN_NODE\" features/steps/coord-legacy-lock-pid-ownership__ownership.js bad","exit":1,"output":"rejected\n"}]}
