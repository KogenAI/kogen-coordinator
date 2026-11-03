package contract

import (
	"bytes"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/KogenAI/kogen-coordinator/git"
)

func chmod(t *testing.T, path string, mode os.FileMode) {
	t.Helper()
	if err := os.Chmod(path, mode); err != nil {
		t.Fatal(err)
	}
}

// kogen-verification verify/readiness.go and kogen-shaping shape/shape.go build the candidate
// tree; kogen-build build/material.go lists its entries and diffs it against the start.
func TestTreeEntriesChangedAndDiff(t *testing.T) {
	f := newRepoFx(t)
	start := f.Head()
	f.write(t, ".kogen/intents/mine/intent.md", "mine\n")
	f.write(t, ".kogen/intents/other/intent.md", "other\n")
	f.write(t, "a b.txt", "one\n")
	f.write(t, "README.md", "readme\nmore\n")
	f.write(t, "run.sh", "#!/bin/sh\n")
	chmod(t, filepath.Join(f.Dir, "run.sh"), 0o755)
	indexBefore := must(f.IndexBytes())

	tree := must(f.Tree(start, []string{".kogen/intents/other"}))
	if !bytes.Equal(must(f.IndexBytes()), indexBefore) {
		t.Fatal("Tree changed the user's index")
	}
	equal(t, "Head", f.Head(), start)
	equal(t, "the excluded folder changes the tree", must(f.Tree(start, nil)) == tree, false)
	clean := newRepoFx(t)
	equal(t, "a clean checkout's tree is HEAD's", must(clean.Tree(clean.Head(), nil)), must(clean.Resolve("HEAD^{tree}")))

	entries := must(f.TreeEntries(tree))
	byPath := map[string]git.TreeEntry{}
	for _, e := range entries {
		byPath[e.Path] = e
	}
	if len(entries) != 4 {
		t.Fatalf("TreeEntries = %+v", entries)
	}
	for path, mode := range map[string]string{"README.md": "100644", "a b.txt": "100644", "run.sh": "100755", ".kogen/intents/mine/intent.md": "100644"} {
		e := byPath[path]
		equal(t, path+" Mode", e.Mode, mode)
		equal(t, path+" Type", e.Type, "blob")
		equal(t, path+" Object", e.Object, strings.TrimSpace(f.git(t, "rev-parse", tree+":"+path)))
		equal(t, path+" Path", e.Path, path)
	}
	if _, ok := byPath[".kogen/intents/other/intent.md"]; ok {
		t.Fatal("an excluded folder is in the tree")
	}

	changed := must(f.Changed(start, tree))
	equalList(t, "Changed", slices.Sorted(slices.Values(changed)), []string{".kogen/intents/mine/intent.md", "README.md", "a b.txt", "run.sh"})
	equal(t, "Changed of the same tree", len(must(f.Changed(tree, tree))), 0)

	diff := must(f.Diff(start, tree, []string{"a b.txt"}))
	if !strings.Contains(diff, "diff --git a/a b.txt b/a b.txt") || !strings.Contains(diff, "+one") || strings.Contains(diff, "README") {
		t.Fatalf("Diff:\n%s", diff)
	}
	equal(t, "Diff without paths", must(f.Diff(start, tree, nil)), "")
	equal(t, "Diff of a glob is literal", must(f.Diff(start, tree, []string{"*.txt"})), "")
	if all := must(f.DiffAll(start, tree)); !strings.Contains(all, "diff --git a/README.md b/README.md") || !strings.Contains(all, "+more") {
		t.Fatalf("DiffAll:\n%s", all)
	}
}

