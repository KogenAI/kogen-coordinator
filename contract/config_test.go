package contract

import (
	"encoding/json"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/KogenAI/kogen-coordinator/project"
)

const fullConfig = `version: 1
commands:
  setup:
    - a
    - b
  fix:
    - c
  checks:
    - name: unit
      run: u
  acceptance:
    run: r
    steps_dir: features/steps/
protect:
  - .eslintrc
  - config/
shape_workers:
  enabled: true
  read: {model: r1, effort: low}
  probe: {model: p1, effort: low}
  draft: {model: d1, effort: low}
shape_audit:
  enabled: true
shape_decision_check:
  enabled: true
review_material:
  mode: on_demand
models:
  shape: {provider: anthropic, model: m, effort: max}
  build: {provider: openai-compatible, model: b, effort: high, base_url: "http://localhost:11434/v1/"}
`

// config-path: kogen-shaping shape/helper_test.go and shape_test.go write the project file to
// .kogen/project.yaml and read it back with LoadConfig; kogen cli/repository_config_test.go
// names the same path.
func TestConfigPathAndLoad(t *testing.T) {
	equal(t, "ConfigPath", project.ConfigPath, ".kogen/project.yaml")
	root := t.TempDir()
	writeFile(t, root, ".kogen/project.yaml", fullConfig)
	cfg, err := project.LoadConfig(root)
	if err != nil {
		t.Fatal(err)
	}
	parsed, err := project.ParseConfig(fullConfig, filepath.Join(root, project.ConfigPath))
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(cfg, parsed) {
		t.Fatalf("LoadConfig = %+v, ParseConfig = %+v", cfg, parsed)
	}

	equalList(t, "Setup", cfg.Setup, []string{"a", "b"})
	equalList(t, "Fix", cfg.Fix, []string{"c"})
	if want := []project.Check{{Name: "unit", Run: "u"}}; !reflect.DeepEqual(cfg.Checks, want) {
		t.Fatalf("Checks = %+v, want %+v", cfg.Checks, want)
	}
	if want := (&project.Acceptance{Run: "r", StepsDir: "features/steps"}); !reflect.DeepEqual(cfg.Acceptance, want) {
		t.Fatalf("Acceptance = %+v, want %+v", cfg.Acceptance, want)
	}
	equal(t, "Acceptance.Run", cfg.Acceptance.Run, "r")
	equal(t, "Acceptance.StepsDir", cfg.Acceptance.StepsDir, "features/steps")
	equal(t, "AcceptanceConfigured", cfg.AcceptanceConfigured(), true)
	equalList(t, "Protect", cfg.Protect, []string{".eslintrc", "config/"})
	equal(t, "ShapeAudit", cfg.ShapeAudit, project.Audit{Enabled: true})
	equal(t, "ShapeAudit.Enabled", cfg.ShapeAudit.Enabled, true)
	equal(t, "ShapeDecisionCheck", cfg.ShapeDecisionCheck, project.DecisionCheck{Enabled: true})
	equal(t, "ShapeDecisionCheck.Enabled", cfg.ShapeDecisionCheck.Enabled, true)
	equal(t, "ReviewMaterial", cfg.ReviewMaterial, project.ReviewMaterial{Mode: "on_demand"})
	equal(t, "ReviewMaterial.Mode", cfg.ReviewMaterial.Mode, "on_demand")

	var workers project.Workers = cfg.ShapeWorkers
	equal(t, "ShapeWorkers.Enabled", workers.Enabled, true)
	wantRoles := map[string]project.Role{
		"read":  {Model: "r1", Effort: "low"},
		"probe": {Model: "p1", Effort: "low"},
		"draft": {Model: "d1", Effort: "low"},
	}
	if !reflect.DeepEqual(workers.Roles, wantRoles) {
		t.Fatalf("ShapeWorkers.Roles = %+v, want %+v", workers.Roles, wantRoles)
	}

	var shape project.Role = cfg.Models["shape"]
	equal(t, "shape Provider", shape.Provider, "anthropic")
	equal(t, "shape Model", shape.Model, "m")
	equal(t, "shape Effort", shape.Effort, "max")
	equal(t, "shape External", shape.External(), false)
	build := cfg.Models["build"]
	equal(t, "build Provider", build.Provider, "openai-compatible")
	equal(t, "build BaseURL", build.BaseURL, "http://localhost:11434/v1")
	equal(t, "review is the default", cfg.Models["review"], project.DefaultModels()["review"])
}

// config-invalid-lines: kogen-shaping shape/init_test.go expects the invalid-configuration
// error to name the file and carry one line per problem.
func TestConfigInvalidNamesTheLines(t *testing.T) {
	_, err := project.ParseConfig("version: 1\nbogus: 1\n", "f.yaml")
	e := wantSysError(t, err, "environment", "project_config_invalid", 3)
	equal(t, "detail", e.Detail, "f.yaml")
	equalList(t, "lines", e.Lines, []string{"line 2: unknown key bogus"})
	equal(t, "message", e.Error(), "environment/project_config_invalid: f.yaml")
}

