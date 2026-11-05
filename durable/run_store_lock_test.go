package durable

import (
	"bufio"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"sync"
	"syscall"
	"testing"
	"time"
)

// TestRunStoreHelper is the body of the helper processes of the tests below: the test binary
// re-executed with RUN_HELPER set. It does nothing in an ordinary run.
func TestRunStoreHelper(t *testing.T) {
	switch os.Getenv("RUN_HELPER") {
	case "":
		t.Skip("helper process only")
	case "append":
		s, err := OpenRunStore(os.Getenv("RUN_ROOT"))
		if err != nil {
			t.Fatal(err)
		}
		bufio.NewReader(os.Stdin).ReadString('\n')
		errs := 0
		for i := 0; i < 50; i++ {
			e := RunEvent{Stage: fmt.Sprintf("p%s-%d", os.Getenv("RUN_WRITER"), i), At: time.Unix(0, 0)}
			if s.Append("shared", e) != nil {
				errs++
			}
		}
		fmt.Printf("ERRORS %d\n", errs)
	case "hold":
		f, err := os.OpenFile(filepath.Join(os.Getenv("RUN_ROOT"), os.Getenv("RUN_ID")+".lock"), os.O_RDWR|os.O_CREATE, 0644)
		if err != nil {
			t.Fatal(err)
		}
		if err := syscall.Flock(int(f.Fd()), syscall.LOCK_EX); err != nil {
			t.Fatal(err)
		}
		fmt.Println("LOCKED")
		os.Stdin.Read(make([]byte, 1))
	}
}

type helper struct {
	cmd   *exec.Cmd
	stdin interface{ Write([]byte) (int, error) }
	close func()
	out   *bufio.Reader
}

func startHelper(t *testing.T, mode, root, id, writer string) *helper {
	t.Helper()
	cmd := exec.Command(os.Args[0], "-test.run=^TestRunStoreHelper$")
	cmd.Env = append(os.Environ(), "RUN_HELPER="+mode, "RUN_ROOT="+root, "RUN_ID="+id, "RUN_WRITER="+writer)
	in, err := cmd.StdinPipe()
	if err != nil {
		t.Fatal(err)
	}
	out, err := cmd.StdoutPipe()
	if err != nil {
		t.Fatal(err)
	}
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	h := &helper{cmd: cmd, stdin: in, close: func() { in.Close() }, out: bufio.NewReader(out)}
	t.Cleanup(func() { cmd.Process.Kill(); cmd.Wait() })
	return h
}

func (h *helper) line(t *testing.T) string {
	t.Helper()
	l, err := h.out.ReadString('\n')
	if err != nil {
		t.Fatalf("helper output: %q %v", l, err)
	}
	return strings.TrimSpace(l)
}

func holdLock(t *testing.T, root, id string) *helper {
	t.Helper()
	h := startHelper(t, "hold", root, id, "")
	if l := h.line(t); l != "LOCKED" {
		t.Fatalf("hold helper: %q", l)
	}
	return h
}

// checkTails requires every writer's retained events to be its newest ones, in order, and the
// retained events plus Omitted to equal the number of appends.
func checkTails(t *testing.T, r RunRecord, writers, perWriter int, prefix func(w int) string) {
	t.Helper()
	if len(r.Events) != maxRunEvents || r.Omitted != uint64(writers*perWriter-maxRunEvents) {
		t.Fatalf("events %d omitted %d", len(r.Events), r.Omitted)
	}
	seen := map[string]bool{}
	for _, e := range r.Events {
		if seen[e.Stage] {
			t.Fatalf("duplicate %s", e.Stage)
		}
		seen[e.Stage] = true
	}
	for w := 0; w < writers; w++ {
		var idx []int
		for _, e := range r.Events {
			var n int
			if strings.HasPrefix(e.Stage, prefix(w)+"-") {
				fmt.Sscanf(strings.TrimPrefix(e.Stage, prefix(w)+"-"), "%d", &n)
				idx = append(idx, n)
			}
		}
		for i := range idx {
			if idx[i] != perWriter-len(idx)+i {
				t.Fatalf("writer %d retained %v, not its newest in order", w, idx)
			}
		}
	}
}

func TestRunStoreConcurrentGoroutines(t *testing.T) {
	s, err := OpenRunStore(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	errs := make(chan error, 200)
	for w := 0; w < 8; w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for i := 0; i < 25; i++ {
				if err := s.Append("many", RunEvent{Stage: fmt.Sprintf("g%d-%d", w, i), At: time.Unix(0, 0)}); err != nil {
					errs <- err
				}
			}
		}()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		t.Fatal(err)
	}
	r, err := s.Read("many")
	if err != nil {
		t.Fatal(err)
	}
	checkTails(t, r, 8, 25, func(w int) string { return fmt.Sprintf("g%d", w) })
}

func TestRunStoreConcurrentProcesses(t *testing.T) {
	root := t.TempDir()
	s, err := OpenRunStore(root)
	if err != nil {
		t.Fatal(err)
	}
	hs := []*helper{startHelper(t, "append", root, "", "0"), startHelper(t, "append", root, "", "1")}
	for _, h := range hs {
		h.stdin.Write([]byte("go\n"))
	}
	for _, h := range hs {
		if l := h.line(t); l != "ERRORS 0" {
			t.Fatalf("helper: %q", l)
		}
		h.cmd.Wait()
	}
	r, err := s.Read("shared")
	if err != nil {
		t.Fatal(err)
	}
	checkTails(t, r, 2, 50, func(w int) string { return fmt.Sprintf("p%d", w) })
}

