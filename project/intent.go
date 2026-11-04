package project

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
	"unicode"
	"unicode/utf8"

	repogit "github.com/KogenAI/kogen-coordinator/git"
	"github.com/KogenAI/kogen-loop/sys"
)

// Intent is `.kogen/intents/<slug>/intent.md` as read: `intent.md`, `acceptance.feature` and an
// optional `model.qnt`, plus the step files its `Acceptance:` list names (chapter 02). Fields
// whose line or section is missing are empty.
type Intent struct {
	Root, Slug, Text string
	SlugLine         string // the Slug: line's text, as written
	Title            string
	ModelLine        string     // the Model: line's text
	Model            *ModelSpec // nil when the Model: line is missing or unreadable
	Acceptance       []string   // the Acceptance: list
	Decisions        []string   // ## Decisions bullet lines
	Feasibility      []string   // ## Feasibility bullet lines
	Tests            []string   // ## Tests bullet lines
	Overlay          map[string][]byte
}

// ModelSpec is the parsed Model: line: either `not applicable — <reason>` (None) or a Quint model
// with the invariants to check and the sampling numbers (digits, as written).
type ModelSpec struct {
	None                 bool
	Path                 string
	Invariants           []string
	Seed, Samples, Steps string
}

// Forbidden scenario tags (SHP-5).
var forbiddenTags = []string{"@skip", "@wip", "@pending", "@manual", "@ignore"}

// IntentDir is the Intent's folder, relative to the repository root.
func IntentDir(slug string) string { return ".kogen/intents/" + slug }

// FeaturePath is the Intent's `acceptance.feature`, relative to the repository root.
func FeaturePath(slug string) string { return IntentDir(slug) + "/acceptance.feature" }

// IntentMDPath is the Intent's `intent.md`, relative to the repository root.
func IntentMDPath(slug string) string { return IntentDir(slug) + "/intent.md" }

// ModelPath is the Intent's `model.qnt`, relative to the repository root.
func ModelPath(slug string) string { return IntentDir(slug) + "/model.qnt" }

// IntentExists reports whether the Intent has an `intent.md`.
func IntentExists(root, slug string) bool {
	_, err := os.Stat(filepath.Join(root, IntentMDPath(slug)))
	return err == nil
}

// RequireIntentDir fails with intent/not_found when the Intent's folder does not exist.
func RequireIntentDir(root, slug string) error {
	if fi, err := os.Stat(filepath.Join(root, IntentDir(slug))); err != nil || !fi.IsDir() {
		return sys.Fail("intent", "not_found", "Intent does not exist", 2)
	}
	return nil
}

// fetch is a file's content from the overlay of files not yet written, or from the disk.
func fetch(root string, overlay map[string][]byte, rel string) ([]byte, error) {
	if b, ok := overlay[rel]; ok {
		return b, nil
	}
	return os.ReadFile(filepath.Join(root, rel))
}

// Fetch is a project file's content from overlay (files not yet written) or the disk.
func Fetch(root string, overlay map[string][]byte, rel string) ([]byte, error) {
	return fetch(root, overlay, rel)
}

func parseError(problems ...string) *sys.Error {
	e := sys.Fail("intent", "parse", "the Intent cannot be read", 1)
	e.Lines = problems
	return e
}

// LoadIntent reads the Intent from disk.
func LoadIntent(root, slug string) (*Intent, error) { return ReadIntent(root, slug, nil) }

// ReadIntent reads intent.md from overlay or disk. A missing intent.md is an intent/parse error.
func ReadIntent(root, slug string, overlay map[string][]byte) (*Intent, error) {
	b, err := fetch(root, overlay, IntentMDPath(slug))
	if err != nil {
		return nil, parseError("intent.md does not exist")
	}
	return parseIntent(root, slug, string(b), overlay), nil
}

func parseIntent(root, slug, text string, overlay map[string][]byte) *Intent {
	lines := strings.Split(text, "\n")
	i := &Intent{Root: root, Slug: slug, Text: text, Overlay: overlay}
	if v, ok := firstWithPrefix(lines, "# "); ok {
		i.Title = strings.TrimSpace(v)
	}
	if v, ok := firstWithPrefix(lines, "Model:"); ok {
		i.ModelLine = strings.TrimSpace(v)
		i.Model = ParseModelSpec(i.ModelLine)
	}
	i.SlugLine, _ = firstWithPrefix(lines, "Slug:")
	i.Acceptance = listAfter(lines, "Acceptance:")
	i.Decisions = sectionBullets(lines, "## Decisions")
	i.Feasibility = sectionBullets(lines, "## Feasibility")
	i.Tests = sectionBullets(lines, "## Tests")
	return i
}

