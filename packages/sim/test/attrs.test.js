// Attributes (docs/spec/attributes.md 属性-1…5): equal bit for bit to the pinned Stronghold oracle on random bases and
// buffs where the two agree, the registered differences at the extremes (DIF-0009), the bounds of the table, the HP
// ratio on a change of the maximum, and the attack interval in whole frames against an independent exact computation.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { loadOracle } from '@aue/testkit';
import { ATTRS, JUDGE_KEYS, activeBuffs, aggregate, statsOf, intervalSeconds, intervalFrames } from '../src/attrs.js';
import { makeBuff, refreshHp, addBuff, removeBuff } from '../src/buffs.js';

/** @typedef {import('../src/types.js').Unit} Unit */

const SEED = 20261011;
/** @type {any} */
let SU;
/** @type {any} */
let SB;
before(async () => {
  SU = await loadOracle('server/sim/units.js');
  SB = await loadOracle('server/sim/buffs.js');
});

/** Same bits (−0 ≠ 0, NaN = NaN). @param {number} a @param {number} b */
const same = (a, b) => Object.is(a, b);
/** A unit of the given base and buffs, as statsOf reads it. @param {Record<string, any>} base @param {any[]} buffs @returns {Pick<Unit, 'base' | 'buffs'>} */
const unitOf = (base, buffs) => /** @type {any} */ ({ base, buffs });
/** @param {string} key @param {Record<string, number>} mods @param {number} [stacks] */
const buff = (key, mods, stacks = 1) => makeBuff({ key, mods, stacks });

const BASE_FIELDS = { maxHp: 1000, atk: 300, def: 100, res: 10, aspd: 100, bat: 1, blockCnt: 0, moveSpeed: 1, spRecovery: 1, tauntLevel: 0, massLevel: 1, hpRecoveryPerSec: 0 };

/** The oracle's stats of a base and raw buffs. @param {Record<string, number>} base @param {{ key: string, stacks: number, mods: Record<string, number> }[]} raws */
function oracleStats(base, raws) {
  const u = new SU.Unit({ id: 1, side: 'enemy', kind: 'x', base: { ...BASE_FIELDS, ...base } });
  u.alive = true;
  u.hp = u.base.maxHp;
  for (const r of raws) u.buffs.push({ key: r.key, stacks: r.stacks, mods: { ...r.mods } });
  u.markDirty();
  return u.s;
}

// ---- generators (the keys and ranges where the oracle and we agree) ----
/** @type {Record<string, [number, number]>} */
const RANGE = {
  hpFlat: [-50, 500], hpPct: [-0.1, 2], hpMul: [0.5, 2], atkFlat: [-50, 500], atkPct: [-0.1, 2], atkFinal: [-50, 500], atkMul: [0.5, 2],
  defFlat: [-50, 500], defPct: [-0.1, 2], defMul: [0.5, 2], resFlat: [-20, 50], resMul: [0.5, 2], aspd: [-40, 100], batPct: [-0.1, 1],
  moveFlat: [-0.5, 1], moveMul: [0.5, 2], spRecoveryFlat: [-0.5, 2], spRecoveryMul: [0.5, 2], massFlat: [-2, 5],
  dmgDealtMul: [0.5, 2], physDealtMul: [0.5, 2], artsDealtMul: [0.5, 2], healingDealtMul: [0.5, 2], healingTakenMul: [0.5, 2], atkScaleMul: [0.5, 2],
};
const KEYS = Object.keys(RANGE);
const num = (/** @type {number} */ min, /** @type {number} */ max) => fc.double({ min, max, noNaN: true });
const entry = fc.constantFrom(...KEYS).chain((k) => num(RANGE[k][0], RANGE[k][1]).map((v) => /** @type {[string, number]} */ ([k, v])));
/** Buffs of distinct keys, so every one is active. */
const buffsArb = fc.array(fc.record({ mods: fc.array(entry, { minLength: 1, maxLength: 4 }), stacks: fc.integer({ min: 1, max: 3 }) }), { maxLength: 4 })
  .map((a) => a.map((b, i) => ({ key: `b${i}`, stacks: b.stacks, mods: Object.fromEntries(b.mods) })));
