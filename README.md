# kogen-coordinator

Kogen's coordinator: the outer workflow's authority over a target repository.

It is a component of [Kogen](https://github.com/KogenAI/kogen), which pins an exact version of it and assembles the `kogen` program.

## Packages

- `project`: what Kogen keeps about a project: `.kogen/project.yaml` (commands, checks, roles and models, protect patterns), Intents (`intent.md`, `acceptance.feature`, stages), the approval baseline and its hash, and Shape provenance receipts.
- `git`: Kogen's window on Git: repository discovery, the target-repository commit, locks, execution pins, candidate trees, diffs and the index.
- `durable`: the one place Kogen flushes a file to stable storage.

## Testing

Then run:

```sh
go build ./... && go vet ./... && go test -race -count=1 ./...
```

The module depends on private KogenAI modules: set `GOPRIVATE=github.com/KogenAI/*`.

### Golden files

`project/testdata/golden.json`, `facts-golden.json` and `parity.json` hold recorded inputs and their recorded results, originally produced by the Elixir Kogen. Their golden tests compare the current Go output with them.

To regenerate them, run:

```sh
go test ./... -update
```

`-update` is a Go test flag, registered in `_test.go` files only; `kogen` has no such option. Use it after a deliberate change to an output a golden records, or to resolve a conflict in a golden on the combined tree during delivery. It replaces only the recorded results that no longer match with the current output: matching results and all recorded inputs stay as they are, and a golden with no drift is not written. A golden mismatch is recorded instead of failing the test; every other failure still fails it.

After it, review the golden diff (`git diff -- project/testdata`), then run `go test ./...` without the flag and the full checks above. A change to a recorded value is a deliberate, reviewed change, most of all the approval hashes in `parity.json`, the config digests and contract hashes in `facts-golden.json`, and the main-Elixir results in `golden.json`. Never edit recorded bytes or hashes by hand.

## License

Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
