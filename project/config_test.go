package project

import (
	"encoding/json"
	"errors"
	"fmt"
	"maps"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"strings"
	"testing"

	"github.com/KogenAI/kogen-loop/sys"
)

func mustParse(t *testing.T, text string) *Config {
	t.Helper()
	c, err := ParseConfig(text, "/project/.kogen/project.yaml")
	if err != nil {
		t.Fatal(err)
	}
	return c
}

func configError(t *testing.T, text, file string) *sys.Error {
	t.Helper()
	_, err := ParseConfig(text, file)
	se, ok := sys.AsError(err)
	if !ok {
		t.Fatalf("got %v, want a *sys.Error", err)
	}
	return se
}

// loadModelsText loads a project whose `.kogen/models.yaml` holds models: roles are validated by
// LoadConfig exactly as the models file schema decides.
func loadModelsText(t *testing.T, models string) (*Config, error) {
	t.Helper()
	root := t.TempDir()
	writeFile(t, root, ConfigPath, "version: 1\n")
	writeFile(t, root, ModelsPath, models)
	return LoadConfig(root)
}

func modelsConfig(t *testing.T, models string) *Config {
	t.Helper()
	cfg, err := loadModelsText(t, models)
	if err != nil {
		t.Fatal(err)
	}
	return cfg
}

func modelsError(t *testing.T, models string) *sys.Error {
	t.Helper()
	_, err := loadModelsText(t, models)
	se, ok := sys.AsError(err)
	if !ok {
		t.Fatalf("got %v, want a *sys.Error", err)
	}
	return se
}

func TestRenderConfigBlockCollectionsAndLongValues(t *testing.T) {
	// ExUnit: SET-8: generated settings use block collections and preserve long command values
	input := &Config{
		Setup: []string{"mix deps.get", "npm ci --no-audit --no-fund"},
		Fix:   []string{"mix format"},
		Checks: []Check{
			{"format", "mix format --check-formatted && npx prettier --check '**/*.{js,css,json,yaml}'"},
			{"test", `mix test && printf '%s\n' 'checks passed'`},
		},
		Protect: []string{".formatter.exs", "config/checks/very-long-path-to-project-formatting-configuration.yaml"},
		Acceptance: &Acceptance{
			Run:      `node "$KOGEN_CUCUMBER/@cucumber/cucumber/bin/cucumber.js" --format message:"$KOGEN_ACCEPTANCE_REPORT"`,
			StepsDir: "features/steps",
		},
	}
	text := RenderConfig(input)
	for _, want := range []string{
		"  checks:\n    - name: format\n      run:",
		"protect:\n  - '.formatter.exs'\n",
	} {
		if !strings.Contains(text, want) {
			t.Errorf("rendered text lacks %q:\n%s", want, text)
		}
	}
	if strings.Contains(text, "models:") || !strings.HasSuffix(text, "  - 'config/checks/very-long-path-to-project-formatting-configuration.yaml'\n") {
		t.Errorf("rendered text has a models block or does not end with the protect lines:\n%s", text)
	}
	cfg := mustParse(t, text)
	if !slices.Equal(cfg.Setup, input.Setup) || !slices.Equal(cfg.Fix, input.Fix) || !slices.Equal(cfg.Checks, input.Checks) || !slices.Equal(cfg.Protect, input.Protect) {
		t.Errorf("round trip lost commands: %+v", cfg)
	}
	if *cfg.Acceptance != *input.Acceptance {
		t.Errorf("acceptance %+v", cfg.Acceptance)
	}
	if !maps.Equal(cfg.Models, DefaultModels()) {
		t.Errorf("models = %+v, want the defaults", cfg.Models)
	}
	// Whatever c.Models holds, no models block is written.
	input.Models = map[string]Role{"build": {Executor: ExecutorClaudeCode, Model: "m", Effort: "high"}}
	if got := RenderConfig(input); got != text {
		t.Errorf("rendering with Models differs:\n%s\n---\n%s", got, text)
	}
}

func TestRenderEmptyConfigEqualsTemplate(t *testing.T) {
	// ExUnit: SET-8: empty generated settings retain the template's nulls and empty lists
	text := RenderConfig(&Config{})
	if text != Template() {
		t.Errorf("rendered empty settings differ from the template:\n%s\n---\n%s", text, Template())
	}
	if !reflect.DeepEqual(mustParse(t, text), mustParse(t, Template())) {
		t.Error("parsed generated text differs from parsed template")
	}
}

func TestTemplateText(t *testing.T) {
	want := `version: 1
commands:
  setup: []          # run before readiness dry runs and before each Build
  fix: []            # deterministic fixers, run once after each builder round
  checks: []         # project checks, e.g. {name: test, run: "mix test"}
  acceptance:
    run: null        # the acceptance command (VER-3)
    steps_dir: null  # where shaping writes step-definition files
protect: []          # check configuration the Build must not change, e.g. .credo.exs
`
	if Template() != want {
		t.Errorf("template:\n%s", Template())
	}
	if strings.Contains(Template(), "models:") {
		t.Error("the template has a models block")
	}
	wantDefaults := map[string]Role{
		"shape":  {Model: "gpt-6.1-sol", Effort: "high"},
		"build":  {Model: "gpt-6.1-sol", Effort: "medium"},
		"review": {Model: "gpt-6.1-terra", Effort: "medium"},
	}
	if !maps.Equal(DefaultModels(), wantDefaults) {
		t.Errorf("DefaultModels = %+v, want %+v", DefaultModels(), wantDefaults)
	}
	d := DefaultModels()
	d["shape"] = Role{Model: "changed"}
	if DefaultModels()["shape"].Model != "gpt-6.1-sol" {
		t.Error("DefaultModels shares state between calls")
	}
}

func TestRenderConfigQuoting(t *testing.T) {
	text := RenderConfig(&Config{
		Setup:      []string{"it's"},
		Checks:     []Check{{"a", "echo 'q'"}},
		Protect:    []string{"a'b"},
		Acceptance: &Acceptance{Run: "x", StepsDir: "s"},
	})
	for _, want := range []string{"    - 'it''s'\n", "      run: 'echo ''q'''\n", "  - 'a''b'\n", "    run: 'x'\n    steps_dir: 's'\n"} {
		if !strings.Contains(text, want) {
			t.Errorf("lacks %q:\n%s", want, text)
		}
	}
	cfg := mustParse(t, text)
	if cfg.Setup[0] != "it's" || cfg.Checks[0].Run != "echo 'q'" || cfg.Protect[0] != "a'b" {
		t.Errorf("round trip %+v", cfg)
	}
}

