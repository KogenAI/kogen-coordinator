package durable

import (
	"go/ast"
	"go/parser"
	"go/token"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestObserveSyncInTestsCallsFnWithTheFileOnEverySync(t *testing.T) {
	t.Cleanup(func() { ObserveSyncInTests(nil) })
	f, err := os.Create(filepath.Join(t.TempDir(), "synced"))
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()

	var seen []*os.File
	ObserveSyncInTests(func(g *os.File) { seen = append(seen, g) })
	if err := Sync(f); err != nil {
		t.Fatal(err)
	}
	if len(seen) != 1 || seen[0] != f {
		t.Fatalf("observed %v, want the file once", seen)
	}

	// A later call replaces fn.
	var other int
	ObserveSyncInTests(func(*os.File) { other++ })
	Sync(f)
	if len(seen) != 1 || other != 1 {
		t.Fatalf("replaced observer: old saw %d, new saw %d", len(seen), other)
	}

	// fn is called also when syncing is skipped, and its error is not the flush's.
	skip.Store(true)
	t.Cleanup(func() { skip.Store(false) })
	g, err := os.Create(filepath.Join(t.TempDir(), "closed"))
	if err != nil {
		t.Fatal(err)
	}
	g.Close()
	if err := Sync(g); err != nil || other != 2 {
		t.Fatalf("skipped Sync = %v after %d observations, want nil after 2", err, other)
	}

	ObserveSyncInTests(nil)
	Sync(f)
	if other != 2 {
		t.Fatalf("a removed observer was called")
	}
}

// moduleRoot is the folder with go.mod, the parent of durable/.
func moduleRoot(t *testing.T) string {
	t.Helper()
	root, err := filepath.Abs("..")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(root, "go.mod")); err != nil {
		t.Fatalf("module root %s: %v", root, err)
	}
	return root
}

func TestSkipSyncInTestsIsCalledOnlyFromTestFiles(t *testing.T) {
	root := moduleRoot(t)
	fset := token.NewFileSet()
	err := filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		name := d.Name()
		if d.IsDir() {
			if path != root && (strings.HasPrefix(name, ".") || strings.HasPrefix(name, "_") || name == "testdata") {
				return filepath.SkipDir
			}
			return nil
		}
		if !strings.HasSuffix(name, ".go") || strings.HasSuffix(name, "_test.go") {
			return nil
		}
		rel, err := filepath.Rel(root, path)
		if err != nil {
			return err
		}
		rel = filepath.ToSlash(rel)
		file, err := parser.ParseFile(fset, path, nil, 0)
		if err != nil {
			t.Errorf("%s does not parse: %v", rel, err)
			return nil
		}
		ast.Inspect(file, func(n ast.Node) bool {
			call, ok := n.(*ast.CallExpr)
			if !ok {
				return true
			}
			switch fn := call.Fun.(type) {
			case *ast.Ident:
				if fn.Name == "SkipSyncInTests" {
					t.Errorf("durable.SkipSyncInTests called from non-test file %s", rel)
				}
			case *ast.SelectorExpr:
				if fn.Sel.Name == "SkipSyncInTests" {
					t.Errorf("durable.SkipSyncInTests called from non-test file %s", rel)
				}
			}
			return true
		})
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}
