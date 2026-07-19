'use strict';

const assert = require('node:assert');
const { describe, it } = require('node:test');
const { redactSecrets, summarizeUrl } = require('../src/cdp/redaction');

describe('recursive redaction', () => {
  it('redacts token-like query values', () => {
    const value = redactSecrets('https://example.com/path?token=abc123&state=def456');
    assert.match(value, /token=REDACTED/);
    assert.match(value, /state=REDACTED/);
  });

  it('summarizes URLs without full query values', () => {
    const summary = summarizeUrl('https://script.google.com/dev?token=abc&foo=bar');
    assert.strictEqual(summary.hostCategory, 'script.google.com');
    assert.deepStrictEqual(summary.queryKeys.sort(), ['foo', 'token']);
  });
});