func TestRunStoreFinishRacingAppends(t *testing.T) {
	s, err := OpenRunStore(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	errs := make(chan error, 21)
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			errs <- s.Append("fin", RunEvent{Stage: fmt.Sprintf("e-%d", i), At: time.Unix(0, 0)})
		}()
	}
	wg.Add(1)
	go func() {
		defer wg.Done()
		errs <- s.Finish("fin", "done", "raced", []string{"attempts/fin"})
	}()
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatal(err)
		}
	}
	r, err := s.Read("fin")
	if err != nil {
		t.Fatal(err)
	}
	var stages []string
	for _, e := range r.Events {
		stages = append(stages, e.Stage)
	}
	sort.Strings(stages)
	if len(stages) != 20 || r.Omitted != 0 || r.Outcome != "done" || r.Reason != "raced" || !reflect.DeepEqual(r.Evidence, []string{"attempts/fin"}) {
		t.Fatalf("record: %+v", r)
	}
}

func TestRunStoreHeldLockTimesOutAndDeadHolderBlocksNothing(t *testing.T) {
	if RunLockWait != 10*time.Second {
		t.Fatalf("RunLockWait %s", RunLockWait)
	}
	root := t.TempDir()
	s, err := OpenRunStore(root)
	if err != nil {
		t.Fatal(err)
	}
	h := holdLock(t, root, "held")
	restore := OverrideRunLockWait(300 * time.Millisecond)
	want := `run record "held": lock still held after 300ms`
	for name, call := range map[string]func() error{
		"append": func() error { return s.Append("held", RunEvent{Stage: "x"}) },
		"finish": func() error { return s.Finish("held", "o", "r", nil) },
	} {
		start := time.Now()
		err := call()
		if d := time.Since(start); err == nil || err.Error() != want || d < 300*time.Millisecond || d > 2300*time.Millisecond {
			t.Fatalf("%s: %v after %s", name, err, d)
		}
	}
	if _, err := os.Stat(filepath.Join(root, "held.json")); !os.IsNotExist(err) {
		t.Fatalf("record written while held: %v", err)
	}
	restore()
	h.cmd.Process.Kill()
	h.cmd.Wait()
	start := time.Now()
	if err := s.Append("held", RunEvent{Stage: "after-dead"}); err != nil || time.Since(start) > time.Second {
		t.Fatalf("after dead: %v after %s", err, time.Since(start))
	}
	if ids, _ := s.List(); !reflect.DeepEqual(ids, []string{"held"}) {
		t.Fatalf("list: %v", ids)
	}
}

func TestRunStoreDifferentIDsDoNotWait(t *testing.T) {
	root := t.TempDir()
	s, err := OpenRunStore(root)
	if err != nil {
		t.Fatal(err)
	}
	h := holdLock(t, root, "a")
	defer OverrideRunLockWait(5 * time.Second)()
	done := make(chan error, 1)
	go func() { done <- s.Append("a", RunEvent{Stage: "a-0"}) }()
	for i := 0; i < 10; i++ {
		if err := s.Append("b", RunEvent{Stage: fmt.Sprintf("b-%d", i)}); err != nil {
			t.Fatal(err)
		}
	}
	select {
	case err := <-done:
		t.Fatalf("append to a finished while its lock was held: %v", err)
	default:
	}
	h.close()
	if err := <-done; err != nil {
		t.Fatal(err)
	}
}

func TestRunStoreErrorPathsReleaseLock(t *testing.T) {
	parent := t.TempDir()
	root := filepath.Join(parent, "records")
	s, err := OpenRunStore(root)
	if err != nil {
		t.Fatal(err)
	}
	defer OverrideRunLockWait(300 * time.Millisecond)()
	at := time.Unix(0, 0)
	big := strings.Repeat("x", maxRunBytes)
	if err := s.Append("e", RunEvent{Stage: big, At: at}); err == nil || !strings.Contains(err.Error(), "event exceeds") {
		t.Fatalf("oversize event: %v", err)
	}
	if err := s.Append("e", RunEvent{Stage: "first", At: at}); err != nil {
		t.Fatal(err)
	}
	if err := s.Finish("e", "", big, nil); err == nil || !strings.Contains(err.Error(), "summary exceeds") {
		t.Fatalf("oversize summary: %v", err)
	}
	if err := s.Finish("e", "ok", "", nil); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "e.json"), []byte("bad"), 0600); err != nil {
		t.Fatal(err)
	}
	if s.Append("e", RunEvent{Stage: "x", At: at}) == nil || s.Finish("e", "", "", nil) == nil {
		t.Fatal("corruption ignored")
	}
	if err := os.Remove(filepath.Join(root, "e.json")); err != nil {
		t.Fatal(err)
	}
	if err := s.Append("e", RunEvent{Stage: "last", At: at}); err != nil {
		t.Fatalf("lock kept after errors: %v", err)
	}
	for _, id := range []string{"../escape", "x.y"} {
		if err := s.Append(id, RunEvent{}); err == nil || err.Error() != fmt.Sprintf("invalid run ID %q", id) {
			t.Fatalf("%q: %v", id, err)
		}
		if err := s.Finish(id, "", "", nil); err == nil {
			t.Fatalf("%q accepted", id)
		}
	}
	var names []string
	entries, _ := os.ReadDir(root)
	for _, e := range entries {
		names = append(names, e.Name())
	}
	if !reflect.DeepEqual(names, []string{"e.json", "e.lock"}) {
		t.Fatalf("folder: %v", names)
	}
	if outside, _ := os.ReadDir(parent); len(outside) != 1 {
		t.Fatalf("outside: %v", outside)
	}
	if ids, _ := s.List(); !reflect.DeepEqual(ids, []string{"e"}) {
		t.Fatalf("list: %v", ids)
	}
}
