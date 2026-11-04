package contract

import (
	"encoding/json"
	"os"
	"slices"
	"testing"

	"github.com/KogenAI/kogen-coordinator/project"
)

// TestBaselineContractGolden pins the ordered producer list before consumers derive bytes and digests.
func TestBaselineContractGolden(t *testing.T) {
	b, err := os.ReadFile("testdata/baseline.json")
	if err != nil {
		t.Fatal(err)
	}
	var golden map[string][]string
	if err := json.Unmarshal(b, &golden); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"basic", "acceptance", "protect", "team"} {
		t.Run(name, func(t *testing.T) {
			want, ok := golden[name]
			if !ok || want == nil {
				t.Fatalf("missing golden array for %s", name)
			}
			f := newBareFx(t)
			intent := "# Fixture intent\n\nSlug: fixture\nModel: not applicable\nAcceptance:\n"
			config := "version: 1\ncommands:\n  acceptance:\n    run: sh accept.sh\n    steps_dir: features/steps\n"
			switch name {
			case "acceptance":
				intent += "- .kogen/intents/fixture/acceptance.feature\n- features/steps/z.js\n- features/steps/a.js\n- .kogen/intents/fixture/intent.md\n"
				f.write(t, ".kogen/intents/fixture/acceptance.feature", fixtureFeature)
				f.write(t, ".kogen/intents/fixture/b.txt", "b\n")
				f.write(t, ".kogen/intents/fixture/notes.md", "notes\n")
				f.write(t, "features/steps/z.js", "// z\n")
				f.write(t, "features/steps/a.js", "// a\n")
			case "protect":
				config += "protect:\n  - guard/**\n"
				f.write(t, "guard/z.txt", "z\n")
				f.write(t, "guard/a/deep.txt", "deep\n")
				f.write(t, "unprotected.txt", "unprotected\n")
			case "team":
				f.write(t, ".kogen/models.yaml", project.ModelsTemplate())
			}
			f.write(t, ".kogen/intents/fixture/intent.md", intent)
			f.write(t, ".kogen/project.yaml", config)
			cfg, err := project.LoadConfig(f.Dir)
			if err != nil {
				t.Fatal(err)
			}
			got, err := project.Baseline(f.Dir, fixtureSlug, cfg)
			if err != nil {
				t.Fatal(err)
			}
			if !slices.Equal(want, got) {
				oldJSON, _ := json.Marshal(want)
				newJSON, _ := json.Marshal(got)
				t.Errorf("%s baseline mismatch\nold: %s\nnew: %s", name, oldJSON, newJSON)
			}
		})
	}
}
