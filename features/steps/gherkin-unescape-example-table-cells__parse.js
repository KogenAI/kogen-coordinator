const assert = require('node:assert/strict');
const fs = require('node:fs');
const {execFileSync} = require('node:child_process');

function parseFeature(text) {
  const output = execFileSync('go', ['run', './features/steps/gherkin-unescape-example-table-cells__driver/main.go'], {
    encoding: 'utf8', input: text, timeout: 100000,
  });
  return JSON.parse(output);
}

function checkScenarios(actual, expected) {
  assert.deepStrictEqual(actual, {scenarios: JSON.parse(expected)});
}

if (require.main === module) {
  const actual = parseFeature(fs.readFileSync(0, 'utf8'));
  try {
    checkScenarios(actual, process.argv[2]);
    console.log('match');
  } catch (error) {
    if (error.code !== 'ERR_ASSERTION') throw error;
    console.log('mismatch');
    process.exitCode = 1;
  }
} else {
  const {Given, Then} = require('@cucumber/cucumber');

  Given('gherkin-unescape-example-table-cells: ParseGherkin reads the feature text', {timeout: 110000}, function (text) {
    this.parsedFeature = parseFeature(text);
  });

  Then('gherkin-unescape-example-table-cells: the generated names and step texts are', function (expected) {
    checkScenarios(this.parsedFeature, expected);
  });
}
