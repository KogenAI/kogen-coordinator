package project

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
	"time"

	"github.com/KogenAI/kogen-coordinator/durable"
)

// Baseline is the acceptance baseline (VER-1, AUT-2) in card order: the Intent's `intent.md` and
// `acceptance.feature`, its acceptance list, the rest of its files, the project configuration, the
// team model lineup `.kogen/models.yaml` right after it, and the files `protect` matches, each once.
// The team lineup is opt-in: it is left out only when the project has no such file (Lstat reports
// that it does not exist) and no `protect` pattern lists it. The host-local lineup and checks files
// are never added.
func Baseline(root, slug string, cfg *Config) ([]string, error) {
	var intentFiles []string
	dir := filepath.Join(root, IntentDir(slug))
	walkErr := filepath.WalkDir(dir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			if path == dir && errors.Is(err, fs.ErrNotExist) {
				return nil // no Intent folder: the Intent contributes no files
			}
			return fmt.Errorf("walk %s: %w", path, err)
		}
		if !d.IsDir() && isRegular(path) {
			if rel, err := filepath.Rel(root, path); err == nil {
				intentFiles = append(intentFiles, filepath.ToSlash(rel))
			}
		}
		return nil
	})
	if walkErr != nil {
		return nil, walkErr
	}
	md, feature := IntentMDPath(slug), FeaturePath(slug)
	slices.SortFunc(intentFiles, func(a, b string) int {
		rank := func(p string) int {
			switch p {
			case md:
				return 0
			case feature:
				return 1
			}
			return 2
		}
		if ra, rb := rank(a), rank(b); ra != rb {
			return ra - rb
		}
		return strings.Compare(a, b)
	})

	var listed []string
	if IntentExists(root, slug) {
		if intent, err := LoadIntent(root, slug); err == nil {
			listed = intent.Acceptance
		}
	}
	var all []string
	for _, p := range []string{md, feature} {
		if slices.Contains(intentFiles, p) {
			all = append(all, p)
		}
	}
	all = append(all, listed...)
	all = append(all, intentFiles...)
	all = append(all, ConfigPath)
	protected, err := Protected(root, cfg)
	if err != nil {
		return nil, err
	}
	all = uniqStrings(append(all, protected...))
	if _, err := os.Lstat(filepath.Join(root, ModelsPath)); err != nil && errors.Is(err, fs.ErrNotExist) && !slices.Contains(protected, ModelsPath) {
		return all, nil
	}
	all = slices.DeleteFunc(all, func(p string) bool { return p == ModelsPath })
	return slices.Insert(all, slices.Index(all, ConfigPath)+1, ModelsPath), nil
}

