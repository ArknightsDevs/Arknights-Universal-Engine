// The field-ownership rule (ADR 0045) with ESLint's RuleTester: every write form, allowed and foreign files, the glob matcher,
// what is ignored (computed keys, object literals, bare identifiers) and the aueConfig wiring.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RuleTester } from 'eslint';
import { fieldOwnership, globToRegExp, matchesAny } from '../src/field-ownership.js';
import { aueConfig } from '../src/index.js';

RuleTester.describe = (_name, fn) => fn();
RuleTester.it = (name, fn) => test(name, fn);
RuleTester.itOnly = (name, fn) => test.only(name, fn);

const root = process.cwd();
const fields = { hp: ['packages/sim/src/damage.js', 'packages/sim/src/status/**'], buffs: ['packages/sim/src/buffs/*.js'] };
const options = [{ fields, root }];
const OWN = `${root}/packages/sim/src/damage.js`;
const FOREIGN = `${root}/packages/render/src/draw.js`;
const message = (/** @type {string} */ field, /** @type {string} */ owners) => ({ message: `Only ${owners} may write the unit field "${field}" (ADR 0045).` });
const HP = message('hp', 'packages/sim/src/damage.js, packages/sim/src/status/**');

const tester = new RuleTester({ languageOptions: { ecmaVersion: 'latest', sourceType: 'module' } });

/** @param {string[]} codes */
const bad = (codes, expected = HP) => codes.map((code) => ({ code, filename: FOREIGN, options, errors: [expected] }));

tester.run('field-ownership', fieldOwnership, {
  valid: [
    ...[
      'x.hp = 1;', 'x.hp -= 2;', 'x.hp++;', 'delete x.hp;', "x['hp'] = 1;", 'this.hp = 1;', 'Object.assign(x, { hp: 1 });', '({ a: x.hp } = o);',
    ].map((code) => ({ code, filename: OWN, options })),
    { code: 'x.hp = 1;', filename: `${root}/packages/sim/src/status/burn/tick.js`, options },
    { code: 'x.buffs = [];', filename: `${root}/packages/sim/src/buffs/a.js`, options },
    // fields outside the table are free
    { code: 'x.atk = 1; x.atk++; delete x.atk;', filename: FOREIGN, options },
    // reads, bare identifiers, creation, comparisons
    { code: 'let hp = 1; hp = 2; const y = x.hp; if (x.hp === 3) y();', filename: FOREIGN, options },
    { code: 'const u = { hp: 1, buffs: [] }; function f() { return { hp: 2 }; }', filename: FOREIGN, options },
    // computed non-literal keys, private names and non-literal assign sources are not visible
    { code: 'x[k] = 1; x[`hp`] = 2; Object.assign(x, src); Object.assign({ hp: 1 });', filename: FOREIGN, options },
    { code: 'class A { #hp = 0; m() { this.#hp = 1; } }', filename: FOREIGN, options },
    { code: 'Object.assign(x, { [k]: 1, ...s }); Other.assign(x, { hp: 1 }); o.assign(x, { hp: 1 }); Object["assign"](x, { atk: 1 });', filename: FOREIGN, options },
    { code: 'for (const hp of xs) f(hp); for (var k in o) f(k);', filename: FOREIGN, options },
    { code: 'x.hp = 1;', filename: FOREIGN, options: [{ fields: {}, root }] },
    { code: 'x.hp = 1;', filename: FOREIGN },
    { code: 'x.hp = 1;', filename: `${root}/other/place.js`, options: [{ fields: { hp: ['**'] }, root }] },
  ],
  invalid: [
    ...bad([
      'x.hp = 1;', 'x.hp += 1;', 'x.hp ??= 1;', 'x.hp ||= 1;', 'x.hp &&= 1;', 'x.hp++;', '--x.hp;', "x['hp'] = 1;", 'delete x.hp;',
      'this.hp = 1;', '({ a: x.hp } = o);', '[x.hp] = arr;', '[, x.hp] = arr;', '({ ...x.hp } = o);', '[...x.hp] = arr;', '({ a: x.hp = 3 } = o);',
      'for (x.hp of xs);', 'for (x.hp in o);', 'delete x?.hp;', 'Object.assign(x, { hp: 1 });', "Object.assign(x, { 'hp': 1 });",
      'Object.assign(x, y, { hp: 1 });', 'a.b.c.hp = 1;',
    ]),
    { code: 'Object.assign(x, { hp: 1 }, { hp: 2 });', filename: FOREIGN, options, errors: [HP, HP] },
    { code: 'x.hp = 1; x.atk = 2; x.buffs = [];', filename: FOREIGN, options, errors: [HP, message('buffs', 'packages/sim/src/buffs/*.js')] },
    { code: 'x.hp = 1;', filename: `${root}/packages/sim/src/status/a.js/../../damage2.js`, options, errors: [HP] },
    { code: 'x.hp = 1;', filename: `${root}/packages/sim/src/damage.js.bak`, options, errors: [HP] },
    { code: 'x.buffs = 1;', filename: `${root}/packages/sim/src/buffs/deep/a.js`, options, errors: [message('buffs', 'packages/sim/src/buffs/*.js')] },
    { code: 'x.hp = 1;', filename: FOREIGN, options: [{ fields: { hp: ['a.js'] }, root: `${root}/packages` }], errors: [message('hp', 'a.js')] },
  ],
});

test('globToRegExp: literals, *, ** and ?', () => {
  assert.ok(globToRegExp('a/b.js').test('a/b.js'));
  assert.ok(!globToRegExp('a/b.js').test('a/bxjs'));
  assert.ok(globToRegExp('a/*.js').test('a/b.js'));
  assert.ok(!globToRegExp('a/*.js').test('a/b/c.js'));
  assert.ok(globToRegExp('a/**').test('a/b/c/d.js'));
  assert.ok(globToRegExp('a/**/z.js').test('a/z.js'));
  assert.ok(globToRegExp('a/**/z.js').test('a/b/c/z.js'));
  assert.ok(!globToRegExp('a/**/z.js').test('a/b/y.js'));
  assert.ok(globToRegExp('**/z.js').test('z.js'));
  assert.ok(globToRegExp('a?.js').test('ab.js'));
  assert.ok(!globToRegExp('a?.js').test('a/.js'));
  assert.ok(!globToRegExp('a.js').test('abjs'));
  assert.ok(globToRegExp('a+(b)[c]{d}|e^$.js').test('a+(b)[c]{d}|e^$.js'));
});

test('matchesAny: any glob is enough', () => {
  assert.equal(matchesAny('a/b.js', ['x/**', 'a/*.js']), true);
  assert.equal(matchesAny('a/b.js', []), false);
});

test('aueConfig: fieldOwnership adds one block that exempts tests; absent by default', () => {
  const table = { hp: ['packages/sim/src/damage.js'] };
  const config = aueConfig({ fieldOwnership: { files: ['packages/sim/**'], fields: table } });
  const block = config.find((c) => c.rules && 'aue/field-ownership' in c.rules);
  assert.deepEqual(block?.files, ['packages/sim/**']);
  assert.deepEqual(block?.ignores, ['**/test/**/*.js', '**/test/**/*.mjs']);
  assert.deepEqual(block?.rules?.['aue/field-ownership'], ['error', { fields: table }]);
  assert.equal(aueConfig().some((c) => c.rules && 'aue/field-ownership' in c.rules), false);
});
