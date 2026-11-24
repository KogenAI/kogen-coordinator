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
	text, err := io.ReadAll(os.Stdin)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	cfg, err := project.ParseConfig(string(text), project.ConfigPath)
	var result any
	if err != nil {
		var lines []string
		if diagnostic, ok := sys.AsError(err); ok {
			lines = diagnostic.Lines
		}
		result = map[string]any{"error": err.Error(), "lines": lines}
	} else {
		result = map[string]any{"setup": cfg.Setup}
	}
	if err := json.NewEncoder(os.Stdout).Encode(result); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
