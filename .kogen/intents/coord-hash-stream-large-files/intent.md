# Stream file bytes into baseline and input digests

Slug: coord-hash-stream-large-files
Model: not applicable — a deterministic per-file digest calculation; no workflow state or interacting rules change
Acceptance:
- .kogen/intents/coord-hash-stream-large-files/acceptance.feature
- features/steps/coord-hash-stream-large-files__digest.js

The approval hash and the verification snapshot's input digests stop reading whole files into memory. Each file's SHA-256 is computed by streaming the file through the hash in fixed 32 KiB (32768-byte) chunks, so memory use no longer grows with the largest baseline or candidate file and a very large file no longer fails because it cannot be read into memory at once. Every resulting digest, the `missing` and `unreadable` classification, the unreadable path list, and the symlink and mode handling stay exactly as they are today. Only how bytes reach the hash changes.

Interfaces (signatures unchanged, no new exported API, setting or fallback):

- `project.HashWithUnreadable(root string, paths []string) (string, []string)` and `project.Hash(root string, paths []string) string` (in `project/baseline.go`). For each sorted path, open `filepath.Join(root, p)` with `os.Open` (it follows symlinks as `os.ReadFile` does today) and copy it into `sha256.New()` with `io.Copy` or `io.CopyBuffer` and a 32 KiB buffer. This replaces the current `os.ReadFile` + `sha256.Sum256`. An open error for which `errors.Is(err, fs.ErrNotExist)` holds still contributes `missing`. Any other open or read error still contributes `unreadable` and appends the path to the unreadable list. That includes a directory, which `os.Open` opens but cannot read (EISDIR), and a permission-denied file. A partial digest is never used. The outer framing stays `<path>\0<digest>\n` per sorted path (duplicates once per occurrence), and so does the final lowercase-hex SHA-256 over those lines. The file is closed after hashing.
- `git.Repo.Materialize` records `Materialized.Inputs`, and `Materialized.Mutations` compares them, both through `inputAt` in `git/snapshot.go`. For a regular file, `inputAt` streams the file through `sha256.New()` in the same 32 KiB chunks instead of `os.ReadFile` + `sha256.Sum256`. It stores the same `[sha256.Size]byte` in `Input.Digest`. A read error is still returned as an error. The Lstat-based `missing` (ENOENT/ENOTDIR), `symlink` (with `Target`, zero `Digest`), `directory` and `other` kinds, and `Exec` (permission bits & 0o111), are unchanged.

Memory bound used by acceptance: in a fresh Go process, call `runtime.GC()` and `runtime.ReadMemStats` immediately before the single call and `runtime.ReadMemStats` immediately after it. The growth of `MemStats.TotalAlloc` across the call is the total heap allocated during it, an upper bound of peak heap growth, and it must stay under 16 MiB for a 256 MiB (268435456-byte) file. The unchanged code allocates about 268 MB there.

Out of scope: other `os.ReadFile` callers (configuration, Intent, provenance files), the blob writing in `Materialize` (it already streams through `git cat-file --batch`), and the recorded golden/parity files, which must not be regenerated or edited.

## Decisions
- Digests, `missing`/`unreadable` classification, the unreadable path list, and symlink and mode handling stay exactly as today; only memory use changes (source: request)
- A 256 MiB sparse file must hash with heap growth under 16 MiB, measured with runtime memory statistics around the call (source: request)