func TestParseConfigInterpretsCommands(t *testing.T) {
	// ExUnit: SET-8: commands, checks, acceptance, protect and model defaults are interpreted
	cfg := mustParse(t, `version: 1
commands:
  setup: [mix deps.get, npm ci]
  fix: [mix format]
  checks: [{name: test, run: mix test}, {name: lint, run: mix credo}]
  acceptance: {run: "npx cucumber --format message:$KOGEN_ACCEPTANCE_REPORT", steps_dir: features/steps/}
protect: [".credo.exs", "config/**/*.yaml"]
`)
	if !slices.Equal(cfg.Setup, []string{"mix deps.get", "npm ci"}) || !slices.Equal(cfg.Fix, []string{"mix format"}) {
		t.Errorf("setup/fix %v %v", cfg.Setup, cfg.Fix)
	}
	if !slices.Equal(cfg.Checks, []Check{{"test", "mix test"}, {"lint", "mix credo"}}) {
		t.Errorf("checks %v", cfg.Checks)
	}
	if *cfg.Acceptance != (Acceptance{Run: "npx cucumber --format message:$KOGEN_ACCEPTANCE_REPORT", StepsDir: "features/steps"}) {
		t.Errorf("acceptance %+v", cfg.Acceptance)
	}
	if !slices.Equal(cfg.Protect, []string{".credo.exs", "config/**/*.yaml"}) {
		t.Errorf("protect %v", cfg.Protect)
	}
	if !maps.Equal(cfg.Models, DefaultModels()) {
		t.Errorf("models %v", cfg.Models)
	}
	wantNamed := []NamedCommand{
		{"setup-1", "mix deps.get"}, {"setup-2", "npm ci"}, {"fix-1", "mix format"},
		{"test", "mix test"}, {"lint", "mix credo"},
		{"acceptance", "npx cucumber --format message:$KOGEN_ACCEPTANCE_REPORT"},
	}
	if got := cfg.NamedCommands(); !slices.Equal(got, wantNamed) {
		t.Errorf("named commands %v", got)
	}
	if !cfg.AcceptanceConfigured() {
		t.Error("acceptance is configured")
	}
}

func TestModelsFileRejectsPlanRole(t *testing.T) {
	// The planner role is not a role of the models file.
	se := modelsError(t, ModelsTemplate()+"  plan: {model: old-planner, effort: high}\n")
	if !slices.Equal(se.Lines, []string{"line 11: unknown key plan"}) {
		t.Errorf("lines %q", se.Lines)
	}
}

func TestParseConfigRefusesModelsKey(t *testing.T) {
	const want = "line 6: models is no longer read from .kogen/project.yaml; move the model lineup to .kogen/models.yaml"
	text := "version: 1\ncommands:\n  checks:\n    - name: test\n      run: 'go test ./...'\nmodels:\n  build: {executor: claude-code, model: m, effort: high}\n"
	check := func(label string, err error, file string, lines ...string) {
		t.Helper()
		se, ok := sys.AsError(err)
		if !ok || se.Class != "environment" || se.Reason != "project_config_invalid" || se.Exit != 3 ||
			se.Detail != file || !slices.Equal(se.Lines, lines) {
			t.Errorf("%s: got %+v", label, err)
		}
	}
	_, err := ParseConfig(text, "/p/.kogen/project.yaml")
	check("ParseConfig", err, "/p/.kogen/project.yaml", want)
	root := t.TempDir()
	writeFile(t, root, ConfigPath, text)
	_, err = LoadConfig(root)
	check("LoadConfig", err, filepath.Join(root, ConfigPath), want)
	// The contents under the key are not validated, and other problems are reported alongside it
	// in line order.
	for label, models := range map[string]string{"scalar": "models: x\n", "garbage": "models:\n  plan: garbage\n  other: 1\n  build: {model: 1}\n"} {
		_, err = ParseConfig("version: 1\nprotect: x\n"+models+"zzz: 1\n", "f")
		se, _ := sys.AsError(err)
		last := "line 4: unknown key zzz"
		if label == "garbage" {
			last = "line 7: unknown key zzz"
		}
		if se == nil || !slices.Equal(se.Lines, []string{"line 2: protect must be a list", "line 3: models is no longer read from .kogen/project.yaml; move the model lineup to .kogen/models.yaml", last}) {
			t.Errorf("%s: %+v", label, err)
		}
	}
	// A project file without the key still parses, with the default roles.
	if cfg := mustParse(t, "version: 1\n"); !maps.Equal(cfg.Models, DefaultModels()) {
		t.Errorf("models %+v", cfg.Models)
	}
}

func TestReadableConfigDoesNotApplyModelsKey(t *testing.T) {
	cfg := ReadableConfig("version: 1\ncommands:\n  checks:\n    - name: unit\n      run: u\nprotect:\n  - keep\nmodels:\n  build: {model: x, effort: low}\n")
	if !slices.Equal(cfg.Checks, []Check{{"unit", "u"}}) || !slices.Equal(cfg.Protect, []string{"keep"}) {
		t.Errorf("readable remainder lost: %+v", cfg)
	}
	if !maps.Equal(cfg.Models, DefaultModels()) {
		t.Errorf("models %+v, want the defaults", cfg.Models)
	}
}

func TestParseConfigPlainScalarKeepsComma(t *testing.T) {
	// ExUnit: SET-8: a plain command scalar keeps its comma and shell arguments
	cfg := mustParse(t, "version: 1\ncommands:\n  checks:\n    - name: test\n      run: python3 -c \"print(1, 2)\"\n")
	if !slices.Equal(cfg.Checks, []Check{{"test", `python3 -c "print(1, 2)"`}}) {
		t.Errorf("checks %v", cfg.Checks)
	}
}

func TestParseConfigAcceptanceNull(t *testing.T) {
	// ExUnit: SET-8: acceptance run and steps_dir may remain null until configured
	cfg := mustParse(t, "version: 1\ncommands:\n  acceptance:\n    run: null\n    steps_dir: null\n")
	if cfg.Acceptance != nil || cfg.AcceptanceConfigured() {
		t.Errorf("acceptance %+v", cfg.Acceptance)
	}
	for _, nc := range cfg.NamedCommands() {
		if nc.Name == "acceptance" {
			t.Error("a null acceptance command is listed")
		}
	}
	half := mustParse(t, "version: 1\ncommands:\n  acceptance:\n    run: x\n")
	if half.Acceptance == nil || half.Acceptance.Run != "x" || half.AcceptanceConfigured() {
		t.Errorf("half-configured acceptance %+v", half.Acceptance)
	}
}

