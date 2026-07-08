const assert = require('node:assert');
const { describe, it } = require('node:test');
const { ExpressionGuard, DEFAULT_BLOCKED } = require('../src/safe-eval');

describe('ExpressionGuard', () => {
  const guard = new ExpressionGuard();

  it('allows harmless read expressions', () => {
    assert.doesNotThrow(() => guard.check('1 + 1'));
    assert.doesNotThrow(() => guard.check('document.title'));
    assert.doesNotThrow(() => guard.check('location.href'));
    assert.doesNotThrow(() => guard.check('navigator.userAgent'));
    assert.doesNotThrow(() => guard.check('JSON.stringify({a: 1})'));
  });

  it('blocks setValue', () => {
    assert.throws(() => guard.check('element.setValue(42)'), (err) => err.code === 'EXPRESSION_BLOCKED');
  });

  it('blocks setValues', () => {
    assert.throws(() => guard.check('range.setValues(data)'), (err) => err.code === 'EXPRESSION_BLOCKED');
  });

  it('blocks appendRow', () => {
    assert.throws(() => guard.check('sheet.appendRow(data)'), (err) => err.code === 'EXPRESSION_BLOCKED');
  });

  it('blocks deleteRow', () => {
    assert.throws(() => guard.check('sheet.deleteRow(1)'), (err) => err.code === 'EXPRESSION_BLOCKED');
  });

  it('blocks removeRow', () => {
    assert.throws(() => guard.check('sheet.removeRow(1)'), (err) => err.code === 'EXPRESSION_BLOCKED');
  });

  it('blocks insertRow', () => {
    assert.throws(() => guard.check('sheet.insertRow(1)'), (err) => err.code === 'EXPRESSION_BLOCKED');
  });

  it('blocks fetch(', () => {
    assert.throws(() => guard.check('fetch(url)'), (err) => err.code === 'EXPRESSION_BLOCKED');
  });

  it('blocks XMLHttpRequest', () => {
    assert.throws(() => guard.check('new XMLHttpRequest()'), (err) => err.code === 'EXPRESSION_BLOCKED');
  });

  it('blocks eval(', () => {
    assert.throws(() => guard.check('eval(code)'), (err) => err.code === 'EXPRESSION_BLOCKED');
  });

  it('blocks Function(', () => {
    assert.throws(() => guard.check('new Function("return 1")'), (err) => err.code === 'EXPRESSION_BLOCKED');
  });

  it('blocks import(', () => {
    assert.throws(() => guard.check('import("fs")'), (err) => err.code === 'EXPRESSION_BLOCKED');
  });

  it('blocks child_process', () => {
    assert.throws(() => guard.check('require("child_process")'), (err) => err.code === 'EXPRESSION_BLOCKED');
  });

  it('blocks process.exit', () => {
    assert.throws(() => guard.check('process.exit(1)'), (err) => err.code === 'EXPRESSION_BLOCKED');
  });

  it('blocks exec(', () => {
    assert.throws(() => guard.check('exec("rm -rf /")'), (err) => err.code === 'EXPRESSION_BLOCKED');
  });

  it('blocks .save(', () => {
    assert.throws(() => guard.check('obj.save()'), (err) => err.code === 'EXPRESSION_BLOCKED');
  });

  it('blocks .write(', () => {
    assert.throws(() => guard.check('fs.write(fd, buf)'), (err) => err.code === 'EXPRESSION_BLOCKED');
  });

  it('blocks .post(', () => {
    assert.throws(() => guard.check('http.post(url)'), (err) => err.code === 'EXPRESSION_BLOCKED');
  });

  it('blocks .put(', () => {
    assert.throws(() => guard.check('http.put(url)'), (err) => err.code === 'EXPRESSION_BLOCKED');
  });

  it('blocks .patch(', () => {
    assert.throws(() => guard.check('http.patch(url)'), (err) => err.code === 'EXPRESSION_BLOCKED');
  });

  it('blocks .delete(', () => {
    assert.throws(() => guard.check('http.delete(url)'), (err) => err.code === 'EXPRESSION_BLOCKED');
  });

  it('blocks clear', () => {
    assert.throws(() => guard.check('sheet.clear()'), (err) => err.code === 'EXPRESSION_BLOCKED');
  });

  it('blocks destroy', () => {
    assert.throws(() => guard.check('obj.destroy()'), (err) => err.code === 'EXPRESSION_BLOCKED');
  });

  it('blocks truncate', () => {
    assert.throws(() => guard.check('db.truncate()'), (err) => err.code === 'EXPRESSION_BLOCKED');
  });

  it('blocks drop', () => {
    assert.throws(() => guard.check('table.drop()'), (err) => err.code === 'EXPRESSION_BLOCKED');
  });

  it('blocks require(', () => {
    assert.throws(() => guard.check('require("fs")'), (err) => err.code === 'EXPRESSION_BLOCKED');
  });

  it('blocks module.exports', () => {
    assert.throws(() => guard.check('module.exports = {}'), (err) => err.code === 'EXPRESSION_BLOCKED');
  });

  it('permissive mode returns warnings instead of throwing', () => {
    const permissive = ExpressionGuard.permissive();
    const result = permissive.check('element.setValue(42)');
    assert.strictEqual(result.safe, true);
    assert.ok(result.warnings.length > 0);
  });

  it('allowDangerous bypasses block', () => {
    const result = guard.check('element.setValue(42)', true);
    assert.strictEqual(result.safe, true);
    assert.ok(result.warnings.length > 0);
  });

  it('getDefaultBlocked returns a copy', () => {
    const list = ExpressionGuard.getDefaultBlocked();
    assert.ok(Array.isArray(list));
    assert.ok(list.length > 0);
    assert.ok(list.includes('setValue'));
    assert.ok(list.includes('eval('));
    assert.ok(list.includes('fetch('));
  });

  it('extraBlocked adds custom tokens', () => {
    const custom = new ExpressionGuard({ extraBlocked: ['MY_CUSTOM_DANGEROUS'] });
    assert.throws(() => custom.check('MY_CUSTOM_DANGEROUS'), (err) => err.code === 'EXPRESSION_BLOCKED');
  });

  it('DEFAULT_BLOCKED does not contain duplicates', () => {
    const seen = new Set();
    const dupes = DEFAULT_BLOCKED.filter(t => {
      if (seen.has(t)) return true;
      seen.add(t);
      return false;
    });
    assert.strictEqual(dupes.length, 0, `duplicates found: ${dupes.join(', ')}`);
  });
});