// config-not-initialized: kogen-shaping shape/shape_test.go.
func TestConfigNotInitialized(t *testing.T) {
	root := t.TempDir()
	_, err := project.LoadConfig(root)
	e := wantSysError(t, err, "environment", "not_initialized", 3)
	equal(t, "detail", e.Detail, root+" has no .kogen/project.yaml; run kogen init")

	_, err = project.ParseConfig("commands:\n  setup: []\n", "old.yaml")
	wantSysError(t, err, "environment", "old_kogen_config", 3)
}

// named-commands: kogen-verification verify/run.go reports the commands under these names, in
// this order; kogen cli/approve_deadline_test.go names them in its deadlines.
func TestNamedCommandsOrder(t *testing.T) {
	cfg := &project.Config{
		Setup:      []string{"a", "b"},
		Fix:        []string{"c"},
		Checks:     []project.Check{{Name: "unit", Run: "u"}},
		Acceptance: &project.Acceptance{Run: "r", StepsDir: "features/steps"},
	}
	var want = []project.NamedCommand{
		{Name: "setup-1", Run: "a"}, {Name: "setup-2", Run: "b"}, {Name: "fix-1", Run: "c"},
		{Name: "unit", Run: "u"}, {Name: "acceptance", Run: "r"},
	}
	got := cfg.NamedCommands()
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("NamedCommands = %+v, want %+v", got, want)
	}
	var runs []string
	for _, c := range got {
		runs = append(runs, c.Run)
	}
	equalList(t, "runs", runs, []string{"a", "b", "c", "u", "r"})
	if len((&project.Config{Acceptance: &project.Acceptance{StepsDir: "x"}}).NamedCommands()) != 0 {
		t.Fatal("an acceptance without a run is a command")
	}
}

// external-rounds and executor-claude-code: kogen-shaping shape/lineup_shape_test.go and
// kogen-build build/lineup_test.go.
func TestExecutorRoleLineup(t *testing.T) {
	equal(t, "DefaultExternalRounds", project.DefaultExternalRounds, 6)
	equal(t, "ExecutorClaudeCode", project.ExecutorClaudeCode, "claude-code")
	equal(t, "ExecutorNative", project.ExecutorNative, "native")

	cfg, err := project.ParseConfig("version: 1\nmodels:\n  shape: {executor: claude-code, model: m, effort: high}\n", "f")
	if err != nil {
		t.Fatal(err)
	}
	want := project.Role{Model: "m", Effort: "high", Executor: "claude-code", MaxRounds: 0}
	if got := cfg.Models["shape"]; got != want || !got.External() {
		t.Fatalf("shape = %+v (external %v), want %+v", got, got.External(), want)
	}
	if got := cfg.Models["shape"].Executor; got != project.ExecutorClaudeCode {
		t.Fatalf("Executor = %q", got)
	}

	_, err = project.ParseConfig("version: 1\nmodels:\n  build: {executor: claude-code, model: m, effort: high, max_rounds: 3}\n", "f")
	e := wantSysError(t, err, "environment", "project_config_invalid", 3)
	equalList(t, "lines", e.Lines, []string{"line 3: models.build.max_rounds was removed; the external executor's own round limit caps a role, and 6 caps a review role whose executor supplies none"})

	// An explicit native role is the omitted one, and neither names an executor in its state.
	omitted, err := project.ParseConfig("version: 1\nmodels:\n  review: {model: r, effort: high}\n", "f")
	if err != nil {
		t.Fatal(err)
	}
	explicit, err := project.ParseConfig("version: 1\nmodels:\n  review: {executor: native, model: r, effort: high}\n", "f")
	if err != nil {
		t.Fatal(err)
	}
	if omitted.Models["review"] != explicit.Models["review"] || explicit.Models["review"].External() {
		t.Fatalf("explicit native %+v differs from omitted %+v", explicit.Models["review"], omitted.Models["review"])
	}
	b, err := json.Marshal(explicit.Models["review"])
	if err != nil {
		t.Fatal(err)
	}
	equal(t, "native role JSON", string(b), `{"Provider":"","Model":"r","Effort":"high"}`)

	_, err = project.ParseConfig("version: 1\nmodels:\n  build: {executor: native, model: m, effort: low, max_rounds: 2}\n", "f")
	e = wantSysError(t, err, "environment", "project_config_invalid", 3)
	equalList(t, "lines", e.Lines, []string{"line 3: models.build.max_rounds was removed; the external executor's own round limit caps a role, and 6 caps a review role whose executor supplies none"})
}