func firstWithPrefix(lines []string, prefix string) (string, bool) {
	for _, l := range lines {
		if rest, ok := strings.CutPrefix(l, prefix); ok {
			return rest, true
		}
	}
	return "", false
}

func afterHeader(lines []string, header string) ([]string, bool) {
	for i, l := range lines {
		if strings.TrimSpace(l) == header {
			return lines[i+1:], true
		}
	}
	return nil, false
}

// logicalBullets reads column-zero markers and their adjacent continuation lines.
func logicalBullets(lines []string, acceptance bool) []string {
	var out []string
	active := false
	for _, l := range lines {
		if strings.HasPrefix(l, "#") {
			break
		}
		if strings.TrimSpace(l) == "" {
			if acceptance && len(out) > 0 {
				break
			}
			active = false
			continue
		}
		marker := strings.HasPrefix(l, "- ") || strings.HasPrefix(l, "* ") || strings.HasPrefix(l, "+ ")
		if marker {
			item := l
			if acceptance && strings.HasPrefix(l, "- ") {
				item = strings.TrimSpace(l[2:])
			}
			out = append(out, item)
			active = true
		} else if active {
			out[len(out)-1] = strings.TrimRightFunc(out[len(out)-1], unicode.IsSpace) + " " + strings.TrimSpace(l)
		} else if acceptance {
			break
		}
	}
	return out
}

func listAfter(lines []string, header string) []string {
	rest, ok := afterHeader(lines, header)
	if !ok {
		return nil
	}
	return logicalBullets(rest, true)
}

func sectionBullets(lines []string, header string) []string {
	rest, ok := afterHeader(lines, header)
	if !ok {
		return nil
	}
	return logicalBullets(rest, false)
}

func unsupportedMarker(s string) bool {
	return strings.HasPrefix(s, "* ") || strings.HasPrefix(s, "+ ")
}

var modelLineRe = regexp.MustCompile(`^(\S+\.qnt) invariants=([A-Za-z_][A-Za-z0-9_]*(?:,[A-Za-z_][A-Za-z0-9_]*)*) seed=(\d+) samples=(\d+) steps=(\d+)$`)

// ParseModelSpec parses a Model: line; nil when it cannot be read.
func ParseModelSpec(line string) *ModelSpec {
	if notApplicable(line) {
		return &ModelSpec{None: true}
	}
	m := modelLineRe.FindStringSubmatch(line)
	if m == nil {
		return nil
	}
	return &ModelSpec{Path: m[1], Invariants: strings.Split(m[2], ","), Seed: m[3], Samples: m[4], Steps: m[5]}
}

// notApplicable matches `not applicable — <reason>` (an em dash or a hyphen, then a reason).
func notApplicable(line string) bool {
	rest, ok := strings.CutPrefix(line, "not applicable")
	if !ok {
		return false
	}
	rest = trimLeftSpace(rest)
	if r, ok := strings.CutPrefix(rest, "—"); ok {
		rest = r
	} else if r, ok := strings.CutPrefix(rest, "-"); ok {
		rest = r
	} else {
		return false
	}
	rest = trimLeftSpace(rest)
	return rest != ""
}

// StepFiles are the step files and other acceptance files after the feature.
func (i *Intent) StepFiles() []string {
	feature := FeaturePath(i.Slug)
	return slices.DeleteFunc(slices.Clone(i.Acceptance), func(p string) bool { return p == feature })
}

// CheckIntent checks the SHP-5 rules on the Intent with overlay (files not yet written) laid over
// the disk. It returns the Intent and its scenarios, or an *sys.Error `intent/parse: the Intent
// cannot be read` / `intent/lint: the Intent needs changes` (exit 1) with one line per problem.
func CheckIntent(root, slug string, overlay map[string][]byte) (*Intent, []Scenario, error) {
	userName := gitUserName(root)
	if _, err := fetch(root, overlay, IntentMDPath(slug)); err != nil {
		return nil, nil, parseError("intent.md does not exist")
	}
	intent, err := ReadIntent(root, slug, overlay)
	if err != nil {
		return nil, nil, err
	}
	b, err := fetch(root, overlay, FeaturePath(slug))
	if err != nil {
		return nil, nil, parseError("acceptance.feature does not exist")
	}
	scenarios, err := ParseGherkin(string(b))
	if err != nil {
		ge := err.(*GherkinError)
		lines := append([]string{fmt.Sprintf("acceptance.feature line %d: %s", ge.Line, ge.Message)}, lintIntent(intent, nil, false, userName)...)
		return nil, nil, parseError(lines...)
	}
	if problems := lintIntent(intent, scenarios, true, userName); len(problems) > 0 {
		e := sys.Fail("intent", "lint", "the Intent needs changes", 1)
		e.Lines = problems
		return nil, nil, e
	}
	return intent, scenarios, nil
}

