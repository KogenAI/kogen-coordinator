const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const driver = path.join(__dirname, 'yaml-empty-flow-sequence-error__driver');
const root = path.resolve(__dirname, '../..');

function run(command, args, timeout, input) {
  const result = spawnSync(command, args, {cwd: root, encoding: 'utf8', timeout, input});
  const context = `${command} ${args.join(' ')}: ${result.error || ''}\n${result.stderr}\n${result.stdout}`;
  assert.ifError(result.error);
  assert.equal(result.signal, null, context);
  assert.equal(result.status, 0, context);
  return result.stdout;
}

function withParser(observe) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yaml-empty-flow-'));
  try {
    const binary = path.join(dir, 'parse');
    const overlay = path.join(dir, 'overlay.json');
    fs.writeFileSync(overlay, JSON.stringify({Replace: {
      [path.join(root, 'project', 'kogen_yaml_empty_flow_acceptance.go')]: path.join(driver, 'bridge.go.txt'),
    }}));
    run('go', ['build', '-overlay', overlay, '-o', binary, path.join(driver, 'main.go')], 95000);
    return observe((mode, text) => JSON.parse(run(binary, [mode], 5000, text)));
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
}

function compare(actual, expected) {
  assert.deepEqual(actual, expected);
}

if (require.main === module) {
  // Qualify the same build, invocation, JSON decoding and equality used by the step.
  const text = process.argv[2] === 'good'
    ? 'version: 1\ncommands: {setup: [1, 2'
    : 'version: 1\ncommands: {setup: []}';
  const actual = withParser(parse => [parse('yaml', text), parse('config', text)]);
  const lines = ['line 2: unclosed ['];
  try {
    compare(actual, [
      {returned: false, lines},
      {returned: false, class: 'environment', reason: 'project_config_invalid', detail: '.kogen/project.yaml', exit: 3, lines},
    ]);
    console.log('observer accepted');
  } catch (error) {
    if (!(error instanceof assert.AssertionError)) throw error;
    console.log('observer rejected');
    process.exitCode = 1;
  }
} else {
  const {Given, Then} = require('@cucumber/cucumber');

  Given('yaml-empty-flow-sequence-error: the {string} parser receives this document', function (mode, text) {
    this.flowMode = mode;
    this.flowText = text;
  });

  Then('yaml-empty-flow-sequence-error: it returns exactly this result without a panic', {timeout: 110000}, function (expected) {
    const actual = withParser(parse => parse(this.flowMode, this.flowText));
    compare(actual, JSON.parse(expected));
  });
}
