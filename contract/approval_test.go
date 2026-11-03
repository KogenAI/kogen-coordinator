package contract

import (
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"strings"
	"testing"

	"github.com/KogenAI/kogen-coordinator/project"
)

// approval-path and approval-json: kogen cli/approve_deadline_test.go and kogen-shaping
// shape/approve_test.go read and write the approval of an Intent.
func TestApprovalPathAndJSON(t *testing.T) {
	root := t.TempDir()
	equal(t, "ApprovalPath", project.ApprovalPath(root, "s"), filepath.Join(root, ".kogen", "local", "approvals", "s.json"))

	a := project.Approval{Slug: "s", SHA256: "h", Approver: "A <a@example.invalid>", ApprovedAt: "2026-11-03T00:00:00Z"}
	b, err := project.EncodeApproval(a)
	if err != nil {
		t.Fatal(err)
	}
	equal(t, "EncodeApproval", string(b), `{"slug":"s","sha256":"h","approver":"A <a@example.invalid>","approved_at":"2026-11-03T00:00:00Z","source_provenance":null}`+"\n")

	based := a
	based.Base = "abc123"
	based.SourceProvenance = map[string]any{"path": "p", "sha256": "d"}
	b, err = project.EncodeApproval(based)
	if err != nil {
		t.Fatal(err)
	}
	equal(t, "EncodeApproval with base", string(b),
		`{"slug":"s","sha256":"h","base":"abc123","approver":"A <a@example.invalid>","approved_at":"2026-11-03T00:00:00Z","source_provenance":{"path":"p","sha256":"d"}}`+"\n")

	if got, err := project.ReadApproval(root, "s"); got != nil || err != nil {
		t.Fatalf("ReadApproval without a file = %+v, %v", got, err)
	}
	for _, want := range []project.Approval{a, based} {
		if err := project.WriteApproval(root, want); err != nil {
			t.Fatal(err)
		}
		got, err := project.ReadApproval(root, "s")
		if err != nil {
			t.Fatal(err)
		}
		if !reflect.DeepEqual(*got, want) {
			t.Fatalf("ReadApproval = %+v, want %+v", *got, want)
		}
		equal(t, "approval file", readFile(t, project.ApprovalPath(root, "s")), mustEncode(t, want))
	}
	equal(t, "Slug", based.Slug, "s")
	equal(t, "SHA256", based.SHA256, "h")
	equal(t, "Base", based.Base, "abc123")
	equal(t, "Approver", based.Approver, "A <a@example.invalid>")
	equal(t, "ApprovedAt", based.ApprovedAt, "2026-11-03T00:00:00Z")
	equal(t, "SourceProvenance", based.SourceProvenance["path"], any("p"))

	if err := os.WriteFile(project.ApprovalPath(root, "s"), []byte("not an approval"), 0o644); err != nil {
		t.Fatal(err)
	}
	if got, err := project.ReadApproval(root, "s"); got != nil || err == nil {
		t.Fatalf("ReadApproval of a damaged file = %+v, %v", got, err)
	}
}

func mustEncode(t *testing.T, a project.Approval) string {
	t.Helper()
	return string(must(project.EncodeApproval(a)))
}

// hash-line: kogen cli/buildprogram/helper_test.go and kogen-verification verify/readiness_test.go
// recompute the approval hash; the line is <path>\0<digest>\n in path order.
func TestHashIsTheDigestOfPathDigestLines(t *testing.T) {
	root := t.TempDir()
	writeFile(t, root, "b.txt", "bee\n")
	writeFile(t, root, "a/z.txt", "")
	paths := []string{"b.txt", "gone.txt", "a/z.txt"}

	digest := func(rel string) string {
		b, err := os.ReadFile(filepath.Join(root, rel))
		if err != nil {
			return "missing"
		}
		return sha256Hex(b)
	}
	var lines strings.Builder
	for _, p := range []string{"a/z.txt", "b.txt", "gone.txt"} {
		lines.WriteString(p + "\x00" + digest(p) + "\n")
	}
	want := sha256Hex([]byte(lines.String()))
	equal(t, "Hash", project.Hash(root, paths), want)
	equal(t, "Hash is order independent", project.Hash(root, []string{"gone.txt", "a/z.txt", "b.txt"}), want)
	equal(t, "missing", digest("gone.txt"), "missing")
	equal(t, "Hash of nothing", project.Hash(root, nil), sha256Hex(nil))
	writeFile(t, root, "b.txt", "changed\n")
	if project.Hash(root, paths) == want {
		t.Fatal("Hash ignores the content")
	}
}

