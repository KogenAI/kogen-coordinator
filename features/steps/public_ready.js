const fs = require('node:fs');
const assert = require('node:assert/strict');
const { Then } = require('@cucumber/cucumber');
const readme = () => fs.readFileSync('README.md', 'utf8');
Then('the public README contains {string}', function (text) {
  assert.ok(readme().includes(text), `README.md must contain ${text}`);
});
Then('the public README mentions the Go version from go.mod', function () {
  const version = fs.readFileSync('go.mod', 'utf8').match(/^go\s+(\S+)/m)[1];
  assert.ok(readme().includes(version), `README.md must specify Go ${version}`);
});
Then('the public README states the inquiry address {string} once', function (address) {
  assert.equal(readme().split(address).length - 1, 1, `README.md must state ${address} once`);
});
Then('the public README excludes pattern {string}', function (pattern) {
  assert.doesNotMatch(readme(), new RegExp(pattern, 'i'));
});
Then('the coordinator contract Intent excludes home path examples', function () {
  assert.doesNotMatch(fs.readFileSync('.kogen/intents/k-contracts-coordinator/intent.md', 'utf8'), /\/(?:Users|home)\//);
});
Then('the public tree has no policy file named {string}', function (name) {
  assert.equal(fs.existsSync(name), false, `${name} must not be present`);
});
Then('the public audit report contains {string}', function (text) {
  assert.ok(fs.readFileSync('docs/public-audit.md', 'utf8').includes(text), `docs/public-audit.md must contain ${text}`);
});
