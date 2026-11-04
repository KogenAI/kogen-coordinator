# Replace the approval file atomically

Slug: coord-approval-write-atomic
Model: not applicable — one call is one write-flush-rename procedure with no state machine of its own; the rename gives readers the old-or-new atomicity and concurrent writers only need distinct temp names
Acceptance:
- .kogen/intents/coord-approval-write-atomic/acceptance.feature
- features/steps/coord-approval-write-atomic__driver.js

The approval of an Intent, `.kogen/local/approvals/<slug>.json` (`project.ApprovalPath(root, slug)`), is written by `project.WriteApproval(root string, a Approval) error` (`project/baseline.go`). Today it creates the folder with `os.MkdirAll(..., 0o755)` and then calls `os.WriteFile(path, b, 0o644)`, which truncates the existing file and writes it in place. A process killed or a machine losing power during that write leaves the approval empty or partial, so readers (`project.ReadApproval`) see no approval or an unparseable one. With a write that fails part way (for example on a file-size limit), the approval file is left holding only the first bytes of the new approval.

After this change, `project.WriteApproval` keeps its signature, its folder creation and its bytes:

- It encodes `a` with the existing `project.EncodeApproval(a)` (unchanged: the JSON object and a newline) and creates the folder `filepath.Dir(ApprovalPath(root, a.Slug))` with `os.MkdirAll(..., 0o755)`, as today.
- It creates a temp file in that same folder under a unique name, never a fixed one: for example `<slug>.json.tmp-<16 random hex digits>` opened with `os.O_WRONLY|os.O_CREATE|os.O_EXCL` and permission `0o644`, so the approval keeps today's mode (0644 less the process umask; `0644` under umask 022). It writes the complete bytes, calls the shared flush helper `durable.Sync` on the temp file exactly once, closes it, and renames it over the approval path. It does not flush the folder: one call makes exactly one `durable.Sync` call, on the temp file, before the rename.
- On every failure after the temp file was created (write, flush, close or rename) it closes the file if still open, removes the temp file and returns the failure's error; the existing approval (if any) is left as it was. A successful call leaves no temp file. A reader sees only the old approval or the complete new one.
- Errors from encoding or from creating the folder are returned as today, before any temp file exists.

The package `project` already imports `durable` (`project/facts.go`), so `durable.SkipSyncInTests` keeps switching the flush off in test binaries. A shared helper with `project.WriteJSONAtomic` is allowed but not required; `WriteJSONAtomic`'s bytes and behaviour are unchanged.

Out of scope and unchanged: `project.ReadApproval`, `project.EncodeApproval`, `project.ApprovalPath`, the approval JSON format and its contract items `approval-path` and `approval-json`, other writers, and cleanup of temp files left by earlier versions (there are none today). No golden or recorded hash changes.

Acceptance builds (`go build -o`) and runs a Go driver that the step file generates in a temporary folder of the module (a dot-prefixed folder under the working directory). It calls `project.WriteApproval`, `project.EncodeApproval`, `project.ApprovalPath` and `durable.ObserveSyncInTests` (the existing test seam), sets umask 022, writes approvals for the slug `atomic-demo` in a fresh temporary root, and at each observed flush records the flushed file's name and bytes and the approval file's bytes at that moment. The rename failure makes the approval path a non-empty directory; the flush failure has the observer close the temp file so the following `f.Sync()` fails; the write failure limits the driver process's file size to 64 bytes with `RLIMIT_FSIZE` (Go ignores `SIGXFSZ`, so the write returns an error).

