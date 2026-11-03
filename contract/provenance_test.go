package contract

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/KogenAI/kogen-coordinator/project"
)

// shapeFx is a project whose Shape has captured its source receipt, as kogen-shaping
// shape/shape.go does at the end of a successful Shape.
type shapeFx struct {
	*projectFx
	cfg    *project.Config
	origin project.SourceOrigin
	ref    *project.SourceRef
}

func newShapeFx(t *testing.T) *shapeFx {
	t.Helper()
	f := newProjectFx(t)
	cfg := must(project.LoadConfig(f.Dir))
	origin := must(project.CaptureOrigin(f.Dir, cfg))
	st := project.ShapeSource{
		Request:    "Make the fixture. Δ\n",
		SourcePath: "",
		Rounds: []map[string]any{{
			"questions": []any{map[string]any{"text": "Which?", "options": []any{map[string]any{"label": "One"}, map[string]any{"label": "Two"}}}},
			"answers":   map[string]any{"1": "b"},
		}},
		Origin: origin,
	}
	if err := project.CaptureSource(f.Dir, fixtureSlug, cfg, st); err != nil {
		t.Fatal(err)
	}
	ref := must(project.BindSource(f.Dir, fixtureSlug))
	if ref == nil {
		t.Fatal("BindSource found no receipt after CaptureSource")
	}
	return &shapeFx{projectFx: f, cfg: cfg, origin: origin, ref: ref}
}

func (f *shapeFx) contractHash(t *testing.T) string {
	t.Helper()
	return project.Hash(f.Dir, must(project.Baseline(f.Dir, fixtureSlug, f.cfg)))
}

// source-path, source-receipt-version: kogen-shaping shape/approve_test.go and shape_test.go.
func TestCaptureSourcePublishesTheVersionOneReceipt(t *testing.T) {
	f := newProjectFx(t)
	cfg := must(project.LoadConfig(f.Dir))
	var origin project.SourceOrigin = must(project.CaptureOrigin(f.Dir, cfg))
	st := project.ShapeSource{
		Request:    "Make the fixture. Δ\n",
		SourcePath: "",
		Rounds: []map[string]any{{
			"questions": []any{map[string]any{"text": "Which?", "options": []any{map[string]any{"label": "One"}, map[string]any{"label": "Two"}}}},
			"answers":   map[string]any{"1": "b"},
		}},
		Origin: origin,
	}
	equal(t, "Request", st.Request, "Make the fixture. Δ\n")
	equal(t, "SourcePath", st.SourcePath, "")
	equal(t, "Rounds", len(st.Rounds), 1)
	if err := project.CaptureSource(f.Dir, fixtureSlug, cfg, st); err != nil {
		t.Fatal(err)
	}
	ref := must(project.BindSource(f.Dir, fixtureSlug))
	if ref == nil {
		t.Fatal("BindSource found no receipt after CaptureSource")
	}
	contractHash := project.Hash(f.Dir, must(project.Baseline(f.Dir, fixtureSlug, cfg)))

	path := project.SourcePath(f.Dir, fixtureSlug)
	equal(t, "SourcePath", path, filepath.Join(f.Dir, ".kogen", "local", "provenance", "fixture", "current.json"))
	equal(t, "ref.Path", ref.Path, path)

	var doc struct {
		Version        json.Number       `json:"version"`
		Request        map[string]any    `json:"request"`
		Rounds         []map[string]any  `json:"rounds"`
		Corrections    []any             `json:"corrections"`
		Origin         map[string]string `json:"origin"`
		ContractSHA256 string            `json:"contract_sha256"`
		Comparison     string            `json:"comparison"`
	}
	text := readFile(t, path)
	if err := json.Unmarshal([]byte(text), &doc); err != nil {
		t.Fatal(err)
	}
	equal(t, "version", doc.Version.String(), "1")
	want := project.NewSourceRequest("Make the fixture. Δ\n", "")
	equal(t, "request text", doc.Request["text"], any(want.Text))
	equal(t, "request source_path", doc.Request["source_path"], any("-"))
	equal(t, "request sha256", doc.Request["sha256"], any(sha256Hex([]byte(want.Text))))
	equal(t, "want SourcePath", want.SourcePath, "-")
	equal(t, "resolved answer", doc.Rounds[0]["resolved_answers"].(map[string]any)["1"], any("Two"))
	equal(t, "corrections", len(doc.Corrections), 0)
	equal(t, "origin head", doc.Origin["head"], f.Head())
	equal(t, "origin tree", doc.Origin["tree"], must(f.Tree(f.Head(), nil)))
	equal(t, "origin configuration", len(doc.Origin["configuration"]), 64)
	equal(t, "origin", origin.Head, f.Head())
	equal(t, "origin tree", origin.Tree, doc.Origin["tree"])
	equal(t, "origin configuration", origin.Configuration, doc.Origin["configuration"])
	equal(t, "contract_sha256", doc.ContractSHA256, contractHash)
	equal(t, "comparison", doc.Comparison, must(project.SourceComparison(f.Dir, fixtureSlug)))
	equal(t, "comparison text", doc.Comparison, "- Addressed: the fixture request.")

	if fi := must(os.Stat(path)); fi.Mode().Perm() != 0o600 {
		t.Fatalf("receipt mode %o", fi.Mode().Perm())
	}

	// The receipt is bound to the baseline hash of the contract.
	equal(t, "ContractSHA256", ref.ContractSHA256, contractHash)
	equal(t, "SHA256", ref.SHA256, sha256Hex([]byte(text)))

	// A project with no receipt is a legacy one.
	legacy := newProjectFx(t)
	if ref, err := project.BindSource(legacy.Dir, fixtureSlug); ref != nil || err != nil {
		t.Fatalf("BindSource without a receipt = %+v, %v", ref, err)
	}
}