func TestParseConfigInvalidNamesFileAndLine(t *testing.T) {
	// ExUnit: SET-4 / SET-8: invalid configuration errors name the file and each source line
	cases := []struct {
		label, text string
		line        int
		message     string
	}{
		{"root unknown key", "version: 1\nlimits: 3\n", 2, "unknown key limits"},
		{"nested unknown key", "version: 1\ncommands:\n  checks:\n    - name: test\n      runn: mix test\n", 5, "unknown key runn"},
		{"duplicate key", "version: 1\ncommands:\n  acceptance:\n    run: first\n    run: second\n", 5, "duplicate key run"},
		{"acceptance run boolean", "version: 1\ncommands:\n  acceptance:\n    run: true\n", 4, "commands.acceptance.run must be a string or null"},
		{"check run boolean", "version: 1\ncommands:\n  checks:\n    - name: test\n      run: true\n", 4, "a check needs a name and a run string"},
		{"checks null", "version: 1\ncommands:\n  checks: null\n", 3, "commands.checks must be a list"},
		{"setup null", "version: 1\ncommands:\n  setup: null\n", 3, "commands.setup must be a list"},
		{"protect null", "version: 1\nprotect: null\n", 2, "protect must be a list"},
		{"duplicate check name", "version: 1\ncommands:\n  checks:\n    - name: test\n      run: one\n    - name: test\n      run: two\n", 6, "check name test is used twice"},
		{"uppercase check name", "version: 1\ncommands:\n  checks:\n    - name: Unit\n      run: mix test\n", 4, "check name Unit must be lowercase"},
		{"acceptance reserved name", "version: 1\ncommands:\n  checks:\n    - name: acceptance\n      run: mix test\n", 4, "check name acceptance is reserved"},
		{"model reserved name", "version: 1\ncommands:\n  checks:\n    - name: model\n      run: mix test\n", 4, "check name model is reserved"},
		{"steps_dir number", "version: 1\ncommands:\n  acceptance:\n    steps_dir: 3\n", 4, "commands.acceptance.steps_dir must be a string or null"},
	}
	for _, c := range cases {
		t.Run(c.label, func(t *testing.T) {
			file := "/tmp/" + c.label + "/.kogen/project.yaml"
			se := configError(t, c.text, file)
			if se.Class != "environment" || se.Reason != "project_config_invalid" || se.Detail != file || se.Exit != 3 {
				t.Errorf("error %+v", se)
			}
			if want := []string{fmt.Sprintf("line %d: %s", c.line, c.message)}; !slices.Equal(se.Lines, want) {
				t.Errorf("lines %q, want %q", se.Lines, want)
			}
		})
	}
}

func TestParseConfigMoreRules(t *testing.T) {
	cases := []struct {
		label, text string
		lines       []string
	}{
		{"version wrong", "version: 2\n", []string{"line 1: version must be 1"}},
		{"version quoted", "version: \"1\"\n", []string{"line 1: version must be 1"}},
		{"top level list", "- a\n- b\n", []string{"line 1: the file must be a mapping"}},
		{"empty file", "", []string{"line 1: the file is empty"}},
		{"yaml error", "version: 1\ncommands:\n  setup: [a\n", []string{"line 3: unclosed ["}},
		{"commands scalar", "version: 1\ncommands: 3\n", []string{"line 2: commands must be a mapping"}},
		{"commands unknown key", "version: 1\ncommands:\n  lint: []\n", []string{"line 3: unknown key lint"}},
		{"setup entries", "version: 1\ncommands:\n  setup:\n    - true\n    - 3\n    - ok\n    -\n", []string{"line 4: commands.setup entries must be strings", "line 5: commands.setup entries must be strings", "line 7: commands.setup entries must be strings"}},
		{"acceptance list", "version: 1\ncommands:\n  acceptance: [a]\n", []string{"line 3: commands.acceptance must be a mapping"}},
		{"acceptance unknown key", "version: 1\ncommands:\n  acceptance: {run: x, extra: 1}\n", []string{"line 3: unknown key extra"}},
		{"check not a map", "version: 1\ncommands:\n  checks:\n    - just text\n", []string{"line 4: a check must be {name, run}"}},
		{"check unknown keys only", "version: 1\ncommands:\n  checks:\n    - name: a\n      extra: 1\n      other: 2\n", []string{"line 5: unknown key extra", "line 6: unknown key other"}},
		{"problems sorted by line then text", "version: 1\nprotect: x\ncommands:\n  setup: y\nzzz: 1\naaa: 2\n", []string{"line 2: protect must be a list", "line 4: commands.setup must be a list", "line 5: unknown key zzz", "line 6: unknown key aaa"}},
	}
	for _, c := range cases {
		t.Run(c.label, func(t *testing.T) {
			se := configError(t, c.text, "f")
			if !slices.Equal(se.Lines, c.lines) {
				t.Errorf("lines %q, want %q", se.Lines, c.lines)
			}
		})
	}
}

func TestModelsFileRules(t *testing.T) {
	cases := []struct {
		label, text string
		lines       []string
	}{
		{"models scalar", "models: x\n", []string{"line 1: models must be a mapping"}},
		{"models unknown role", "models:\n  other: {model: m, effort: e}\n", []string{"line 2: unknown key other"}},
		{"models missing effort", "models:\n  build: {model: m}\n", []string{"line 2: models.build must be {model, effort}"}},
		{"models extra key", "models:\n  build: {model: m, effort: e, extra: 1}\n", []string{"line 2: models.build must be {model, effort}"}},
		{"models number model", "models:\n  build: {model: 1, effort: high}\n", []string{"line 2: models.build must be {model, effort}"}},
	}
	for _, c := range cases {
		t.Run(c.label, func(t *testing.T) {
			if se := modelsError(t, c.text); !slices.Equal(se.Lines, c.lines) {
				t.Errorf("lines %q, want %q", se.Lines, c.lines)
			}
		})
	}
}

func TestParseConfigRefusesRemovedOptions(t *testing.T) {
	// shape_workers, shape_audit, shape_decision_check and review_material were removed: they
	// are unknown keys like any other.
	for _, key := range []string{"shape_workers", "shape_audit", "shape_decision_check", "review_material"} {
		_, err := ParseConfig("version: 1\n"+key+":\n  enabled: true\n", "p")
		var se *sys.Error
		if !errors.As(err, &se) || !slices.Equal(se.Lines, []string{"line 2: unknown key " + key}) {
			t.Errorf("%s: %v", key, err)
		}
	}
}

func TestLoadConfigReportsActualPathAndSourceLine(t *testing.T) {
	// ExUnit: SET-4: loading an invalid project file reports its actual path and source line
	root := t.TempDir()
	path := filepath.Join(root, ConfigPath)
	writeFile(t, root, ConfigPath, "version: 1\ncommands:\n  acceptance:\n    run: true\n")
	_, err := LoadConfig(root)
	se, ok := sys.AsError(err)
	if !ok || se.Detail != path || !slices.Equal(se.Lines, []string{"line 4: commands.acceptance.run must be a string or null"}) {
		t.Fatalf("got %v", err)
	}
	if want := "environment/project_config_invalid: " + path + "\n  line 4: commands.acceptance.run must be a string or null\n"; se.Render() != want {
		t.Errorf("render %q", se.Render())
	}
}

