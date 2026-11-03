package contract

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/KogenAI/kogen-coordinator/durable"
)

// durable-skip: kogen, kogen-shaping and kogen-build test mains call SkipSyncInTests, after
// which Sync does not touch the file: a closed file, which cannot be flushed, syncs to nil.
func TestDurableSyncIsSkippedInTests(t *testing.T) {
	durable.SkipSyncInTests()
	f, err := os.Create(filepath.Join(t.TempDir(), "synced"))
	if err != nil {
		t.Fatal(err)
	}
	if err := f.Close(); err != nil {
		t.Fatal(err)
	}
	if err := f.Sync(); err == nil {
		t.Fatal("the control failed: syncing a closed file succeeded")
	}
	if err := durable.Sync(f); err != nil {
		t.Fatalf("Sync of a closed file after SkipSyncInTests = %v, want nil", err)
	}
}
