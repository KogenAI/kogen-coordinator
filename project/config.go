// Package project reads and writes what Kogen keeps about a project: `.kogen/project.yaml`
// (commands, protected paths), the model lineup files `.kogen/models.yaml` and
// `.kogen/local/models.yaml`, Gherkin features, Intent packages with their baseline
// hash and approvals, and the command detection `kogen init` starts from. It holds data and
// files only; the one Git it runs is `git check-ignore` and `git ls-files`.
package project

import (
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"sort"
	"strings"

	"github.com/KogenAI/kogen-loop/sys"
)

// ConfigPath is the project configuration, relative to the repository root.
const ConfigPath = ".kogen/project.yaml"

// LocalChecksPath is the optional host-local check commands, relative to the repository root.
const LocalChecksPath = ".kogen/local/checks.yaml"

// Role is one model selection. Provider "" means the role names no provider (legacy ChatGPT).
// BaseURL is set only for the openai-compatible provider (the host's /v1 base); it is
// omitted from JSON when empty so existing checkpoints keep their bytes.
//
// Executor is "" for the native role (including `executor: native`) or "claude-code".
// Both are omitted from JSON when empty so existing checkpoints keep their bytes.
type Role struct {
	Provider, Model, Effort string
	BaseURL                 string `json:",omitempty"`
	Executor                string `json:",omitempty"`
}

// Executor names a role may select (the native one is the empty Executor).
const (
	ExecutorNative     = "native"
	ExecutorClaudeCode = "claude-code"
)

// External reports whether the role is served by an external executor instead of Kogen's own
// provider-backed builder.
func (r Role) External() bool { return r.Executor != "" && r.Executor != ExecutorNative }

// Check is a project check: a unique lowercase name and its command.
type Check struct{ Name, Run string }

// Acceptance is the acceptance command and the folder shaping writes step files to
// (`commands.acceptance`). Either may be empty while it is not configured.
type Acceptance struct{ Run, StepsDir string }

// Config is a validated `.kogen/project.yaml` (SET-8). Its Models come from the models files
// (ModelsPath, LocalModelsPath), never from `.kogen/project.yaml`.
type Config struct {
	Setup, Fix         []string
	Checks             []Check
	Acceptance         *Acceptance // nil when neither run nor steps_dir is set
	Protect            []string
	ProtectDiagnostics []ProtectDiagnostic
	Models             map[string]Role // "shape", "build", "review"; set by LoadConfig from the models files, defaults where they say nothing
}

// ProtectDiagnostic describes an advisory finding for a protect entry.
type ProtectDiagnostic struct {
	Entry, Severity, Message string
}

// ModelRoles lists the model roles in the order the template writes them.
var ModelRoles = [...]string{"shape", "build", "review"}

// DefaultModels returns the per-role defaults (SET-8); the template is derived from it.
func DefaultModels() map[string]Role {
	return map[string]Role{
		"shape":  {Model: "gpt-6.1-sol", Effort: "high"},
		"build":  {Model: "gpt-6.1-sol", Effort: "medium"},
		"review": {Model: "gpt-6.1-terra", Effort: "medium"},
	}
}

// AcceptanceConfigured reports whether both the acceptance command and the steps folder are set.
func (c *Config) AcceptanceConfigured() bool {
	return c.Acceptance != nil && c.Acceptance.Run != "" && c.Acceptance.StepsDir != ""
}

// NamedCommand is a configured command with the name Kogen reports it under.
type NamedCommand struct{ Name, Run string }

// NamedCommands lists every configured command in the order Kogen runs them (SET-8).
func (c *Config) NamedCommands() []NamedCommand {
	var out []NamedCommand
	for i, cmd := range c.Setup {
		out = append(out, NamedCommand{fmt.Sprintf("setup-%d", i+1), cmd})
	}
	for i, cmd := range c.Fix {
		out = append(out, NamedCommand{fmt.Sprintf("fix-%d", i+1), cmd})
	}
	for _, ch := range c.Checks {
		out = append(out, NamedCommand{ch.Name, ch.Run})
	}
	if c.Acceptance != nil && c.Acceptance.Run != "" {
		out = append(out, NamedCommand{"acceptance", c.Acceptance.Run})
	}
	return out
}

