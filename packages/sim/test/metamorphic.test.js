// Metamorphic tests (ADR 0042): changes to the input with a known effect on the output. Moving everything by whole
// tiles moves the range and keeps the choice; turning the attacker with its range turns the tiles; scaling every
// amount by a power of two scales the damage exactly; renumbering the units changes no order.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { rangeKeys, sortEnemies, sortAllies } from '../src/targeting.js';
import { rotateOffset } from '../src/dir.js';
import { mitigate } from '../src/damage.js';
import { makeBuff } from '../src/buffs.js';

const SEED = 20261011, G = { rows: 40, cols: 40 };
const NO_PEN = Object.freeze({ defIgnorePct: 0, defIgnoreFlat: 0, resIgnorePct: 0, resIgnoreFlat: 0 });
const DIRS = /** @type {const} */ (['UP', 'RIGHT', 'DOWN', 'LEFT']);
const offsets = fc.uniqueArray(fc.record({ row: fc.integer({ min: -3, max: 3 }), col: fc.integer({ min: -2, max: 4 }) }),
  { minLength: 1, maxLength: 10, selector: (o) => `${o.row},${o.col}` });

/** @param {number} id @param {Record<string, unknown>} [o] @returns {any} */
const unit = (id, o = {}) => ({ id, kind: 1, base: { tauntLevel: 0 }, buffs: [], hp: 100, blockedBy: -1, born: 0, bornN: id, ...o });
/** @param {Set<number>} keys @param {number} dr @param {number} dc */
const shift = (keys, dr, dc) => new Set([...keys].map((k) => k + dr * G.cols + dc));

test('[索敌-1] moving the attacker by whole tiles moves its range tiles the same way', () => {
  fc.assert(fc.property(offsets, fc.constantFrom(...DIRS), fc.integer({ min: 0, max: 2 }), fc.integer({ min: -5, max: 5 }), fc.integer({ min: -5, max: 5 }),
    (offs, dir, extend, dr, dc) => {
      const a = rangeKeys(G, { x: 20, y: 20, dir }, offs, extend), b = rangeKeys(G, { x: 20 + dc, y: 20 + dr, dir }, offs, extend);
      assert.deepEqual([...b].sort((p, q) => p - q), [...shift(a, dr, dc)].sort((p, q) => p - q));
    }), { seed: SEED, numRuns: 300 });
});

test('[索敌-1] a range written already turned, faced RIGHT, covers what the original covers facing that way', () => {
  fc.assert(fc.property(offsets, fc.constantFrom(...DIRS), (offs, dir) => {
    const turned = offs.map((o) => { const [row, col] = rotateOffset(o.row, o.col, dir); return { row, col }; });
    assert.deepEqual(rangeKeys(G, { x: 20, y: 20, dir }, offs), rangeKeys(G, { x: 20, y: 20, dir: 'RIGHT' }, turned));
  }), { seed: SEED, numRuns: 300 });
});

test('[伤害-1] [伤害-3] [伤害-5] scaling every amount by a power of two scales the damage exactly', () => {
  // normal numbers only: a power of two scales a subnormal inexactly
  const amt = fc.oneof(fc.constant(0), fc.double({ min: 1e-3, max: 1e5, noNaN: true })), k = fc.constantFrom(0.25, 0.5, 2, 4, 1024);
  const def = fc.oneof(fc.constant(0), fc.double({ min: 1e-3, max: 5000, noNaN: true }));
  fc.assert(fc.property(amt, def, fc.double({ min: 0, max: 100, noNaN: true }), k, (a, d, r, s) => {
    const t = { def: d, res: r, epDamageResistance: r };
    assert.ok(Object.is(mitigate(a * s, 'phys', { ...t, def: d * s }, NO_PEN), mitigate(a, 'phys', t, NO_PEN) * s));
    assert.ok(Object.is(mitigate(a * s, 'arts', t, NO_PEN), mitigate(a, 'arts', t, NO_PEN) * s));
    assert.ok(Object.is(mitigate(a * s, 'elemental', t, NO_PEN), mitigate(a, 'elemental', t, NO_PEN) * s));
  }), { seed: SEED, numRuns: 500 });
});

test('[索敌-3] [索敌-5] renumbering the units changes no order; only the creation order and the stats count', () => {
  fc.assert(fc.property(fc.array(fc.integer({ min: 0, max: 200 }), { minLength: 1, maxLength: 8 }), fc.integer({ min: 1, max: 1000 }), (dists, off) => {
    const att = unit(500), enemies = dists.map((d, i) => unit(i + 1, { d }));
    const renamed = enemies.map((e) => ({ ...e, id: e.id + off }));
    const order = (/** @type {any[]} */ es) => sortEnemies(att, es, { blockedFirst: true, pathDist: (e) => /** @type {any} */ (e).d / 10 + 0.05 })
      .map((e) => es.indexOf(e));
    assert.deepEqual(order(renamed), order(enemies));
    const allies = dists.map((d, i) => unit(i + 1, { born: d, bornN: 1 }));
    const relabeled = allies.map((a) => ({ ...a, id: a.id + off }));
    const ally = (/** @type {any[]} */ as) => sortAllies(unit(900), as, 30).map((a) => as.indexOf(a));
    assert.deepEqual(ally(relabeled), ally(allies));
  }), { seed: SEED, numRuns: 300 });
});

test('[索敌-3] a neutral buff on a candidate changes no order', () => {
  fc.assert(fc.property(fc.array(fc.integer({ min: 0, max: 200 }), { minLength: 2, maxLength: 8 }), fc.nat(7), (dists, which) => {
    const es = dists.map((d, i) => unit(i + 1, { d }));
    const o = { blockedFirst: true, pathDist: (/** @type {any} */ e) => e.d / 10 + 0.05 };
    const before = sortEnemies(unit(99), es, o).map((e) => e.id);
    es[which % es.length].buffs.push(makeBuff({ key: 'n', mods: { taunt: 0, atkMul: 1 } }));
    assert.deepEqual(sortEnemies(unit(99), es, o).map((e) => e.id), before);
  }), { seed: SEED, numRuns: 300 });
});
