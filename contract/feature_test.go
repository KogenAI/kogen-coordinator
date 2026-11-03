package contract

import (
	"reflect"
	"strings"
	"testing"

	"github.com/KogenAI/kogen-coordinator/project"
)

const stagesPlan = "## Stages\n```json\n" +
	`{"version":1,"stages":[` +
	`{"id":"foundation","title":"Foundation","goal":"First runnable section","checks":["first","second"]},` +
	`{"id":"surface","title":"Surface","goal":"Integrate","checks":["third"]}]}` +
	"\n```\n"

// stages-invalid: kogen-build build/stages_plan_test.go; kogen-shaping shape/approve.go prints
// the plan on the approval card.
func TestParseStages(t *testing.T) {
	plan, err := project.ParseStages("# Intent\n\n" + stagesPlan + "\n## Tests\n")
	if err != nil {
		t.Fatal(err)
	}
	want := []project.Stage{
		{ID: "foundation", Title: "Foundation", Goal: "First runnable section", Checks: []string{"first", "second"}},
		{ID: "surface", Title: "Surface", Goal: "Integrate", Checks: []string{"third"}},
	}
	if !reflect.DeepEqual(plan, want) {
		t.Fatalf("ParseStages = %+v, want %+v", plan, want)
	}
	var first project.Stage = plan[0]
	equal(t, "ID", first.ID, "foundation")
	equal(t, "Title", first.Title, "Foundation")
	equal(t, "Goal", first.Goal, "First runnable section")
	equalList(t, "Checks", first.Checks, []string{"first", "second"})

	for _, text := range []string{"", "## Foundation\nSome stages in prose.\n", "````markdown\n" + stagesPlan + "````\n"} {
		if plan, err := project.ParseStages(text); plan != nil || err != nil {
			t.Fatalf("ParseStages(%q) = %v, %v; want nil and no error", text, plan, err)
		}
	}

	const invalid = "stages: expected one JSON fence with version 1 and at least two unique stages (id, title, goal, nonempty checks); no extra fields"
	for name, text := range map[string]string{
		"not json":      "## Stages\nnot json\n",
		"one stage":     "## Stages\n```json\n" + `{"version":1,"stages":[{"id":"a","title":"A","goal":"g","checks":["c"]}]}` + "\n```\n",
		"extra field":   "## Stages\n```json\n" + `{"version":1,"extra":1,"stages":[]}` + "\n```\n",
		"duplicate ids": strings.Replace(stagesPlan, `"id":"surface"`, `"id":"foundation"`, 1),
		"empty checks":  strings.Replace(stagesPlan, `["third"]`, `[]`, 1),
	} {
		_, err := project.ParseStages(text)
		if err == nil || err.Error() != invalid {
			t.Fatalf("%s: ParseStages error = %v, want %q", name, err, invalid)
		}
	}
	_, err = project.ParseStages(stagesPlan + stagesPlan)
	if err == nil || err.Error() != "stages: duplicate ## Stages sections" {
		t.Fatalf("two sections: %v", err)
	}
}

// gherkin-outline-line and gherkin-background: kogen-verification verify/readiness_test.go and
// verify/report.go; kogen cli/approve_deadline_test.go reads scenario names, lines and steps.
func TestParseGherkinOutlineRowsAndBackground(t *testing.T) {
	feature := `@feature-tag
Feature: Accounting
  Background:
    Given the project is ready

  @scenario-tag
  Scenario: ordinary scenario
    When the action runs
    Then the result is visible

  Scenario Outline: value <value>
    When the value is <value>
    Then it is accepted
    @example-tag
    Examples:
      | value  |
      | first  |
      | second |
`
	scenarios, err := project.ParseGherkin(feature)
	if err != nil {
		t.Fatal(err)
	}
	if len(scenarios) != 3 {
		t.Fatalf("scenarios %+v", scenarios)
	}
	ordinary, first, second := scenarios[0], scenarios[1], scenarios[2]
	equal(t, "ordinary Name", ordinary.Name, "ordinary scenario")
	equal(t, "ordinary Line", ordinary.Line, 7)
	equalList(t, "ordinary Tags", ordinary.Tags, []string{"@feature-tag", "@scenario-tag"})
	if ordinary.Outline != nil {
		t.Fatalf("ordinary Outline = %+v", ordinary.Outline)
	}

	// gherkin-outline-line: an Examples row is a scenario at the row's line.
	equal(t, "first Name", first.Name, "value first")
	equal(t, "first Line", first.Line, 17)
	equal(t, "second Name", second.Name, "value second")
	equal(t, "second Line", second.Line, 18)
	equalList(t, "first Tags", first.Tags, []string{"@feature-tag", "@example-tag"})
	for _, s := range []project.Scenario{first, second} {
		var o *project.Outline = s.Outline
		if o == nil || *o != (project.Outline{Name: "value <value>", Line: 11, Examples: 2}) {
			t.Fatalf("Outline = %+v", o)
		}
		equal(t, "Outline.Name", o.Name, "value <value>")
		equal(t, "Outline.Line", o.Line, 11)
		equal(t, "Outline.Examples", o.Examples, 2)
	}

	// gherkin-background: Background steps come first.
	type step struct {
		keyword, text string
		line          int
	}
	var got []step
	for _, st := range first.Steps {
		var s project.Step = st
		got = append(got, step{s.Keyword, s.Text, s.Line})
	}
	want := []step{{"Given ", "the project is ready", 4}, {"When ", "the value is first", 12}, {"Then ", "it is accepted", 13}}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("first steps %+v, want %+v", got, want)
	}
	equal(t, "ordinary first step", ordinary.Steps[0].Text, "the project is ready")
	equal(t, "ordinary steps", len(ordinary.Steps), 3)

	_, err = project.ParseGherkin("Feature: A\n  Scenario: ordinary\n  Examples:\n")
	ge, ok := err.(*project.GherkinError)
	if !ok || ge.Line != 3 || ge.Message != "Examples: belongs to a Scenario Outline" || ge.Error() != "line 3: Examples: belongs to a Scenario Outline" {
		t.Fatalf("ParseGherkin error = %#v", err)
	}
}
