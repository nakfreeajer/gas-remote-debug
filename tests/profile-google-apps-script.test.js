const assert = require('node:assert');
const { describe, it } = require('node:test');
const { profile } = require('../src/profiles/google-apps-script');

describe('Google Apps Script Profile', () => {
  it('exports a profile object', () => {
    assert.ok(profile);
    assert.strictEqual(typeof profile, 'object');
  });

  it('has correct name', () => {
    assert.strictEqual(profile.name, 'google-apps-script');
  });

  it('has description', () => {
    assert.ok(profile.description);
    assert.strictEqual(typeof profile.description, 'string');
  });

  it('exports runtimeHelpers array', () => {
    assert.ok(Array.isArray(profile.runtimeHelpers));
    assert.ok(profile.runtimeHelpers.length > 0);
  });

  it('contains google and google.script as runtime helpers', () => {
    assert.ok(profile.runtimeHelpers.includes('google'));
    assert.ok(profile.runtimeHelpers.includes('google.script'));
  });

  it('exports domMarkers object with selectors', () => {
    assert.ok(profile.domMarkers);
    assert.ok(Array.isArray(profile.domMarkers.selectors));
    assert.ok(profile.domMarkers.selectors.length > 0);
  });

  it('domMarkers contains body selector', () => {
    assert.ok(profile.domMarkers.selectors.includes('body'));
  });

  it('exports targetFilter with titleContains', () => {
    assert.ok(profile.targetFilter);
    assert.ok(profile.targetFilter.titleContains);
    assert.strictEqual(profile.targetFilter.titleContains, 'userCodeAppPanel');
  });

  it('has helpText', () => {
    assert.ok(profile.helpText);
    assert.strictEqual(typeof profile.helpText, 'string');
    assert.ok(profile.helpText.includes('Google Apps Script'));
  });

  it('does not contain AFFOTECH identifiers', () => {
    const serialized = JSON.stringify(profile);
    assert.ok(!serialized.includes('AFFOTECH'));
    assert.ok(!serialized.includes('R&R'));
    assert.ok(!serialized.includes('Rony'));
    assert.ok(!serialized.includes('Mata Kucing'));
  });
});
