package contract

import (
	"errors"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/KogenAI/kogen-coordinator/git"
)

// not-a-git-repo: kogen-shaping shape/init_test.go and shape/approve_test.go open a directory that
// is no repository. identity-missing: shape/init_test.go and shape/approve_test.go.
func TestOpenAndIdentity(t *testing.T) {
	dir := t.TempDir()
	env := gitEnv("GIT_CEILING_DIRECTORIES=" + filepath.Dir(dir))
	for _, open := range []func(string, []string) (*git.Repo, error){git.Open, git.OpenReadOnly} {
		_, err := open(dir, env)
		e := wantSysError(t, err, "environment", "not_a_git_repo", 3)
		equal(t, "detail", e.Detail, dir+"; run git init first")
	}

	f := newRepoFx(t)
	f.write(t, "sub/dir/file.txt", "x\n")
	var opened *git.Repo = must(git.Open(filepath.Join(f.Dir, "sub", "dir"), f.Env))
	equal(t, "Open Dir", opened.Dir, f.Dir)
	equal(t, "Open is not read-only", opened.ReadOnly, false)
	equal(t, "OpenReadOnly Dir", must(git.OpenReadOnly(f.Dir, f.Env)).Dir, f.Dir)
	equal(t, "OpenReadOnly", must(git.OpenReadOnly(f.Dir, f.Env)).ReadOnly, true)

	plain := git.New(f.Dir, f.Env)
	equal(t, "New Dir", plain.Dir, f.Dir)
	observing := plain.Observing()
	equal(t, "Observing", observing.ReadOnly, true)
	equal(t, "Observing Dir", observing.Dir, f.Dir)
	equal(t, "New stays writable", plain.ReadOnly, false)
	at := plain.At(filepath.Join(f.Dir, "sub"))
	equal(t, "At Dir", at.Dir, filepath.Join(f.Dir, "sub"))
	equal(t, "At keeps the mode", observing.At(f.Dir).ReadOnly, true)
	equal(t, "At sees the same repository", must(at.Resolve("HEAD")), must(plain.Resolve("HEAD")))

	equal(t, "Identity", f.Identity(), fixtureIdentity)
	equal(t, "RequireIdentity", must(f.RequireIdentity()), fixtureIdentity)
	equal(t, "CanCommit", f.CanCommit(), true)

	f.git(t, "config", "--unset", "user.email")
	equal(t, "Identity without an email", f.Identity(), "")
	equal(t, "CanCommit without an email", f.CanCommit(), false)
	_, err := f.RequireIdentity()
	wantSysError(t, err, "environment", "git_identity_missing", 3)
}

// kogen-executor agent/git_test.go, kogen-shaping shape/refine.go and shape/datastores.go run
// Git through Result and OK.
func TestRunOKAndCommandError(t *testing.T) {
	f := newRepoFx(t)
	var res git.Result = must(f.Run("status", "--porcelain"))
	equal(t, "Status", res.Status, 0)
	equal(t, "Stdout", res.Stdout, "")
	equal(t, "Stderr", res.Stderr, "")

	res = must(f.Run("rev-parse", "--verify", "refs/heads/nope"))
	equal(t, "failing Status", res.Status, 128)
	equal(t, "failing Stdout", res.Stdout, "")
	if !strings.Contains(res.Stderr, "Needed a single revision") {
		t.Fatalf("Stderr %q", res.Stderr)
	}

	equal(t, "OK", must(f.OK("log", "-1", "--format=%s")), "baseline\n")
	_, err := f.OK("rev-parse", "--verify", "refs/heads/nope")
	var ce *git.CommandError
	if !errors.As(err, &ce) {
		t.Fatalf("OK error %v is no *git.CommandError", err)
	}
	equalList(t, "Args", ce.Args, []string{"rev-parse", "--verify", "refs/heads/nope"})
	equal(t, "CommandError.Status", ce.Status, 128)
	equal(t, "CommandError.Output", ce.Output, "fatal: Needed a single revision")
	equal(t, "Error", ce.Error(), "git rev-parse --verify refs/heads/nope failed (status 128): fatal: Needed a single revision")

	// Extra variables win over the base environment.
	res = must(f.RunEnv([]string{"GIT_AUTHOR_NAME=Other"}, "var", "GIT_AUTHOR_IDENT"))
	if !strings.HasPrefix(res.Stdout, "Other <fixture@example.invalid> ") {
		t.Fatalf("RunEnv ident %q", res.Stdout)
	}
	if out := must(f.OKEnv([]string{"GIT_AUTHOR_NAME=Third"}, "var", "GIT_AUTHOR_IDENT")); !strings.HasPrefix(out, "Third <fixture@example.invalid> ") {
		t.Fatalf("OKEnv ident %q", out)
	}

	// Commands Kogen never runs are refused before Git starts.
	for _, args := range [][]string{{"push"}, {"checkout", "-b", "x"}, {"commit", "-m", "x"}} {
		if _, err := f.Run(args...); !errors.Is(err, git.ErrForbidden) {
			t.Fatalf("Run(%q) error = %v, want ErrForbidden", args, err)
		}
	}
	if _, err := f.OK("reset", "--hard"); !errors.Is(err, git.ErrForbidden) {
		t.Fatalf("OK(reset) error = %v", err)
	}
	if _, err := f.Resolve("--upload-pack=x"); !errors.Is(err, git.ErrBadRevision) {
		t.Fatalf("Resolve of an option-like revision: %v", err)
	}
}

