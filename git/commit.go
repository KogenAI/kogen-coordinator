package git

import (
	"errors"
	"fmt"
	"os"
	"regexp"
	"strings"

	"github.com/KogenAI/kogen-loop/sys"
)

// CommitMessage is the Build's commit message: the Intent title, an empty line, and the
// Kogen-Intent trailer as the only trailer (GIT-5).
func CommitMessage(title, slug string) string { return title + "\n\nKogen-Intent: " + slug + "\n" }

// CommitSpec describes the one commit of a Build.
type CommitSpec struct {
	Tree        string // the reviewed candidate snapshot
	Start       string // HEAD recorded when the Build started
	Title, Slug string // the Intent's title and slug
	MessageFile string // where the message is written for `git commit -F` (the run's commit-message.txt)
}

// Commit stages Tree as the user's index, runs a plain `git commit -q -F <message>` and
// checks the result in the repository (GIT-3..6). Kogen adds no signing or hook options
// of its own: the user's identity, hooks and signing apply.
//
// It returns the new commit id. Failures leave the user's index as the commit left it;
// the caller restores its custody copy:
//
//	environment/commit_failed       git commit exited non-zero (exit 3, Git's output as lines)
//	candidate/hook_changed_commit   the commit's parent, tree, signature or Kogen-Intent
//	                                trailer is not as reviewed (exit 1); the commit has been undone
//	*sys.Interrupted                the caller interrupted; Commit waited for git commit to
//	                                finish and undid the commit if it landed (CLI-7)
func (r *Repo) Commit(s *sys.Session, spec CommitSpec) (string, error) {
	if r.ReadOnly {
		return "", errors.New("git: read-only repository cannot commit")
	}
	if err := errors.Join(checkRev(spec.Tree), checkRev(spec.Start)); err != nil {
		return "", err
	}
	if err := r.ReadTree(spec.Tree); err != nil {
		return "", err
	}
	if err := os.WriteFile(spec.MessageFile, []byte(CommitMessage(spec.Title, spec.Slug)), 0o644); err != nil {
		return "", err
	}
	bound := commitTimeout()
	res, err := runHooked(s, UnsetPrefix()+"git commit -q -F "+shellQuote(spec.MessageFile), r.Dir,
		sys.Options{FinishOnInterrupt: true, KillGroupOnExit: true}, bound)
	if err != nil {
		r.undoIfLanded(spec.Start)
		return "", err
	}
	if res.TimedOut {
		r.undoIfLanded(spec.Start)
		return "", timeoutError([]string{"commit", "-q", "-F", spec.MessageFile}, bound)
	}
	if res.Status != 0 {
		return "", &sys.Error{
			Class: "environment", Reason: "commit_failed", Exit: 3,
			Detail: fmt.Sprintf("git commit failed (status %d); the verified changes are left uncommitted", res.Status),
			Lines:  strings.Split(strings.TrimSpace(res.Output), "\n"),
		}
	}
	return r.landed(s, spec)
}

var gpgsigRE = regexp.MustCompile(`(?m)^gpgsig(-sha256)? `)

// landed reads the commit from the repository. A commit whose parent is not the start
// HEAD, whose tree is not the reviewed one, or that is unsigned although the user's
// configuration signs, is undone (GIT-6). So is a commit whose message does not carry
// exactly one Kogen-Intent trailer with the Build's slug.
func (r *Repo) landed(s *sys.Session, spec CommitSpec) (string, error) {
	head := r.Head()
	if head == "" {
		return "", errors.New("git: HEAD is missing after the commit")
	}
	tree, err := r.Resolve(head + "^{tree}")
	if err != nil {
		return "", err
	}
	parent, err := r.Resolve(head + "^")
	if err != nil {
		return "", err
	}
	cfg, err := r.exec(r.Dir, nil, nil, nil, "config", "--bool", "--get", "commit.gpgsign")
	if err != nil {
		return "", err
	}
	signs := cfg.Status == 0 && cfg.Stdout == "true\n"
	raw, err := r.ok(nil, "cat-file", "commit", head)
	if err != nil {
		return "", err
	}
	if tree != spec.Tree || parent != spec.Start || (signs && !gpgsigRE.MatchString(raw)) {
		if err := r.undo(spec.Start, head); err != nil {
			return "", err
		}
		paths, err := r.Changed(spec.Tree, tree)
		if err != nil {
			return "", err
		}
		if len(paths) == 0 {
			paths = []string{"the commit itself"}
		}
		return "", &sys.Error{
			Class: "candidate", Reason: "hook_changed_commit", Exit: 1,
			Detail: "a commit hook changed " + strings.Join(paths, ", ") + "; the commit was undone and the changes are left in place",
		}
	}
	trailers, err := r.intentTrailers(head)
	if err != nil {
		return "", err
	}
	if detail := trailerProblem(trailers, spec.Slug); detail != "" {
		if err := r.undo(spec.Start, head); err != nil {
			return "", err
		}
		return "", &sys.Error{
			Class: "candidate", Reason: "hook_changed_commit", Exit: 1,
			Detail: "a commit hook changed the commit message: it no longer carries the Intent trailer Kogen-Intent: " +
				spec.Slug + " (" + detail + "); the commit was undone and the changes are left in place",
		}
	}
	// The commit is still ours to undo until every query has completed.
	if err := s.Err(); err != nil {
		if uerr := r.undo(spec.Start, head); uerr != nil {
			return "", errors.Join(err, uerr)
		}
		return "", err
	}
	return head, nil
}

