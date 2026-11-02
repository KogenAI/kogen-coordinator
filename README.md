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

## License

Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
