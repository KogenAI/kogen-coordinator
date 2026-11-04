const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const hash = s => crypto.createHash('sha256').update(s).digest('hex');
function compare(actual, expected) { assert.deepEqual(actual, expected); }
if (require.main === module) {
  const expected = { hash: hash('a\0unreadable\n'), unreadable: ['a'] };
  try {
    compare(process.argv[2] === 'good' ? { hash: hash('a\0unreadable\n'), unreadable: ['a'] } : { hash: hash('a\0missing\n'), unreadable: [] }, expected);
    console.log('match');
  } catch (_) { console.log('mismatch'); process.exitCode = 1; }
} else {
  const { When, Then } = require('@cucumber/cucumber');
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { execFileSync } = require('node:child_process');
  When('coord-baseline-hash-unreadable-distinct: I hash fixture {string}', { timeout: 120000 }, function(kind) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'baseline-hash-'));
    try {
      const root = path.join(dir, 'root'); fs.mkdirSync(root);
      fs.writeFileSync(path.join(root, 'readable'), 'hello');
      fs.writeFileSync(path.join(root, 'permission'), 'secret'); fs.chmodSync(path.join(root, 'permission'), 0);
      fs.mkdirSync(path.join(root, 'directory'));
      const names = kind === 'mixed' ? ['readable', 'permission', 'directory', 'absent'] : [kind];
      this.baselineInputs = names.map(name => {
        try { return [name, hash(fs.readFileSync(path.join(root, name)))]; }
        catch (e) { return [name, e.code === 'ENOENT' ? 'missing' : 'unreadable']; }
      });
      const source = `package main
import("encoding/json";"os";"github.com/KogenAI/kogen-coordinator/project")
func main(){p:=os.Args[2:]; h,u:=project.HashWithUnreadable(os.Args[1],p); if u==nil {u=[]string{}}; json.NewEncoder(os.Stdout).Encode(map[string]any{"hash":h,"legacy":project.Hash(os.Args[1],p),"unreadable":u})}
`;
      const file = path.join(dir, 'main.go'); fs.writeFileSync(file, source);
      this.baselineResult = JSON.parse(execFileSync('go', ['run', file, root, ...names], { encoding: 'utf8', timeout: 110000 }));
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
  Then('coord-baseline-hash-unreadable-distinct: contributions use missing {string} and unreadable {string}', function(missing, unreadable) {
    const inputs = this.baselineInputs.slice().sort((a,b) => a[0].localeCompare(b[0]));
    const digest = hash(inputs.map(([name,value]) => name + '\0' + (value === 'missing' ? missing : value === 'unreadable' ? unreadable : value) + '\n').join(''));
    compare(this.baselineResult, { hash: digest, legacy: digest, unreadable: inputs.filter(([,v]) => v === 'unreadable').map(([n]) => n) });
  });
}
