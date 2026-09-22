import test from 'node:test';
import assert from 'node:assert/strict';

test('intentional QA fixture CI failure', () => {
  assert.equal('ci-failure-fixture', 'this-test-must-fail', 'Intentional CI failure fixture: this PR must not be QA-ready.');
});
