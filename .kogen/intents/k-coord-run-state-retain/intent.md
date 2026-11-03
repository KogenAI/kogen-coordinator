# Retain bounded durable run records

Slug: k-coord-run-state-retain
Model: .kogen/intents/k-coord-run-state-retain/model.qnt invariants=Bounded,Accounting seed=17 samples=100 steps=40
Acceptance:
- .kogen/intents/k-coord-run-state-retain/acceptance.feature
- features/steps/run_state.js
- features/steps/run_state_driver.go.txt

Add a coordinator-owned durable run index/writer, not build integration. Existing durable.Sync and SkipSyncInTests remain unchanged. A caller supplies a retention root outside its disposable workspace; deleting that workspace must leave records discoverable and readable by a new store instance. This does not wire stages into kogen-build, implement resume/recovery/stale-lock policy, alter project/ or validators, copy evidence, or promise that pointed-to evidence survives pruning.

## Decisions
- Keep the most recent 32 events per run, count omitted earlier events, and retain outcome/reason and evidence pointers separately; never automatically delete other runs. The bound is per run, not across runs. (source: answer 1)
- Retain ordered stage events with UTC instants, outcome/reason, and attempt evidence-folder pointers outside the pruned workspace. (source: request)
- Deliver new files under durable/ only, plus implementation tests/documentation as necessary; kogen-build call sites are a separate step. (source: request)

Technical contract: export durable.OpenRunStore(root string) (*RunStore, error), (*RunStore).Append(id string, event RunEvent) error, (*RunStore).Finish(id, outcome, reason string, evidence []string) error, (*RunStore).Read(id string) (RunRecord, error), and (*RunStore).List() ([]string, error). RunEvent has exported fields Stage string, At time.Time, Attempt string. RunRecord has ID string, Events []RunEvent, Omitted uint64, Outcome string, Reason string, Evidence []string. JSON uses lower-case field names (attempt, omitted, outcome, reason, evidence), with version:1 at record top level and id/events/stage/at for the remaining fields. Empty collections serialize as [] rather than null. At serializes as RFC3339Nano in UTC, preserving the instant; order is append order, not timestamp sorting. Stage is a caller-supplied label, not a workflow enum; Attempt is an optional pointer. Finish creates a record if absent, replaces the summary and evidence without modifying the event tail, and may be repeated. Append after Finish remains supported and preserves the summary. No wall clock is read to replace supplied instants. Read of an absent ID returns an error satisfying errors.Is(err, os.ErrNotExist). List returns sorted IDs, including unfinished runs; an empty root returns [].

The index is the directory of independent versioned JSON records, not a second unbounded manifest. Store each record at root/<id>.json. IDs are nonempty ASCII letters/digits/hyphen/underscore only; reject other IDs before filesystem mutation. Create root if absent. Successful mutations replace a complete record via a same-directory temporary file, durable.Sync, rename, and parent-directory sync; clean up temporary files. Propagate I/O/decoding errors rather than reporting success or silently resetting history. Serial calls through reopened instances must preserve state; concurrent writers and hostile/symlinked roots are outside this item. Returned values must not alias later in-memory mutations.

Each JSON record is at most 65536 bytes, including any newline. After append, discard oldest events until both the 32-event and byte bounds hold, incrementing Omitted once per discarded event. An incoming event must itself fit alongside current summary; do not silently omit that incoming event. Finish preserves the full existing tail: if its replacement summary cannot fit, return an error without mutation. An unrepresentable event or summary returns an error without changing the previous durable bytes. Evidence strings and summary are never silently truncated. This bounds per-run storage while preserving final metadata. List only regular <valid-id>.json records; no cross-run deletion or workspace traversal.

## Source comparison
- Addressed: request Need and answer 1 map to the API, UTC ordered tail, independent retained summary, omission counter, byte bound and prune/reopen acceptance below.
- Addressed: Independence maps to durable/ ownership and explicit exclusion of kogen-build, project/ and validators. Existing fsync-only behavior remains available.
- Addressed as historical motivation, not fabricated fixtures: request reports 0/200 attempt.json and event logs (Studio 87, eu2 65, laptop 48), 75/200 final-tree.tar, c4a49a4 durable.go at 23 lines, coordinator L0 BLOCKER 01:13Z, verification Row 9, build no_progress and loop hashed logs. Acceptance reproduces the missing-record class with a fresh root, then prunes a real workspace and reopens retained records. It does not assert access to the research shelf or invent its missing artifacts.
- Omitted deliberately: producing attempt.json, build event-log instrumentation, retaining final-tree.tar, and examining resume, stale locks or recovery are downstream uses, not this independent index/writer item. No existing research evidence is superseded or represented as newly observed.

## Tests
- Ordered UTC events and optional attempt pointers persist across reopen: run-store lifecycle acceptance and focused durable integration tests (integration)
- Empty/nonempty sorted discovery and independent runs survive workspace pruning: run-store lifecycle acceptance (integration)
- Bounded recent tail retains summary and pointers, accounts for omissions, and never deletes another run: run-store lifecycle acceptance plus byte-boundary implementation tests (integration)
- Finish without events, repeated Finish, and append after Finish preserve the specified state: durable transition tests and lifecycle acceptance (integration)
- Unrepresentable updates leave durable bytes unchanged; invalid IDs cannot mutate storage; absent reads and I/O errors remain errors: durable boundary tests and lifecycle acceptance (integration)
- Existing flush API and other packages remain compatible: configured build, vet and Go tests (existing)

## Feasibility
- Local Go toolchain observed as go1.27.2; no external protocol or provider dependency is introduced. The preliminary Quint availability check reached its parser (empty-input parse error); the actual model is checked separately.
- evidence: {"id":"run-observer","kind":"observer","inputs":[".kogen/intents/k-coord-run-state-retain/acceptance.feature"],"observers":["features/steps/run_state.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/run_state.js good","exit":0,"output":"accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/run_state.js bad","exit":1,"output":"rejected\n"}]}
