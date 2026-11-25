//go:build yaml_empty_flow_sequence_acceptance

package main

import (
	"encoding/json"
	"fmt"
	"io"
	"os"

	"github.com/KogenAI/kogen-coordinator/project"
	"github.com/KogenAI/kogen-loop/sys"
)

func main() {
	if err := observe(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func observe() error {
	if len(os.Args) != 2 {
		return fmt.Errorf("expected yaml or config argument")
	}
	text, err := io.ReadAll(os.Stdin)
	if err != nil {
		return err
	}
	result := map[string]any{}
	switch os.Args[1] {
	case "yaml":
		returned, lines := project.KogenObserveYAML(string(text))
		result["returned"], result["lines"] = returned, lines
	case "config":
		cfg, err := project.ParseConfig(string(text), project.ConfigPath)
		result["returned"] = cfg != nil
		if err != nil {
			diagnostic, ok := sys.AsError(err)
			if !ok {
				return fmt.Errorf("unclassified configuration error: %w", err)
			}
			result["class"] = diagnostic.Class
			result["reason"] = diagnostic.Reason
			result["detail"] = diagnostic.Detail
			result["exit"] = diagnostic.Exit
			result["lines"] = diagnostic.Lines
		}
	default:
		return fmt.Errorf("unexpected parser %q", os.Args[1])
	}
	return json.NewEncoder(os.Stdout).Encode(result)
}
