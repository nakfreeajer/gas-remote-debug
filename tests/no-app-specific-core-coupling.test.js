'use strict';

const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { describe, it } = require('node:test');

const ROOT = path.resolve(__dirname, '..', 'src');
const FORBIDDEN = [
  'AFFOTECH_TEST_API',
  'TENANT_ID',
  'USER_ROLE',
  'TEST_MODE',
  'callApi',
  'R&R_Kitchen',
  'connectOverCDP',
  'page.frames',
  'frame.evaluate'
];

function scan(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...scan(fullPath));
      continue;
    }
    if (!entry.name.endsWith('.js')) continue;
    const content = fs.readFileSync(fullPath, 'utf8');
    results.push({ fullPath, content });
  }
  return results;
}

describe('generic core isolation', () => {
  it('contains no app-specific or playwright discovery strings', () => {
    const files = scan(ROOT);
    const offenders = [];
    for (const file of files) {
      for (const token of FORBIDDEN) {
        if (file.content.includes(token)) offenders.push(`${path.relative(ROOT, file.fullPath)}:${token}`);
      }
    }
    assert.deepStrictEqual(offenders, []);
  });
});
