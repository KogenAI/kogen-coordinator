const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { When, Then } = require('@cucumber/cucumber');

// The generated driver asks project.RequireIntentDir, the function every `kogen intent approve|refine|build`
// refusal comes from, about a slug in a repository holding the named Intents, and prints what it returned.
const driver = `package main

import (
	"encoding/json"
	"os"

	"github.com/KogenAI/kogen-coordinator/project"
	"github.com/KogenAI/kogen-loop/sys"
)

func main() {
	out := map[string]any{"accepted": false, "class": "", "reason": "", "exit": 0, "render": "", "other": ""}
	err := project.RequireIntentDir(os.Args[1], os.Args[2])
	if err == nil {
		out["accepted"] = true
	} else if e, ok := sys.AsError(err); ok {
		out["class"], out["reason"], out["exit"], out["render"] = e.Class, e.Reason, e.Exit, e.Render()
	} else {
		out["other"] = err.Error()
	}
	json.NewEncoder(os.Stdout).Encode(out)
}
`;

When('k-coord-intent-not-found-names-next-command: the repository holds the Intents {string} and the Intent {string} is required',
  { timeout: 120000 }, function(names, slug) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'intent-not-found-'));
    try {
      const root = path.join(dir, 'root');
      fs.mkdirSync(path.join(root, '.kogen'), { recursive: true });
      fs.writeFileSync(path.join(root, '.kogen', 'project.yaml'), 'checks: []\n');
      for (const name of names.split(',').filter(Boolean)) {
        const intent = path.join(root, '.kogen', 'intents', name);
        fs.mkdirSync(intent, { recursive: true });
        fs.writeFileSync(path.join(intent, 'intent.md'), `# ${name}\n`);
      }
      const file = path.join(dir, 'main.go');
      fs.writeFileSync(file, driver);
      this.requireResult = JSON.parse(execFileSync('go', ['run', file, root, slug], { encoding: 'utf8', timeout: 110000 }));
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

Then('k-coord-intent-not-found-names-next-command: the refusal is class {string}, reason {string} and exit {int}', function(cls, reason, exit) {
  const r = this.requireResult;
  assert.deepEqual({ accepted: r.accepted, class: r.class, reason: r.reason, exit: r.exit, other: r.other },
    { accepted: false, class: cls, reason, exit, other: '' });
});

Then('k-coord-intent-not-found-names-next-command: the refusal text is exactly:', function(text) {
  assert.equal(this.requireResult.render, text + '\n');
});

Then('k-coord-intent-not-found-names-next-command: the Intent is accepted without a refusal', function() {
  assert.deepEqual(this.requireResult, { accepted: true, class: '', reason: '', exit: 0, render: '', other: '' });
});
