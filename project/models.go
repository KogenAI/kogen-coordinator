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

// ModelsTemplate returns the team lineup with the default roles.
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
		node, problems := parseYAML(string(b))
		v := &validator{}
		var models *yamlNode
		if len(problems) == 0 {
			if node.kind != kindMap {
				v.add(node.line, "the file must be a mapping")
			} else {
				for _, p := range node.pairs {
					if p.key == "models" {
						models = p.node
					} else {
						v.add(p.line, "unknown key "+p.key)
					}
				}
				if models == nil {
					v.add(node.line, "models is required")
				}
			}
			if models != nil {
				if models.kind == kindMap {
					for _, p := range models.pairs {
						if p.key == "plan" {
							v.add(p.line, "unknown key "+p.key)
						}
					}
				}
				roles := v.models(models)
				if models.kind == kindMap {
					for _, p := range models.pairs {
						if r, ok := roles[p.key]; ok {
							lineup.Roles[p.key] = r
							lineup.Sources[p.key] = path
						}
					}
				}
			}
			problems = v.problems
		}
		if len(problems) > 0 {
			return nil, configProblems(path, problems)
		}
	}
	return lineup, nil
}
