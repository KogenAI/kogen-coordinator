package project

import (
	"os"
	"path/filepath"
	"slices"
	"testing"

	kgit "github.com/KogenAI/kogen-coordinator/git"
)

func TestOwnedByIntent(t *testing.T) {
	for path, want := range map[string]bool{
		".kogen/intents/complete-task/intent.md":         true,
		".kogen/intents/complete-task/model.qnt":         true,
		".kogen/models/complete-task/model.json":         true,
		".kogen/models/complete-task/model.qnt":          true,
		".kogen/intents/complete-task-archive/intent.md": false,
		".kogen/models/complete-task-archive/model.json": false,
		".kogen/intents/complete-task":                   false,
		".kogen/models/complete-task":                    false,
		"lib/complete-task/model.json":                   false,
		"README.md":                                      false,
		"":                                               false,
	} {
		if got := OwnedByIntent("complete-task", path); got != want {
			t.Errorf("OwnedByIntent(%q) = %v, want %v", path, got, want)
		}
	}
}

func TestBuildEditsKeepOrderAndLeaveOutOwned(t *testing.T) {
	changed := []string{
		"lib/b.js",
		".kogen/models/complete-task/model.json",
		".kogen/intents/complete-task-archive/intent.md",
		"README.md",
		".kogen/intents/complete-task/intent.md",
		"lib/a.js",
	}
	want := []string{"lib/b.js", ".kogen/intents/complete-task-archive/intent.md", "README.md", "lib/a.js"}
	if got := BuildEdits("complete-task", changed); !slices.Equal(got, want) {
		t.Errorf("BuildEdits = %v, want %v", got, want)
	}
	for _, in := range [][]string{nil, {}, {".kogen/models/complete-task/model.qnt"}} {
		if got := BuildEdits("complete-task", in); len(got) != 0 {
			t.Errorf("BuildEdits(%v) = %v, want none", in, got)
		}
	}
}

// The interrupted Build of 4 Nov: promoteModel's files are in the tree diff but not in the edit
// list, so discarding the listed paths leaves the model readable for the next Build.
func TestInterruptedBuildKeepsThePromotedModel(t *testing.T) {
	const slug = "complete-task"
	root := gitRepo(t)
	writeFile(t, root, "README.md", "readme\n")
	writeFile(t, root, "lib/task.js", "old\n")
	git(t, root, "add", ".")
	git(t, root, "commit", "-qm", "baseline")
	writeFile(t, root, IntentMDPath(slug), "intent\n")
	writeFile(t, root, ModelPath(slug), "module m {}\n")

	repo := kgit.New(root, os.Environ())
	start, err := repo.Tree(repo.Head(), nil)
	if err != nil {
		t.Fatal(err)
	}
	writeFile(t, root, ".kogen/models/"+slug+"/model.qnt", "module m {}\n")
	writeFile(t, root, ".kogen/models/"+slug+"/model.json", `{"path":".kogen/models/complete-task/model.qnt"}`)
	writeFile(t, root, "README.md", "edited\n")
	writeFile(t, root, "lib/task.js", "new\n")
	writeFile(t, root, "test/task.test.js", "test\n")
	tree, err := repo.Tree(start, nil)
	if err != nil {
		t.Fatal(err)
	}
	changed, err := repo.Changed(start, tree)
	if err != nil {
		t.Fatal(err)
	}
	wantChanged := []string{".kogen/models/complete-task/model.json", ".kogen/models/complete-task/model.qnt", "README.md", "lib/task.js", "test/task.test.js"}
	if !slices.Equal(changed, wantChanged) {
		t.Fatalf("Changed = %v, want %v", changed, wantChanged)
	}
	edits := BuildEdits(slug, changed)
	if want := []string{"README.md", "lib/task.js", "test/task.test.js"}; !slices.Equal(edits, want) {
		t.Fatalf("BuildEdits = %v, want %v", edits, want)
	}

	writeFile(t, root, "README.md", "readme\n")
	writeFile(t, root, "lib/task.js", "old\n")
	if err := os.Remove(filepath.Join(root, "test/task.test.js")); err != nil {
		t.Fatal(err)
	}
	second, err := repo.Tree(repo.Head(), nil)
	if err != nil {
		t.Fatal(err)
	}
	rest, err := repo.Changed(start, second)
	if err != nil {
		t.Fatal(err)
	}
	if want := []string{".kogen/models/complete-task/model.json", ".kogen/models/complete-task/model.qnt"}; !slices.Equal(rest, want) {
		t.Fatalf("model files missing from the second tree: %v", rest)
	}
	if _, err := os.ReadFile(filepath.Join(root, ".kogen/models", slug, "model.json")); err != nil {
		t.Fatal(err)
	}
}
