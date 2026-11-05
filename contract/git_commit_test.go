package contract

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/KogenAI/kogen-coordinator/git"
)

// candidateFx is a repository with an edit and a new file: the candidate tree and the HEAD it
// started from, as kogen-build build/commit.go receives them.
func candidateFx(t *testing.T) (f *repoFx, tree, start string) {
	t.Helper()
	f = newRepoFx(t)
	start = f.Head()
	f.write(t, "app.txt", "verified edit\n")
	f.write(t, "README.md", "readme\nchanged\n")
	return f, must(f.Tree(start, nil)), start
}

func (f *repoFx) log(t *testing.T, format string) string {
	t.Helper()
	return f.git(t, "log", "-1", "--format="+format)
}

// commit-message: kogen-build build/build_test.go reads the commit the Build landed.
func TestCommitLandsTheReviewedTreeWithTheIntentTrailer(t *testing.T) {
	f, tree, start := candidateFx(t)
	spec := git.CommitSpec{
		Tree:        tree,
		Start:       start,
		Title:       "Add the app",
		Slug:        "add-app",
		MessageFile: filepath.Join(t.TempDir(), "commit-message.txt"),
	}
	equal(t, "CommitMessage", git.CommitMessage("Add the app", "add-app"), "Add the app\n\nKogen-Intent: add-app\n")
	f.write(t, "later.txt", "not in the reviewed tree\n")

	head, err := f.Commit(f.session(), spec)
	if err != nil {
		t.Fatal(err)
	}
	equal(t, "returned", head, f.Head())
	equal(t, "message", f.log(t, "%B"), "Add the app\n\nKogen-Intent: add-app\n\n")
	equal(t, "trailer", strings.TrimSpace(f.log(t, "%(trailers:key=Kogen-Intent,valueonly)")), "add-app")
	assertNothingAt(t, spec.MessageFile)
	equal(t, "parent", strings.TrimSpace(f.log(t, "%P")), spec.Start)
	equal(t, "tree", strings.TrimSpace(f.log(t, "%T")), spec.Tree)
	equal(t, "author", strings.TrimSpace(f.log(t, "%an <%ae>")), fixtureIdentity)
	equal(t, "status", f.git(t, "status", "--porcelain"), "?? later.txt\n")

	// A read-only view never commits.
	if _, err := f.Observing().Commit(f.session(), spec); err == nil {
		t.Fatal("a read-only repository committed")
	}
}

// A failing commit reports Git's output and leaves HEAD where it was (GIT-6).
func TestCommitFailureLeavesHeadAndTheStagedCandidate(t *testing.T) {
	f, tree, start := candidateFx(t)
	spec := git.CommitSpec{
		Tree:        tree,
		Start:       start,
		Title:       "Add the app",
		Slug:        "add-app",
		MessageFile: filepath.Join(t.TempDir(), "commit-message.txt"),
	}
	f.hook(t, "pre-commit", "echo 'pre-commit says no'\nexit 1\n")
	_, err := f.Commit(f.session(), spec)
	e := wantSysError(t, err, "environment", "commit_failed", 3)
	equal(t, "detail", e.Detail, "git commit failed (status 1); the verified changes are left uncommitted")
	equalList(t, "lines", e.Lines, []string{"pre-commit says no"})
	equal(t, "HEAD", f.Head(), spec.Start)
	assertNothingAt(t, spec.MessageFile)
}

// assertNothingAt fails when anything exists at path.
func assertNothingAt(t *testing.T, path string) {
	t.Helper()
	if _, err := os.Lstat(path); !os.IsNotExist(err) {
		t.Fatalf("Lstat(%s) = %v, want nothing at the path", path, err)
	}
}

// commit-rejected: kogen-build build/build_test.go checks the commit message before any model
// time is spent.
func TestCheckCommitMsgRunsTheCommitMsgHook(t *testing.T) {
	f := newRepoFx(t)
	s := f.session()
	if err := f.CheckCommitMsg(s, "A title", "slug"); err != nil {
		t.Fatalf("without a hook: %v", err)
	}
	seen := filepath.Join(t.TempDir(), "message")
	f.hook(t, "commit-msg", fmt.Sprintf("cp \"$1\" '%s'\nexit 0\n", seen))
	if err := f.CheckCommitMsg(s, "A title", "slug"); err != nil {
		t.Fatalf("an accepting hook: %v", err)
	}
	equal(t, "message the hook saw", readFile(t, seen), "A title\n\nKogen-Intent: slug\n")

	f.hook(t, "commit-msg", "echo 'subject too vague'\nexit 9\n")
	err := f.CheckCommitMsg(s, "A title", "slug")
	e := wantSysError(t, err, "environment", "commit_rejected", 3)
	equal(t, "detail", e.Detail, "the commit-msg hook rejects this Intent's commit message (status=9); change the Intent's title or the hook, then approve again")
	equalList(t, "lines", e.Lines, []string{"subject too vague"})
	equal(t, "HEAD", f.log(t, "%s"), "baseline\n")
}

// kogen-shaping shape/init.go commits exactly the configuration it wrote.
func TestCommitPathsCommitsOnlyThosePaths(t *testing.T) {
	f := newRepoFx(t)
	f.write(t, "config.yaml", "config\n")
	f.write(t, "other.txt", "not part of it\n")
	f.git(t, "add", "other.txt")
	short, err := f.CommitPaths(f.session(), "Add the configuration", []string{"config.yaml"}, true)
	if err != nil {
		t.Fatal(err)
	}
	equal(t, "returned", short, f.Head()[:8])
	equal(t, "subject", f.log(t, "%s"), "Add the configuration\n")
	equal(t, "committed", f.git(t, "show", "--name-only", "--format=", "HEAD"), "config.yaml\n")
	equal(t, "staged", f.git(t, "diff", "--cached", "--name-only"), "other.txt\n")

	f.hook(t, "pre-commit", "exit 1\n")
	f.write(t, "again.yaml", "again\n")
	_, err = f.CommitPaths(f.session(), "Again", []string{"again.yaml"}, true)
	wantSysError(t, err, "environment", "commit_failed", 3)
	equal(t, "unstaged", f.git(t, "diff", "--cached", "--name-only"), "other.txt\n")

	empty := newBareFx(t)
	empty.write(t, "first.yaml", "first\n")
	short, err = empty.CommitPaths(empty.session(), "First", []string{"first.yaml"}, false)
	if err != nil {
		t.Fatal(err)
	}
	equal(t, "first commit", short, empty.Head()[:8])
	if _, err := os.Stat(filepath.Join(empty.Dir, "first.yaml")); err != nil {
		t.Fatal(err)
	}
}