// LoadConfig reads and validates the configuration of an initialized project, then takes every
// model role from the models files: the defaults, then the team file ModelsPath, then the
// host-local LocalModelsPath, each role a file names replacing the whole role. It then applies
// the host-local check commands (LocalChecksPath). Files are read in that precedence order and the
// first failure is the only one reported: errors are environment/not_initialized,
// environment/old_kogen_config and environment/project_config_invalid. A models file or local
// checks file that does not exist is skipped; none is ever written.
func LoadConfig(root string) (*Config, error) {
	file := filepath.Join(root, ConfigPath)
	b, err := os.ReadFile(file)
	if err != nil {
		return nil, sys.Fail("environment", "not_initialized", root+" has no .kogen/project.yaml; run kogen init", 3)
	}
	cfg, err := ParseConfig(string(b), file)
	if err != nil {
		return nil, err
	}
	if err := applyFiles(root, cfg); err != nil {
		return nil, err
	}
	_, _ = Protected(root, cfg)
	return cfg, nil
}

// applyFiles applies the models files and the host-local checks over a validated committed
// configuration: each role of a models file replaces the whole role, each local check replaces
// the command of the committed check with that name. The first failing file is the only one
// reported.
func applyFiles(root string, cfg *Config) error {
	localFile := func(rel string) (string, bool, error) {
		b, err := os.ReadFile(filepath.Join(root, rel))
		if err != nil {
			if os.IsNotExist(err) {
				return "", false, nil
			}
			return "", false, sys.Fail("environment", "project_config_invalid", fmt.Sprintf("read %s: %v", filepath.Join(root, rel), err), 3)
		}
		return string(b), true, nil
	}
	for _, rel := range []string{ModelsPath, LocalModelsPath} {
		text, found, err := localFile(rel)
		if err != nil {
			return err
		}
		if !found {
			continue
		}
		roles, problems := parseModelsFile(text)
		if len(problems) > 0 {
			return configProblems(filepath.Join(root, rel), problems)
		}
		for name, r := range roles {
			cfg.Models[name] = r
		}
	}
	text, found, err := localFile(LocalChecksPath)
	if err != nil {
		return err
	}
	if found {
		runs, problems := parseChecksFile(text, cfg.Checks)
		if len(problems) > 0 {
			return configProblems(filepath.Join(root, LocalChecksPath), problems)
		}
		for i, c := range cfg.Checks {
			if run, ok := runs[c.Name]; ok {
				cfg.Checks[i].Run = run
			}
		}
	}
	return nil
}

// parseChecksFile validates the text of a host-local check file (a root mapping whose only key
// is checks, a list of {name, run}) against the committed checks and returns the commands by
// name; it returns none when there are problems.
func parseChecksFile(text string, committed []Check) (map[string]string, []problem) {
	node, problems := parseYAML(text)
	if len(problems) > 0 {
		return nil, problems
	}
	v := &validator{}
	if node.kind != kindMap {
		v.add(node.line, "the file must be a mapping")
		return nil, v.problems
	}
	var list *yamlNode
	for _, p := range node.pairs {
		if p.key == "checks" {
			list = p.node
		} else {
			v.add(p.line, "unknown key "+p.key)
		}
	}
	if list == nil {
		v.add(node.line, "checks is required")
		return nil, v.problems
	}
	if list.kind != kindSeq {
		v.add(list.line, "checks must be a list")
		return nil, v.problems
	}
	runs := map[string]string{}
	seen := map[string]bool{}
	for _, item := range list.items {
		if item.kind != kindMap {
			v.add(item.line, "a check must be {name, run}")
			continue
		}
		unknown := false
		for _, p := range item.pairs {
			if p.key != "name" && p.key != "run" {
				v.add(p.line, "unknown key "+p.key)
				unknown = true
			}
		}
		if unknown {
			continue
		}
		name, okName := stringAt(item.pairs, "name")
		run, okRun := stringAt(item.pairs, "run")
		switch {
		case !okName || !okRun:
			v.add(item.line, "a check needs a name and a run string")
		case seen[name]:
			v.add(item.line, "check name "+name+" is used twice")
		case !hasCheck(committed, name):
			seen[name] = true
			v.add(item.line, "check name "+name+" is not in "+ConfigPath)
		default:
			seen[name] = true
			runs[name] = run
		}
	}
	if len(v.problems) > 0 {
		return nil, v.problems
	}
	return runs, nil
}