func TestLoadConfigNotInitialized(t *testing.T) {
	root := t.TempDir()
	_, err := LoadConfig(root)
	se, ok := sys.AsError(err)
	if !ok || se.Class != "environment" || se.Reason != "not_initialized" || se.Exit != 3 ||
		se.Detail != root+" has no .kogen/project.yaml; run kogen init" {
		t.Fatalf("got %+v", err)
	}
}

func TestLoadConfigReadsTheTemplate(t *testing.T) {
	root := t.TempDir()
	writeFile(t, root, ConfigPath, Template())
	cfg, err := LoadConfig(root)
	if err != nil {
		t.Fatal(err)
	}
	if len(cfg.Setup) != 0 || cfg.Acceptance != nil || !maps.Equal(cfg.Models, DefaultModels()) {
		t.Errorf("template config %+v", cfg)
	}
}

func TestLoadConfigTeamFileDecidesItsRoles(t *testing.T) {
	root := t.TempDir()
	const text = "models:\n  review: {provider: chatgpt, model: gpt-6.1-sol, effort: high}\n"
	writeFile(t, root, ConfigPath, "version: 1\n")
	writeFile(t, root, ModelsPath, text)
	cfg, err := LoadConfig(root)
	if err != nil {
		t.Fatal(err)
	}
	if want := (Role{Provider: "chatgpt", Model: "gpt-6.1-sol", Effort: "high"}); cfg.Models["review"] != want {
		t.Errorf("review = %+v, want %+v", cfg.Models["review"], want)
	}
	if cfg.Models["shape"] != DefaultModels()["shape"] || cfg.Models["build"] != DefaultModels()["build"] {
		t.Errorf("other roles changed: %+v", cfg.Models)
	}
	if got := readFile(t, filepath.Join(root, ModelsPath)); got != text {
		t.Errorf("team file changed: %q", got)
	}
	// An all-defaults team file leaves the roles at the defaults.
	writeFile(t, root, ModelsPath, ModelsTemplate())
	if cfg, err = LoadConfig(root); err != nil || !maps.Equal(cfg.Models, DefaultModels()) {
		t.Errorf("template team file: %+v, %v", cfg, err)
	}
}

func TestLoadConfigLocalFileOverTeamFile(t *testing.T) {
	root := t.TempDir()
	writeFile(t, root, ConfigPath, "version: 1\n")
	writeFile(t, root, ModelsPath, "models:\n  shape: {executor: claude-code, model: claude-sonnet-5-5, effort: high}\n  build: {executor: claude-code, model: claude-sonnet-5-5, effort: high}\n  review: {executor: claude-code, model: claude-sonnet-5-5, effort: high}\n")
	writeFile(t, root, LocalModelsPath, "models:\n  build: {provider: anthropic, model: claude-opus-5-5, effort: max}\n")
	cfg, err := LoadConfig(root)
	if err != nil {
		t.Fatal(err)
	}
	team := Role{Executor: "claude-code", Model: "claude-sonnet-5-5", Effort: "high"}
	want := map[string]Role{"shape": team, "build": {Provider: "anthropic", Model: "claude-opus-5-5", Effort: "max"}, "review": team}
	if !maps.Equal(cfg.Models, want) {
		t.Errorf("models %+v, want %+v", cfg.Models, want)
	}
}

func TestLoadConfigMalformedTeamFile(t *testing.T) {
	root := t.TempDir()
	writeFile(t, root, ConfigPath, "version: 1\n")
	writeFile(t, root, ModelsPath, "models:\n  build:\n    executor: claude-code\n    model: m\n    effort: high\n    bogus: 3\n")
	// The local files come after the team file: their problems are not reported first.
	writeFile(t, root, LocalModelsPath, "models: [x\n")
	writeFile(t, root, LocalChecksPath, "checks: [x\n")
	cfg, err := LoadConfig(root)
	se, ok := sys.AsError(err)
	if !ok || cfg != nil || se.Class != "environment" || se.Reason != "project_config_invalid" || se.Exit != 3 ||
		se.Detail != filepath.Join(root, ModelsPath) ||
		!slices.Equal(se.Lines, []string{"line 2: models.build with executor claude-code must be {model, effort} non-blank strings"}) {
		t.Fatalf("got %+v, %v", cfg, err)
	}
	// The project file's errors come before the team file's.
	writeFile(t, root, ConfigPath, "version: 1\nlimits: 3\n")
	_, err = LoadConfig(root)
	if se, _ := sys.AsError(err); se == nil || se.Detail != filepath.Join(root, ConfigPath) {
		t.Errorf("got %v", err)
	}
}

func TestLoadConfigUnreadableTeamFile(t *testing.T) {
	root := t.TempDir()
	writeFile(t, root, ConfigPath, "version: 1\n")
	if err := os.MkdirAll(filepath.Join(root, ModelsPath), 0o755); err != nil {
		t.Fatal(err)
	}
	_, err := LoadConfig(root)
	se, ok := sys.AsError(err)
	if !ok || se.Class != "environment" || se.Reason != "project_config_invalid" || se.Exit != 3 ||
		!strings.HasPrefix(se.Detail, "read "+filepath.Join(root, ModelsPath)+": ") || len(se.Lines) != 0 {
		t.Fatalf("got %+v", err)
	}
}

func TestParseConfigOldConfig(t *testing.T) {
	for _, text := range []string{"commands:\n  setup: []\n", "limits: 3\n", "commands: {}\n"} {
		se := configError(t, text, "f")
		if se.Class != "environment" || se.Reason != "old_kogen_config" || se.Exit != 3 || len(se.Lines) != 0 ||
			se.Detail != ".kogen/ is from an earlier Kogen; move it aside (git mv .kogen .kogen-old), commit, and run kogen init" {
			t.Errorf("%q: %+v", text, se)
		}
	}
}