// kogen-verification verify/readiness.go materializes the candidate and verify/run.go asks which
// inputs the commands changed.
func TestMaterializeAndMutations(t *testing.T) {
	f := newRepoFx(t)
	f.write(t, ".gitignore", "build/\n")
	f.write(t, "app.sh", "printf 'before\\n'\n")
	f.write(t, "build/tracked.txt", "tracked ignored input\n")
	f.git(t, "add", "-f", ".gitignore", "app.sh", "build/tracked.txt")
	f.git(t, "commit", "-qm", "baseline")
	start := f.Head()
	f.write(t, "app.sh", "printf 'candidate\\n'\n")
	chmod(t, filepath.Join(f.Dir, "app.sh"), 0o755)
	f.write(t, "new.txt", "new candidate\n")
	if err := os.Symlink("new.txt", filepath.Join(f.Dir, "link")); err != nil {
		t.Fatal(err)
	}
	f.write(t, "build/undeclared.sh", "workspace only\n")
	tree := must(f.Tree(start, nil))

	scratch := filepath.Join(t.TempDir(), "copy")
	var m *git.Materialized = must(f.Materialize(tree, scratch))
	equal(t, "Dir", m.Dir, scratch)
	copyRepo := f.At(scratch)
	equal(t, "scratch tree", strings.TrimSpace(must(copyRepo.OK("rev-parse", "HEAD^{tree}"))), tree)
	equal(t, "app.sh", readFile(t, filepath.Join(scratch, "app.sh")), "printf 'candidate\\n'\n")
	equal(t, "app.sh mode", must(os.Lstat(filepath.Join(scratch, "app.sh"))).Mode().Perm(), os.FileMode(0o755))
	equal(t, "link", must(os.Readlink(filepath.Join(scratch, "link"))), "new.txt")
	if _, err := os.Stat(filepath.Join(scratch, "build", "undeclared.sh")); err == nil {
		t.Fatal("an ignored workspace output was materialized")
	}
	equal(t, "author", strings.TrimSpace(must(copyRepo.OK("log", "-1", "--format=%an <%ae>"))), "Kogen Verification <verification@kogen.invalid>")
	equal(t, "commits", strings.TrimSpace(must(copyRepo.OK("rev-list", "--count", "HEAD"))), "1")

	mutations := func(want ...string) {
		t.Helper()
		got := must(m.Mutations())
		if !slices.Equal(got, want) && !(len(got) == 0 && len(want) == 0) {
			t.Fatalf("Mutations = %q, want %q", got, want)
		}
	}
	mutations()
	chmod(t, filepath.Join(scratch, "app.sh"), 0o644)
	mutations("app.sh")
	chmod(t, filepath.Join(scratch, "app.sh"), 0o755)
	mutations()
	if err := os.WriteFile(filepath.Join(scratch, "added.txt"), []byte("added by a command\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	must(copyRepo.OK("add", "added.txt"))
	mutations("added.txt")
	must(copyRepo.OK("rm", "-q", "-f", "added.txt"))
	if err := os.WriteFile(filepath.Join(scratch, "build", "generated.sh"), []byte("an ignored output\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	mutations()
	if err := os.WriteFile(filepath.Join(scratch, "build", "tracked.txt"), []byte("mutated\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	mutations("build/tracked.txt")

}

// kogen-build build/review_retry.go puts the checkout back to the reviewed tree.
func TestRestoreTreePutsBackTheDifferingPaths(t *testing.T) {
	f := newRepoFx(t)
	f.write(t, "keep.txt", "kept\n")
	f.write(t, "dir/gone.txt", "gone\n")
	f.git(t, "add", ".")
	f.git(t, "commit", "-qm", "reviewed")
	green := must(f.Resolve("HEAD^{tree}"))
	head, index := f.Head(), must(f.IndexBytes())

	f.write(t, "README.md", "edited\n")
	if err := os.Remove(filepath.Join(f.Dir, "dir", "gone.txt")); err != nil {
		t.Fatal(err)
	}
	f.write(t, "new/deep/added.txt", "added\n")
	current := must(f.Tree(f.Head(), nil))
	equal(t, "the edits changed the tree", current != green, true)

	got := must(f.RestoreTree(current, green))
	changes := map[string]string{}
	for _, r := range got {
		var restored git.Restored = r
		changes[restored.Path] = restored.Change
	}
	want := map[string]string{"README.md": "modified", "dir/gone.txt": "deleted", "new/deep/added.txt": "added"}
	if len(changes) != len(want) {
		t.Fatalf("RestoreTree = %v, want %v", changes, want)
	}
	for path, change := range want {
		equal(t, path+" Change", changes[path], change)
	}
	equal(t, "restored tree", must(f.Tree(f.Head(), nil)), green)
	equal(t, "README", readFile(t, filepath.Join(f.Dir, "README.md")), "readme\n")
	equal(t, "deleted file", readFile(t, filepath.Join(f.Dir, "dir", "gone.txt")), "gone\n")
	if _, err := os.Stat(filepath.Join(f.Dir, "new")); !os.IsNotExist(err) {
		t.Fatalf("the folders of the added file stayed: %v", err)
	}
	equal(t, "HEAD", f.Head(), head)
	if !bytes.Equal(must(f.IndexBytes()), index) {
		t.Fatal("RestoreTree changed the index")
	}
	equal(t, "a second restore", len(must(f.RestoreTree(green, green))), 0)
}

// kogen-build build/build.go saves the user's index before a Build and build/stop.go restores it;
// build/resume.go and build/review_retry.go ask whether two indexes stage the same.
func TestIndexCustody(t *testing.T) {
	f := newRepoFx(t)
	f.write(t, "user-staged.txt", "staged by the user\n")
	f.git(t, "add", "user-staged.txt")
	equal(t, "IndexPath", must(f.IndexPath()), filepath.Join(must(f.GitDir()), "index"))
	before := must(f.IndexBytes())
	backup := filepath.Join(t.TempDir(), "index-at-start")
	if err := f.SaveIndex(backup); err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal([]byte(readFile(t, backup)), before) {
		t.Fatal("the custody copy differs from the index")
	}

	if err := f.ReadTree(must(f.Resolve("HEAD^{tree}"))); err != nil {
		t.Fatal(err)
	}
	equal(t, "ReadTree unstaged", f.git(t, "diff", "--cached", "--name-only"), "")
	if err := f.RestoreIndex(backup); err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(must(f.IndexBytes()), before) {
		t.Fatal("RestoreIndex did not put the index back")
	}
	equal(t, "staged again", f.git(t, "diff", "--cached", "--name-only"), "user-staged.txt\n")
	if err := f.RestoreIndex(filepath.Join(t.TempDir(), "missing")); err == nil {
		t.Fatal("RestoreIndex of a missing custody copy succeeded")
	}

	// A refresh of the stat cache keeps the staging equivalent; another staging does not.
	f.write(t, "README.md", "readme\n")
	later := must(os.Stat(filepath.Join(f.Dir, "README.md"))).ModTime().Add(3e9)
	if err := os.Chtimes(filepath.Join(f.Dir, "README.md"), later, later); err != nil {
		t.Fatal(err)
	}
	f.git(t, "status", "--porcelain")
	refreshed := must(f.IndexBytes())
	equal(t, "ObjectFormat", must(f.ObjectFormat()), "sha1")
	equal(t, "StagedEquivalent after a refresh", git.StagedEquivalent(before, refreshed, "sha1"), true)
	f.git(t, "add", "README.md")
	f.write(t, "README.md", "changed\n")
	f.git(t, "add", "README.md")
	equal(t, "StagedEquivalent after another staging", git.StagedEquivalent(before, must(f.IndexBytes()), "sha1"), false)
	equal(t, "StagedEquivalent of damaged bytes", git.StagedEquivalent(before[:len(before)-1], before, "sha1"), false)
}