// ParseConfig validates configuration text; file names it in errors.
func ParseConfig(text, file string) (*Config, error) {
	var cfg *Config
	var problems []problem
	node, probs := parseYAML(text)
	switch {
	case probs != nil:
		problems = probs
	case node.kind == kindMap:
		hasVersion := false
		for _, p := range node.pairs {
			hasVersion = hasVersion || p.key == "version"
		}
		if !hasVersion {
			return nil, sys.Fail("environment", "old_kogen_config", ".kogen/ is from an earlier Kogen; move it aside (git mv .kogen .kogen-old), commit, and run kogen init", 3)
		}
		cfg, problems = validateConfig(node)
	default:
		cfg, problems = validateConfig(node)
	}
	if len(problems) > 0 {
		return nil, configProblems(file, problems)
	}
	return cfg, nil
}

func configProblems(file string, problems []problem) error {
	sort.SliceStable(problems, func(i, j int) bool {
		if problems[i].line != problems[j].line {
			return problems[i].line < problems[j].line
		}
		return problems[i].msg < problems[j].msg
	})
	e := sys.Fail("environment", "project_config_invalid", file, 3)
	for _, p := range problems {
		e.Lines = append(e.Lines, fmt.Sprintf("line %d: %s", p.line, p.msg))
	}
	return e
}

type validator struct{ problems []problem }

func (v *validator) add(line int, msg string) { v.problems = append(v.problems, problem{line, msg}) }

var (
	checkNameRe = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)
	notStringRe = regexp.MustCompile(`^(true|false|True|False|TRUE|FALSE|[-+]?[0-9][0-9._]*(e[-+]?[0-9]+)?)$`)
)

func validateConfig(node *yamlNode) (*Config, []problem) {
	if node.kind != kindMap {
		return nil, []problem{{node.line, "the file must be a mapping"}}
	}
	v := &validator{}
	c := &Config{Models: DefaultModels()}
	for _, p := range node.pairs {
		switch p.key {
		case "version":
			if !(p.node.kind == kindScalar && !p.node.null && !p.node.quoted && p.node.text == "1") {
				v.add(p.line, "version must be 1")
			}
		case "commands":
			v.commands(p.node, c)
		case "protect":
			c.Protect = v.strings(p.node, "protect")
		case "models":
			// The lineup lives only in the models files; its contents are not read.
			v.add(p.line, "models is no longer read from "+ConfigPath+"; move the model lineup to "+ModelsPath)
		default:
			v.add(p.line, "unknown key "+p.key)
		}
	}
	return c, v.problems
}

func (v *validator) commands(node *yamlNode, c *Config) {
	if node.kind != kindMap {
		v.add(node.line, "commands must be a mapping")
		return
	}
	for _, p := range node.pairs {
		switch p.key {
		case "setup":
			c.Setup = v.strings(p.node, "commands.setup")
		case "fix":
			c.Fix = v.strings(p.node, "commands.fix")
		case "checks":
			c.Checks = v.checks(p.node)
		case "acceptance":
			v.acceptance(p.node, c)
		default:
			v.add(p.line, "unknown key "+p.key)
		}
	}
}

func (v *validator) acceptance(node *yamlNode, c *Config) {
	if node.kind != kindMap {
		v.add(node.line, "commands.acceptance must be a mapping")
		return
	}
	for _, p := range node.pairs {
		if p.key != "run" && p.key != "steps_dir" {
			v.add(p.line, "unknown key "+p.key)
			continue
		}
		n := p.node
		if n.kind != kindScalar || (!n.null && !isString(n)) {
			v.add(p.line, "commands.acceptance."+p.key+" must be a string or null")
			continue
		}
		if n.null {
			continue
		}
		if c.Acceptance == nil {
			c.Acceptance = &Acceptance{}
		}
		if p.key == "run" {
			c.Acceptance.Run = n.text
		} else {
			c.Acceptance.StepsDir = strings.TrimRight(n.text, "/")
		}
	}
}

func (v *validator) checks(node *yamlNode) []Check {
	if node.kind != kindSeq {
		v.add(node.line, "commands.checks must be a list")
		return nil
	}
	var list []Check
	for _, item := range node.items {
		if item.kind != kindMap {
			v.add(item.line, "a check must be {name, run}")
			continue
		}
		unknown := false
		for _, p := range item.pairs {
			if p.key != "name" && p.key != "run" {
				v.add(p.line, "unknown key "+p.key)
				unknown = true
			}
		}
		if unknown {
			continue
		}
		name, okName := stringAt(item.pairs, "name")
		run, okRun := stringAt(item.pairs, "run")
		switch {
		case !okName || !okRun:
			v.add(item.line, "a check needs a name and a run string")
		case name == "acceptance" || name == "model":
			v.add(item.line, "check name "+name+" is reserved")
		case !checkNameRe.MatchString(name):
			v.add(item.line, "check name "+name+" must be lowercase")
		case hasCheck(list, name):
			v.add(item.line, "check name "+name+" is used twice")
		default:
			list = append(list, Check{name, run})
		}
	}
	return list
}