const baseArb = fc.record({
  maxHp: num(1, 1e5), atk: num(0, 5000), def: num(0, 5000), res: num(0, 100), aspd: num(50, 200), bat: num(0.5, 3),
  moveSpeed: num(0.2, 3), spRecovery: num(0, 3), tauntLevel: fc.constant(0), massLevel: fc.integer({ min: 0, max: 5 }),
});
/** @param {{ key: string, stacks: number, mods: Record<string, number> }[]} raws */
const ours = (raws) => raws.map((r) => makeBuff(r));

const COMPARED = ['maxHp', 'atk', 'def', 'res', 'aspd', 'bat', 'moveSpeed', 'spRecovery', 'massLevel'];
const CHANNEL_KEYS = ['dmgDealtMul', 'physDealtMul', 'artsDealtMul', 'healingDealtMul', 'healingTakenMul', 'atkScaleMul'];

/** Where the oracle and we agree (DIF-0009 lies outside): pct sums above −0.9, aspd, move speed and mass off their bounds. @param {Record<string, number>} base @param {ReturnType<typeof statsOf>} s @param {any} o */
function inAgreement(base, s, o) {
  const pcts = ['hpPct', 'atkPct', 'defPct', 'batPct'].every((k) => (s.sum[k] ?? 0) > -0.9);
  const rawAspd = base.aspd + (s.sum.aspd ?? 0);
  return pcts && rawAspd >= 20 && rawAspd <= 600 && o.moveSpeed >= 0.1 && s.massLevel >= 0;
}

test('[属性-1] [属性-2] statsOf: the oracle\'s bits for every attribute, the interval and the multiplier channels', () => {
  fc.assert(fc.property(baseArb, buffsArb, (base, raws) => {
    const s = statsOf(unitOf({ ...BASE_FIELDS, ...base }, ours(raws)));
    const o = oracleStats(base, raws);
    fc.pre(inAgreement({ ...BASE_FIELDS, ...base }, s, o));
    for (const k of [...COMPARED, ...CHANNEL_KEYS]) assert.ok(same(/** @type {any} */ (s)[k], o[k]), `${k}: ${/** @type {any} */ (s)[k]} vs ${o[k]}`);
    assert.ok(same(s.interval, o.interval), `interval: ${s.interval} vs ${o.interval}`);
    assert.ok(same(s.interval, intervalSeconds(s.bat, s.aspd)));
  }), { seed: SEED, numRuns: 300 });
});

test('[属性-2] aggregate: the oracle\'s sums and products of every key but the judge keys', () => {
  fc.assert(fc.property(buffsArb, (raws) => {
    const a = aggregate(ours(raws)), o = SB.aggregateMods(raws);
    assert.deepEqual(Object.keys(a.sum).sort(), Object.keys(o.add).sort());
    assert.deepEqual(Object.keys(a.prod).sort(), Object.keys(o.mul).sort());
    for (const k of Object.keys(a.sum)) assert.ok(same(a.sum[k], o.add[k]), k);
    for (const k of Object.keys(a.prod)) assert.ok(same(a.prod[k], o.mul[k]), k);
  }), { seed: SEED, numRuns: 300 });
});

test('[属性-2] keys: …Mul multiplies, the rest add, judge keys and non-finite values are left out, stacks count', () => {
  const a = aggregate([
    buff('a', { fooMul: 2, fooBar: 3, dmgTakenMul: 5, dodgePhys: 0.5, bad: NaN, worse: Infinity, atkMul: 3 }, 3),
    buff('b', { fooMul: 0.5, fooBar: 1, hpPct: 0.25 }),
  ]);
  assert.deepEqual(a.sum, { fooBar: 10, hpPct: 0.25 });
  assert.deepEqual(a.prod, { fooMul: 4, atkMul: 27 });
  for (const k of JUDGE_KEYS) assert.ok(!(k in a.sum) && !(k in a.prod), k);
  assert.deepEqual(JUDGE_KEYS.slice().sort(), ['artsTakenMul', 'dmgTakenMul', 'dodgeArts', 'dodgePhys', 'elementalTakenMul', 'physTakenMul', 'trueTakenMul']);
});