// kogen cli/readiness/readiness.go reads what it can of an invalid file and lists the model
// roles in the template's order.
func TestReadableConfigAndModelRoles(t *testing.T) {
	equalList(t, "ModelRoles", project.ModelRoles[:], []string{"shape", "build", "review"})
	readable := project.ReadableConfig("version: 1\nprotect:\n  - keep\nbogus: 1\nmodels:\n  build: {model: x, effort: low}\n")
	equalList(t, "Protect", readable.Protect, []string{"keep"})
	equal(t, "build Model", readable.Models["build"].Model, "x")
	broken := project.ReadableConfig("version: 1\n\tbad: [\n")
	if !reflect.DeepEqual(broken.Models, project.DefaultModels()) || len(broken.Protect) != 0 {
		t.Fatalf("ReadableConfig of an unparsable file = %+v", broken)
	}
	for _, role := range project.ModelRoles {
		if project.DefaultModels()[role].Model == "" {
			t.Fatalf("DefaultModels has no %s", role)
		}
	}
}

// kogen-shaping shape/init.go writes the template and the rendered configuration `kogen init`
// keeps; kogen-build build/facts_test.go and helper_test.go write them as project files.
func TestTemplateAndRenderConfig(t *testing.T) {
	tpl := project.Template()
	root := t.TempDir()
	writeFile(t, root, project.ConfigPath, tpl)
	cfg, err := project.LoadConfig(root)
	if err != nil {
		t.Fatal(err)
	}
	if len(cfg.Setup)+len(cfg.Fix)+len(cfg.Checks)+len(cfg.Protect) != 0 || cfg.Acceptance != nil || cfg.AcceptanceConfigured() {
		t.Fatalf("template configuration %+v", cfg)
	}
	if !reflect.DeepEqual(cfg.Models, project.DefaultModels()) {
		t.Fatalf("template models %+v", cfg.Models)
	}
	if !strings.HasPrefix(tpl, "version: 1\ncommands:\n") {
		t.Fatalf("template %q", tpl)
	}
	equal(t, "empty render is the template", project.RenderConfig(cfg), tpl)

	kept := &project.Config{
		Setup:      []string{"go mod download"},
		Fix:        []string{"gofmt -w ."},
		Checks:     []project.Check{{Name: "test", Run: "go test ./..."}},
		Acceptance: &project.Acceptance{Run: "it's", StepsDir: "features/steps"},
		Protect:    []string{".golangci.yml"},
		Models:     project.DefaultModels(),
	}
	rendered := project.RenderConfig(kept)
	back, err := project.ParseConfig(rendered, "rendered")
	if err != nil {
		t.Fatalf("%v\n%s", err, rendered)
	}
	kept.ShapeWorkers.Roles = map[string]project.Role{}
	kept.ReviewMaterial.Mode = "parts"
	if !reflect.DeepEqual(back, kept) {
		t.Fatalf("rendered configuration reads back as %+v, want %+v\n%s", back, kept, rendered)
	}
}

// kogen-shaping shape/init.go detects the commands `kogen init` starts from and chooses the
// acceptance command of the runner it found.
func TestDetectAndAcceptanceCommand(t *testing.T) {
	var d project.Detected = project.Detect(map[string]string{
		"go.mod":       "module example\n",
		"package.json": `{"scripts":{"test":"jest","lint":"eslint ."},"devDependencies":{"@cucumber/cucumber":"1"}}`,
	}, []string{"go.mod", "package.json", "package-lock.json", "features/step_definitions/a.js"})
	equalList(t, "Setup", d.Setup, []string{"npm ci --no-audit --no-fund", "go mod download"})
	equalList(t, "Fix", d.Fix, nil)
	equalList(t, "Protect", d.Protect, nil)
	equal(t, "Runner", d.Runner, "features/step_definitions")
	var names []string
	for _, c := range d.Checks {
		names = append(names, c.Name+"="+c.Run)
	}
	equalList(t, "Checks", names, []string{
		"test=npm run test", "lint=npm run lint",
		"go-format=" + `test -z "$(gofmt -l .)"`, "go-test=go test ./...", "go-vet=go vet ./...", "go-build=go build -o /dev/null ./...",
	})

	mix := project.Detect(map[string]string{"mix.exs": "deps: [:credo]"}, []string{".formatter.exs", ".credo.exs"})
	equalList(t, "mix Fix", mix.Fix, []string{"mix format"})
	equalList(t, "mix Protect", mix.Protect, []string{".formatter.exs", ".credo.exs"})

	const args = ` --strict --require 'features/steps/*.js' --format "message:$KOGEN_ACCEPTANCE_REPORT" "$KOGEN_ACCEPTANCE_FEATURES"`
	runners := []struct {
		runner project.Runner
		want   string
	}{
		{project.ProjectRunner, `"$KOGEN_NODE" node_modules/@cucumber/cucumber/bin/cucumber.js` + args},
		{project.KogenRunner, `NODE_PATH="$KOGEN_CUCUMBER" "$KOGEN_NODE" "$KOGEN_CUCUMBER/@cucumber/cucumber/bin/cucumber.js"` + args},
	}
	for _, c := range runners {
		equal(t, "acceptance command", project.AcceptanceCommand("features/steps", c.runner), c.want)
	}
}
