# Public audit

## Scope and current tree

Reviewed all tracked files at the local HEAD, including source, tests, fixtures, configuration, license and historical Intent documentation, for host paths, private setup and URLs, internal workflow notes, and navigable links. The host-only check paths in `.kogen/project.yaml` are excluded as requested; the file is unchanged. Documentation was sanitized without changing the technical contracts. No policy files were added. The current approved Intent and acceptance files are untracked protected build inputs, not part of the tracked-tree inventory; they were not modified.

### Current fixture exceptions

- `project/testdata/parity.json`: two existing home-path occurrences in recorded fixture data; unchanged.
- `project/testdata/facts-golden.json`: one existing home-path occurrence in recorded fixture data; unchanged.

These are intentional exceptions to the clean-tree requirement, not navigable links. No additional host-path findings were identified outside the excluded configuration and those fixtures.

### Links

The README's GitHub Kogen and coordinator URLs, the RubyGems and Rails documentation references in `.kogen/intents/k-coord-detect-bundler/intent.md`, and both Apache license URLs in `LICENSE` returned HTTP 200 following redirects. README relative links `contract/`, `LICENSE`, and `NOTICE` resolve from the README to tracked targets. The historical contract Intent's Markdown-shaped `contract/` example is inline code rather than a link. The RubyGems URL in the Bundler acceptance input is fixture data (its host also returned 200). Localhost, reserved example domains, and URLs embedded in source tests and `project/testdata/parity.json` are synthetic inputs or recorded source data, not navigable documentation links; they were not converted to links or probed as services.

## History

Read-only inventory of every snapshot reachable from local `main` and `origin/main` (including `origin/HEAD`), from root `c4a49a4fe84faaa2d3705ad4d270841f4467969f` through `ffca7072fe15303cfe24e50418250bbc909750d4`, plus the local-only tip below. The repository reports non-shallow. No other refs were available locally; remote-only, deleted, unreachable and external repository history was not inspected. Searches covered host/home paths, host identity, private module instructions and internal delivery wording, with manual review of documentation and URLs. Rows below identify snapshots containing findings, not necessarily the commits that introduced them. Sensitive literals are redacted by category. Fixture entries refer to the same unchanged current exceptions. Host-only configuration check lines are excluded throughout.

### Publishable history snapshots

