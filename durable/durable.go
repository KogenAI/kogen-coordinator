// Package durable is the one place Kogen flushes a file to stable storage. Test binaries may
// switch the flush off; the kogen program never does.
package durable

import (
	"os"
	"sync/atomic"
)

var skip atomic.Bool

var observer atomic.Pointer[func(f *os.File)]

// Sync calls the observer set by ObserveSyncInTests with f, if any, then returns f.Sync(), and
// returns nil without calling it once SkipSyncInTests was called.
func Sync(f *os.File) error {
	if fn := observer.Load(); fn != nil {
		(*fn)(f)
	}
	if skip.Load() {
		return nil
	}
	return f.Sync()
}

// SkipSyncInTests switches syncing off for the rest of the process. Only Go test files call it.
func SkipSyncInTests() {
	skip.Store(true)
}

// ObserveSyncInTests makes every later Sync call fn with the file before it flushes it, also
// after SkipSyncInTests. A later call replaces fn; nil removes it. Only Go test files and test
// drivers call it.
func ObserveSyncInTests(fn func(f *os.File)) {
	if fn == nil {
		observer.Store(nil)
		return
	}
	observer.Store(&fn)
}