// baseline-order and protect-glob: kogen-shaping shape/approve_test.go.
func TestBaselineOrderAndProtectGlobs(t *testing.T) {
	f := newProjectFx(t)
	f.write(t, ".kogen/intents/fixture/intent.md", strings.Replace(fixtureIntentMD,
		"- features/steps/fixture_steps.js\n", "- features/steps/zz_steps.js\n- features/steps/aa_steps.js\n", 1))
	f.write(t, "features/steps/zz_steps.js", "// zz\n")
	f.write(t, "features/steps/aa_steps.js", "// aa\n")
	f.write(t, ".kogen/intents/fixture/notes.md", "notes\n")
	f.write(t, ".kogen/intents/fixture/b.txt", "b\n")
	f.write(t, "x.cfg", "x\n")
	f.write(t, "a/b/x.cfg", "x\n")
	f.write(t, "y.cfg", "y\n")
	f.write(t, "cfg/one", "1\n")
	f.write(t, "cfg/two/deep", "2\n")
	f.write(t, "ignored.cfg", "ignored\n")
	f.write(t, ".gitignore", ".kogen/local/\nignored.cfg\n")
	cfg := &project.Config{Protect: []string{"**/x.cfg", "cfg/", "features/steps/aa_steps.js", "ignored.cfg"}}

	protected, err := project.Protected(f.Dir, cfg)
	if err != nil {
		t.Fatal(err)
	}
	equalList(t, "Protected", protected, []string{"a/b/x.cfg", "cfg/one", "cfg/two/deep", "features/steps/aa_steps.js", "x.cfg"})
	none, err := project.Protected(f.Dir, &project.Config{})
	if err != nil || len(none) != 0 {
		t.Fatalf("Protected without patterns = %q, %v", none, err)
	}

	got, err := project.Baseline(f.Dir, "fixture", cfg)
	if err != nil {
		t.Fatal(err)
	}
	equalList(t, "Baseline", got, []string{
		".kogen/intents/fixture/intent.md", ".kogen/intents/fixture/acceptance.feature",
		"features/steps/zz_steps.js", "features/steps/aa_steps.js",
		".kogen/intents/fixture/b.txt", ".kogen/intents/fixture/notes.md",
		".kogen/project.yaml", ".kogen/models.yaml",
		"a/b/x.cfg", "cfg/one", "cfg/two/deep", "x.cfg",
	})
	if !slices.IsSorted(got[8:]) {
		t.Fatalf("protect matches are not sorted: %q", got[8:])
	}
}

// kogen cli/buildprogram/helper_test.go and kogen-shaping shape/approve_test.go write the
// approval for the hash of the Baseline.
func TestApprovalOfTheBaselineHash(t *testing.T) {
	f := newProjectFx(t)
	cfg := must(project.LoadConfig(f.Dir))
	paths := must(project.Baseline(f.Dir, "fixture", cfg))
	hash := project.Hash(f.Dir, paths)
	if err := project.WriteApproval(f.Dir, project.Approval{Slug: "fixture", SHA256: hash, Approver: fixtureIdentity, ApprovedAt: "2026-11-03T00:00:00Z"}); err != nil {
		t.Fatal(err)
	}
	approval := must(project.ReadApproval(f.Dir, "fixture"))
	equal(t, "approved hash", approval.SHA256, hash)
	f.write(t, "guard.cfg", "changed\n")
	if project.Hash(f.Dir, must(project.Baseline(f.Dir, "fixture", cfg))) == approval.SHA256 {
		t.Fatal("a changed protected file keeps the approval hash")
	}
}
