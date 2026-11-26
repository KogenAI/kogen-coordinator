const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const slug = 'route-resume-stage-validation';
const root = path.resolve(__dirname, '../..');

function run(rows) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `${slug}-`));
  try {
    const binary = path.join(dir, 'resume-driver');
    execFileSync('go', ['build', '-o', binary, `./features/steps/${slug}__driver`],
      { cwd: root, timeout: 75000 });
    return rows.map(row => ({ ...row, actual: JSON.parse(execFileSync(binary,
      [row.stage, row.continuable], { encoding: 'utf8', timeout: 2000 })) }));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function observe({ stage, continuable, phases, actual }) {
  const seen = `stage ${JSON.stringify(stage)}, continuable ${continuable}: ${JSON.stringify(actual)}`;
  if (phases === undefined) {
    // Compare both observations together so baseline red exposes the misrouting as well.
    assert.deepEqual({ namesStage: typeof actual.error === 'string' && actual.error.includes(stage), calls: actual.calls },
      { namesStage: true, calls: [] }, seen);
  } else {
    assert.deepEqual({ error: actual.error, phases: actual.calls.filter(call => call !== 'continuable') },
      { error: null, phases: JSON.parse(phases) }, seen);
  }
}

if (require.main === module) {
  // Qualify the same assertions on recorded output, independent of baseline acceptance red.
  const [file, mode] = process.argv.slice(2);
  const rows = JSON.parse(fs.readFileSync(file, 'utf8'))[mode];
  assert.ok(rows.length > 0, `no ${mode} observations`);
  for (const row of rows) {
    try {
      observe(row);
      console.log(`accepted ${row.name}`);
    } catch (err) {
      if (!(err instanceof assert.AssertionError)) throw err;
      console.log(`rejected ${row.name}`);
      process.exitCode = 1;
    }
  }
} else {
  const { When, Then } = require('@cucumber/cucumber');
  When(`${slug}: Resume receives {string} with reviewer continuable {string}`, { timeout: 100000 }, function (stage, continuable) {
    this.resumeRows = run([{ stage, continuable }]);
  });
  Then(`${slug}: Resume returns an error naming the stage without calling any step`, function () {
    observe(this.resumeRows[0]);
  });
  When(`${slug}: Resume receives these recognized stages in separate calls`, { timeout: 100000 }, function (table) {
    this.resumeRows = run(table.hashes());
  });
  Then(`${slug}: each call succeeds with exactly its listed phase calls in order`, function () {
    this.resumeRows.forEach(observe);
  });
}
