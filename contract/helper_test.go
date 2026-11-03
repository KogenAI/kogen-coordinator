package contract

import (
	"crypto/sha256"
	"encoding/hex"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/KogenAI/kogen-coordinator/git"
	"github.com/KogenAI/kogen-loop/sys"
)

const (
	fixtureIdentity = "Test User <fixture@example.invalid>"
	fixtureSlug     = "fixture"
)

// gitEnv is the environment of the fixtures' Git: the process environment TestMain isolated,
// plus extra.
func gitEnv(extra ...string) []string {
	return append(os.Environ(), extra...)
}

// repoFx is a temporary repository with one commit, its own identity, no signing and an empty
// hooks folder of its own, as kogen-coordinator's git/helper_test.go builds it.
type repoFx struct {
	*git.Repo
	Hooks string
	Env   []string
}

func newRepoFx(t *testing.T) *repoFx {
	t.Helper()
	f := newBareFx(t)
	f.write(t, "README.md", "readme\n")
	f.git(t, "add", ".")
	f.git(t, "commit", "-qm", "baseline")
	return f
}

// newBareFx is a repository with the identity and no commit.
func newBareFx(t *testing.T) *repoFx {
	t.Helper()
	root := t.TempDir()
	hooks := t.TempDir()
	env := gitEnv()
	f := &repoFx{Repo: git.New(root, env), Hooks: hooks, Env: env}
	f.git(t, "init", "-q")
	f.git(t, "config", "user.name", "Test User")
	f.git(t, "config", "user.email", "fixture@example.invalid")
	f.git(t, "config", "core.hooksPath", hooks)
	f.git(t, "config", "commit.gpgsign", "false")
	return f
}

// git runs a command in the fixture directly (not through the package under test) and fails the
// test unless it succeeds.
func (f *repoFx) git(t *testing.T, args ...string) string {
	t.Helper()
	cmd := exec.Command("git", args...)
	cmd.Dir = f.Dir
	cmd.Env = f.Env
	var stderr strings.Builder
	cmd.Stderr = &stderr
	out, err := cmd.Output()
	if err != nil {
		t.Fatalf("git %s: %v\n%s", strings.Join(args, " "), err, stderr.String())
	}
	return string(out)
}

func (f *repoFx) write(t *testing.T, rel, content string) {
	t.Helper()
	writeFile(t, f.Dir, rel, content)
}

func (f *repoFx) hook(t *testing.T, name, script string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(f.Hooks, name), []byte("#!/bin/sh\n"+script), 0o755); err != nil {
		t.Fatal(err)
	}
}

func (f *repoFx) session() *sys.Session {
	s := sys.NewWith(f.Env, f.Dir)
	s.Stderr = &strings.Builder{}
	return s
}

func writeFile(t *testing.T, root, rel, content string) {
	t.Helper()
	path := filepath.Join(root, rel)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

func readFile(t *testing.T, path string) string {
	t.Helper()
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

func sha256Hex(b []byte) string {
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}

// must returns v, or panics (failing the test) on err.
func must[T any](v T, err error) T {
	if err != nil {
		panic(err)
	}
	return v
}

func equal[T comparable](t *testing.T, name string, got, want T) {
	t.Helper()
	if got != want {
		t.Fatalf("%s = %v, want %v", name, got, want)
	}
}

func equalList(t *testing.T, name string, got, want []string) {
	t.Helper()
	if !slices.Equal(got, want) {
		t.Fatalf("%s = %q, want %q", name, got, want)
	}
}

// wantSysError checks that err is a *sys.Error of the class, reason and exit status.
func wantSysError(t *testing.T, err error, class, reason string, exit int) *sys.Error {
	t.Helper()
	e, ok := sys.AsError(err)
	if !ok {
		t.Fatalf("error = %v, want *sys.Error %s/%s", err, class, reason)
	}
	if e.Class != class || e.Reason != reason || e.Exit != exit {
		t.Fatalf("error = %s (exit %d), want %s/%s (exit %d)", e.Error(), e.Exit, class, reason, exit)
	}
	return e
}

// A synthetic Intent `fixture`, adapted from kogen-shaping shape/approve_test.go's approveIntentMD
// and approveFeature, with the Source comparison a receipt records.
const (
	fixtureFeature  = "Feature: Fixture\n  Scenario: First\n    Then the candidate succeeds\n  Scenario: Later\n    Then the candidate succeeds\n"
	fixtureIntentMD = "# Fixture intent\n\nSlug: fixture\nModel: not applicable — nothing to model\nAcceptance:\n" +
		"- .kogen/intents/fixture/acceptance.feature\n- features/steps/fixture_steps.js\n\nThe fixture.\n\n" +
		"## Decisions\n- Fixture decision. (source: request)\n\n## Tests\n- Fixture rule: a test (unit)\n\n" +
		"## Feasibility\n- none\n\n## Source comparison\n- Addressed: the fixture request.\n"
	fixtureConfig = "version: 1\ncommands:\n  acceptance:\n    run: sh accept.sh\n    steps_dir: features/steps\nprotect:\n  - guard.cfg\n"
)

// projectFx is a repository holding the committed Intent `fixture` and a project configuration.
type projectFx struct {
	*repoFx
}

func newProjectFx(t *testing.T) *projectFx {
	t.Helper()
	f := newBareFx(t)
	f.write(t, ".gitignore", ".kogen/local/\n")
	f.write(t, ".kogen/project.yaml", fixtureConfig)
	f.write(t, ".kogen/intents/fixture/intent.md", fixtureIntentMD)
	f.write(t, ".kogen/intents/fixture/acceptance.feature", fixtureFeature)
	f.write(t, "features/steps/fixture_steps.js", "// steps\n")
	f.write(t, "guard.cfg", "guard\n")
	f.git(t, "add", ".")
	f.git(t, "commit", "-qm", "fixture")
	return &projectFx{f}
}
