package project

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/KogenAI/kogen-loop/sys"
)

// ModelsPath and LocalModelsPath identify the team lineup and optional machine override.
const ModelsPath = ".kogen/models.yaml"
const LocalModelsPath = ".kogen/local/models.yaml"

// ModelLineup contains the effective roles and their repository-relative sources.
type ModelLineup struct {
	Roles   map[string]Role
	Sources map[string]string
}

// ModelsTemplate returns the team lineup file `.kogen/models.yaml`, the one place besides the
// host-local file where model roles are written, with the default roles.
func ModelsTemplate() string {
	var b strings.Builder
	b.WriteString("models:\n")
	defaults := DefaultModels()
	for _, name := range ModelRoles {
		r := defaults[name]
		fmt.Fprintf(&b, "  %s:\n    model: %s\n    effort: %s\n", name, r.Model, r.Effort)
	}
	return b.String()
}

// LoadModels reads the required team lineup and optional whole-role local overrides.
// It never changes either file or the legacy project configuration.
func LoadModels(root string) (*ModelLineup, error) {
	lineup := &ModelLineup{Roles: DefaultModels(), Sources: map[string]string{}}
	for _, name := range ModelRoles {
		lineup.Sources[name] = ModelsPath
	}
	for _, path := range []string{ModelsPath, LocalModelsPath} {
		b, err := os.ReadFile(filepath.Join(root, path))
		if err != nil {
			if path == LocalModelsPath && os.IsNotExist(err) {
				continue
			}
			return nil, sys.Fail("environment", "project_config_invalid", fmt.Sprintf("read %s: %v", path, err), 3)
		}
		roles, problems := parseModelsFile(string(b))
		for name, r := range roles {
			lineup.Roles[name] = r
			lineup.Sources[name] = path
		}
		if len(problems) > 0 {
			return nil, configProblems(path, problems)
		}
	}
	return lineup, nil
}

// parseModelsFile validates the text of a lineup file (a root mapping whose only key is
// models) and returns the roles it names; it returns no roles when there are problems.
func parseModelsFile(text string) (map[string]Role, []problem) {
	node, problems := parseYAML(text)
	if len(problems) > 0 {
		return nil, problems
	}
	v := &validator{}
	if node.kind != kindMap {
		v.add(node.line, "the file must be a mapping")
		return nil, v.problems
	}
	var models *yamlNode
	for _, p := range node.pairs {
		if p.key == "models" {
			models = p.node
		} else {
			v.add(p.line, "unknown key "+p.key)
		}
	}
	if models == nil {
		v.add(node.line, "models is required")
		return nil, v.problems
	}
	if models.kind == kindMap {
		for _, p := range models.pairs {
			if p.key == "plan" {
				v.add(p.line, "unknown key "+p.key)
			}
		}
	}
	all := v.models(models)
	if len(v.problems) > 0 {
		return nil, v.problems
	}
	named := map[string]Role{}
	if models.kind == kindMap {
		for _, p := range models.pairs {
			named[p.key] = all[p.key]
		}
	}
	return named, nil
}
