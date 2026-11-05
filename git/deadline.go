package git

import (
	"context"
	"errors"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/KogenAI/kogen-loop/sys"
)

// CommandTimeout (10 minutes) is the wall time bound of every Git command the package runs through its
// runner (Run, RunEnv, OK, OKEnv and every internal call), and of each read from the
// `cat-file --batch` blob stream. A command past it is killed with its process group and
// the caller receives a *TimeoutError.
const CommandTimeout time.Duration = 10 * time.Minute

// CommitTimeout (1 hour) is the larger wall time bound of the commands that run the user's commit
// hooks: the `git commit` of Commit and CommitPaths, and the
// `git hook run --ignore-missing commit-msg` of CheckCommitMsg.
const CommitTimeout time.Duration = time.Hour

var (
	timeoutsMu   sync.Mutex
	commandBound = CommandTimeout
	commitBound  = CommitTimeout
)

// killGroup kills every process of the group a command leads.
func killGroup(pid int) { syscall.Kill(-pid, syscall.SIGKILL) }

// OverrideTimeouts is the test seam: until the returned restore is called, the effective
// bounds of every Repo in the process are command and commit instead of CommandTimeout and
// CommitTimeout. Callers pass positive durations. restore puts back the values that were in
// effect before the call.
func OverrideTimeouts(command, commit time.Duration) (restore func()) {
	timeoutsMu.Lock()
	prevCommand, prevCommit := commandBound, commitBound
	commandBound, commitBound = command, commit
	timeoutsMu.Unlock()
	return func() {
		timeoutsMu.Lock()
		commandBound, commitBound = prevCommand, prevCommit
		timeoutsMu.Unlock()
	}
}

func commandTimeout() time.Duration {
	timeoutsMu.Lock()
	defer timeoutsMu.Unlock()
	return commandBound
}

func commitTimeout() time.Duration {
	timeoutsMu.Lock()
	defer timeoutsMu.Unlock()
	return commitBound
}

// TimeoutError is a Git command that passed its bound and was stopped. Args are the first
// at most four Git arguments of the caller; the text carries no environment value, stdout
// or stderr.
type TimeoutError struct {
	Args    []string
	Timeout time.Duration
}

func (e *TimeoutError) Error() string {
	return "git " + strings.Join(e.Args, " ") + " timed out after " + e.Timeout.String()
}

// timeoutError is the *TimeoutError for a command with args and its effective bound.
func timeoutError(args []string, bound time.Duration) *TimeoutError {
	return &TimeoutError{Args: append([]string(nil), args[:min(4, len(args))]...), Timeout: bound}
}

// teardownGrace is how long past the bound the wait for a timed-out hook command's process
// group to disappear may last. kogen-loop waits for the group's absence without a limit, and a
// member that nobody reaps (an orphan under an init that does not wait for its children) would
// hold the caller forever; the group has been signalled by then.
const teardownGrace = 1500 * time.Millisecond

// runHooked runs a command that runs the user's commit hooks under the commit bound. A
// command stopped by its bound has TimedOut set, also when the wait for its group to
// disappear outlasted the grace.
func runHooked(s *sys.Session, command, dir string, opts sys.Options, bound time.Duration) (sys.Result, error) {
	ctx, cancel := context.WithTimeout(context.Background(), bound+teardownGrace)
	defer cancel()
	opts.Timeout, opts.Context = bound, ctx
	res, err := s.Run(command, dir, opts)
	if errors.Is(err, context.DeadlineExceeded) {
		return sys.Result{Status: -1, TimedOut: true}, nil
	}
	return res, err
}