func TestProviderSelections(t *testing.T) {
	// ExUnit: provider selections preserve omission and validate every role and effort
	const section = "models"
	for _, role := range []string{"shape", "build", "review"} {
		parse := func(fields string) (Role, *sys.Error) {
			text := section + ":\n  " + role + ": {" + fields + "}\n"
			cfg, err := loadModelsText(t, text)
			if err != nil {
				se, _ := sys.AsError(err)
				return Role{}, se
			}
			return cfg.Models[role], nil
		}
		if r, _ := parse("model: fixture, effort: arbitrary"); r != (Role{Model: "fixture", Effort: "arbitrary"}) {
			t.Errorf("%s.%s without provider: %+v", section, role, r)
		}
		if r, _ := parse("model: fixture, effort: arbitrary, provider: chatgpt"); r != (Role{Provider: "chatgpt", Model: "fixture", Effort: "arbitrary"}) {
			t.Errorf("%s.%s chatgpt: %+v", section, role, r)
		}
		for _, effort := range []string{"low", "medium", "high", "xhigh"} {
			if r, _ := parse("model: grok-4.7, effort: " + effort + ", provider: supergrok"); r != (Role{Provider: "supergrok", Model: "grok-4.7", Effort: effort}) {
				t.Errorf("%s.%s supergrok %s: %+v", section, role, effort, r)
			}
		}
		for _, model := range []string{"claude-opus-5-5", "claude-sonnet-5-5"} {
			for _, effort := range []string{"low", "medium", "high", "max"} {
				if r, _ := parse("model: " + model + ", effort: " + effort + ", provider: anthropic"); r != (Role{Provider: "anthropic", Model: model, Effort: effort}) {
					t.Errorf("%s.%s anthropic %s %s: %+v", section, role, model, effort, r)
				}
			}
		}
		// KOGEN-057: no allowlists. Any model and effort reach the provider unchanged,
		// including the ones the old lists refused.
		for _, c := range []struct{ provider, model, effort string }{
			{"anthropic", "claude-invented", "high"}, {"anthropic", "claude-opus-5-5", "xhigh"}, {"anthropic", "claude-haiku-5-5", "low"},
			{"opencode-go", "kimi-k3.1-pro", "xhigh"}, {"opencode-go", "glm-5", "low"}, {"opencode-go", "kimi-k3", "default"},
			{"supergrok", "grok-4.20-0309-reasoning", "xhigh"}, {"supergrok", "grok-5", "low"},
			{"chatgpt", "gpt-7-preview", "minimal"},
		} {
			fields := "model: " + c.model + ", effort: " + c.effort + ", provider: " + c.provider
			if r, se := parse(fields); se != nil || r != (Role{Provider: c.provider, Model: c.model, Effort: c.effort}) {
				t.Errorf("%s.%s %s: %+v %+v", section, role, fields, r, se)
			}
		}
		// A named provider other than ChatGPT still needs a non-blank model and effort.
		for _, fields := range []string{"model: '', effort: high, provider: supergrok", "model: kimi-k3, effort: ' ', provider: opencode-go"} {
			_, se := parse(fields)
			want := "line 2: " + section + "." + role + " must be {model, effort}"
			if se == nil || se.Exit != 3 || !slices.Equal(se.Lines, []string{want}) {
				t.Errorf("%s.%s %s: %+v", section, role, fields, se)
			}
		}
		for _, provider := range []string{"grok", "xai", "true", "null", "claude", "opencode", "openai", "ollama"} {
			_, se := parse("model: grok-4.7, effort: low, provider: " + provider)
			if se == nil || se.Exit != 3 || !slices.Equal(se.Lines, []string{"line 2: " + section + "." + role + ".provider must be chatgpt, supergrok, opencode-go, anthropic or openai-compatible"}) {
				t.Errorf("%s.%s provider %s: %+v", section, role, provider, se)
			}
		}
		// openai-compatible: base_url is required, must be http(s), is trimmed of a trailing
		// slash, and is refused on every other provider.
		for _, base := range []string{"'http://localhost:11434/v1'", "\"https://llm.example.com/v1/\""} {
			r, se := parse("provider: openai-compatible, model: qwen3-coder:30b, effort: default, base_url: " + base)
			want := strings.TrimRight(strings.Trim(base, "'\""), "/")
			if se != nil || r != (Role{Provider: "openai-compatible", Model: "qwen3-coder:30b", Effort: "default", BaseURL: want}) {
				t.Errorf("%s.%s base %s: %+v %+v", section, role, base, r, se)
			}
		}
		for _, c := range []struct{ fields, want string }{
			{"provider: openai-compatible, model: m, effort: default", ": openai-compatible needs base_url, for example http://localhost:11434/v1"},
			{"provider: openai-compatible, model: m, effort: default, base_url: 'ftp://host/v1'", ".base_url must be an http:// or https:// URL"},
			{"provider: openai-compatible, model: m, effort: default, base_url: 'localhost:11434'", ".base_url must be an http:// or https:// URL"},
			{"provider: openai-compatible, model: m, effort: default, base_url: 'http://h/v1?x=1'", ".base_url must be an http:// or https:// URL"},
			{"provider: openai-compatible, model: m, effort: default, base_url: 3", ".base_url must be an http:// or https:// URL"},
			{"provider: opencode-go, model: kimi-k3, effort: high, base_url: 'http://localhost:1/v1'", ".base_url is only for provider openai-compatible"},
			{"model: gpt-6.1-sol, effort: high, base_url: 'http://localhost:1/v1'", ".base_url is only for provider openai-compatible"},
		} {
			_, se := parse(c.fields)
			if se == nil || se.Exit != 3 || !slices.Equal(se.Lines, []string{"line 2: " + section + "." + role + c.want}) {
				t.Errorf("%s.%s %s: %+v", section, role, c.fields, se)
			}
		}
	}
}

func TestConfigErrorRendering(t *testing.T) {
	se := configError(t, "version: 1\nlimits: 3\n", "/p/.kogen/project.yaml")
	want := "environment/project_config_invalid: /p/.kogen/project.yaml\n  line 2: unknown key limits\n"
	if se.Render() != want {
		t.Errorf("got %q", se.Render())
	}
}

// ---- the executor of the build role (docs/executor-contract.md section 5) ----

func TestEffortPerRoute(t *testing.T) {
	for _, tt := range []struct {
		fields, effort string
		ok             bool
		accepted       string
	}{
		{"provider: anthropic, model: m", "max", true, ""},
		{"provider: anthropic, model: m", "xhigh", true, ""},
		{"provider: anthropic, model: m", "ultra", false, "low, medium, high, xhigh, max"},
		{"provider: anthropic, model: m", "default", false, "low, medium, high, xhigh, max"},
		{"provider: anthropic, model: m", "High", false, "low, medium, high, xhigh, max"},
		{"provider: supergrok, model: m", "xhigh", true, ""},
		{"provider: supergrok, model: m", "max", false, "low, medium, high, xhigh"},
		{"executor: claude-code, model: m", "max", true, ""},
		{"executor: claude-code, model: m", "turbo", false, "low, medium, high, xhigh, max"},
		{"model: m", "whatever", true, ""},
		{"model: m", "ultra", false, "any effort except ultra"},
		{"provider: opencode-go, model: m", "default", true, ""},
		{"provider: opencode-go, model: m", "ultra", false, "any effort except ultra"},
		{"provider: openai-compatible, base_url: 'http://h/v1', model: m", "ultra", false, "any effort except ultra"},
	} {
		text := "models:\n  build: {" + tt.fields + ", effort: " + tt.effort + "}\n"
		_, err := loadModelsText(t, text)
		if tt.ok {
			if err != nil {
				t.Errorf("%q: %v", text, err)
			}
			continue
		}
		se, _ := sys.AsError(err)
		if se == nil || len(se.Lines) != 1 || !strings.HasSuffix(se.Lines[0], ".effort \""+tt.effort+"\" is not supported; accepted: "+tt.accepted) {
			t.Errorf("%q: %+v", text, err)
		}
	}
}