test('[属性-2] order: buffs are summed in list order, which changes the float bits', () => {
  const vals = [0.1, 0.2, 0.3];
  const mk = (/** @type {number[]} */ vs) => vs.map((v, i) => buff(`k${i}`, { atkFlat: v, atkMul: v }));
  const fwd = aggregate(mk(vals)), rev = aggregate(mk([...vals].reverse()));
  assert.ok(same(fwd.sum.atkFlat, 0.1 + 0.2 + 0.3));
  assert.ok(same(rev.sum.atkFlat, 0.3 + 0.2 + 0.1));
  assert.notEqual(fwd.sum.atkFlat, rev.sum.atkFlat);
  assert.ok(same(fwd.prod.atkMul, 0.1 * 0.2 * 0.3));
  assert.ok(same(rev.prod.atkMul, 0.3 * 0.2 * 0.1));
  assert.notEqual(fwd.prod.atkMul, rev.prod.atkMul);
  assert.ok(same(statsOf(unitOf({ atk: 0 }, mk(vals))).atk, ((0 + (0.1 + 0.2 + 0.3)) * 1 + 0) * (0.1 * 0.2 * 0.3)));
});

test('[属性-1] formula: (A + D_p) × max(0, 1 + D_t) + F_p, then × F_t; missing base values take the defaults', () => {
  const s = statsOf(unitOf({ atk: 100 }, [buff('a', { atkFlat: 20, atkPct: 0.5, atkFinal: 7, atkMul: 2 })]));
  assert.equal(s.atk, ((100 + 20) * 1.5 + 7) * 2);
  assert.equal(statsOf(unitOf({ atk: 100 }, [buff('a', { atkPct: -3 })])).atk, 0, '1 + D_t < 0 counts as 0');
  const d = statsOf(unitOf({}, []));
  assert.deepEqual([d.maxHp, d.atk, d.def, d.res, d.aspd, d.bat, d.moveSpeed, d.taunt, d.massLevel, d.spRecovery, d.statusRes], [1, 0, 0, 0, 100, 1, 1, 0, 0, 1, 1]);
  assert.equal(d.interval, 1);
  assert.equal(statsOf(unitOf({ aspd: 100 }, [buff('a', { aspd: 30 }, 2)])).aspd, 160, 'aspd\'s 直接加算 key is the bare name, stacked');
});

/** The spec's table: attribute → [lower, upper] bound, null for none (属性-3). */
const TABLE = {
  maxHp: [1, null], atk: [0, null], def: [0, null], res: [0, 100], aspd: [20, null], bat: [0, null], blockCnt: [0, null], moveSpeed: [0.1, null],
  taunt: [-2, 2], massLevel: [null, null], rangeExtend: [null, null], spRecovery: [0, null], hpRecoveryPerSec: [0, null],
  defIgnorePct: [0, 1], resIgnorePct: [0, 1], defIgnoreFlat: [0, null], resIgnoreFlat: [0, null], statusRes: [0.001, 1000],
  epDamageResistance: [0, 100], epResistance: [0, 100], maxEp: [0, null],
};

test('[属性-3] bounds: every attribute stops at its limits of the spec table, and ATTRS says the same', () => {
  assert.deepEqual(Object.keys(TABLE).sort(), Object.keys(ATTRS).sort());
  for (const [name, [lo, hi]] of Object.entries(TABLE)) {
    const a = /** @type {Record<string, any>} */ (ATTRS)[name], key = a.keys[0];
    assert.equal(a.lo, lo ?? -Infinity, `${name} lo`);
    assert.equal(a.hi, hi ?? Infinity, `${name} hi`);
    const low = /** @type {Record<string, number>} */ (/** @type {unknown} */ (statsOf(unitOf({}, [buff('x', { [key]: -1e9 })]))))[name];
    const high = /** @type {Record<string, number>} */ (/** @type {unknown} */ (statsOf(unitOf({}, [buff('x', { [key]: 1e9 })]))))[name];
    assert.ok(lo === null ? low < -1e8 : low === lo, `${name} floor is reached`);
    assert.ok(hi === null ? high > 1e8 : high === hi, `${name} ceiling`);
  }
});