// source-ref-map: kogen-shaping shape/approve.go stores Map in the approval and kogen-build
// build/build.go reads it back with SourceRefFromMap.
func TestSourceRefMapRoundTrip(t *testing.T) {
	f := newShapeFx(t)
	want := map[string]any{"path": f.ref.Path, "sha256": f.ref.SHA256, "contract_sha256": f.ref.ContractSHA256}
	if got := f.ref.Map(); !reflect.DeepEqual(got, want) {
		t.Fatalf("Map = %+v, want %+v", got, want)
	}
	if back := project.SourceRefFromMap(f.ref.Map()); !f.ref.Equal(back) || *back != *f.ref {
		t.Fatalf("SourceRefFromMap = %+v, want %+v", back, f.ref)
	}
	archive := &project.SourceRef{Path: f.ref.Path, SHA256: f.ref.SHA256}
	if got := archive.Map(); !reflect.DeepEqual(got, map[string]any{"path": f.ref.Path, "sha256": f.ref.SHA256}) {
		t.Fatalf("Map without a contract hash = %+v", got)
	}
	if project.SourceRefFromMap(nil) != nil || (*project.SourceRef)(nil).Map() != nil {
		t.Fatal("a nil reference is not the legacy marker")
	}
	partial := project.SourceRefFromMap(map[string]any{"path": 3})
	if *partial != (project.SourceRef{}) {
		t.Fatalf("a non-string member reads as %+v", partial)
	}
	var nilRef *project.SourceRef
	if !nilRef.Equal(nil) || nilRef.Equal(f.ref) || f.ref.Equal(nil) || f.ref.Equal(archive) {
		t.Fatal("Equal does not tell bindings apart")
	}
	var moved project.SourceRef = *f.ref
	moved.Path = filepath.Join(t.TempDir(), "x.json")
	equal(t, "Path", moved.Path != f.ref.Path, true)
	equal(t, "SHA256", archive.SHA256, f.ref.SHA256)
}