func TestBuildExecutorSelection(t *testing.T) {
	for _, tt := range []struct {
		name, build string
		want        Role
	}{
		{"claude-code with model and effort", "{executor: claude-code, model: claude-sonnet-5-5, effort: high}",
			Role{Model: "claude-sonnet-5-5", Effort: "high", Executor: "claude-code"}},
		{"quoted executor name", `{executor: "claude-code", model: m, effort: low}`, Role{Model: "m", Effort: "low", Executor: "claude-code"}},
		// Written out, the native executor is the native builder: no value differs from a file
		// that says nothing, so checkpoints keep their bytes.
		{"native written out", "{executor: native, model: gpt-6.1-sol, effort: medium}", Role{Model: "gpt-6.1-sol", Effort: "medium"}},
		{"native keeps its provider", "{executor: native, provider: supergrok, model: grok-4.7, effort: low}",
			Role{Provider: "supergrok", Model: "grok-4.7", Effort: "low"}},
		{"no executor", "{model: gpt-6.1-sol, effort: medium}", Role{Model: "gpt-6.1-sol", Effort: "medium"}},
	} {
		t.Run(tt.name, func(t *testing.T) {
			cfg := modelsConfig(t, "models:\n  build: "+tt.build+"\n")
			if got := cfg.Models["build"]; got != tt.want {
				t.Fatalf("build = %+v, want %+v", got, tt.want)
			}
			if want := tt.want.Executor == "claude-code"; cfg.Models["build"].External() != want {
				t.Fatalf("External() = %v", !want)
			}
		})
	}
	// Block form.
	cfg := modelsConfig(t, "models:\n  build:\n    executor: claude-code\n    model: m\n    effort: low\n")
	if got := cfg.Models["build"]; got != (Role{Model: "m", Effort: "low", Executor: "claude-code"}) {
		t.Fatalf("block form %+v", got)
	}
	// The other roles keep their defaults.
	if cfg.Models["shape"] != DefaultModels()["shape"] || cfg.Models["review"] != DefaultModels()["review"] {
		t.Fatalf("other roles changed: %+v", cfg.Models)
	}
}

func TestBuildExecutorConfigurationErrors(t *testing.T) {
	const head = "models:\n  "
	for _, tt := range []struct{ name, text, want string }{
		{"unknown executor", "build: {executor: codex, model: m, effort: e}", "line 2: models.build.executor must be native or claude-code"},
		{"executor is not a string", "build: {executor: true, model: m, effort: e}", "line 2: models.build.executor must be native or claude-code"},
		{"executor is empty", "build: {executor: , model: m, effort: e}", "line 2: models.build.executor must be native or claude-code"},
		{"claude-code forbids provider", "build: {executor: claude-code, provider: anthropic, model: m, effort: e}",
			"line 2: models.build.provider is not allowed with executor claude-code"},
		{"claude-code forbids base_url", "build: {executor: claude-code, base_url: 'http://localhost:1/v1', model: m, effort: e}",
			"line 2: models.build.base_url is not allowed with executor claude-code"},
		{"claude-code needs a model", "build: {executor: claude-code, effort: e}", "line 2: models.build with executor claude-code must be {model, effort} non-blank strings"},
		{"claude-code needs an effort", "build: {executor: claude-code, model: m}", "line 2: models.build with executor claude-code must be {model, effort} non-blank strings"},
		{"claude-code needs non-blank model", "build: {executor: claude-code, model: ' ', effort: e}", "line 2: models.build with executor claude-code must be {model, effort} non-blank strings"},
		{"claude-code takes no other key", "build: {executor: claude-code, model: m, effort: e, sandbox: true}", "line 2: models.build with executor claude-code must be {model, effort} non-blank strings"},
		{"review unknown executor", "review: {executor: codex, model: m, effort: e}", "line 2: models.review.executor must be native or claude-code"},
		{"shape claude-code forbids provider", "shape: {executor: claude-code, provider: anthropic, model: m, effort: e}", "line 2: models.shape.provider is not allowed with executor claude-code"},
	} {
		t.Run(tt.name, func(t *testing.T) {
			se := modelsError(t, head+tt.text+"\n")
			if se.Class != "environment" || se.Reason != "project_config_invalid" || se.Exit != 3 || !slices.Equal(se.Lines, []string{tt.want}) {
				t.Fatalf("%+v", se)
			}
		})
	}
}

// TestClaudeLineupRoleConfiguration: shape, build and review select native or claude-code
// independently, with model and effort passed through.
func TestClaudeLineupRoleConfiguration(t *testing.T) {
	ext := func() Role {
		return Role{Model: "claude-opus-5-5", Effort: "xhigh", Executor: "claude-code"}
	}
	roles := []string{"shape", "build", "review"}
	// Every subset of roles may be external; the others keep their native configuration.
	for mask := 0; mask < 8; mask++ {
		var text strings.Builder
		text.WriteString("models:\n")
		want := DefaultModels()
		for i, r := range roles {
			switch {
			case mask&(1<<i) != 0:
				text.WriteString("  " + r + ": {executor: claude-code, model: claude-opus-5-5, effort: xhigh}\n")
				want[r] = ext()
			case i == 1:
				text.WriteString("  " + r + ": {executor: native, model: gpt-6.1-sol, effort: medium}\n")
				want[r] = Role{Model: "gpt-6.1-sol", Effort: "medium"}
			}
		}
		cfg := modelsConfig(t, text.String())
		for _, r := range roles {
			if cfg.Models[r] != want[r] {
				t.Fatalf("mask %d: %s = %+v, want %+v", mask, r, cfg.Models[r], want[r])
			}
			if cfg.Models[r].External() != (want[r].Executor == "claude-code") {
				t.Fatalf("mask %d: %s External() wrong", mask, r)
			}
		}
	}
	for _, r := range roles {
		se := modelsError(t, "models:\n  "+r+": {executor: claude-code, base_url: 'http://x/v1', model: m, effort: e}\n")
		if !slices.Equal(se.Lines, []string{"line 2: models." + r + ".base_url is not allowed with executor claude-code"}) {
			t.Fatalf("%s: %+v", r, se)
		}
		se = modelsError(t, "models:\n  "+r+": {executor: claude-code, model: m, effort: ' '}\n")
		if !slices.Equal(se.Lines, []string{"line 2: models." + r + " with executor claude-code must be {model, effort} non-blank strings"}) {
			t.Fatalf("%s: %+v", r, se)
		}
	}
	// Explicit native normalizes to omission: identical role bytes.
	a := modelsConfig(t, "models:\n  review: {executor: native, model: m, effort: e}\n").Models["review"]
	b := modelsConfig(t, "models:\n  review: {model: m, effort: e}\n").Models["review"]
	if a != b {
		t.Fatalf("explicit native %+v differs from omission %+v", a, b)
	}
}