var (
	sourceRe   = regexp.MustCompile(`\(source: (request|answer \d+)\)\.?\s*$`)
	testLineRe = regexp.MustCompile(`^- (none: \S.*|.+: .+ \((unit|integration|scenario|regression|existing)\)\.?)$`)
)

// projectGit is the repository layer's runner for root with the process environment: the git binary
// is the one first on PATH and the location variables are removed.
func projectGit(root string) *repogit.Repo { return repogit.New(root, nil) }

// gitOK runs git with args in root through projectGit and returns its stdout.
func gitOK(root string, args ...string) (string, error) { return projectGit(root).OK(args...) }

// gitUserName reads the effective configuration in the target repository, independently of email.
func gitUserName(root string) string {
	out, err := gitOK(root, "config", "--get", "user.name")
	if err != nil {
		return ""
	}
	return strings.TrimSpace(out)
}

var ownerAuthorizationRe = regexp.MustCompile(`(?i)\b(?:(?:the\s+)?(?:owner|user)\s+(?:(?:has|had)\s+)?(?:approves?|approved|authorizes?|authorized)|(?:approved|authorized)\s+by\s+(?:the\s+)?(?:owner|user))\b`)

func titleNamesUser(title, name string) bool {
	if name == "" {
		return false
	}
	re := regexp.MustCompile(`(?i)` + regexp.QuoteMeta(name))
	for _, loc := range re.FindAllStringIndex(title, -1) {
		before, _ := utf8.DecodeLastRuneInString(title[:loc[0]])
		after, _ := utf8.DecodeRuneInString(title[loc[1]:])
		word := func(r rune) bool { return unicode.IsLetter(r) || unicode.IsNumber(r) || r == '_' || unicode.IsMark(r) }
		if !word(before) && !word(after) {
			return true
		}
	}
	return false
}

// CheckTitle returns the title problems using the supplied Git user name, without reading Git configuration.
func CheckTitle(title, userName string) []string {
	var problems []string
	add := func(p string) { problems = append(problems, p) }
	if title == "" {
		add("title: intent.md must start with a # title")
	} else {
		if n := graphemeLen(title); n > 50 {
			add(fmt.Sprintf("title: the title must be at most 50 characters, not %d", n))
		}
		if titleNamesUser(title, userName) {
			add(fmt.Sprintf("title: %q names the Git user %q (git user.name); use an owner-authored title instead", title, userName))
		}
		if ownerAuthorizationRe.MatchString(title) {
			add(fmt.Sprintf("title: %q narrates owner or user approval or authorization in the third person", title))
		}
		if strings.HasSuffix(title, ".") {
			add("title: the title must not end with a period")
		}
	}
	return problems
}

