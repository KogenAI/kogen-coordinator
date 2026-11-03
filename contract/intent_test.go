package contract

import (
	"reflect"
	"strings"
	"testing"

	"github.com/KogenAI/kogen-coordinator/project"
)

// intent-paths: every consumer builds the paths of an Intent from its slug.
func TestIntentPaths(t *testing.T) {
	equal(t, "IntentDir", project.IntentDir("s"), ".kogen/intents/s")
	equal(t, "FeaturePath", project.FeaturePath("s"), ".kogen/intents/s/acceptance.feature")
	equal(t, "IntentMDPath", project.IntentMDPath("s"), ".kogen/intents/s/intent.md")
	equal(t, "ModelPath", project.ModelPath("s"), ".kogen/intents/s/model.qnt")
}

// kogen-shaping shape/context.go and preflight.go ask whether an Intent exists; shape/approve.go
// and kogen-build build/build.go require its folder.
func TestIntentExistsAndRequireIntentDir(t *testing.T) {
	f := newProjectFx(t)
	equal(t, "IntentExists", project.IntentExists(f.Dir, fixtureSlug), true)
	equal(t, "IntentExists of another", project.IntentExists(f.Dir, "other"), false)
	if err := project.RequireIntentDir(f.Dir, fixtureSlug); err != nil {
		t.Fatal(err)
	}
	e := wantSysError(t, project.RequireIntentDir(f.Dir, "other"), "intent", "not_found", 2)
	equal(t, "detail", e.Detail, "Intent does not exist")
}

// kogen-shaping shape/window.go and kogen-build build/builder.go read the fields of an Intent.
func TestIntentFields(t *testing.T) {
	f := newProjectFx(t)
	for _, load := range []func() (*project.Intent, error){
		func() (*project.Intent, error) { return project.LoadIntent(f.Dir, fixtureSlug) },
		func() (*project.Intent, error) { return project.ReadIntent(f.Dir, fixtureSlug, nil) },
		func() (*project.Intent, error) {
			return project.ReadIntent(f.Dir, fixtureSlug, map[string][]byte{project.IntentMDPath(fixtureSlug): []byte(fixtureIntentMD)})
		},
	} {
		var in *project.Intent = must(load())
		equal(t, "Root", in.Root, f.Dir)
		equal(t, "Slug", in.Slug, fixtureSlug)
		equal(t, "Text", in.Text, fixtureIntentMD)
		equal(t, "SlugLine", in.SlugLine, " fixture")
		equal(t, "Title", in.Title, "Fixture intent")
		equal(t, "ModelLine", in.ModelLine, "not applicable — nothing to model")
		if in.Model == nil || !in.Model.None {
			t.Fatalf("Model = %+v", in.Model)
		}
		equalList(t, "Acceptance", in.Acceptance, []string{project.FeaturePath(fixtureSlug), "features/steps/fixture_steps.js"})
		equalList(t, "StepFiles", in.StepFiles(), []string{"features/steps/fixture_steps.js"})
		equalList(t, "Decisions", in.Decisions, []string{"- Fixture decision. (source: request)"})
		equalList(t, "Feasibility", in.Feasibility, []string{"- none"})
		equalList(t, "Tests", in.Tests, []string{"- Fixture rule: a test (unit)"})
	}

	e := wantSysError(t, func() error { _, err := project.ReadIntent(f.Dir, "other", nil); return err }(), "intent", "parse", 1)
	equalList(t, "lines", e.Lines, []string{"intent.md does not exist"})
	overlaid := must(project.ReadIntent(f.Dir, "other", map[string][]byte{project.IntentMDPath("other"): []byte("# Other\n\nSlug: other\n")}))
	equal(t, "overlaid Title", overlaid.Title, "Other")
}

// model-line and model-none: kogen-verification verify/model.go and
// verify/helper_project_test.go.
func TestParseModelSpec(t *testing.T) {
	got := project.ParseModelSpec(".kogen/intents/s/model.qnt invariants=A,B seed=1 samples=2 steps=3")
	want := &project.ModelSpec{Path: ".kogen/intents/s/model.qnt", Invariants: []string{"A", "B"}, Seed: "1", Samples: "2", Steps: "3"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("ParseModelSpec = %+v, want %+v", got, want)
	}
	equal(t, "None", got.None, false)
	equal(t, "Path", got.Path, ".kogen/intents/s/model.qnt")
	equalList(t, "Invariants", got.Invariants, []string{"A", "B"})
	equal(t, "Seed", got.Seed, "1")
	equal(t, "Samples", got.Samples, "2")
	equal(t, "Steps", got.Steps, "3")

	for _, line := range []string{"not applicable — no state", "not applicable - no state"} {
		if spec := project.ParseModelSpec(line); spec == nil || !reflect.DeepEqual(*spec, project.ModelSpec{None: true}) || !spec.None {
			t.Fatalf("ParseModelSpec(%q) = %+v, want {None: true}", line, spec)
		}
	}
	for _, line := range []string{"", "not applicable", "not applicable —", "not applicable: x", "m.qnt invariants=A seed=1 steps=3 samples=2", "m.qnt seed=1 samples=2 steps=3"} {
		if spec := project.ParseModelSpec(line); spec != nil {
			t.Fatalf("ParseModelSpec(%q) = %+v, want nil", line, spec)
		}
	}
}

