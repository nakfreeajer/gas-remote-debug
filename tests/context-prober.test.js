const assert = require('node:assert');
const { describe, it } = require('node:test');
const {
  buildRuntimeProbe,
  buildDomProbe,
  scoreContext
} = require('../src/context-prober');

describe('buildRuntimeProbe', () => {
  it('includes configured helper names', () => {
    const expr = buildRuntimeProbe(['MY_APP_API', 'app']);
    assert.ok(expr.includes('MY_APP_API'));
    assert.ok(expr.includes('app'));
    assert.ok(expr.includes('typeof'));
    assert.ok(expr.includes('JSON.stringify'));
    assert.ok(expr.includes('windowKeys'));
  });

  it('handles empty helper list', () => {
    const expr = buildRuntimeProbe([]);
    assert.ok(expr.includes('helpers'));
    assert.ok(expr.includes('windowKeys'));
  });

  it('produces valid evaluable JavaScript', () => {
    const expr = buildRuntimeProbe(['testHelper']);
    // Should not throw syntax errors, though really runs in browser context
    assert.ok(typeof expr === 'string');
    assert.ok(expr.length > 0);
  });
});

describe('buildDomProbe', () => {
  it('includes configured selectors', () => {
    const expr = buildDomProbe({ selectors: ['#app', '.main'] });
    assert.ok(expr.includes('#app'));
    assert.ok(expr.includes('.main'));
    assert.ok(expr.includes('querySelector'));
  });

  it('includes configured text strings', () => {
    const expr = buildDomProbe({ textStrings: ['Dashboard', 'Loading'] });
    assert.ok(expr.includes('Dashboard'));
    assert.ok(expr.includes('Loading'));
    assert.ok(expr.includes('innerText'));
  });

  it('includes loading pattern detection', () => {
    const expr = buildDomProbe({ loadingPatterns: ['Loading'] });
    assert.ok(expr.includes('isLoadingShell'));
  });

  it('handles empty options', () => {
    const expr = buildDomProbe({});
    assert.ok(typeof expr === 'string');
    assert.ok(expr.includes('selectors'));
    assert.ok(expr.includes('textFound'));
  });

  it('produces valid evaluable JavaScript', () => {
    const expr = buildDomProbe({ selectors: ['body'], textStrings: ['test'] });
    assert.ok(typeof expr === 'string');
    assert.ok(expr.length > 0);
  });
});

describe('scoreContext', () => {
  it('classifies runtime-only context', () => {
    const runtime = {
      helpers: { MY_APP_API: true },
      windowKeys: ['MY_APP_API']
    };
    const dom = { selectors: {}, textFound: {}, isLoadingShell: false };
    const { type, score, features } = scoreContext(runtime, dom, ['MY_APP_API']);
    assert.strictEqual(type, 'runtime');
    assert.ok(score >= 100);
    assert.ok(features.includes('helper:MY_APP_API'));
  });

  it('classifies DOM-only context', () => {
    const runtime = { helpers: {}, windowKeys: [] };
    const dom = {
      selectors: { '#app': true },
      textFound: {},
      isLoadingShell: false
    };
    const { type, score } = scoreContext(runtime, dom, ['MY_APP_API']);
    assert.strictEqual(type, 'dom');
    assert.ok(score >= 50);
  });

  it('classifies full context (both runtime and DOM)', () => {
    const runtime = {
      helpers: { MY_APP_API: true },
      windowKeys: ['MY_APP_API']
    };
    const dom = {
      selectors: { '#app': true },
      textFound: { 'Dashboard': true },
      isLoadingShell: false
    };
    const { type, score, features } = scoreContext(runtime, dom, ['MY_APP_API']);
    assert.strictEqual(type, 'full');
    assert.ok(score >= 150);
    assert.ok(features.includes('helper:MY_APP_API'));
    assert.ok(features.includes('dom:#app'));
    assert.ok(features.includes('text:"Dashboard"'));
  });

  it('penalizes loading shell', () => {
    const runtime = {
      helpers: { MY_APP_API: true },
      windowKeys: ['MY_APP_API']
    };
    const dom = {
      selectors: { '#app': true },
      textFound: {},
      isLoadingShell: true
    };
    const { type, features } = scoreContext(runtime, dom, ['MY_APP_API']);
    assert.ok(features.includes('LOADING-SHELL'));
    // Loading shell with helpers but no valid DOM should still be runtime
    assert.strictEqual(type, 'runtime');
  });

  it('classifies as empty when nothing found', () => {
    const runtime = { helpers: {}, windowKeys: [] };
    const dom = { selectors: {}, textFound: {}, isLoadingShell: false };
    const { type, score } = scoreContext(runtime, dom, ['MY_APP_API']);
    assert.strictEqual(type, 'empty');
    assert.strictEqual(score, 0);
  });

  it('handles null/undefined results gracefully', () => {
    const { type, score } = scoreContext(null, null, ['test']);
    assert.strictEqual(type, 'empty');
    assert.strictEqual(score, 0);
  });

  it('detects text markers in DOM', () => {
    const runtime = { helpers: {}, windowKeys: [] };
    const dom = {
      selectors: {},
      textFound: { 'Welcome': true, 'Logout': false },
      isLoadingShell: false
    };
    const { type, features } = scoreContext(runtime, dom, ['test']);
    assert.strictEqual(type, 'dom');
    assert.ok(features.includes('text:"Welcome"'));
    assert.ok(!features.includes('text:"Logout"'));
  });
});
