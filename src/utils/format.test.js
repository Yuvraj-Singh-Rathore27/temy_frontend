// Run: node --test src/utils/format.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { initials } from './format.js';

test('first letters of the first and last word', () => {
  assert.equal(initials('Aarav Sharma'), 'AS');
  assert.equal(initials('aarav kumar sharma'), 'AS');
  assert.equal(initials('Priya'), 'P');
  assert.equal(initials('  Neha   Gupta  '), 'NG');
  assert.equal(initials('Élodie Durand'), 'ÉD');
  assert.equal(initials('प्रिया पटेल'), 'पप');
});

test('empty names fall back to "?"', () => {
  assert.equal(initials(''), '?');
  assert.equal(initials('   '), '?');
  assert.equal(initials(undefined), '?');
});

test('emoji in a name never produce a broken character', () => {
  // Before the fix these returned half of the emoji's surrogate pair ("P\uD83D").
  for (const name of ['Product Launch 🚀', '🚀 Launch', '🔥Rahul Verma', 'Team 👨‍👩‍👧', 'Weekend 🏖️ Trip']) {
    const result = initials(name);
    assert.ok(result.isWellFormed(), `"${name}" gave a broken string: ${JSON.stringify(result)}`);
  }
  assert.equal(initials('Product Launch 🚀'), 'PL');
  assert.equal(initials('🚀 Launch'), 'L');
  assert.equal(initials('🔥Rahul Verma'), 'RV');
  assert.equal(initials('Weekend 🏖️ Trip'), 'WT');
});

test('a name made only of emoji shows the first whole emoji', () => {
  assert.equal(initials('🚀'), '🚀');
  assert.equal(initials('🎉 🚀'), '🎉');
  assert.equal(initials('👨‍👩‍👧 Family'.split(' ')[0]), '👨‍👩‍👧');
});