func hasCheck(list []Check, name string) bool {
	for _, c := range list {
		if c.Name == name {
			return true
		}
	}
	return false
}

func (v *validator) models(node *yamlNode) map[string]Role {
	roles := DefaultModels()
	if node.kind != kindMap {
		v.add(node.line, "models must be a mapping")
		return roles
	}
	for _, p := range node.pairs {
		// Older project files may retain a planner model. It is ignored: building starts
		// directly and never issues a separate planning request.
		if p.key == "plan" {
			continue
		}
		if _, known := roles[p.key]; !known {
			v.add(p.line, "unknown key "+p.key)
			continue
		}
		rest, exec, ok := v.executorKeys(p)
		if !ok {
			continue
		}
		if exec == ExecutorClaudeCode {
			if r, ok := v.externalRole(rest, "models."+p.key, p.line); ok {
				r.Executor = exec
				roles[p.key] = r
			}
			continue
		}
		m, e, ok := modelEffort(rest, false)
		if !ok {
			v.add(p.line, "models."+p.key+" must be {model, effort}")
			continue
		}
		if r, ok := v.roleConfig(rest.pairs, "models."+p.key, p.line, m, e); ok {
			roles[p.key] = r
		}
	}
	return roles
}

// executorKeys separates executor from a role mapping.
func (v *validator) executorKeys(p yamlPair) (rest *yamlNode, exec string, ok bool) {
	rest = p.node
	if p.node.kind != kindMap {
		return rest, "", true
	}
	var execPair *yamlPair
	var kept []yamlPair
	ok = true
	path := "models." + p.key
	for i := range p.node.pairs {
		pair := &p.node.pairs[i]
		if pair.key == "executor" {
			execPair = pair
		} else {
			kept = append(kept, *pair)
		}
	}
	if execPair == nil {
		return rest, "", true
	}
	copied := *p.node
	copied.pairs = kept
	rest = &copied
	if execPair != nil {
		n := execPair.node
		if n.kind == kindScalar && !n.null && isString(n) && (n.text == ExecutorNative || n.text == ExecutorClaudeCode) {
			if n.text == ExecutorClaudeCode {
				exec = ExecutorClaudeCode
			}
		} else {
			v.add(execPair.line, path+".executor must be native or claude-code")
			ok = false
		}
	}
	return rest, exec, ok
}

// externalRole is a role served by an external executor: Kogen's provider keys do not apply
// (the executor uses its own sign-in), model and effort are required and passed through.
func (v *validator) externalRole(node *yamlNode, path string, line int) (Role, bool) {
	good := true
	for _, p := range node.pairs {
		if p.key == "provider" || p.key == "base_url" {
			v.add(p.line, path+"."+p.key+" is not allowed with executor claude-code")
			good = false
		}
	}
	if !good {
		return Role{}, false
	}
	m, e, ok := modelEffort(node, true)
	if !ok {
		v.add(line, path+" with executor claude-code must be {model, effort} non-blank strings")
		return Role{}, false
	}
	if !v.checkEffort(node.pairs, path, line, ExecutorClaudeCode, e) {
		return Role{}, false
	}
	return Role{Model: m, Effort: e}, true
}

// effortLists are the efforts known per route, exact and case-sensitive. Routes without an
// entry pass any effort through, except ultra, which no route lists.
var effortLists = map[string][]string{
	"anthropic":        {"low", "medium", "high", "xhigh", "max"},
	"supergrok":        {"low", "medium", "high", "xhigh"},
	ExecutorClaudeCode: {"low", "medium", "high", "xhigh", "max"},
}

// checkEffort rejects an effort the route does not accept, naming the line of the effort key.
func (v *validator) checkEffort(kv []yamlPair, path string, line int, route, effort string) bool {
	for _, p := range kv {
		if p.key == "effort" {
			line = p.line
		}
	}
	list, known := effortLists[route]
	if known && slices.Contains(list, effort) || !known && effort != "ultra" {
		return true
	}
	accepted := "any effort except ultra"
	if known {
		accepted = strings.Join(list, ", ")
	}
	v.add(line, fmt.Sprintf("%s.effort %q is not supported; accepted: %s", path, effort, accepted))
	return false
}