// kogen-executor agent/git.go and kogen-verification verify/readiness.go read HEAD and trees;
// kogen-build build/commit.go resolves the commit's tree and parent.
func TestHeadResolveShowGitDirAndObjectFormat(t *testing.T) {
	bare := newBareFx(t)
	equal(t, "Head without a commit", bare.Head(), "")

	f := newRepoFx(t)
	head := strings.TrimSpace(f.git(t, "rev-parse", "HEAD"))
	equal(t, "Head", f.Head(), head)
	equal(t, "Resolve", must(f.Resolve("HEAD")), head)
	equal(t, "Resolve tree", must(f.Resolve("HEAD^{tree}")), strings.TrimSpace(f.git(t, "rev-parse", "HEAD^{tree}")))
	if _, err := f.Resolve("refs/heads/nope"); err == nil {
		t.Fatal("Resolve of a missing revision succeeded")
	}
	content, ok := f.Show("HEAD", "README.md")
	equal(t, "Show", content, "readme\n")
	equal(t, "Show ok", ok, true)
	_, ok = f.Show("HEAD", "missing.txt")
	equal(t, "Show of a missing path", ok, false)
	equal(t, "GitDir", must(f.GitDir()), filepath.Join(must(filepath.EvalSymlinks(f.Dir)), ".git"))
	equal(t, "ObjectFormat", must(f.ObjectFormat()), "sha1")

	equal(t, "OperationInProgress", must(f.OperationInProgress()), "")
	for file, op := range map[string]string{"MERGE_HEAD": "merge", "CHERRY_PICK_HEAD": "cherry-pick", "REVERT_HEAD": "revert", "rebase-merge": "rebase"} {
		path := filepath.Join(must(f.GitDir()), file)
		if err := os.WriteFile(path, nil, 0o644); err != nil {
			t.Fatal(err)
		}
		equal(t, "OperationInProgress "+file, must(f.OperationInProgress()), op)
		os.Remove(path)
	}
}

// changed-paths-rename: kogen-shaping shape/init.go and shape/preflight.go and kogen-build
// build/build.go list the changed paths of a checkout.
func TestChangedPathsReportsARenameNewPathFirst(t *testing.T) {
	f := newRepoFx(t)
	f.write(t, "old name.txt", "content that is long enough to be a rename\n")
	f.git(t, "add", ".")
	f.git(t, "commit", "-qm", "add")
	f.git(t, "mv", "old name.txt", "new name.txt")
	equalList(t, "ChangedPaths", must(f.ChangedPaths()), []string{"new name.txt", "old name.txt"})

	f.write(t, ".gitignore", "ignored.log\n")
	f.write(t, "ignored.log", "x\n")
	f.write(t, "dir/untracked.txt", "y\n")
	equalList(t, "ChangedPaths with untracked files", slices.Sorted(slices.Values(must(f.ChangedPaths()))),
		[]string{".gitignore", "dir/untracked.txt", "new name.txt", "old name.txt"})
	equalList(t, "ChangedPaths limited", must(f.ChangedPaths("dir")), []string{"dir/untracked.txt"})
	equalList(t, "ChangedPaths of both names", must(f.ChangedPaths("old name.txt", "new name.txt")), []string{"new name.txt", "old name.txt"})
}

// unset-prefix: kogen-shaping shape/init.go runs Git through a shell with this prefix.
func TestUnsetPrefix(t *testing.T) {
	equal(t, "UnsetPrefix", git.UnsetPrefix(), "unset GIT_ALTERNATE_OBJECT_DIRECTORIES GIT_COMMON_DIR GIT_DIR GIT_GRAFT_FILE GIT_IMPLICIT_WORK_TREE GIT_INDEX_FILE GIT_NAMESPACE GIT_OBJECT_DIRECTORY GIT_PREFIX GIT_QUARANTINE_PATH GIT_SHALLOW_FILE GIT_WORK_TREE; ")
	env := git.CleanEnv([]string{"PATH=/bin", "GIT_DIR=/x", "GIT_INDEX_FILE=/y", "GIT_AUTHOR_NAME=a"})
	equalList(t, "CleanEnv", env, []string{"PATH=/bin", "GIT_AUTHOR_NAME=a"})
}

// Ignored exposes both exact path bytes and errors to coordinator consumers.
func TestIgnoredContract(t *testing.T) {
	f := newRepoFx(t)
	f.write(t, ".gitignore", "*.skip\n")
	var paths []string
	var err error
	paths, err = f.Ignored("café\".skip", "clean.txt")
	if err != nil || !slices.Equal(paths, []string{"café\".skip"}) {
		t.Fatalf("Ignored: %q, %v", paths, err)
	}
	paths, err = git.New(t.TempDir(), f.Env).Ignored("clean.txt")
	if err == nil {
		t.Fatalf("Ignored outside repository: %q, %v", paths, err)
	}
}
