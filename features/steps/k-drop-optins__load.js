const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {When, Then} = require('@cucumber/cucumber');

// The driver loads <root>/.kogen/project.yaml with project.LoadConfig and prints the fields the
// removed options used to set, or the configuration error with its lines.
const driver = String.raw`package main

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/KogenAI/kogen-coordinator/project"
	"github.com/KogenAI/kogen-loop/sys"
)

func main() {
	cfg, err := project.LoadConfig(os.Args[1])
	if err != nil {
		se, ok := sys.AsError(err)
		if !ok {
			fmt.Println("ERROR:", err)
			return
		}
		fmt.Printf("ERROR: %s/%s\n", se.Class, se.Reason)
		for _, l := range se.Lines {
			fmt.Println(l)
		}
		return
	}
	b, err := json.Marshal(map[string]any{
		"ShapeWorkers":       cfg.ShapeWorkers,
		"ShapeAudit":         cfg.ShapeAudit,
		"ShapeDecisionCheck": cfg.ShapeDecisionCheck,
		"ReviewMaterial":     cfg.ReviewMaterial,
		"Protect":            cfg.Protect,
		"BuildModel":         cfg.Models["build"].Model,
	})
	if err != nil {
		panic(err)
	}
	fmt.Printf("RESULT: %s\n", b)
}
`;

When('k-drop-optins: I load this project configuration:', function(text) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'k-drop-optins-'));
  try {
    const root = path.join(dir, 'root');
    fs.mkdirSync(path.join(root, '.kogen'), {recursive: true});
    fs.writeFileSync(path.join(root, '.kogen/project.yaml'), text.endsWith('\n') ? text : `${text}\n`);
    const source = path.join(dir, 'main.go');
    const binary = path.join(dir, 'driver');
    fs.writeFileSync(source, driver);
    const built = spawnSync('go', ['build', '-o', binary, source], {encoding: 'utf8'});
    if (built.status !== 0) {
      this.kDropOptinsOutput = `BUILD FAILURE: go build exited ${built.status} ${built.error || ''}\n${built.stdout}\n${built.stderr}`;
      return;
    }
    const result = spawnSync(binary, [root], {encoding: 'utf8'});
    this.kDropOptinsOutput = result.status === 0
      ? result.stdout
      : `PROCESS FAILURE: driver exited ${result.status} ${result.error || ''}\n${result.stdout}\n${result.stderr}`;
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
});

Then('k-drop-optins: the output is:', function(expected) {
  assert.equal(this.kDropOptinsOutput, `${expected}\n`);
});
