package main

import (
	"encoding/json"
	"os"

	"github.com/KogenAI/kogen-coordinator/project"
)

func main() {
	var input struct {
		Files   map[string]string
		Tracked []string
	}
	if err := json.NewDecoder(os.Stdin).Decode(&input); err != nil {
		panic(err)
	}
	if err := json.NewEncoder(os.Stdout).Encode(project.Detect(input.Files, input.Tracked)); err != nil {
		panic(err)
	}
}
