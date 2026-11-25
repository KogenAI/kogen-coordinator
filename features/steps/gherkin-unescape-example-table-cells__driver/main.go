package main

import (
	"encoding/json"
	"io"
	"log"
	"os"

	"github.com/KogenAI/kogen-coordinator/project"
)

func main() {
	text, err := io.ReadAll(os.Stdin)
	if err != nil {
		log.Fatal(err)
	}
	scenarios, err := project.ParseGherkin(string(text))
	result := map[string]any{}
	if err != nil {
		result["error"] = err.Error()
	} else {
		rows := make([][]string, 0, len(scenarios))
		for _, scenario := range scenarios {
			row := []string{scenario.Name}
			for _, step := range scenario.Steps {
				row = append(row, step.Text)
			}
			rows = append(rows, row)
		}
		result["scenarios"] = rows
	}
	if err := json.NewEncoder(os.Stdout).Encode(result); err != nil {
		log.Fatal(err)
	}
}