// lintIntent lists every problem. With parsed false the feature did not parse, so the checks that
// need its scenarios are skipped.
func lintIntent(i *Intent, scenarios []Scenario, parsed bool, userName string) []string {
	problems := CheckTitle(i.Title, userName)
	add := func(p ...string) { problems = append(problems, p...) }

	if strings.TrimSpace(i.SlugLine) != i.Slug {
		add("slug: the Slug: line must be " + i.Slug)
	}

	switch {
	case i.Model == nil:
		add("model: the Model: line must be `not applicable — <reason>` or `" + ModelPath(i.Slug) + " invariants=<Name> seed=<n> samples=<n> steps=<n>`")
	case !i.Model.None:
		add(modelProblems(i, i.Model)...)
	}

	switch {
	case len(i.Tests) == 0:
		add("tests: the ## Tests section is missing or empty")
	default:
		for _, l := range i.Tests {
			if unsupportedMarker(l) {
				add("tests: use the required `- ` bullet marker: " + l)
			} else if !testLineRe.MatchString(l) {
				add("tests: " + l + " must be `- <rule>: <test to add or update> (<layer>)` or `- none: <reason>`")
			}
		}
	}

	feature := FeaturePath(i.Slug)
	ordered := len(i.Acceptance) > 0 && i.Acceptance[0] == feature
	if !ordered && (len(i.Acceptance) == 0 || !unsupportedMarker(i.Acceptance[0])) {
		add("acceptance: the Acceptance: list must start with " + feature)
	}
	valid := make([]string, 0, len(i.Acceptance))
	checks := make(map[string][]string)
	rules := make([]string, len(i.Acceptance))
	for n, p := range i.Acceptance {
		if unsupportedMarker(p) {
			continue
		}
		rules[n] = acceptancePathRule(i.Root, p)
		if rules[n] == "" {
			checks[p] = acceptanceIgnorePaths(i.Root, p)
			valid = append(valid, checks[p]...)
		}
	}
	ignored := map[string]bool{}
	if ordered && len(valid) > 0 {
		ignoredPaths, err := projectGit(i.Root).Ignored(valid...)
		if err != nil {
			add("acceptance: Git ignore check could not run")
		}
		for _, p := range ignoredPaths {
			ignored[p] = true
		}
	}
	for n, p := range i.Acceptance {
		if unsupportedMarker(p) {
			add("acceptance: use the required `- ` bullet marker: " + p)
		} else if rules[n] != "" {
			add("acceptance: " + p + " " + rules[n])
		} else if ordered {
			_, inOverlay := i.Overlay[p]
			switch {
			case !inOverlay && !isRegular(filepath.Join(i.Root, p)):
				add("acceptance: " + p + " does not exist")
			case slices.ContainsFunc(checks[p], func(path string) bool { return ignored[path] }):
				add("acceptance: " + p + " is ignored by Git")
			}
		}
	}

	for _, d := range i.Decisions {
		if unsupportedMarker(d) {
			add("decisions: use the required `- ` bullet marker: " + d)
		} else if !sourceRe.MatchString(d) {
			add("decisions: " + d + " must end with `(source: request)` or `(source: answer <n>)`")
		}
	}

	if len(i.Feasibility) == 0 {
		add("feasibility: intent.md needs a ## Feasibility section listing each probe, or - none")
	}

	for _, f := range i.Feasibility {
		if unsupportedMarker(f) {
			add("feasibility: use the required `- ` bullet marker: " + f)
		}
	}

	if parsed && len(scenarios) == 0 {
		add("acceptance: acceptance.feature has no scenario")
	} else if parsed {
		var scen []string
		for _, s := range scenarios {
			for _, t := range s.Tags {
				if slices.Contains(forbiddenTags, t) {
					scen = append(scen, "acceptance: scenario "+s.Name+" is tagged "+t)
				}
			}
			if !slices.ContainsFunc(s.Steps, func(st Step) bool { return st.Keyword == "Then " }) {
				scen = append(scen, "acceptance: scenario "+s.Name+" has no Then step")
			}
		}
		add(uniqStrings(scen)...)
	}

	if p := stagesProblem(i.Text); p != "" {
		add(p)
	}
	return problems
}

func modelProblems(i *Intent, m *ModelSpec) []string {
	expected := ModelPath(i.Slug)
	if m.Path != expected {
		return []string{"model: the model must be " + expected}
	}
	b, err := fetch(i.Root, i.Overlay, m.Path)
	if err != nil {
		return []string{"model: " + m.Path + " does not exist"}
	}
	var out []string
	for _, inv := range m.Invariants {
		if !regexp.MustCompile(`\b(val|def)\s+` + inv + `\b`).Match(b) {
			out = append(out, "model: invariant "+inv+" does not exist in model.qnt")
		}
	}
	return out
}

// Git cannot check a path through a symlink directory. Check the link and its
// resolved target instead, retaining missing suffixes for overlays.
func acceptanceIgnorePaths(root, path string) []string {
	parts := strings.Split(path, "/")
	var checks []string
	for n := 1; n < len(parts); n++ {
		prefix := filepath.Join(parts[:n]...)
		fi, err := os.Lstat(filepath.Join(root, prefix))
		if err != nil || fi.Mode()&os.ModeSymlink == 0 {
			continue
		}
		checks = append(checks, filepath.ToSlash(prefix))
		resolved, err := filepath.EvalSymlinks(filepath.Join(root, prefix))
		canonical, rootErr := filepath.EvalSymlinks(root)
		if err != nil || rootErr != nil {
			return checks
		}
		rel, err := filepath.Rel(canonical, resolved)
		if err != nil {
			return checks
		}
		path = filepath.ToSlash(filepath.Join(append([]string{rel}, parts[n:]...)...))
		return append(checks, acceptanceIgnorePaths(root, path)...)
	}
	return append(checks, path)
}

