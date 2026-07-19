'use strict';

const assert = require('node:assert');
const { describe, it } = require('node:test');
const genericGasProfile = require('../src/profiles/generic-gas');

describe('generic GAS profile', () => {
  it('matches GAS-like targets and generic globals only', () => {
    assert.strictEqual(genericGasProfile.targetSelector({ type: 'page', url: 'https://script.google.com/dev', title: 'App' }, {}), true);
    assert.strictEqual(genericGasProfile.contextPredicate({ globals: { google: true, 'google.script': true } }, null, { globals: ['google', 'google.script'] }), true);
  });
});
