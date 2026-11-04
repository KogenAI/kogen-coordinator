// Steps of the Intent k-interrupt-edits-exclude-approved. A generated Go driver (package main, in a
// temporary folder of the module, built with go build) replays the interrupted Build of 4 Nov in a
// fresh Git repository: an approved Intent with a model, a Build that maintains the model under
// .kogen/models/<slug>/ (as kogen-build's promoteModel does) and edits the project, an interrupt
// during verification, the discard of the listed edits and the start of a second Build. It prints
// one line EDITS_RESULT=<JSON> of raw observations; observe() judges them against the expected
// object in the feature file.
//
// The driver reaches project.BuildEdits and project.OwnedByIntent through seam.go. Observer
// controls: `node features/steps/k-interrupt-edits-exclude-approved__driver.js good|bad` build the
// same driver with a stand-in seam (good: the requested rule; bad: today's behaviour, the whole
// tree diff and only .kogen/intents/<slug>/ owned) and judge its real observations against the
// expectations parsed from the feature file.
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const assert = require('assert/strict');

const SLUG = 'k-interrupt-edits-exclude-approved';
const CASES = ['interrupted-build', 'filter'];

function observe(actual, expected) {
  assert.deepEqual(actual, expected);
}

const driver = String.raw`
package main

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/KogenAI/kogen-coordinator/git"
	"github.com/KogenAI/kogen-coordinator/project"
)

const slug = "complete-task"

func check(err error) {
	if err != nil {
		fmt.Fprintln(os.Stderr, "driver setup:", err)
		os.Exit(3)
	}
}

func nonNil(s []string) []string {
	if s == nil {
		return []string{}
	}
	return s
}

func write(root, rel, content string) {
	full := filepath.Join(root, rel)
	check(os.MkdirAll(filepath.Dir(full), 0o755))
	check(os.WriteFile(full, []byte(content), 0o644))
}

func gitRun(root string, args ...string) {
	cmd := exec.Command("git", args...)
	cmd.Dir = root
	if out, err := cmd.CombinedOutput(); err != nil {
		check(fmt.Errorf("git %s: %v: %s", strings.Join(args, " "), err, out))
	}
}

func splitNUL(s string) []string {
	var out []string
	for _, p := range strings.Split(s, "\x00") {
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

// interruptedBuild replays the live run of 4 Nov.
func interruptedBuild() map[string]any {
	tmp, err := os.MkdirTemp("", "interrupt-edits-")
	check(err)
	defer os.RemoveAll(tmp)
	root, err := filepath.EvalSymlinks(tmp)
	check(err)
	gitRun(root, "init", "-q")
	write(root, "README.md", "# tasks\n")
	write(root, "lib/task.js", "module.exports = {};\n")
	gitRun(root, "add", "-A")
	gitRun(root, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", "commit", "-q", "-m", "Base")

	// The approved Intent, in the working tree as approval leaves it.
	modelLine := project.ModelPath(slug) + " invariants=Safe seed=1 samples=2 steps=3"
	model := "module complete_task {\n  val Safe = true\n}\n"
	write(root, project.IntentMDPath(slug), "# Complete a task\n\nSlug: "+slug+"\nModel: "+modelLine+"\n")
	write(root, project.FeaturePath(slug), "Feature: Complete a task\n")
	write(root, project.ModelPath(slug), model)

	repo := git.New(root, nil)
	head := repo.Head()
	start, err := repo.Tree(head, nil)
	check(err)

	// The Build: its first verification maintains the model as kogen-build's promoteModel does,
	// and the builder edits the project.
	spec := project.ParseModelSpec(modelLine)
	spec.Path = ".kogen/models/" + slug + "/model.qnt"
	record, err := json.MarshalIndent(spec, "", "  ")
	check(err)
	write(root, spec.Path, model)
	write(root, ".kogen/models/"+slug+"/model.json", string(record)+"\n")
	write(root, "README.md", "# tasks\n\nComplete tasks.\n")
	write(root, "lib/task.js", "module.exports = { complete: t => ({ ...t, done: true }) };\n")
	write(root, "test/task.test.js", "require('../lib/task');\n")

	// Interrupted during verification: the candidate and the Build's edit list.
	tree, err := repo.Tree(head, nil)
	check(err)
	changed, err := repo.Changed(start, tree)
	check(err)
	edited := buildEdits(slug, changed)

	// The person discards the listed edits: each is put back as the start tree has it, or removed.
	for _, p := range edited {
		res, err := repo.Run("cat-file", "-e", start+":"+p)
		check(err)
		if res.Status == 0 {
			content, err := repo.OK("cat-file", "blob", start+":"+p)
			check(err)
			write(root, p, content)
		} else {
			check(os.Remove(filepath.Join(root, p)))
		}
	}

	// The second Build starts: what is still changed, its start tree and the model it reads.
	paths, err := repo.ChangedPaths()
	check(err)
	var notOwned []string
	for _, p := range paths {
		if !ownedByIntent(slug, p) {
			notOwned = append(notOwned, p)
		}
	}
	second, err := repo.Tree(head, nil)
	check(err)
	listed, err := repo.OK("ls-tree", "-r", "-z", "--name-only", second, "--", ".kogen/models")
	check(err)
	modelError, modelPath := "", ""
	data, err := os.ReadFile(filepath.Join(root, ".kogen/models", slug, "model.json"))
	if err != nil {
		modelError = strings.ReplaceAll(err.Error(), root, "<root>")
	} else {
		var read project.ModelSpec
		check(json.Unmarshal(data, &read))
		modelPath = read.Path
	}
	qnt, _ := os.ReadFile(filepath.Join(root, ".kogen/models", slug, "model.qnt"))
	return map[string]any{
		"changed": nonNil(changed),
		"edited":  nonNil(edited),
		"second_build": map[string]any{
			"changes_not_owned":             nonNil(notOwned),
			"models_in_start_tree":          nonNil(splitNUL(listed)),
			"model_json_error":              modelError,
			"model_path":                    modelPath,
			"model_qnt_is_the_intent_model": string(qnt) == model,
		},
	}
}

// filter applies the rule to a given list.
func filter() map[string]any {
	in := []string{
		".kogen/intents/complete-task/intent.md",
		".kogen/intents/complete-task-archive/intent.md",
		".kogen/models/complete-task-archive/model.json",
		".kogen/models/complete-task/model.json",
		".kogen/models/complete-task/model.qnt",
		"README.md",
		"lib/complete-task/model.json",
	}
	owned := map[string]bool{}
	for _, p := range in {
		owned[p] = ownedByIntent(slug, p)
	}
	return map[string]any{
		"edited":            nonNil(buildEdits(slug, in)),
		"edited_of_nothing": nonNil(buildEdits(slug, nil)),
		"owned":             owned,
	}
}

func main() {
	var out map[string]any
	switch os.Getenv("EDITS_CASE") {
	case "interrupted-build":
		out = interruptedBuild()
	case "filter":
		out = filter()
	default:
		check(fmt.Errorf("unknown EDITS_CASE %q", os.Getenv("EDITS_CASE")))
	}
	b, err := json.Marshal(out)
	check(err)
	fmt.Println("EDITS_RESULT=" + string(b))
}
`;