// acceptancePathRule checks spelling before walking existing components, including links.
func acceptancePathRule(root, path string) string {
	parts := strings.Split(path, "/")
	if filepath.IsAbs(path) || path == "" {
		return "must be a clean relative path"
	}
	for _, part := range parts {
		if part == "" || part == "." || part == ".." {
			return "must be a clean relative path"
		}
	}
	for _, part := range parts {
		if part == ".git" {
			return "must not contain .git"
		}
	}
	canonical, err := filepath.EvalSymlinks(root)
	if err != nil {
		return "resolves outside the repository"
	}
	canonical, err = filepath.Abs(canonical)
	if err != nil {
		return "resolves outside the repository"
	}
	current := canonical
	for links := 0; len(parts) > 0; {
		part := parts[0]
		parts = parts[1:]
		current = filepath.Join(current, part)
		rel, err := filepath.Rel(canonical, current)
		if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
			return "resolves outside the repository"
		}
		fi, err := os.Lstat(current)
		if err != nil {
			continue // Missing components are permitted for overlay entries.
		}
		if fi.Mode()&os.ModeSymlink == 0 {
			continue
		}
		links++
		if links > 255 {
			break
		}
		target, err := os.Readlink(current)
		if err != nil {
			break
		}
		current = filepath.Dir(current)
		if filepath.IsAbs(target) {
			// Strip the canonical root without cleaning the target: link/.. must
			// be resolved in filesystem order, not collapsed lexically.
			prefix := canonical
			if !strings.HasSuffix(prefix, string(filepath.Separator)) {
				prefix += string(filepath.Separator)
			}
			if target == canonical {
				target = ""
			} else if strings.HasPrefix(target, prefix) {
				target = strings.TrimPrefix(target, prefix)
			} else {
				// Find an existing alias of the canonical root, then walk the
				// remaining components normally (they may be overlay-only).
				components := strings.Split(strings.TrimPrefix(target, string(filepath.Separator)), string(filepath.Separator))
				prefix := string(filepath.Separator)
				found := false
				for n, component := range components {
					prefix = filepath.Join(prefix, component)
					resolved, err := filepath.EvalSymlinks(prefix)
					if err != nil {
						break
					}
					if resolved == canonical {
						target = strings.Join(components[n+1:], string(filepath.Separator))
						found = true
						break
					}
				}
				if !found {
					return "resolves outside the repository"
				}
			}
			current = canonical
		}
		parts = append(strings.Split(target, string(filepath.Separator)), parts...)
	}
	return ""
}

func isRegular(path string) bool {
	fi, err := os.Stat(path)
	return err == nil && fi.Mode().IsRegular()
}

func uniqStrings(ss []string) []string {
	seen := map[string]bool{}
	var out []string
	for _, s := range ss {
		if !seen[s] {
			seen[s] = true
			out = append(out, s)
		}
	}
	return out
}

// graphemeLen counts user-perceived characters: a base character with its combining marks, a
// zero-width-joiner emoji sequence or a pair of regional indicators is one.
func graphemeLen(s string) int {
	n, ri := 0, 0 // ri: regional indicators so far in the current run
	var prev rune
	for _, r := range s {
		attach := false
		switch {
		case n == 0:
		case prev == '\r' && r == '\n':
			attach = true
		case unicode.In(r, unicode.Mn, unicode.Me, unicode.Mc),
			r == 0x200C, r == 0x200D, r >= 0x1F3FB && r <= 0x1F3FF, r >= 0xE0020 && r <= 0xE007F:
			attach = true
		case prev == 0x200D && isPictographic(r):
			attach = true
		case isRegionalIndicator(r) && ri%2 == 1:
			attach = true
		}
		if isRegionalIndicator(r) {
			ri++
		} else {
			ri = 0
		}
		if !attach {
			n++
		}
		prev = r
	}
	return n
}

func isRegionalIndicator(r rune) bool { return r >= 0x1F1E6 && r <= 0x1F1FF }

func isPictographic(r rune) bool {
	return r >= 0x1F300 && r <= 0x1FAFF || r >= 0x2600 && r <= 0x27BF || r == 0x2764 || r == 0x2B50
}
