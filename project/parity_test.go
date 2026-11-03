package project

import (
	"encoding/json"
	"os"
	"slices"
	"testing"
)

// parityFile is testdata/parity.json. It pins what the Elixir Kogen computed for three real
// Intent packages of this repository (Kogen.Intent.baseline/3 and hash/2, via `mix run`): the
// baseline file list in card order and the approval hash, over the exact bytes of those files,
// which parity.json carries as recorded inputs. The approval hash a user types must be identical
// between the two implementations.
//
// `go test ./... -update` records the current Go baseline and hash only for the cases that no
// longer match; matching cases and the files stay as recorded. Changing a recorded approval hash
// is a deliberate, reviewed change (`git diff -- project/testdata`): it pins hashes users have
// approved.
const parityFile = "testdata/parity.json"

func TestIntentHashMatchesElixir(t *testing.T) {
	u := updatesOf(t, parityFile)
	b, err := os.ReadFile(parityFile)
	if err != nil {
		t.Fatal(err)
	}
	var parity struct {
		Cases []struct {
			Slug, Hash string
			Baseline   []string
		}
		Files map[string]string
	}
	if err := json.Unmarshal(b, &parity); err != nil {
		t.Fatal(err)
	}
	if len(parity.Cases) < 3 {
		t.Fatalf("only %d pinned packages", len(parity.Cases))
	}
	root := gitRepo(t)
	for p, content := range parity.Files {
		writeFile(t, root, p, content)
	}
	cfg, err := LoadConfig(root)
	if err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(cfg.Protect, []string{".formatter.exs", "mix.exs"}) || cfg.Models["shape"] != (Role{Provider: "supergrok", Model: "grok-4.7", Effort: "high"}) {
		t.Fatalf("pinned configuration read as %+v", cfg)
	}
	for i, c := range parity.Cases {
		t.Run(c.Slug, func(t *testing.T) {
			baseline, err := Baseline(root, c.Slug, cfg)
			if err != nil {
				t.Fatal(err)
			}
			if !slices.Equal(baseline, c.Baseline) && !u.record(baseline, "cases", i, "baseline") {
				t.Errorf("baseline\n got %q\nwant %q", baseline, c.Baseline)
			}
			if got := Hash(root, baseline); got != c.Hash && !u.record(got, "cases", i, "hash") {
				t.Errorf("hash %s, want %s", got, c.Hash)
			}
			// Reading and checking the package must work on the same files.
			if in, err := LoadIntent(root, c.Slug); err != nil || in.Title == "" || len(in.Acceptance) < 2 {
				t.Errorf("intent %+v %v", in, err)
			}
			if _, scenarios, err := CheckIntent(root, c.Slug, nil); err != nil || len(scenarios) == 0 {
				t.Errorf("check: %v (%d scenarios)", err, len(scenarios))
			}
		})
	}
}