// modelEffort reads a role mapping: only model, effort, provider and base_url keys, model and
// effort strings (non-blank when nonBlank is set).
func modelEffort(node *yamlNode, nonBlank bool) (model, effort string, ok bool) {
	if node.kind != kindMap {
		return "", "", false
	}
	for _, p := range node.pairs {
		if p.key != "model" && p.key != "effort" && p.key != "provider" && p.key != "base_url" {
			return "", "", false
		}
	}
	m, okM := stringAt(node.pairs, "model")
	e, okE := stringAt(node.pairs, "effort")
	if !okM || !okE || (nonBlank && (strings.TrimSpace(m) == "" || strings.TrimSpace(e) == "")) {
		return "", "", false
	}
	return m, e, true
}

// Providers lists the values a role's provider may name, in the order messages list them.
var Providers = []string{"chatgpt", "supergrok", "opencode-go", "anthropic", "openai-compatible"}

// roleConfig applies the provider rules to a role mapping (KOGEN-057): the provider, when
// given, is one Kogen knows; any model and effort are accepted and sent unchanged (a named
// provider needs both non-blank). openai-compatible needs base_url, an http(s) URL; no other
// provider takes one. Known models are defaults and documentation hints, never validation.
func (v *validator) roleConfig(kv []yamlPair, path string, line int, model, effort string) (Role, bool) {
	provider, _ := stringAt(kv, "provider")
	present, hasBase := false, false
	for _, p := range kv {
		present = present || p.key == "provider"
		hasBase = hasBase || p.key == "base_url"
	}
	base, baseOK := stringAt(kv, "base_url")
	switch {
	case present && !slices.Contains(Providers, provider):
		v.add(line, path+".provider must be chatgpt, supergrok, opencode-go, anthropic or openai-compatible")
		return Role{}, false
	case present && provider != "chatgpt" && (strings.TrimSpace(model) == "" || strings.TrimSpace(effort) == ""):
		v.add(line, path+" must be {model, effort}")
		return Role{}, false
	case hasBase && provider != "openai-compatible":
		v.add(line, path+".base_url is only for provider openai-compatible")
		return Role{}, false
	case provider == "openai-compatible" && !hasBase:
		v.add(line, path+": openai-compatible needs base_url, for example http://localhost:11434/v1")
		return Role{}, false
	case provider == "openai-compatible" && (!baseOK || !validBaseURL(base)):
		v.add(line, path+".base_url must be an http:// or https:// URL")
		return Role{}, false
	}
	if !v.checkEffort(kv, path, line, provider, effort) {
		return Role{}, false
	}
	r := Role{Model: model, Effort: effort}
	if present {
		r.Provider = provider
	}
	if provider == "openai-compatible" {
		r.BaseURL = strings.TrimRight(base, "/")
	}
	return r, true
}

// validBaseURL is an absolute http or https URL with a host and no query or fragment.
func validBaseURL(s string) bool {
	u, err := url.Parse(s)
	return err == nil && (u.Scheme == "http" || u.Scheme == "https") && u.Host != "" &&
		u.RawQuery == "" && u.Fragment == "" && u.User == nil && !strings.ContainsAny(s, " \t\r\n")
}

func (v *validator) strings(node *yamlNode, name string) []string {
	if node.kind != kindSeq {
		v.add(node.line, name+" must be a list")
		return nil
	}
	var list []string
	for _, item := range node.items {
		if item.kind == kindScalar && !item.null && isString(item) {
			list = append(list, item.text)
		} else {
			v.add(item.line, name+" entries must be strings")
		}
	}
	return list
}

// stringAt is the string value of key in pairs, when there is one: a plain true, false or number
// is not a string (quote it to use it as one).
func stringAt(pairs []yamlPair, key string) (string, bool) {
	for _, p := range pairs {
		if p.key == key {
			if p.node.kind == kindScalar && !p.node.null && isString(p.node) {
				return p.node.text, true
			}
			return "", false
		}
	}
	return "", false
}

func isString(n *yamlNode) bool { return n.quoted || !notStringRe.MatchString(n.text) }

// ReadableConfig is what validation could read from configuration text that may be invalid:
// every key it accepted, with the defaults (SET-8) for everything else, including the models
// (a models key is refused, not applied) and a file it cannot parse at all.
func ReadableConfig(text string) *Config {
	if node, probs := parseYAML(text); probs == nil && node.kind == kindMap {
		if cfg, _ := validateConfig(node); cfg != nil {
			return cfg
		}
	}
	return &Config{Models: DefaultModels()}
}