test('[属性-3] DIF-0009: where PRTS\'s ranges and the oracle\'s differ, we follow PRTS', () => {
  const pair = (/** @type {Record<string, number>} */ base, /** @type {Record<string, number>} */ mods) =>
    [statsOf(unitOf({ ...BASE_FIELDS, ...base }, [buff('x', mods)])), oracleStats(base, [{ key: 'x', stacks: 1, mods }])];
  let [s, o] = pair({ moveSpeed: 1 }, { moveFlat: -5 });
  assert.equal(s.moveSpeed, 0.1); assert.equal(o.moveSpeed, 0);
  [s, o] = pair({ aspd: 100, bat: 2 }, { aspd: 900 });
  assert.equal(s.aspd, 1000); assert.equal(o.aspd, 600);
  assert.ok(same(s.interval, o.interval), 'the interval is capped at 600 either way');
  assert.equal(s.interval, 200 / 600);
  [s, o] = pair({ bat: 2 }, { batPct: -2 });
  assert.equal(s.bat, 0); assert.equal(o.bat, 0.2);
  [s, o] = pair({ bat: 2 }, { batPct: -0.95 });
  assert.ok(same(s.bat, 2 * (1 + -0.95))); assert.equal(o.bat, 0.2);
  [s, o] = pair({ tauntLevel: 0 }, { taunt: 5 });
  assert.equal(s.taunt, 2); assert.equal(o.taunt, 5);
  [s, o] = pair({ tauntLevel: 0 }, { taunt: -5 });
  assert.equal(s.taunt, -2); assert.equal(o.taunt, -5);
  [s, o] = pair({ massLevel: 1 }, { massFlat: -5 });
  assert.equal(s.massLevel, -4); assert.equal(o.massLevel, 0);
  [s, o] = pair({}, { defIgnoreFlat: -5, resIgnoreFlat: -3 });
  assert.deepEqual([s.defIgnoreFlat, s.resIgnoreFlat], [0, 0]);
  assert.deepEqual([o.defIgnoreFlat, o.resIgnoreFlat], [-5, -3]);
});

/** A unit as refreshHp reads it. @param {number} hp @returns {Unit} */
const hpUnit = (hp) => /** @type {any} */ ({ base: { maxHp: 1000 }, buffs: [], hp, maxHp: 1000 });

test('[属性-4] refreshHp: HP keeps its ratio to the maximum, a dead unit stays dead, removing restores', () => {
  const u = hpUnit(300);
  const b = buff('big', { hpMul: 2 });
  u.buffs.push(b);
  refreshHp(u);
  assert.deepEqual([u.hp, u.maxHp], [600, 2000]);
  u.buffs = [];
  refreshHp(u);
  assert.deepEqual([u.hp, u.maxHp], [300, 1000]);
  const dead = hpUnit(0);
  dead.buffs.push(b);
  refreshHp(dead);
  assert.deepEqual([dead.hp, dead.maxHp], [0, 2000]);
  refreshHp(dead);
  assert.equal(dead.hp, 0);
  const v = hpUnit(300);
  addBuff(v, buff('big', { hpMul: 2 }));
  assert.deepEqual([v.hp, v.maxHp], [600, 2000]);
  assert.equal(removeBuff(v, 'big'), 1);
  assert.deepEqual([v.hp, v.maxHp], [300, 1000]);
});

test('[属性-4] refreshHp: the oracle\'s bits for the scaled HP', () => {
  fc.assert(fc.property(num(1, 1e5), num(0, 1), num(1.01, 3), (maxHp, ratio, mul) => {
    const hp = maxHp * ratio, u = /** @type {Unit} */ (/** @type {any} */ ({ base: { maxHp }, buffs: [], hp, maxHp }));
    u.buffs.push(buff('m', { hpMul: mul }));
    refreshHp(u);
    const o = new SU.Unit({ id: 1, side: 'ally', kind: 'x', base: { ...BASE_FIELDS, maxHp } });
    o.alive = true; o.hp = hp;
    void o.s;
    o.buffs.push({ key: 'm', stacks: 1, mods: { hpMul: mul } });
    o.markDirty();
    assert.ok(same(o.s.maxHp, u.maxHp));
    assert.ok(same(o.hp, u.hp), `${o.hp} vs ${u.hp}`);
  }), { seed: SEED, numRuns: 300 });
});

/** The frames of T₀ seconds at S percent, exactly: round half up of 30 × 100 × T₀ / S on the decimal strings (属性-5). @param {number} t @param {number} s */
function exactFrames(t, s) {
  /** @param {number} x @returns {[bigint, number]} */
  const parts = (x) => {
    const [i, f = ''] = String(x).split('.');
    return [BigInt(i + f), f.length];
  };
  const [tm, tf] = parts(t), [sm, sf] = parts(s);
  const num = tm * 3000n * 10n ** BigInt(sf), den = sm * 10n ** BigInt(tf);
  return Number((2n * num + den) / (2n * den));
}

