package contract

import (
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/KogenAI/kogen-coordinator/project"
)

func TestModelsLineup(t *testing.T) {
	root := t.TempDir()
	if project.ModelsPath != ".kogen/models.yaml" || project.LocalModelsPath != ".kogen/local/models.yaml" {
		t.Fatal("lineup paths changed")
	}
	if _, err := project.LoadModels(root); err == nil || !strings.Contains(err.Error(), project.ModelsPath) {
		t.Fatalf("missing team: %v", err)
	}
	writeFile(t, root, project.ModelsPath, project.ModelsTemplate())
	lineup, err := project.LoadModels(root)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(lineup.Roles, project.DefaultModels()) {
		t.Fatalf("template: %+v", lineup)
	}
	for _, role := range project.ModelRoles {
		if lineup.Sources[role] != project.ModelsPath {
			t.Fatalf("source: %+v", lineup.Sources)
		}
	}
	team := "models:\n  build: {provider: openai-compatible, model: team, effort: high, base_url: 'http://localhost/v1/'}\n"
	local := "models:\n  build: {executor: claude-code, model: local, effort: max}\n"
	writeFile(t, root, project.ModelsPath, team)
	writeFile(t, root, project.LocalModelsPath, local)
	lineup, err = project.LoadModels(root)
	if err != nil {
		t.Fatal(err)
	}
	if lineup.Roles["build"] != (project.Role{Executor: "claude-code", Model: "local", Effort: "max"}) || lineup.Sources["build"] != project.LocalModelsPath || lineup.Roles["shape"] != project.DefaultModels()["shape"] || lineup.Sources["shape"] != project.ModelsPath {
		t.Fatalf("override: %+v", lineup)
	}
	for path, want := range map[string]string{project.ModelsPath: team, project.LocalModelsPath: local} {
		b, err := os.ReadFile(filepath.Join(root, path))
		if err != nil || string(b) != want {
			t.Fatalf("file %s changed: %v", path, err)
		}
	}
}

func TestModelsValidation(t *testing.T) {
	for _, body := range []string{
		"models:\n  build: {provider: openai-compatible, model: m, effort: high}\n",
		"models:\n  build: {executor: claude-code, provider: anthropic, model: m, effort: max}\n",
		"models:\n  build: {provider: anthropic, model: m, effort: ultra}\n",
		"models: {}\nversion: 1\n",
	} {
		for _, path := range []string{project.ModelsPath, project.LocalModelsPath} {
			t.Run(path+body, func(t *testing.T) {
				root := t.TempDir()
				writeFile(t, root, project.ModelsPath, "models: {}\n")
				writeFile(t, root, path, body)
				_, err := project.LoadModels(root)
				e := wantSysError(t, err, "environment", "project_config_invalid", 3)
				if !strings.Contains(e.Detail, path) || len(e.Lines) == 0 || !strings.HasPrefix(e.Lines[0], "line ") {
					t.Fatalf("error: %+v", e)
				}
			})
		}
	}
}

func TestModelsBaselineHash(t *testing.T) {
	root := t.TempDir()
	paths, err := project.Baseline(root, "missing", &project.Config{})
	if err != nil || !reflect.DeepEqual(paths, []string{project.ConfigPath}) {
		t.Fatalf("baseline: %v %v", paths, err)
	}
	before := project.Hash(root, paths)
	writeFile(t, root, project.LocalModelsPath, "models: {}\n")
	if project.Hash(root, paths) != before {
		t.Fatal("local file changed approval")
	}
	equal(t, "LocalChecksPath", project.LocalChecksPath, ".kogen/local/checks.yaml")
	writeFile(t, root, project.LocalChecksPath, "checks: []\n")
	if project.Hash(root, paths) != before {
		t.Fatal("local checks file changed approval")
	}
	writeFile(t, root, project.ModelsPath, "models: {}\n")
	paths, err = project.Baseline(root, "missing", &project.Config{})
	if err != nil || !reflect.DeepEqual(paths, []string{project.ConfigPath, project.ModelsPath}) {
		t.Fatalf("baseline with the team file: %v %v", paths, err)
	}
	if project.Hash(root, paths) == before {
		t.Fatal("team file did not change approval")
	}
}