// intentTrailers are the values of the Kogen-Intent trailers Git's trailer parser reports
// for the commit (its final trailer block, key matched case-insensitively), in message order.
// Keys are printed too, so that a trailer with an empty value is still one trailer.
func (r *Repo) intentTrailers(head string) ([]string, error) {
	out, err := r.ok(nil, "log", "-1", "--no-show-signature",
		"--format=%(trailers:key=Kogen-Intent,separator=%x00,key_value_separator=%x01)", head)
	if err != nil {
		return nil, err
	}
	out = strings.TrimSuffix(out, "\n")
	if out == "" {
		return nil, nil
	}
	var values []string
	for _, t := range strings.Split(out, "\x00") {
		_, value, _ := strings.Cut(t, "\x01")
		values = append(values, value)
	}
	return values, nil
}

// trailerProblem is why the trailers are not exactly one Kogen-Intent: slug, or "" when they are.
func trailerProblem(values []string, slug string) string {
	switch {
	case len(values) == 0:
		return "no Kogen-Intent trailer found"
	case len(values) > 1:
		return "duplicate Kogen-Intent trailers: " + strings.Join(values, ", ")
	case values[0] != slug:
		return "found Kogen-Intent: " + values[0]
	}
	return ""
}

// undo moves HEAD back from Kogen's own just-made commit with a compare-and-swap; the
// commit stays in the reflog (GIT-6).
func (r *Repo) undo(start, made string) error {
	if err := errors.Join(checkRev(start), checkRev(made)); err != nil {
		return err
	}
	_, err := r.ok(nil, "update-ref", "-m", "kogen: undo the unverified commit", "HEAD", start, made)
	return err
}

// undoIfLanded handles an interrupt during `git commit`, which may still have let the
// commit land (CLI-7).
func (r *Repo) undoIfLanded(start string) {
	if head := r.Head(); head != "" && head != start {
		r.undo(start, head)
	}
}

// CheckCommitMsg runs the user's commit-msg hook (if any) on the message the Build would
// commit, before any model time is spent (AUT-5). A rejecting hook is
// environment/commit_rejected (exit 3) with the last 20 lines of its output.
func (r *Repo) CheckCommitMsg(s *sys.Session, title, slug string) error {
	msg := sys.TmpPath("kogen-commit-msg")
	if err := os.WriteFile(msg, []byte(CommitMessage(title, slug)), 0o600); err != nil {
		return err
	}
	defer os.Remove(msg)
	bound := commitTimeout()
	res, err := runHooked(s, UnsetPrefix()+"git hook run --ignore-missing commit-msg -- "+shellQuote(msg), r.Dir,
		sys.Options{KillGroupOnExit: true}, bound)
	if err != nil {
		return err
	}
	if res.TimedOut {
		return timeoutError([]string{"hook", "run", "--ignore-missing", "commit-msg"}, bound)
	}
	if res.Status != 0 {
		return &sys.Error{
			Class: "environment", Reason: "commit_rejected", Exit: 3,
			Detail: fmt.Sprintf("the commit-msg hook rejects this Intent's commit message (status=%d); change the Intent's title or the hook, then approve again", res.Status),
			Lines:  strings.Split(tailLines(res.Output, 20), "\n"),
		}
	}
	return nil
}

// tailLines is the last n lines of command output.
func tailLines(output string, n int) string {
	lines := strings.Split(strings.TrimRight(output, " \t\r\n\v\f"), "\n")
	if len(lines) > n {
		lines = lines[len(lines)-n:]
	}
	return strings.Join(lines, "\n")
}

// CommitPaths is a plain `git commit` of exactly these paths with the subject as message;
// other staged or unstaged changes stay out (SET-3). On failure the paths are unstaged
// again (`rm --cached` when the repository had no commit) and the error is
// environment/commit_failed (exit 3). It returns the first 8 characters of the new HEAD.
func (r *Repo) CommitPaths(s *sys.Session, subject string, paths []string, hadHead bool) (string, error) {
	if r.ReadOnly {
		return "", errors.New("git: read-only repository cannot commit")
	}
	if _, err := r.ok(nil, append([]string{"add", "--"}, paths...)...); err != nil {
		return "", err
	}
	msg := sys.TmpPath("kogen-init-msg")
	if err := os.WriteFile(msg, []byte(subject+"\n"), 0o600); err != nil {
		return "", err
	}
	defer os.Remove(msg)
	quoted := make([]string, len(paths))
	for i, p := range paths {
		quoted[i] = shellQuote(p)
	}
	bound := commitTimeout()
	res, err := runHooked(s, UnsetPrefix()+"git commit -q -F "+shellQuote(msg)+" -- "+strings.Join(quoted, " "), r.Dir,
		sys.Options{KillGroupOnExit: true}, bound)
	if err != nil {
		return "", err
	}
	if res.TimedOut || res.Status != 0 {
		unstage := []string{"rm", "-q", "--cached", "--"}
		if hadHead {
			unstage = []string{"restore", "--staged", "--"}
		}
		r.exec(r.Dir, nil, nil, nil, append(unstage, paths...)...)
		if res.TimedOut {
			return "", timeoutError([]string{"commit", "-q", "-F", msg}, bound)
		}
		return "", &sys.Error{
			Class: "environment", Reason: "commit_failed", Exit: 3,
			Detail: fmt.Sprintf("git commit failed (status %d); the configuration is left uncommitted", res.Status),
			Lines:  strings.Split(strings.TrimSpace(res.Output), "\n"),
		}
	}
	head, err := r.okTrim(nil, "rev-parse", "HEAD")
	if err != nil {
		return "", err
	}
	return head[:min(8, len(head))], nil
}