## Decisions
- Writing an approval creates its folder, writes the complete bytes to a unique temp file in the same folder, flushes it with the shared flush helper `durable.Sync`, and renames it over the approval path (source: request)
- Readers see only the old approval or the new one (source: request)
- Failures leave no temp file (source: request)
- The bytes written (`EncodeApproval`'s output) and the file mode (0644) are unchanged (source: request)
- One write flushes the temp file exactly once before the rename, observed through the flush counter in the test seam `durable.ObserveSyncInTests` (source: request)

## Source comparison
- In-place `os.WriteFile` truncating the approval (request "Problem"): replaced by a unique temp file in the approval's folder, one `durable.Sync`, and a rename over the approval path (prose bullets 2 and 3).
- Synthetic acceptance "Write an approval for a slug in a fresh root: the file exists, its bytes equal the existing encoder's output, and its mode is 0644": scenario "Writing an approval in a fresh root creates its folder, flushes the temp file once and keeps today's bytes and mode" (literal bytes of approval A, `file_is_the_encoding` against `project.EncodeApproval`, mode `0644` under umask 022, folder holding only `atomic-demo.json`).
- Synthetic acceptance "Overwrite an existing approval with a different one: the file holds exactly the new bytes and the folder holds no other entries": scenario "Overwriting an approval flushes the new bytes once before the rename and leaves only the approval in the folder" (approval B over approval A; folder `["atomic-demo.json"]`).
- Synthetic acceptance "Make the rename fail (the approval path is a non-empty directory): an error is returned, and the folder holds no temp file": scenario "A failed rename returns an error and leaves no temp file in the folder" (the directory and its file `keep` stay intact).
- Synthetic acceptance "With the flush counter in the test seam, one write flushes the temp file exactly once before the rename": the fresh and overwrite scenarios observe exactly one flush, of a file in the approval's folder other than the approval path, holding the complete new bytes while the approval path is still absent (fresh) or still holds the old approval A (overwrite).
- "Failures leave no temp file" and "Readers see only the old approval or the new one" (request "Need"): besides the rename failure, scenarios "A failed flush returns an error, keeps the old approval and leaves no temp file in the folder" and "An interrupted write of the new bytes keeps the old approval whole and leaves no temp file" (today the latter leaves the approval holding the first 64 bytes of the new one).
- Process kill or power loss is not simulated; the flush-before-rename order and the untouched old approval on failure are what acceptance observes.

## Tests
- `WriteApproval` in a fresh root creates the folder and writes `EncodeApproval`'s bytes with mode 0644, flushing its temp file once through `durable.Sync` before the rename (the approval path absent at that moment): new test in `project` (for example `project/baseline_test.go` or next to `TestApprovalFiles` in `project/intent_test.go`) with `durable.ObserveSyncInTests` (removed in `t.Cleanup`, not `t.Parallel`) (integration)
- Overwriting an approval leaves exactly the new bytes and only the approval file in the folder, the old bytes still in place at the flush: new test in `project` (integration)
- A failed rename (the approval path is a non-empty directory) returns an error and leaves no temp file: new test in `project` (integration)
- A failed flush (the observer closes the temp file) returns an error, keeps the old approval and leaves no temp file: new test in `project` (integration)
- A failed write of the temp file returns an error, keeps the old approval and leaves no temp file: acceptance scenario "An interrupted write of the new bytes keeps the old approval whole and leaves no temp file" (the file-size limit is process-wide, so it stays in the separate driver process) (scenario)
- Approval bytes, path and read-back are unchanged: existing `TestApprovalFiles` and contract `approval-path`/`approval-json` tests in `contract/approval_test.go` (existing)

## Feasibility
- Scratch copies outside the repository (external-session observations, not Kogen probe records): on today's code the driver observed 0 flushes in every case, a successful write despite the closed temp file in the flush-failure case, and an approval truncated to its first 64 bytes in the write-failure case; with a candidate implementation (unique `O_EXCL` temp with perm 0o644, one `durable.Sync`, rename, removal on every failure) it observed exactly the objects the feature expects. The recorded known-good and known-bad observations in the step file come from those runs.
- evidence: {"id":"driver-observer","kind":"observer","inputs":[".kogen/intents/coord-approval-write-atomic/acceptance.feature"],"observers":["features/steps/coord-approval-write-atomic__driver.js"],"checks":[{"name":"good","command":"\"${KOGEN_NODE:-node}\" features/steps/coord-approval-write-atomic__driver.js good","exit":0,"output":"accepted fresh\naccepted overwrite\naccepted rename-failure\naccepted sync-failure\naccepted write-failure\n"},{"name":"bad","command":"\"${KOGEN_NODE:-node}\" features/steps/coord-approval-write-atomic__driver.js bad","exit":1,"output":"rejected fresh\nrejected overwrite\nrejected rename-failure\nrejected sync-failure\nrejected write-failure\n"}]}