test('[属性-5] intervalFrames: the exact rational result on random decimals, halves rounded up', () => {
  const bat = fc.integer({ min: 10, max: 300 }).map((k) => Number((k / 100).toFixed(2)));
  const aspd = fc.oneof(fc.integer({ min: 10, max: 600 }), fc.integer({ min: 10, max: 599 }).map((k) => k + 0.5), fc.integer({ min: 100, max: 6000 }).map((k) => k / 10));
  fc.assert(fc.property(bat, aspd, (t, s) => intervalFrames(t, s) === exactFrames(t, s)), { seed: SEED, numRuns: 3000 });
  assert.equal(exactFrames(1.05, 100), 32);
});

test('[属性-5] intervalFrames: the spec\'s examples and the clamp of the speed to 10–600', () => {
  assert.equal(intervalFrames(1.6, 130), 37);
  assert.equal(intervalFrames(1, 100), 30);
  assert.equal(intervalFrames(1.05, 100), 32);
  assert.equal(intervalFrames(1, 600), 5);
  assert.equal(intervalFrames(1, 700), intervalFrames(1, 600));
  assert.equal(intervalFrames(1, 5), intervalFrames(1, 10));
  assert.equal(intervalFrames(1, 10), 300);
  assert.equal(intervalSeconds(1, 700), intervalSeconds(1, 600));
  assert.equal(intervalSeconds(1, 5), intervalSeconds(1, 10));
  assert.ok(same(intervalSeconds(1.6, 130), 160 / 130));
});

test('[属性-1] [属性-2] invariants: a neutral buff changes no stat bit, anywhere in the list', () => {
  const names = [...Object.keys(ATTRS), 'interval', ...CHANNEL_KEYS];
  fc.assert(fc.property(baseArb, buffsArb, fc.boolean(), (base, raws, first) => {
    const bs = ours(raws), neutral = buff('neutral', { atkFlat: 0, atkMul: 1 });
    const u = { ...BASE_FIELDS, ...base };
    const a = /** @type {Record<string, any>} */ (statsOf(unitOf(u, bs)));
    const b = /** @type {Record<string, any>} */ (statsOf(unitOf(u, first ? [neutral, ...bs] : [...bs, neutral])));
    for (const k of names) assert.ok(same(a[k], b[k]), k);
  }), { seed: SEED, numRuns: 300 });
});

test('[属性-3] invariants: whatever the mods, every attribute is finite and inside its bounds', () => {
  const all = Object.values(ATTRS).flatMap((a) => a.keys);
  const mod = fc.constantFrom(...all).chain((k) => (k.endsWith('Mul') ? num(-3, 3) : num(-1000, 1000)).map((v) => /** @type {[string, number]} */ ([k, v])));
  const bs = fc.array(fc.record({ mods: fc.array(mod, { minLength: 1, maxLength: 5 }), stacks: fc.integer({ min: 1, max: 3 }) }), { maxLength: 4 });
  fc.assert(fc.property(baseArb, bs, (base, raws) => {
    const list = raws.map((r, i) => makeBuff({ key: `b${i}`, stacks: r.stacks, mods: Object.fromEntries(r.mods) }));
    const s = /** @type {Record<string, any>} */ (statsOf(unitOf({ ...BASE_FIELDS, ...base }, list)));
    for (const [name, a] of Object.entries(ATTRS)) assert.ok(Number.isFinite(s[name]) && s[name] >= a.lo && s[name] <= a.hi, `${name} = ${s[name]}`);
  }), { seed: SEED, numRuns: 500 });
});

test('[属性-2] activeBuffs: buffs of distinct keys are all active, in order, whatever their rule', () => {
  const rule = fc.constantFrom('queue', 'max', 'stack', 'extend', 'independent');
  fc.assert(fc.property(fc.array(rule, { maxLength: 6 }), (rules) => {
    const list = rules.map((r, i) => makeBuff({ key: `k${i}`, rule: r, value: i }));
    const act = activeBuffs(list);
    assert.equal(act.length, list.length);
    act.forEach((b, i) => assert.equal(b, list[i]));
  }), { seed: SEED, numRuns: 200 });
});
