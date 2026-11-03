package contract

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"strings"
	"testing"

	"github.com/KogenAI/kogen-coordinator/project"
)

// encode-json-order: kogen-build build/unit_test.go and kogen-shaping shape/context_test.go
// compare the compact JSON of Kogen's local records.
func TestEncodeJSON(t *testing.T) {
	got, err := project.EncodeJSON(map[string]any{"b": 1, "a": "x\n<&>"})
	if err != nil {
		t.Fatal(err)
	}
	equal(t, "EncodeJSON", string(got), `{"a":"x\n<&>","b":1}`)

	nested := map[string]any{
		"z": []any{json.Number("1.50"), nil, true, "é\"\\\t"},
		"m": map[string]string{"y": "1", "x": "2"},
		"l": []string{"b", "a"},
		"n": int64(-7),
		"s": []map[string]any{{"k": false}},
		"t": struct {
			B string `json:"b"`
			A int    `json:"a"`
		}{"s", 2},
	}
	got, err = project.EncodeJSON(nested)
	if err != nil {
		t.Fatal(err)
	}
	equal(t, "nested", string(got), `{"l":["b","a"],"m":{"x":"2","y":"1"},"n":-7,"s":[{"k":false}],"t":{"a":2,"b":"s"},"z":[1.50,null,true,"é\"\\\t"]}`)

	if _, err := project.EncodeJSON("\xff"); err == nil {
		t.Fatal("EncodeJSON accepted a string that is not UTF-8")
	}
}

// Kogen's local records name the checkout by the physical Git directory: kogen-shaping
// shape/preflight_test.go and shape/shape_test.go read the facts, kogen-build build/facts.go
// publishes the id.
func TestCheckoutFacts(t *testing.T) {
	f := newRepoFx(t)
	var facts project.CheckoutFacts = must(project.Checkout(f.Dir))
	root := must(filepath.EvalSymlinks(f.Dir))
	equal(t, "Root", facts.Root, root)
	equal(t, "GitDir", facts.GitDir, filepath.Join(root, ".git"))
	equal(t, "ID", facts.ID, sha256Hex([]byte(filepath.Join(root, ".git"))))

	link := filepath.Join(t.TempDir(), "link")
	if err := os.Symlink(f.Dir, link); err != nil {
		t.Fatal(err)
	}
	if viaLink := must(project.Checkout(link)); viaLink != facts {
		t.Fatalf("Checkout through a symlink = %+v, want %+v", viaLink, facts)
	}
	if _, err := project.Checkout(filepath.Join(t.TempDir(), "missing")); err == nil {
		t.Fatal("Checkout of a missing directory succeeded")
	}
}

// package-facts: kogen cli/facts.go lists packages from the file; kogen-verification
// verify/readiness_test.go, kogen-shaping shape/approve.go and kogen-build build/facts.go write it.
func TestWritePackageFacts(t *testing.T) {
	f := newProjectFx(t)
	cfg := must(project.LoadConfig(f.Dir))
	path := filepath.Join(f.Dir, ".kogen", "local", "packages", "fixture.json")

	if err := project.WritePackageFacts(f.Dir, "fixture", cfg); err != nil {
		t.Fatal(err)
	}
	paths := must(project.Baseline(f.Dir, "fixture", cfg))
	sorted := slices.Sorted(slices.Values(paths))
	checkout := must(project.Checkout(f.Dir))
	read := func() map[string]any {
		var doc map[string]any
		if err := json.Unmarshal([]byte(readFile(t, path)), &doc); err != nil {
			t.Fatal(err)
		}
		return doc
	}
	doc := read()
	keys := make([]string, 0, len(doc))
	for k := range doc {
		keys = append(keys, k)
	}
	slices.Sort(keys)
	equalList(t, "keys", keys, []string{"checkout_id", "package_state", "paths", "sha256"})
	equal(t, "checkout_id", doc["checkout_id"], any(checkout.ID))
	equal(t, "package_state", doc["package_state"], any("valid"))
	equal(t, "sha256", doc["sha256"], any(project.Hash(f.Dir, paths)))
	var got []string
	for _, p := range doc["paths"].([]any) {
		got = append(got, p.(string))
	}
	equalList(t, "paths", got, sorted)
	want, err := project.EncodeJSON(map[string]any{
		"checkout_id": checkout.ID, "package_state": "valid", "paths": sorted, "sha256": project.Hash(f.Dir, paths),
	})
	if err != nil {
		t.Fatal(err)
	}
	equal(t, "file", readFile(t, path), string(want)+"\n")

	// An Intent that fails its check is `invalid`.
	earlier := project.Hash(f.Dir, paths)
	f.write(t, ".kogen/intents/fixture/intent.md", strings.Replace(fixtureIntentMD, "Slug: fixture", "Slug: other", 1))
	if err := project.WritePackageFacts(f.Dir, "fixture", cfg); err != nil {
		t.Fatal(err)
	}
	doc = read()
	equal(t, "invalid package_state", doc["package_state"], any("invalid"))
	if reflect.DeepEqual(doc["sha256"], any(earlier)) {
		t.Fatal("the facts keep the hash of the earlier contract")
	}
}