func intentWith(title string) map[string][]byte {
	return map[string][]byte{project.IntentMDPath(fixtureSlug): []byte(strings.Replace(fixtureIntentMD, "# Fixture intent", "# "+title, 1))}
}

// intent-lint, intent-title-limit and tests-layers: kogen-shaping shape/contract_check_test.go
// and kogen-build build/helper_test.go (which writes `(existing)` test lines).
func TestCheckIntent(t *testing.T) {
	f := newProjectFx(t)
	in, scenarios, err := project.CheckIntent(f.Dir, fixtureSlug, nil)
	if err != nil {
		t.Fatal(err)
	}
	equal(t, "Title", in.Title, "Fixture intent")
	if len(scenarios) != 2 || scenarios[0].Name != "First" {
		t.Fatalf("scenarios %+v", scenarios)
	}

	// intent-title-limit: 50 characters pass, 51 do not.
	if _, _, err := project.CheckIntent(f.Dir, fixtureSlug, intentWith(strings.Repeat("a", 50))); err != nil {
		t.Fatalf("a 50-character title: %v", err)
	}
	_, _, err = project.CheckIntent(f.Dir, fixtureSlug, intentWith(strings.Repeat("a", 51)))
	e := wantSysError(t, err, "intent", "lint", 1)
	equalList(t, "lines", e.Lines, []string{"title: the title must be at most 50 characters"})
	equal(t, "message", e.Error(), "intent/lint: the Intent needs changes")
	equal(t, "detail", e.Detail, "the Intent needs changes")
	if _, _, err := project.CheckIntent(f.Dir, fixtureSlug, intentWith(strings.Repeat("é", 50))); err != nil {
		t.Fatalf("a 50-grapheme title: %v", err)
	}

	// tests-layers: each layer ends a valid Tests line.
	for _, layer := range []string{"unit", "integration", "scenario", "regression", "existing"} {
		text := strings.Replace(fixtureIntentMD, "(unit)", "("+layer+")", 1)
		if _, _, err := project.CheckIntent(f.Dir, fixtureSlug, map[string][]byte{project.IntentMDPath(fixtureSlug): []byte(text)}); err != nil {
			t.Fatalf("a Tests line ending in (%s): %v", layer, err)
		}
	}
	text := strings.Replace(fixtureIntentMD, "(unit)", "(manual)", 1)
	_, _, err = project.CheckIntent(f.Dir, fixtureSlug, map[string][]byte{project.IntentMDPath(fixtureSlug): []byte(text)})
	e = wantSysError(t, err, "intent", "lint", 1)
	equalList(t, "layer lines", e.Lines, []string{"tests: - Fixture rule: a test (manual) must be `- <rule>: <test to add or update> (<layer>)` or `- none: <reason>`"})

	// intent-lint: one line per problem.
	broken := strings.NewReplacer(
		"Slug: fixture", "Slug: another",
		"Model: not applicable — nothing to model", "Model: later",
		"- Fixture decision. (source: request)", "- Fixture decision.",
		"## Feasibility\n- none\n\n", "",
	).Replace(fixtureIntentMD)
	_, _, err = project.CheckIntent(f.Dir, fixtureSlug, map[string][]byte{project.IntentMDPath(fixtureSlug): []byte(broken)})
	e = wantSysError(t, err, "intent", "lint", 1)
	equalList(t, "problems", e.Lines, []string{
		"slug: the Slug: line must be fixture",
		"model: the Model: line must be `not applicable — <reason>` or `.kogen/intents/fixture/model.qnt invariants=<Name> seed=<n> samples=<n> steps=<n>`",
		"decisions: a decision has no source",
		"feasibility: intent.md needs a ## Feasibility section listing each probe, or - none",
	})

	_, _, err = project.CheckIntent(f.Dir, "other", nil)
	e = wantSysError(t, err, "intent", "parse", 1)
	equalList(t, "parse lines", e.Lines, []string{"intent.md does not exist"})
	e = wantSysError(t, func() error {
		_, _, err := project.CheckIntent(f.Dir, fixtureSlug, map[string][]byte{project.FeaturePath(fixtureSlug): []byte("not a feature\n")})
		return err
	}(), "intent", "parse", 1)
	equalList(t, "gherkin lines", e.Lines, []string{"acceptance.feature line 1: expected Feature:, got: not a feature"})

	// A Quint model line names the model and the invariants it checks.
	modelIntent := strings.Replace(fixtureIntentMD, "Model: not applicable — nothing to model",
		"Model: .kogen/intents/fixture/model.qnt invariants=Safe seed=1 samples=2 steps=3", 1)
	overlay := map[string][]byte{project.IntentMDPath(fixtureSlug): []byte(modelIntent), project.ModelPath(fixtureSlug): []byte("module m { val Safe = true }\n")}
	checked, _, err := project.CheckIntent(f.Dir, fixtureSlug, overlay)
	if err != nil {
		t.Fatal(err)
	}
	if want := (&project.ModelSpec{Path: project.ModelPath(fixtureSlug), Invariants: []string{"Safe"}, Seed: "1", Samples: "2", Steps: "3"}); !reflect.DeepEqual(checked.Model, want) {
		t.Fatalf("Model = %+v, want %+v", checked.Model, want)
	}
	equal(t, "ModelLine", checked.ModelLine, ".kogen/intents/fixture/model.qnt invariants=Safe seed=1 samples=2 steps=3")
}
