package contract

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/KogenAI/kogen-coordinator/git"
)

// kogen-shaping shape/external.go pins the Git execution state before an external executor
// runs and compares it afterwards.
func TestPinNamesWhatChanged(t *testing.T) {
	f := newRepoFx(t)
	var base *git.Pin = must(f.TakePin())
	if got := base.Changes(must(f.TakePin())); len(got) != 0 {
		t.Fatalf("an unchanged checkout changed: %q", got)
	}

	hook := filepath.Join(f.Hooks, "pre-commit")
	if err := os.WriteFile(hook, []byte("#!/bin/sh\nexit 0\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	got := base.Changes(must(f.TakePin()))
	if len(got) != 1 || !strings.HasSuffix(got[0], "pre-commit") {
		t.Fatalf("an added hook: %q", got)
	}
	os.Remove(hook)
	if got := base.Changes(must(f.TakePin())); len(got) != 0 {
		t.Fatalf("the removed hook: %q", got)
	}

	const secret = "s3cr3t-token-value"
	f.git(t, "config", "core.sshCommand", "ssh "+secret)
	got = base.Changes(must(f.TakePin()))
	equalList(t, "an executable configuration key", got, []string{"core.sshCommand"})
	if strings.Contains(strings.Join(got, " "), secret) {
		t.Fatal("a configuration value was named")
	}
}
