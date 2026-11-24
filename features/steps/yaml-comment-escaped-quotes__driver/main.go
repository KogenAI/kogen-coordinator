package main

import (
	"encoding/json"
	"fmt"
	"io"
	"os"

	"github.com/KogenAI/kogen-coordinator/project"
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
		result = map[string]string{"error": err.Error()}
	} else {
		result = cfg.Setup
	}
	if err := json.NewEncoder(os.Stdout).Encode(result); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