// Protected lists the files matching `protect` (paths, folders or globs) among the tracked and the
// not-ignored untracked files, sorted and without duplicates.
func Protected(root string, cfg *Config) ([]string, error) {
	cfg.ProtectDiagnostics = nil
	if len(cfg.Protect) == 0 {
		return nil, nil
	}
	out, err := gitOK(root, "ls-files", "-z", "--cached", "--others", "--exclude-standard")
	if err != nil {
		return nil, fmt.Errorf("git ls-files failed: %w", err)
	}
	var files []string
	for _, f := range strings.Split(out, "\x00") {
		if f != "" {
			files = append(files, f)
		}
	}
	var matched []string
	for _, entry := range cfg.Protect {
		pat := strings.TrimRight(entry, "/")
		re := globRegexp(pat)
		exists, literal := false, false
		for _, f := range files {
			if re.MatchString(f) || strings.HasPrefix(f, pat+"/") {
				matched = append(matched, f)
				if info, err := os.Stat(filepath.Join(root, f)); err == nil && !info.IsDir() {
					exists = true
					if f == entry && !strings.ContainsAny(entry, "*?") {
						literal = true
					}
				}
			}
		}
		var categories []string
		if !literal && strings.Contains(entry, "[") {
			categories = append(categories, "character classes")
		}
		if !literal && strings.Contains(entry, "{") {
			categories = append(categories, "brace alternatives")
		}
		if strings.HasPrefix(entry, "!") {
			categories = append(categories, "leading negation")
		}
		if strings.Contains(entry, `\`) {
			categories = append(categories, "backslash escapes")
		}
		if len(categories) > 0 {
			cfg.ProtectDiagnostics = append(cfg.ProtectDiagnostics, ProtectDiagnostic{entry, "lint", fmt.Sprintf("%s: unsupported %s; supported forms are **/, **, * and ?", entry, strings.Join(categories, ", "))})
		}
		if !exists {
			cfg.ProtectDiagnostics = append(cfg.ProtectDiagnostics, ProtectDiagnostic{entry, "warning", fmt.Sprintf("%s matches no file", entry)})
		}
	}
	matched = uniqStrings(matched)
	slices.Sort(matched)
	return matched, nil
}

// globRegexp turns a protect pattern into an anchored regexp: `**/` any folders, `**` anything,
// `*` anything but a slash, `?` one character but a slash.
func globRegexp(pat string) *regexp.Regexp {
	var b strings.Builder
	b.WriteString("^")
	lit := 0
	flush := func(end int) {
		if end > lit {
			b.WriteString(regexp.QuoteMeta(pat[lit:end]))
		}
	}
	for i := 0; i < len(pat); {
		switch {
		case strings.HasPrefix(pat[i:], "**/"):
			flush(i)
			b.WriteString("(?:.*/)?")
			i += 3
			lit = i
		case strings.HasPrefix(pat[i:], "**"):
			flush(i)
			b.WriteString(".*")
			i += 2
			lit = i
		case pat[i] == '*':
			flush(i)
			b.WriteString("[^/]*")
			i++
			lit = i
		case pat[i] == '?':
			flush(i)
			b.WriteString("[^/]")
			i++
			lit = i
		default:
			i++
		}
	}
	flush(len(pat))
	b.WriteString("$")
	return regexp.MustCompile(b.String())
}

// Hash is the SHA-256 over `<path>\0<sha256 of the file's bytes>\n` for each baseline file in
// path order (`missing` for absent files, `unreadable` for other read errors), as lowercase hex.
func Hash(root string, paths []string) string {
	hash, _ := HashWithUnreadable(root, paths)
	return hash
}

// HashWithUnreadable returns the approval hash and the sorted paths with non-absence read errors.
// Duplicate paths contribute and appear once per occurrence.
func HashWithUnreadable(root string, paths []string) (string, []string) {
	var unreadable []string
	sorted := slices.Clone(paths)
	slices.Sort(sorted)
	var buf bytes.Buffer
	for _, p := range sorted {
		digest := "missing"
		if sum, err := fileDigest(filepath.Join(root, p)); err == nil {
			digest = hex.EncodeToString(sum[:])
		} else if !errors.Is(err, fs.ErrNotExist) {
			digest = "unreadable"
			unreadable = append(unreadable, p)
		}
		buf.WriteString(p + "\x00" + digest + "\n")
	}
	sum := sha256.Sum256(buf.Bytes())
	return hex.EncodeToString(sum[:]), unreadable
}

// fileDigest streams the file at path through SHA-256 in 32 KiB chunks.
func fileDigest(path string) ([sha256.Size]byte, error) {
	var sum [sha256.Size]byte
	f, err := os.Open(path)
	if err != nil {
		return sum, err
	}
	defer f.Close()
	h := sha256.New()
	if _, err := io.CopyBuffer(h, f, make([]byte, 32*1024)); err != nil {
		return sum, err
	}
	h.Sum(sum[:0])
	return sum, nil
}

// Approval is `.kogen/local/approvals/<slug>.json` (AUT-2).
type Approval struct {
	Slug             string         `json:"slug"`
	SHA256           string         `json:"sha256"`
	Base             string         `json:"base,omitempty"`
	Approver         string         `json:"approver"`
	ApprovedAt       string         `json:"approved_at"`
	SourceProvenance map[string]any `json:"source_provenance"`
}

// ApprovalPath is the approval file of an Intent (an absolute path under root).
func ApprovalPath(root, slug string) string {
	return filepath.Join(root, ".kogen/local/approvals/"+slug+".json")
}

// ReadApproval reads the approval of an Intent: nil without an error when there is none, an error
// when the file cannot be read or is not an approval.
func ReadApproval(root, slug string) (*Approval, error) {
	b, err := os.ReadFile(ApprovalPath(root, slug))
	if errors.Is(err, fs.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var a Approval
	if err := json.Unmarshal(b, &a); err != nil {
		return nil, fmt.Errorf("approval %s: %w", slug, err)
	}
	return &a, nil
}

// EncodeApproval is the approval file's bytes: the JSON object and a newline.
func EncodeApproval(a Approval) ([]byte, error) {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(a); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil // Encode already ends with a newline
}

// WriteApproval writes the approval file, creating its folder. The bytes go to a unique temp file
// in that folder, which is flushed once and renamed over the approval, so a reader sees the old
// approval or the complete new one; a failure removes the temp file and keeps the old approval.
func WriteApproval(root string, a Approval) error {
	b, err := EncodeApproval(a)
	if err != nil {
		return err
	}
	path := ApprovalPath(root, a.Slug)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	var suffix [8]byte
	if _, err := rand.Read(suffix[:]); err != nil {
		return err
	}
	tmp := path + ".tmp-" + hex.EncodeToString(suffix[:])
	f, err := os.OpenFile(tmp, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
	if err != nil {
		return err
	}
	if _, err := f.Write(b); err != nil {
		f.Close()
		os.Remove(tmp)
		return err
	}
	if err := durable.Sync(f); err != nil {
		f.Close()
		os.Remove(tmp)
		return err
	}
	if err := f.Close(); err != nil {
		os.Remove(tmp)
		return err
	}
	if err := os.Rename(tmp, path); err != nil {
		os.Remove(tmp)
		return err
	}
	return nil
}

// CheckResult is what the check baseline decided for one check: the command as configured and the
// status and output the runner returned.
type CheckResult struct {
	Name    string `json:"name"`
	Command string `json:"command"`
	Status  int    `json:"status"`
	Output  string `json:"output"`
}

// CheckTiming is the start, end and wall time of one check of the check baseline.
type CheckTiming struct {
	Name      string    `json:"name"`
	StartedAt time.Time `json:"started_at"`
	EndedAt   time.Time `json:"ended_at"`
	WallMS    int64     `json:"wall_ms"`
}

// CheckBaseline is the record of one check baseline pass: the decided results, its own start and
// end instants and wall time, and the timing of each completed check, in the same order.
type CheckBaseline struct {
	Checks    []CheckResult `json:"checks"`
	StartedAt time.Time     `json:"started_at"`
	EndedAt   time.Time     `json:"ended_at"`
	WallMS    int64         `json:"wall_ms"`
	Timings   []CheckTiming `json:"timings"`
}

// CheckRunner runs one check and returns its exit status and output. An error is a failure to run
// it, not a nonzero status.
type CheckRunner func(ctx context.Context, c Check) (status int, output string, err error)

// BaselineStop is the error of a check baseline whose context ended while a check ran. It names
// that check and unwraps to the context error.
type BaselineStop struct {
	Check     string
	Command   string
	StartedAt time.Time
	StoppedAt time.Time
	WallMS    int64
	Err       error
}

func (s *BaselineStop) Error() string {
	return fmt.Sprintf("stopped during the check baseline: check %s (%s) ran %d ms: %v", s.Check, s.Command, s.WallMS, s.Err)
}

func (s *BaselineStop) Unwrap() error { return s.Err }

// RunCheckBaseline runs every check once, in order, through run and records the baseline's and
// each check's wall time. A nonzero status is recorded and the next check runs. When ctx has ended
// once a check's run returns, it stops with a *BaselineStop and the checks completed before that
// one; a runner error while ctx is live is returned unchanged with the same partial record. It adds
// no timeout of its own: ctx is the only bound.
func RunCheckBaseline(ctx context.Context, checks []Check, run CheckRunner) (CheckBaseline, error) {
	start := time.Now()
	rec := CheckBaseline{Checks: []CheckResult{}, Timings: []CheckTiming{}}
	finish := func(end time.Time) CheckBaseline {
		rec.StartedAt = start.UTC()
		rec.EndedAt = end.UTC()
		rec.WallMS = end.Sub(start).Milliseconds()
		return rec
	}
	for _, c := range checks {
		cStart := time.Now()
		status, output, err := run(ctx, c)
		cEnd := time.Now()
		wall := cEnd.Sub(cStart).Milliseconds()
		if ctxErr := ctx.Err(); ctxErr != nil {
			return finish(cEnd), &BaselineStop{Check: c.Name, Command: c.Run, StartedAt: cStart.UTC(), StoppedAt: cEnd.UTC(), WallMS: wall, Err: ctxErr}
		}
		if err != nil {
			return finish(cEnd), err
		}
		rec.Checks = append(rec.Checks, CheckResult{Name: c.Name, Command: c.Run, Status: status, Output: output})
		rec.Timings = append(rec.Timings, CheckTiming{Name: c.Name, StartedAt: cStart.UTC(), EndedAt: cEnd.UTC(), WallMS: wall})
	}
	return finish(time.Now()), nil
}