// source-refused and source-message: kogen-shaping shape/approve_test.go (a receipt changed during
// readiness), kogen-build build/build_test.go (the legacy notice).
func TestSourceCustodyAndMessages(t *testing.T) {
	f := newShapeFx(t)
	if err := project.ValidateSource(f.ref); err != nil {
		t.Fatal(err)
	}
	if err := project.ValidateSource(nil); err != nil {
		t.Fatalf("ValidateSource of a legacy reference: %v", err)
	}
	equal(t, "legacy SourceMessage", project.SourceMessage(nil), "Source provenance: unavailable (legacy)")
	message := project.SourceMessage(f.ref)
	equal(t, "SourceMessage", message, "Diagnostic source provenance (not authority): "+f.ref.Path+
		"\nManifest sha256: "+f.ref.SHA256+"; contract: "+f.ref.ContractSHA256+
		". Retrieve full originals with read_file. Only the approved Intent authorizes implementation; omissions require ordinary Refine and new exact approval. Mapping is an aid, not proof.")

	card := must(project.SourceCard(f.ref))
	equal(t, "SourceCard", card, message+"\nSource comparison:\n- Addressed: the fixture request.")
	if strings.Contains(card, "Make the fixture") {
		t.Fatal("the card shows the raw request")
	}
	equal(t, "legacy SourceCard", must(project.SourceCard(nil)), "Source provenance: unavailable (legacy)")

	// A changed receipt is refused.
	file, err := os.OpenFile(f.ref.Path, os.O_APPEND|os.O_WRONLY, 0)
	if err != nil {
		t.Fatal(err)
	}
	file.WriteString(" ")
	file.Close()
	for name, err := range map[string]error{
		"ValidateSource": project.ValidateSource(f.ref),
		"SourceCard":     func() error { _, err := project.SourceCard(f.ref); return err }(),
	} {
		e := wantSysError(t, err, "candidate", "source_provenance_changed", 1)
		if name == "ValidateSource" && !strings.Contains(e.Detail, f.ref.Path+" (expected SHA-256 "+f.ref.SHA256+")") {
			t.Fatalf("%s detail %q", name, e.Detail)
		}
	}

	// A receipt of another version is refused as well.
	g := newShapeFx(t)
	text := readFile(t, g.ref.Path)
	if err := os.WriteFile(g.ref.Path, []byte(strings.Replace(text, `"version":1`, `"version":2`, 1)), 0o600); err != nil {
		t.Fatal(err)
	}
	_, err = project.BindSource(g.Dir, fixtureSlug)
	wantSysError(t, err, "candidate", "source_provenance_changed", 1)
}

// kogen-shaping shape/approve.go and shape/refine.go refresh and refine the receipt when the
// contract changes, keep the replaced one as an archive and restore it when a step fails.
func TestSourceRefreshRefineAndRestore(t *testing.T) {
	f := newShapeFx(t)
	original := readFile(t, f.ref.Path)

	// RefreshSource moves the receipt to another contract hash and archives the old one.
	refreshed := must(project.RefreshSource(f.Dir, fixtureSlug, "newhash", f.ref))
	equal(t, "refreshed ContractSHA256", refreshed.ContractSHA256, "newhash")
	archived := f.ref.Archived()
	equal(t, "Archived path", archived.Path, filepath.Join(filepath.Dir(f.ref.Path), f.ref.SHA256+".json"))
	equal(t, "archive bytes", readFile(t, archived.Path), original)
	if err := project.ValidateSource(archived); err != nil {
		t.Fatal(err)
	}
	var doc map[string]any
	if err := json.Unmarshal([]byte(readFile(t, f.ref.Path)), &doc); err != nil {
		t.Fatal(err)
	}
	equal(t, "previous_receipt", doc["previous_receipt"].(map[string]any)["sha256"], any(f.ref.SHA256))
	equal(t, "prior_contract_sha256", doc["prior_contract_sha256"], any(f.ref.ContractSHA256))
	again := must(project.RefreshSource(f.Dir, fixtureSlug, "newhash", refreshed))
	if !again.Equal(refreshed) {
		t.Fatal("refreshing to the bound hash changed the receipt")
	}
	wantSysError(t, func() error { _, err := project.RefreshSource(f.Dir, fixtureSlug, "x", f.ref); return err }(),
		"candidate", "source_provenance_changed", 1)
	if nilRef, err := project.RefreshSource(f.Dir, fixtureSlug, "x", nil); err == nil && nilRef != nil {
		t.Fatalf("RefreshSource of a legacy reference = %+v", nilRef)
	}

	// RefineSource appends the correction and binds the contract the Refine produced.
	f.write(t, "guard.cfg", "refined\n")
	correction := project.NewSourceRequest("Also keep it small.", "")
	var req project.SourceRequest = correction
	equal(t, "correction path", req.SourcePath, "-")
	refined := must(project.RefineSource(f.Dir, fixtureSlug, correction, "newhash", refreshed))
	equal(t, "refined ContractSHA256", refined.ContractSHA256, f.contractHash(t))
	var refinedDoc struct {
		Corrections []map[string]any `json:"corrections"`
	}
	if err := json.Unmarshal([]byte(readFile(t, refined.Path)), &refinedDoc); err != nil {
		t.Fatal(err)
	}
	if len(refinedDoc.Corrections) != 1 || refinedDoc.Corrections[0]["text"] != "Also keep it small." || refinedDoc.Corrections[0]["prior_contract_sha256"] != "newhash" {
		t.Fatalf("corrections %+v", refinedDoc.Corrections)
	}
	if nilRef := must(project.RefineSource(newProjectFx(t).Dir, fixtureSlug, correction, "", nil)); nilRef != nil {
		t.Fatalf("RefineSource of a legacy Intent = %+v", nilRef)
	}

	// RestoreSource puts the earlier bytes back while the published receipt is still intact.
	before := []byte(original)
	if err := project.RestoreSource(refined, before); err != nil {
		t.Fatal(err)
	}
	equal(t, "restored", readFile(t, refined.Path), original)
	if err := project.RestoreSource(refined, []byte("ignored")); err != nil {
		t.Fatal(err)
	}
	equal(t, "restore of an edited receipt", readFile(t, refined.Path), original)
	if err := project.RestoreSource(nil, before); err != nil {
		t.Fatal(err)
	}
}