func TestNativeRoleJSONKeepsItsBytes(t *testing.T) {
	// The new fields are omitted when empty, so checkpoints of native Builds do not change.
	b, err := json.Marshal(Role{Provider: "chatgpt", Model: "m", Effort: "e"})
	if err != nil || string(b) != `{"Provider":"chatgpt","Model":"m","Effort":"e"}` {
		t.Fatalf("%s %v", b, err)
	}
	b, _ = json.Marshal(Role{Model: "m", Effort: "e", Executor: "claude-code"})
	if string(b) != `{"Provider":"","Model":"m","Effort":"e","Executor":"claude-code"}` {
		t.Fatalf("%s", b)
	}
}

func TestLegacyNoProgressKeysAreNotSettings(t *testing.T) {
	// The removed native fingerprint option was never a YAML setting, and its two legacy
	// spellings are not read: they are an unrecognized role key like any other in a models file.
	const plain = "models:\n  shape: {model: gpt-6.1-sol, effort: high}\n  build: {model: gpt-6.1-sol, effort: medium}\n  review: {model: gpt-6.1-terra, effort: medium}\n"
	if cfg := modelsConfig(t, plain); !maps.Equal(cfg.Models, DefaultModels()) {
		t.Fatalf("control models %+v", cfg.Models)
	}
	for _, key := range []string{"No" + "Progress", "no_progress"} {
		for _, role := range []string{"shape", "build", "review"} {
			text := strings.Replace(plain, "  "+role+": {model", "  "+role+": {"+key+": true, model", 1)
			if text == plain {
				t.Fatalf("fixture did not add %s to %s", key, role)
			}
			control := modelsError(t, strings.Replace(text, key+":", "unrelated_key:", 1))
			legacy := modelsError(t, text)
			if legacy.Reason != "project_config_invalid" || !slices.Equal(legacy.Lines, control.Lines) {
				t.Errorf("%s in %s: loading %+v, an unrelated key gives %+v", key, role, legacy, control)
			}
		}
	}
}

func TestParseConfigIgnoresOneLeadingBOM(t *testing.T) {
	const bom = "\uFEFF"
	text := "version: 1\ncommands:\n  setup: []\n  fix:\n    - 'gofmt -w .'\n"
	want := mustParse(t, text)
	if got := mustParse(t, bom+text); !reflect.DeepEqual(got, want) {
		t.Errorf("with BOM: %+v, want %+v", got, want)
	}
	se := configError(t, bom+"version: 1\ncommands:\n  setup: []\nsurprise: true\n", "/project/.kogen/project.yaml")
	if !slices.Equal(se.Lines, []string{"line 4: unknown key surprise"}) {
		t.Errorf("lines = %q", se.Lines)
	}
	if se := configError(t, bom+bom+text, "/project/.kogen/project.yaml"); !strings.Contains(strings.Join(se.Lines, "\n"), "line 1") {
		t.Errorf("double BOM lines = %q", se.Lines)
	}
	fix := mustParse(t, "version: 1\ncommands:\n  fix:\n    - 'gofmt"+bom+" -w .'\n")
	if fix.Fix[0] != "gofmt"+bom+" -w ." {
		t.Errorf("middle BOM fix = %q", fix.Fix)
	}
}

const localBase = "version: 1\ncommands:\n  setup: [s]\n  fix: [f]\n  checks:\n    - {name: format, run: fmt}\n    - {name: compile, run: build}\n    - {name: vet, run: vet}\n  acceptance: {run: acc, steps_dir: features/steps}\nprotect: [p]\n"

// localRoot is a project root holding the committed configuration and the given local files.
func localRoot(t *testing.T, models, checks string) string {
	t.Helper()
	root := t.TempDir()
	writeFile(t, root, ConfigPath, localBase)
	if models != "" {
		writeFile(t, root, LocalModelsPath, models)
	}
	if checks != "" {
		writeFile(t, root, LocalChecksPath, checks)
	}
	return root
}

func TestLocalChecksPath(t *testing.T) {
	if LocalChecksPath != ".kogen/local/checks.yaml" {
		t.Fatalf("LocalChecksPath = %q", LocalChecksPath)
	}
}

func TestLoadConfigLocalLineupReplacesWholeRoles(t *testing.T) {
	const models = "models:\n  shape: {executor: claude-code, model: claude-opus-5-5, effort: high}\n  review: {provider: anthropic, model: m, effort: max}\n"
	root := localRoot(t, models, "")
	want, err := ParseConfig(localBase, filepath.Join(root, ConfigPath))
	if err != nil {
		t.Fatal(err)
	}
	cfg, err := LoadConfig(root)
	if err != nil {
		t.Fatal(err)
	}
	if w := (Role{Executor: "claude-code", Model: "claude-opus-5-5", Effort: "high"}); cfg.Models["shape"] != w {
		t.Errorf("shape = %+v, want %+v", cfg.Models["shape"], w)
	}
	if w := (Role{Provider: "anthropic", Model: "m", Effort: "max"}); cfg.Models["review"] != w {
		t.Errorf("review = %+v, want %+v", cfg.Models["review"], w)
	}
	if cfg.Models["build"] != DefaultModels()["build"] {
		t.Errorf("build = %+v, want the default", cfg.Models["build"])
	}
	want.Models = cfg.Models
	_, _ = Protected(root, want)
	if !reflect.DeepEqual(cfg, want) {
		t.Errorf("only the models should differ: %+v vs %+v", cfg, want)
	}
	if got := readFile(t, filepath.Join(root, LocalModelsPath)); got != models {
		t.Errorf("local models file changed: %q", got)
	}
	if got := readFile(t, filepath.Join(root, ConfigPath)); got != localBase {
		t.Errorf("project file changed: %q", got)
	}
}