| Commit | Repository-relative file | Finding (literal redacted) |
| --- | --- | --- |
| `ffca7072fe15303cfe24e50418250bbc909750d4` | `README.md` | private setup and internal delivery wording |
| `ffca7072fe15303cfe24e50418250bbc909750d4` | `.kogen/intents/k-contracts-coordinator/intent.md` | home path and internal workflow, host-specific paths and identity |
| `ffca7072fe15303cfe24e50418250bbc909750d4` | `.kogen/intents/k-golden-update-coordinator/intent.md` | private setup and internal delivery wording |
| `ffca7072fe15303cfe24e50418250bbc909750d4` | `.kogen/intents/k-git-warning-dirty/intent.md` | host-specific paths and identity |
| `ffca7072fe15303cfe24e50418250bbc909750d4` | `project/testdata/parity.json` | home path and internal workflow |
| `ffca7072fe15303cfe24e50418250bbc909750d4` | `project/testdata/facts-golden.json` | home path and internal workflow |
| `741ddac6213a266b7d6bbd1dcc4ef16393600f8e` | `README.md` | private setup and internal delivery wording |
| `741ddac6213a266b7d6bbd1dcc4ef16393600f8e` | `.kogen/intents/k-contracts-coordinator/intent.md` | home path and internal workflow, host-specific paths and identity |
| `741ddac6213a266b7d6bbd1dcc4ef16393600f8e` | `.kogen/intents/k-golden-update-coordinator/intent.md` | private setup and internal delivery wording |
| `741ddac6213a266b7d6bbd1dcc4ef16393600f8e` | `.kogen/intents/k-git-warning-dirty/intent.md` | host-specific paths and identity |
| `741ddac6213a266b7d6bbd1dcc4ef16393600f8e` | `project/testdata/parity.json` | home path and internal workflow |
| `741ddac6213a266b7d6bbd1dcc4ef16393600f8e` | `project/testdata/facts-golden.json` | home path and internal workflow |
| `8d24cc7b091d28716b86c72ef790b8cc751c574d` | `README.md` | private setup and internal delivery wording |
| `8d24cc7b091d28716b86c72ef790b8cc751c574d` | `.kogen/intents/k-contracts-coordinator/intent.md` | home path and internal workflow, host-specific paths and identity |
| `8d24cc7b091d28716b86c72ef790b8cc751c574d` | `.kogen/intents/k-golden-update-coordinator/intent.md` | private setup and internal delivery wording |
| `8d24cc7b091d28716b86c72ef790b8cc751c574d` | `.kogen/intents/k-git-warning-dirty/intent.md` | host-specific paths and identity |
| `8d24cc7b091d28716b86c72ef790b8cc751c574d` | `project/testdata/parity.json` | home path and internal workflow |
| `8d24cc7b091d28716b86c72ef790b8cc751c574d` | `project/testdata/facts-golden.json` | home path and internal workflow |
| `656694f4b3ef0a982691cabcce8b924ec77eeee9` | `README.md` | private setup and internal delivery wording |
| `656694f4b3ef0a982691cabcce8b924ec77eeee9` | `.kogen/intents/k-contracts-coordinator/intent.md` | home path and internal workflow, host-specific paths and identity |
| `656694f4b3ef0a982691cabcce8b924ec77eeee9` | `.kogen/intents/k-golden-update-coordinator/intent.md` | private setup and internal delivery wording |
| `656694f4b3ef0a982691cabcce8b924ec77eeee9` | `.kogen/intents/k-git-warning-dirty/intent.md` | host-specific paths and identity |
| `656694f4b3ef0a982691cabcce8b924ec77eeee9` | `project/testdata/parity.json` | home path and internal workflow |
| `656694f4b3ef0a982691cabcce8b924ec77eeee9` | `project/testdata/facts-golden.json` | home path and internal workflow |
| `50fb67ac5bcb005a42164e592473183ebc78736e` | `README.md` | private setup and internal delivery wording |
| `50fb67ac5bcb005a42164e592473183ebc78736e` | `.kogen/intents/k-contracts-coordinator/intent.md` | home path and internal workflow, host-specific paths and identity |
| `50fb67ac5bcb005a42164e592473183ebc78736e` | `.kogen/intents/k-golden-update-coordinator/intent.md` | private setup and internal delivery wording |
| `50fb67ac5bcb005a42164e592473183ebc78736e` | `.kogen/intents/k-git-warning-dirty/intent.md` | host-specific paths and identity |
| `50fb67ac5bcb005a42164e592473183ebc78736e` | `project/testdata/parity.json` | home path and internal workflow |
| `50fb67ac5bcb005a42164e592473183ebc78736e` | `project/testdata/facts-golden.json` | home path and internal workflow |
| `0ad33f64273515844c2980a432b1a4219b8e68bb` | `README.md` | private setup and internal delivery wording |
| `0ad33f64273515844c2980a432b1a4219b8e68bb` | `.kogen/intents/k-golden-update-coordinator/intent.md` | private setup and internal delivery wording |
| `0ad33f64273515844c2980a432b1a4219b8e68bb` | `.kogen/intents/k-git-warning-dirty/intent.md` | host-specific paths and identity |
| `0ad33f64273515844c2980a432b1a4219b8e68bb` | `project/testdata/parity.json` | home path and internal workflow |
| `0ad33f64273515844c2980a432b1a4219b8e68bb` | `project/testdata/facts-golden.json` | home path and internal workflow |
| `c056d3750bd4b50b20b179774673cac42716ea81` | `README.md` | private setup and internal delivery wording |
| `c056d3750bd4b50b20b179774673cac42716ea81` | `.kogen/intents/k-git-warning-dirty/intent.md` | host-specific paths and identity |
| `c056d3750bd4b50b20b179774673cac42716ea81` | `project/testdata/parity.json` | home path and internal workflow |
| `c056d3750bd4b50b20b179774673cac42716ea81` | `project/testdata/facts-golden.json` | home path and internal workflow |
| `91f2b297ffa770544aab28c05ecc17882076b42d` | `README.md` | private setup and internal delivery wording |
| `91f2b297ffa770544aab28c05ecc17882076b42d` | `.kogen/intents/k-git-warning-dirty/intent.md` | host-specific paths and identity |
| `91f2b297ffa770544aab28c05ecc17882076b42d` | `project/testdata/parity.json` | home path and internal workflow |
| `91f2b297ffa770544aab28c05ecc17882076b42d` | `project/testdata/facts-golden.json` | home path and internal workflow |
| `fe041a5f6ef18172dd9e69d498402972490bd095` | `README.md` | private setup and internal delivery wording |
| `fe041a5f6ef18172dd9e69d498402972490bd095` | `project/testdata/parity.json` | home path and internal workflow |
| `fe041a5f6ef18172dd9e69d498402972490bd095` | `project/testdata/facts-golden.json` | home path and internal workflow |
| `c6e20bed8b381891e57f356cced5af462c0418e5` | `README.md` | private setup and internal delivery wording |
| `c6e20bed8b381891e57f356cced5af462c0418e5` | `project/testdata/parity.json` | home path and internal workflow |
| `c6e20bed8b381891e57f356cced5af462c0418e5` | `project/testdata/facts-golden.json` | home path and internal workflow |
| `c4a49a4fe84faaa2d3705ad4d270841f4467969f` | `README.md` | private setup and internal delivery wording |
| `c4a49a4fe84faaa2d3705ad4d270841f4467969f` | `project/testdata/parity.json` | home path and internal workflow |
| `c4a49a4fe84faaa2d3705ad4d270841f4467969f` | `project/testdata/facts-golden.json` | home path and internal workflow |

### Host-only override

Commit `ed4f132cf170f5e7779d09211ecedb6473165c07` is the local lineup override, not for publication. Its only change from its parent is the excluded configuration; its remaining snapshot inherits the findings listed for its parent. It is not a publishable-history remediation. No history was rewritten. The owner should decide how to handle historical findings before publication; this report does not assert that the existing history is clean.