// kogen-shaping shape/approve.go resolves the receipt an existing approval points at.
func TestResolveApproval(t *testing.T) {
	f := newShapeFx(t)
	approval := &project.Approval{Slug: fixtureSlug, SHA256: f.contractHash(t), Approver: fixtureIdentity, ApprovedAt: "2026-11-03T00:00:00Z", SourceProvenance: f.ref.Map()}
	got := must(project.ResolveApproval(f.Dir, fixtureSlug, approval))
	if !got.Equal(f.ref) {
		t.Fatalf("ResolveApproval = %+v, want %+v", got, f.ref)
	}
	if got := must(project.ResolveApproval(f.Dir, fixtureSlug, nil)); got != nil {
		t.Fatalf("ResolveApproval of no approval = %+v", got)
	}
	legacy := *approval
	legacy.SourceProvenance = nil
	if got := must(project.ResolveApproval(f.Dir, fixtureSlug, &legacy)); got != nil {
		t.Fatalf("ResolveApproval of a legacy approval = %+v", got)
	}
	stale := *approval
	stale.SourceProvenance = map[string]any{"path": "/elsewhere/current.json", "sha256": f.ref.SHA256}
	_, err := project.ResolveApproval(f.Dir, fixtureSlug, &stale)
	wantSysError(t, err, "candidate", "source_provenance_changed", 1)
}

// kogen-shaping shape/approve_test.go publishes receipts directly.
func TestPublishSourceKeepsThePredecessor(t *testing.T) {
	root := t.TempDir()
	doc := func(comparison string) map[string]any {
		return map[string]any{
			"version": json.Number("1"), "request": project.NewSourceRequest("text", "-"), "rounds": []any{}, "corrections": []any{},
			"contract_sha256": "contract", "comparison": comparison,
		}
	}
	if err := project.PublishSource(root, "s", doc("first")); err != nil {
		t.Fatal(err)
	}
	first := readFile(t, project.SourcePath(root, "s"))
	if err := project.PublishSource(root, "s", doc("second")); err != nil {
		t.Fatal(err)
	}
	archive := filepath.Join(filepath.Dir(project.SourcePath(root, "s")), sha256Hex([]byte(first))+".json")
	equal(t, "archive", readFile(t, archive), first)
	for path, mode := range map[string]os.FileMode{
		project.SourcePath(root, "s"): 0o600,
		archive:                       0o600,
		filepath.Dir(project.SourcePath(root, "s")):               0o700,
		filepath.Dir(filepath.Dir(project.SourcePath(root, "s"))): 0o700,
	} {
		if got := must(os.Stat(path)).Mode().Perm(); got != mode {
			t.Fatalf("%s mode %o, want %o", path, got, mode)
		}
	}
	ref := must(project.BindSource(root, "s"))
	equal(t, "bound contract", ref.ContractSHA256, "contract")
}

// kogen-shaping shape/contract_test.go reads the Source comparison of an Intent.
func TestSourceComparisonRules(t *testing.T) {
	f := newProjectFx(t)
	equal(t, "SourceComparison", must(project.SourceComparison(f.Dir, fixtureSlug)), "- Addressed: the fixture request.")
	for name, text := range map[string]string{
		"missing":  strings.Replace(fixtureIntentMD, "## Source comparison\n- Addressed: the fixture request.\n", "", 1),
		"empty":    strings.Replace(fixtureIntentMD, "- Addressed: the fixture request.\n", "\n", 1),
		"too long": fixtureIntentMD + strings.Repeat("x", 8192),
	} {
		f.write(t, project.IntentMDPath(fixtureSlug), text)
		_, err := project.SourceComparison(f.Dir, fixtureSlug)
		e := wantSysError(t, err, "intent", "lint", 1)
		if !strings.HasPrefix(e.Detail, "the Intent needs a nonempty ## Source comparison of at most 8192 UTF-8 bytes") {
			t.Fatalf("%s: detail %q", name, e.Detail)
		}
	}
}