## Source comparison
- Addressed: request Problem/Need for the approval hash. `project.HashWithUnreadable`/`project.Hash` stream file bytes in fixed 32 KiB chunks. This replaces `os.ReadFile` in `project/baseline.go`. The chunk size is decided here because the request asks for a fixed size without naming one.
- Addressed: request Need for the verification snapshot. `inputAt` (used by `Materialize` and `Mutations`) streams regular files. This replaces `os.ReadFile` in `git/snapshot.go`.
- Addressed: synthetic acceptance "256 MiB sparse file in the baseline". The 268435456-byte sparse fixture scenario checks the hash against an independent Node SHA-256 reference and checks TotalAlloc growth under 16 MiB.
- Addressed: "the same for the verification input digest of a 256 MiB file". A `Materialize` scenario on a candidate tree holding that file checks the recorded digest and the 16 MiB bound.
- Addressed: empty, one-byte and chunk-multiple files. Outlines for 0, 1, 32767, 32768, 32769, 65536 and 1048576 bytes run for both digests. 32768 and 65536 are exact multiples of the 32 KiB chunk, 1048576 is a multiple of any power-of-two chunk up to 1 MiB, and 32767/32769 are the adjacent lengths.
- Addressed: absent → `missing`; directory and permission-denied → `unreadable` and listed. A classification scenario checks these, plus symlinks to a file, to a directory and dangling, against the reference and the explicit list `dir,dir-link,locked`.
- Addressed: symlink and mode handling of verification inputs. A scenario checks the kind, target and executable bits of a 100755 file and of a symlink.
- Addressed: "existing hash fixtures produce byte-identical hashes". The recorded `project/testdata/parity.json` inputs are hashed through the real API and compared with their recorded hashes, written literally in the feature. The unchanged golden/parity Go tests also stay.
- Omitted: nothing requested.

## Tests
- Approval hash streams a 256 MiB sparse file with heap growth under 16 MiB and the reference digest: acceptance scenario through `project.HashWithUnreadable` and `project.Hash` in a Go driver (integration)
- Verification input digest streams a 256 MiB file with heap growth under 16 MiB and the reference digest: acceptance scenario through `git.Repo.Materialize` in a Go driver (integration)
- Digests of 0, 1, 32767, 32768, 32769, 65536 and 1048576-byte files equal an independent SHA-256: acceptance outlines for both digests, plus a table test of these lengths against `sha256.Sum256` added in `project/intent_test.go` and `git/snapshot_test.go` (integration)
- Absent stays `missing`; directory, symlink-to-directory and permission-denied stay `unreadable` and listed: acceptance classification scenario plus existing `TestHashFormat` and `TestHashWithUnreadable` (existing)
- Verification input kind, symlink target and executable bits are unchanged: acceptance scenario plus existing `git/snapshot_test.go` Materialize tests (existing)
- Existing hash fixtures stay byte-identical: acceptance parity outline plus unchanged `TestIntentHashMatchesElixir`, golden and contract hash tests (existing)

## Feasibility
- A Go driver run with `go run <tmp>/main.go` from the repository root imports `github.com/KogenAI/kogen-coordinator/project`. On the unchanged tree, `HashWithUnreadable` over a 268435456-byte sparse file (16 KiB on disk) grew TotalAlloc by 268444552 bytes. That is the missing-feature red the bound distinguishes. (probe: exit 0, 1.2 s)
- A candidate tree with that sparse file, a 100755 file and a symlink was built with `git add -A`/`git write-tree` (0.9 s). `git.New(src, nil).Materialize(tree, dst)` then recorded the same digest as `shasum -a 256`, exec 73 and a symlink with zero digest, with TotalAlloc growth of 268714656 bytes, so non-input overhead is about 280 KB. (probe: exit 0, 1.8 s)
- Hashing the recorded `project/testdata/parity.json` files with each case's recorded baseline through `project.Hash` reproduced all three recorded hashes. (probe: exit 0)
- The acceptance user is uid 502 (not root), so a mode-000 file fails to open and is `unreadable`.
- evidence: {"id":"digest-observer","kind":"observer","inputs":["features/steps/coord-hash-stream-large-files__digest.js"],"observers":["features/steps/coord-hash-stream-large-files__digest.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/coord-hash-stream-large-files__digest.js good","exit":0,"output":"match\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/coord-hash-stream-large-files__digest.js bad","exit":1,"output":"mismatch\n"}]}