func TestLoadConfigLocalChecksReplaceCommandsByName(t *testing.T) {
	const checks = "checks:\n  - name: vet\n    run: 'nice vet'\n  - name: format\n    run: nice fmt\n"
	root := localRoot(t, "", checks)
	cfg, err := LoadConfig(root)
	if err != nil {
		t.Fatal(err)
	}
	want := []Check{{"format", "nice fmt"}, {"compile", "build"}, {"vet", "nice vet"}}
	if !reflect.DeepEqual(cfg.Checks, want) {
		t.Errorf("Checks = %+v, want %+v", cfg.Checks, want)
	}
	if !slices.Equal(cfg.Setup, []string{"s"}) || !slices.Equal(cfg.Fix, []string{"f"}) || cfg.Acceptance.Run != "acc" || !slices.Equal(cfg.Protect, []string{"p"}) {
		t.Errorf("setup, fix, acceptance or protect changed: %+v", cfg)
	}
	if !maps.Equal(cfg.Models, DefaultModels()) {
		t.Errorf("models changed: %+v", cfg.Models)
	}
	if got := readFile(t, filepath.Join(root, LocalChecksPath)); got != checks {
		t.Errorf("local checks file changed: %q", got)
	}
	if got := readFile(t, filepath.Join(root, ConfigPath)); got != localBase {
		t.Errorf("project file changed: %q", got)
	}
	empty := localRoot(t, "", "checks: []\n")
	cfg, err = LoadConfig(empty)
	if err != nil || !reflect.DeepEqual(cfg.Checks, []Check{{"format", "fmt"}, {"compile", "build"}, {"vet", "vet"}}) {
		t.Errorf("empty list: %+v, %v", cfg, err)
	}
}

func TestLoadConfigLocalFilesCombine(t *testing.T) {
	root := localRoot(t, "models:\n  build: {executor: claude-code, model: m, effort: high}\n", "checks:\n  - {name: compile, run: c2}\n")
	cfg, err := LoadConfig(root)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Checks[1].Run != "c2" || cfg.Models["build"].Executor != "claude-code" {
		t.Errorf("not combined: %+v", cfg)
	}
}

func TestLoadConfigMalformedLocalFile(t *testing.T) {
	file := func(root, rel string) string { return filepath.Join(root, rel) }
	tests := []struct {
		name, models, checks, path string
		lines                      []string
	}{
		{"plan role", "models:\n  plan: {model: m, effort: high}\n", "", LocalModelsPath, []string{"line 2: unknown key plan"}},
		{"models yaml", "models:\n  build: [m\n", "", LocalModelsPath, []string{"line 2: unclosed ["}},
		{"models root", "- a\n", "", LocalModelsPath, []string{"line 1: the file must be a mapping"}},
		{"models required", "version: 1\n", "", LocalModelsPath, []string{"line 1: models is required", "line 1: unknown key version"}},
		{"models first", "models: {build: {executor: nope, model: m, effort: high}}\n", "checks: [x\n", LocalModelsPath, []string{"line 1: models.build.executor must be native or claude-code"}},
		{"checks yaml", "", "checks:\n  - name: vet\n    run: [nice\n", LocalChecksPath, []string{"line 3: unclosed ["}},
		{"checks root", "", "- a\n", LocalChecksPath, []string{"line 1: the file must be a mapping"}},
		{"unknown root key", "", "extra: 1\nchecks: []\n", LocalChecksPath, []string{"line 1: unknown key extra"}},
		{"checks required", "", "# c\n\nother: 1\n", LocalChecksPath, []string{"line 3: checks is required", "line 3: unknown key other"}},
		{"checks not a list", "", "checks:\n  vet: x\n", LocalChecksPath, []string{"line 2: checks must be a list"}},
		{"entry not a mapping", "", "checks:\n  - vet\n", LocalChecksPath, []string{"line 2: a check must be {name, run}"}},
		{"entry unknown key", "", "checks:\n  - name: vet\n    run: x\n    note: y\n", LocalChecksPath, []string{"line 4: unknown key note"}},
		{"entry without run", "", "checks:\n  - name: vet\n", LocalChecksPath, []string{"line 2: a check needs a name and a run string"}},
		{"entry run not a string", "", "checks:\n  - name: vet\n    run: true\n", LocalChecksPath, []string{"line 2: a check needs a name and a run string"}},
		{"unknown name", "", "checks:\n  - name: lint\n    run: x\n", LocalChecksPath, []string{"line 2: check name lint is not in .kogen/project.yaml"}},
		{"duplicate", "", "checks:\n  - name: vet\n    run: a\n  - name: vet\n    run: b\n", LocalChecksPath, []string{"line 4: check name vet is used twice"}},
		{"sorted", "", "checks:\n  - name: vet\n    run: a\n  - name: zzz\n    run: b\n  - name: vet\n    run: c\n  - name: lint\n    run: d\n", LocalChecksPath,
			[]string{"line 4: check name zzz is not in .kogen/project.yaml", "line 6: check name vet is used twice", "line 8: check name lint is not in .kogen/project.yaml"}},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			root := localRoot(t, tc.models, tc.checks)
			cfg, err := LoadConfig(root)
			se, ok := sys.AsError(err)
			if !ok || cfg != nil || se.Class != "environment" || se.Reason != "project_config_invalid" || se.Exit != 3 ||
				se.Detail != file(root, tc.path) || !slices.Equal(se.Lines, tc.lines) {
				t.Fatalf("got %+v, %v; want %s %q", cfg, err, tc.path, tc.lines)
			}
			if got := readFile(t, filepath.Join(root, ConfigPath)); got != localBase {
				t.Errorf("project file changed: %q", got)
			}
		})
	}
}

func TestLoadConfigCommittedErrorsComeBeforeLocalFiles(t *testing.T) {
	root := t.TempDir()
	writeFile(t, root, ConfigPath, "version: 1\ncommands:\n  acceptance:\n    run: true\n")
	writeFile(t, root, LocalModelsPath, "models: {build: {model: m, effort: high}}\n")
	writeFile(t, root, LocalChecksPath, "checks: [x\n")
	_, err := LoadConfig(root)
	se, ok := sys.AsError(err)
	if !ok || se.Detail != filepath.Join(root, ConfigPath) || !slices.Equal(se.Lines, []string{"line 4: commands.acceptance.run must be a string or null"}) {
		t.Fatalf("got %v", err)
	}
	empty := t.TempDir()
	writeFile(t, empty, LocalChecksPath, "checks: []\n")
	if _, err := LoadConfig(empty); err == nil || !strings.Contains(err.Error(), "not_initialized") {
		t.Errorf("not initialized: %v", err)
	}
}

func TestLoadConfigUnreadableLocalFile(t *testing.T) {
	root := localRoot(t, "", "")
	if err := os.MkdirAll(filepath.Join(root, LocalChecksPath), 0o755); err != nil {
		t.Fatal(err)
	}
	_, err := LoadConfig(root)
	se, ok := sys.AsError(err)
	if !ok || se.Class != "environment" || se.Reason != "project_config_invalid" || se.Exit != 3 ||
		!strings.HasPrefix(se.Detail, "read "+filepath.Join(root, LocalChecksPath)+": ") || len(se.Lines) != 0 {
		t.Fatalf("got %+v", err)
	}
}
