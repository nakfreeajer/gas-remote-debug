const assert = require('node:assert');
const { describe, it } = require('node:test');
const { execSync } = require('child_process');

function runCLI(...args) {
  const result = execSync(`node bin/gas-remote-debug.js ${args.join(' ')}`, {
    encoding: 'utf-8',
    timeout: 5000
  });
  return result;
}

describe('CLI help output', () => {
  it('node bin/gas-remote-debug.js help shows expected content', () => {
    const output = runCLI('help');
    assert.ok(output.includes('gas-remote-debug'));
    assert.ok(output.includes('list'));
    assert.ok(output.includes('scan'));
    assert.ok(output.includes('discover'));
    assert.ok(output.includes('eval'));
    assert.ok(output.includes('experimental'));
    assert.ok(output.includes('--host'));
    assert.ok(output.includes('--port'));
    assert.ok(output.includes('--json'));
    assert.ok(output.includes('--config'));
    assert.ok(output.includes('--allow-dangerous'));
    assert.ok(output.includes('--helpers'));
    assert.ok(output.includes('--selector'));
    assert.ok(output.includes('--text'));
  });

  it('node bin/gas-remote-debug.js --help shows same content', () => {
    const output = runCLI('--help');
    assert.ok(output.includes('gas-remote-debug'));
    assert.ok(output.includes('list'));
    assert.ok(output.includes('discover'));
    assert.ok(output.includes('experimental'));
  });

  it('node bin/gas-remote-debug.js (no args) shows help', () => {
    const output = runCLI();
    assert.ok(output.includes('gas-remote-debug'));
    assert.ok(output.includes('Commands'));
    assert.ok(output.includes('Options'));
  });
});
