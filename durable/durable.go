// Package durable is the one place Kogen flushes a file to stable storage. Test binaries may
// switch the flush off; the kogen program never does.
package durable

import (
	"os"
	"runtime"
	"strings"
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

// SkipSyncInTests switches syncing off for the rest of the process. Only Go test files call it:
// it reads its caller's file with runtime.Caller and, unless that file name ends in _test.go,
// panics with "durable.SkipSyncInTests called from non-test file <file>" before switching
// anything off, so syncing stays on. No option or setting changes this.
func SkipSyncInTests() {
	_, file, _, ok := runtime.Caller(1)
	if !ok || !strings.HasSuffix(file, "_test.go") {
		panic("durable.SkipSyncInTests called from non-test file " + file)
	}
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
