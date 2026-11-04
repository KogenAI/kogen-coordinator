package project

import (
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	repogit "github.com/KogenAI/kogen-coordinator/git"
)

func runGit(t *testing.T, dir string, args ...string) {
	t.Helper()
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	cmd.Env = repogit.CleanEnv(os.Environ())
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("git %v: %v: %s", args, err, out)
	}
}

// envTarget is a repository with a.txt tracked by force-add over a .gitignore that matches it, so
// only its own index lists it, and another repository whose user.name is "Other".
func envTarget(t *testing.T) (target, other string) {
	t.Helper()
	target = gitRepo(t)
	other = gitRepo(t)
	runGit(t, other, "config", "user.name", "Other")
	writeFile(t, other, "b.txt", "b\n")
	runGit(t, other, "add", "b.txt")
	writeFile(t, target, "a.txt", "a\n")
	writeFile(t, target, ".gitignore", "a.txt\n")
	runGit(t, target, "add", "-f", "a.txt", ".gitignore")
	runGit(t, target, "config", "user.name", "Pat Owner")
	return target, other
}

func TestProtectedIgnoresInheritedLocationVariables(t *testing.T) {
	target, other := envTarget(t)
	emptyIndex := filepath.Join(t.TempDir(), "empty.index")
	cmd := exec.Command("git", "read-tree", "--empty")
	cmd.Dir = target
	cmd.Env = append(repogit.CleanEnv(os.Environ()), "GIT_INDEX_FILE="+emptyIndex)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("read-tree: %v: %s", err, out)
	}
	zeroIndex := filepath.Join(t.TempDir(), "zero.index")
	if err := os.WriteFile(zeroIndex, nil, 0o644); err != nil {
		t.Fatal(err)
	}
	otherDir := filepath.Join(other, ".git")
	for name, vars := range map[string][][2]string{
		"clean":             nil,
		"empty index":       {{"GIT_INDEX_FILE", emptyIndex}},
		"zero-byte index":   {{"GIT_INDEX_FILE", zeroIndex}},
		"other repository":  {{"GIT_DIR", otherDir}},
		"other repo, index": {{"GIT_DIR", otherDir}, {"GIT_INDEX_FILE", filepath.Join(otherDir, "index")}},
	} {
		t.Run(name, func(t *testing.T) {
			for _, kv := range vars {
				t.Setenv(kv[0], kv[1])
			}
			got, err := Protected(target, &Config{Protect: []string{"a.txt"}})
			if err != nil {
				t.Fatal(err)
			}
			if !slices.Equal(got, []string{"a.txt"}) {
				t.Fatalf("Protected = %v, want [a.txt]", got)
			}
		})
	}
}

func TestProtectedFailsOutsideRepository(t *testing.T) {
	gitSandbox(t)
	if _, err := Protected(t.TempDir(), &Config{Protect: []string{"a.txt"}}); err == nil || !strings.Contains(err.Error(), "git ls-files failed") {
		t.Fatalf("err = %v, want git ls-files failure", err)
	}
}

func TestCheckIntentUserNameIgnoresInheritedGitDir(t *testing.T) {
	target, other := envTarget(t)
	t.Setenv("GIT_DIR", filepath.Join(other, ".git"))
	for title, refused := range map[string]bool{"Pat Owner adds retry": true, "Other adds retry": false} {
		overlay := map[string][]byte{IntentMDPath(demoSlug): []byte(demoMD(demoParts{title: sp("# " + title)})), FeaturePath(demoSlug): []byte(goodFeature)}
		_, _, err := CheckIntent(target, demoSlug, overlay)
		if !refused {
			if err != nil {
				t.Fatalf("%q: %v", title, err)
			}
			continue
		}
		if lines := problemsOf(t, err, "lint"); !strings.Contains(strings.Join(lines, "\n"), `names the Git user "Pat Owner"`) {
			t.Fatalf("%q: problems %v", title, lines)
		}
	}
}

func TestProjectGitCallsUseRepositoryLayerGitAndCleanEnv(t *testing.T) {
	target, other := envTarget(t)
	realGit, err := exec.LookPath("git")
	if err != nil {
		t.Fatal(err)
	}
	bin, log := t.TempDir(), filepath.Join(t.TempDir(), "git.log")
	script := "#!/bin/sh\nprintf '%s|GIT_DIR=%s|GIT_INDEX_FILE=%s\\n' \"$*\" \"${GIT_DIR+set}\" \"${GIT_INDEX_FILE+set}\" >> \"$FAKE_GIT_LOG\"\nexec " + realGit + " \"$@\"\n"
	if err := os.WriteFile(filepath.Join(bin, "git"), []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", bin+string(os.PathListSeparator)+os.Getenv("PATH"))
	t.Setenv("FAKE_GIT_LOG", log)
	t.Setenv("GIT_DIR", filepath.Join(other, ".git"))
	t.Setenv("GIT_INDEX_FILE", filepath.Join(other, ".git", "index"))
	if got, err := Protected(target, &Config{Protect: []string{"a.txt"}}); err != nil || !slices.Equal(got, []string{"a.txt"}) {
		t.Fatalf("Protected = %v, %v", got, err)
	}
	if _, err := repogit.Open(target, nil); err != nil {
		t.Fatal(err)
	}
	overlay := map[string][]byte{IntentMDPath(demoSlug): []byte(demoMD(demoParts{title: sp("# Pat Owner adds retry")})), FeaturePath(demoSlug): []byte(goodFeature)}
	CheckIntent(target, demoSlug, overlay)
	data, err := os.ReadFile(log)
	if err != nil {
		t.Fatal(err)
	}
	want := []string{
		"ls-files -z --cached --others --exclude-standard|GIT_DIR=|GIT_INDEX_FILE=",
		"rev-parse --show-toplevel|GIT_DIR=|GIT_INDEX_FILE=",
		"config --get user.name|GIT_DIR=|GIT_INDEX_FILE=",
	}
	got := strings.Split(strings.TrimSpace(string(data)), "\n")
	if len(got) < len(want) || !slices.Equal(got[:len(want)], want) {
		t.Fatalf("git log:\n%s\nwant prefix:\n%s", strings.Join(got, "\n"), strings.Join(want, "\n"))
	}
	for _, l := range got {
		if !strings.HasSuffix(l, "|GIT_DIR=|GIT_INDEX_FILE=") {
			t.Errorf("location variable reached git: %q", l)
		}
	}
}
