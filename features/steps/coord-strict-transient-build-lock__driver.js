const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const source = path.join(__dirname, 'coord-strict-transient-build-lock__driver', 'main.go.txt');
const strictAPI = 'var acquire = git.AcquireBuildStrict\nvar occupied = git.ErrBuildLockExists\n';

function run(mode, api = strictAPI) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'strict-build-lock-'));
  try {
    const main = path.join(dir, 'main.go');
    const binary = path.join(dir, 'check');
    fs.writeFileSync(main, fs.readFileSync(source, 'utf8') + '\n' + api);
    const compiled = spawnSync('go', ['build', '-o', binary, main], { encoding: 'utf8', timeout: 70000 });
    assert.equal(compiled.status, 0, `go build for ${mode}: ${compiled.error || ''}\n${compiled.stdout}${compiled.stderr}`);
    const result = spawnSync(binary, [mode, dir], { encoding: 'utf8', timeout: 10000 });
    if (result.error) throw result.error;
    return result;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function judge(result, mode) {
  assert.equal(result.status, 0, `${mode}: ${result.signal || ''}\n${result.stdout}${result.stderr}`);
  assert.equal(result.stdout, `checked ${mode}\n`);
}

if (require.main === module) {
  // Qualify the real late-file custody observer on a controlled refusal, with and without a write.
  const bad = process.argv[2] === 'bad';
  const api = `var occupied = errors.New("fixture refusal")
func acquire(root string) (*git.Lock, error) {
  if _, err := os.Lstat(git.BuildLockPath(root)); err != nil { return nil, err }
  ${bad ? 'if err := os.WriteFile(git.BuildLockPath(root), []byte("overwritten"), 0644); err != nil { return nil, err }' : ''}
  return nil, occupied
}
`;
  const result = run('late', api);
  if (bad && result.status === 1 && result.stdout === '' && result.stderr === 'late: artifact bytes changed\n') {
    console.log('rejected changed custody');
    process.exitCode = 1;
  } else {
    judge(result, 'late');
    console.log('accepted unchanged custody');
  }
} else {
  const { Then } = require('@cucumber/cucumber');
  const prefix = 'coord-strict-transient-build-lock: ';
  const options = { timeout: 90000 };
  const check = (sentence, mode) => Then(prefix + sentence, options, function () {
    judge(run(mode), mode);
  });
  check('a strict owner at BuildLockPath has a valid token, promptly excludes normal and strict contenders, and releases the same lock', 'fresh');
  check('strict acquisition promptly refuses the normally held lock and preserves its owner, inode and bytes', 'held');
  Then(prefix + 'strict acquisition refuses the {word} {word} without changing its path identity or contents', options, function (a, b) {
    const mode = `${a} ${b}`;
    judge(run(mode), mode);
  });
  check('the stale directory is preserved by strict refusal and still allows ordinary stale takeover and release', 'stale directory');
  check('the stale pid file is preserved by strict refusal and still allows ordinary stale takeover and release', 'stale pid file');
  check('strict acquisition refuses and preserves the file created after the caller observed absence', 'late');
  check('the strict owner releases its own lock without removing the replacement symlink at BuildLockPath', 'replaced');
  check('strict acquisition reports the parent obstruction without classifying it as an occupied Build lock', 'parent');
}