const seams = {
  real: String.raw`
package main

import "github.com/KogenAI/kogen-coordinator/project"

func buildEdits(slug string, changed []string) []string { return project.BuildEdits(slug, changed) }

func ownedByIntent(slug, path string) bool { return project.OwnedByIntent(slug, path) }
`,
  good: String.raw`
package main

import "strings"

// The requested rule, for the observer control only.
func ownedByIntent(slug, path string) bool {
	return strings.HasPrefix(path, ".kogen/intents/"+slug+"/") || strings.HasPrefix(path, ".kogen/models/"+slug+"/")
}

func buildEdits(slug string, changed []string) []string {
	var out []string
	for _, p := range changed {
		if !ownedByIntent(slug, p) {
			out = append(out, p)
		}
	}
	return out
}
`,
  bad: String.raw`
package main

import "strings"

// Today's behaviour, for the observer control only: the whole tree diff is the edit list, and a
// Build counts only .kogen/intents/<slug>/ as its Intent's own.
func ownedByIntent(slug, path string) bool { return strings.HasPrefix(path, ".kogen/intents/"+slug+"/") }

func buildEdits(slug string, changed []string) []string { return changed }
`
};

function gitFreeEnv() {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (!k.startsWith('GIT_')) env[k] = v;
  return { ...env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' };
}

// run builds the driver with the named seam in a temporary folder of the module and runs each
// named case; it returns the parsed observations by case.
function run(seam, names) {
  const dir = fs.mkdtempSync(path.join(process.cwd(), '.' + SLUG + '-'));
  try {
    fs.writeFileSync(path.join(dir, 'main.go'), driver);
    fs.writeFileSync(path.join(dir, 'seam.go'), seams[seam]);
    const binary = path.join(dir, 'edits-driver');
    const build = cp.spawnSync('go', ['build', '-o', binary, './' + path.basename(dir)], {
      encoding: 'utf8', timeout: 540000, env: gitFreeEnv()
    });
    const buildOutput = (build.stdout || '') + (build.stderr || '');
    assert.equal(build.status, 0, `go build -o ${binary} ./${path.basename(dir)} (seam ${seam}) exited ${build.status} ${build.signal || ''}: ${buildOutput}`);
    const out = {};
    for (const name of names) {
      const result = cp.spawnSync(binary, [], {
        encoding: 'utf8', timeout: 120000, env: { ...gitFreeEnv(), EDITS_CASE: name }
      });
      const output = (result.stdout || '') + (result.stderr || '');
      assert.equal(result.status, 0, `${binary} (EDITS_CASE=${name}) exited ${result.status} ${result.signal || ''}: ${output}`);
      const rows = output.split('\n').filter(s => s.startsWith('EDITS_RESULT='));
      assert.equal(rows.length, 1, `${binary} (EDITS_CASE=${name}) must print exactly one EDITS_RESULT line: ${output}`);
      out[name] = JSON.parse(rows[0].slice('EDITS_RESULT='.length));
    }
    return out;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// expectations reads, from the feature file, the doc string that follows each case's When step.
function expectations() {
  const feature = fs.readFileSync(path.join(__dirname, '..', '..', '.kogen', 'intents', SLUG, 'acceptance.feature'), 'utf8');
  const out = {};
  const re = /the driver runs the "([a-z-]+)" case\s*\n\s*Then [^\n]*the observation is\s*\n\s*"""\n([\s\S]*?)\n\s*"""/g;
  for (const m of feature.matchAll(re)) out[m[1]] = JSON.parse(m[2]);
  return out;
}

function control(kind) {
  const expected = expectations();
  const actual = run(kind, CASES);
  let accepted = 0;
  for (const c of CASES) {
    let ok;
    try { observe(actual[c], expected[c]); ok = true; } catch (_) { ok = false; }
    if (ok) accepted++;
    console.log((ok ? 'accepted ' : 'rejected ') + c);
  }
  process.exit(accepted === CASES.length ? 0 : 1);
}

function register() {
  const { When, Then } = require('@cucumber/cucumber');

  When(SLUG + ': the driver runs the {string} case', { timeout: 600000 }, function (name) {
    this.editsObservation = run('real', [name])[name];
  });

  Then(SLUG + ': the observation is', function (docString) {
    observe(this.editsObservation, JSON.parse(docString));
  });
}

if (require.main === module) {
  const kind = process.argv[2];
  if (kind === 'good' || kind === 'bad') control(kind);
  else if (kind === 'print' && ['good', 'bad', 'real'].includes(process.argv[3])) console.log(JSON.stringify(run(process.argv[3], CASES), null, 2));
  else { console.log('usage: good|bad|print good|bad|real'); process.exit(2); }
} else {
  register();
}
