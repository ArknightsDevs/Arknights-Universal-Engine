// Talents that give a status (docs/spec/field.md 部署-5…部署-8, docs/spec/traits.md 职业-25, 职业-28, 职业-31, 职业-34): an aura that
// holds a status, a status after some seconds or from the deployment, one a run of kills gives, one a heal leaves; two sources of
// one name keep the strongest; the status events run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent } from '@aue/testkit';
import { createWorld, step, bus } from '../src/index.js';
import { makeEnemy } from '../src/units.js';
import { applyStatus, inflict } from '../src/status.js';
import { statsOf, activeBuffs } from '../src/attrs.js';
import { creditedDamage } from '../src/traits.js';
import { auras } from '../src/aura.js';
import { healGives } from '../src/talentmore.js';
import { withdraw } from '../src/deck.js';

/** @typedef {import('../src/types.js').Unit} Unit */

/**
 * The tiny level without waves; the guard (its tile and two ahead, 攻击力 50) with these record fields deployed at (1, 1) facing
 * right; `foe` adds a rooted enemy of a million HP, `frames` steps; `events` the `beforeStatus` events seen, as [target key, status, strength].
 * @param {Record<string, any>} rec
 */
function arena(rec = {}) {
  const c = tinyContent();
  c.level.waves = [];
  Object.assign(c.operators.guard, { range: [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }], ...rec });
  const w = createWorld(c, { seed: 1, players: 1 });
  /** @type {[string, string, number | undefined][]} */
  const events = [];
  bus.on(w, 'beforeStatus', (k) => { events.push([k.target.key, k.status, k.strength]); });
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 1, dir: 0 }]]);
  w.players[0].cost = 0;
  const g = /** @type {Unit} */ (w.units.find((u) => u.key === 'guard'));
  const foe = (/** @type {number} */ row, /** @type {number} */ col, /** @type {Record<string, any>} */ over = {}) => {
    const e = makeEnemy(w, c, { key: 'slime', route: 0 });
    e.x = col; e.y = row;
    e.base = { ...e.base, maxHp: 1e6, def: 0, res: 0, epResistance: 0, ...over };
    e.hp = statsOf(e).maxHp;
    applyStatus(e, 'root', {});
    w.units.push(e);
    return e;
  };
  const frames = (/** @type {number} */ n) => { for (let i = 0; i < n; i++) step(w, c, []); };
  return { w, c, g, foe, frames, events };
}

/** The product of a judge key over the buffs that take effect (状态-2). @param {Unit} u @param {string} key */
const prod = (u, key) => activeBuffs(u.buffs).reduce((k, b) => k * (b.mods[key] ?? 1), 1);
/** The buffs of a status key a unit holds. @param {Unit} u @param {string} key */
const held = (u, key) => u.buffs.filter((b) => b.key === key);

test('[部署-6] an in-range aura holds its status: one status each, tagged with the aura; two sources keep the strongest; gone with the source', () => {
  const a = arena({ rangeTalents: [{ side: 'enemy', ranged: false, mods: {}, status: { key: 'fragile', value: 0.23 } }, { side: 'enemy', ranged: false, mods: {}, status: { key: 'fragile', value: 0.18 } }] });
  const e = a.foe(1, 2);
  a.frames(2);
  assert.deepEqual(held(e, 'fragile').map((b) => [b.value, b.rule, b.left, b.tag.startsWith('held:range:')]), [[0.23, 'max', -1, true], [0.18, 'max', -1, true]]);
  assert.equal(prod(e, 'dmgTakenMul'), 1.23, 'the strongest of the name, not 1.23 × 1.18');
  assert.deepEqual(a.events.filter(([, s]) => s === 'fragile'), [['slime', 'fragile', 0.23], ['slime', 'fragile', 0.18]], 'each is given once, with the event');
  a.frames(30);
  assert.equal(a.events.filter(([, s]) => s === 'fragile').length, 2, 'not again while held');
  e.x = 5;
  a.frames(1);
  assert.equal(held(e, 'fragile').length, 0, 'out of range');
  e.x = 2;
  a.frames(1);
  assert.equal(held(e, 'fragile').length, 2);
  withdraw(a.w, a.c, a.g);
  a.frames(1);
  assert.equal(held(e, 'fragile').length, 0, 'the source left');
});

test('[部署-6] a status an aura holds follows its strength; the same status from a skill or a hit is one name with it', () => {
  const a = arena({ rangeTalents: [{ side: 'enemy', ranged: false, mods: {}, status: { key: 'artsFragile', value: 0.1 } }] });
  const e = a.foe(1, 2);
  a.frames(1);
  inflict(a.w, e, 'artsFragile', { seconds: 5, value: 0.3, src: a.g });
  assert.equal(prod(e, 'artsTakenMul'), 1.3, 'the stronger of the two');
  a.frames(200);
  assert.equal(prod(e, 'artsTakenMul'), 1.1, 'the hit one ended, the aura one stays');
  a.c.operators.guard.rangeTalents = [{ side: 'enemy', ranged: false, mods: {}, status: { key: 'artsFragile', value: 0.14 } }];
  a.frames(1);
  assert.deepEqual(held(e, 'artsFragile').map((b) => [b.value, b.mods.artsTakenMul]), [[0.14, 1 + 0.14]], 'retuned in place');
});

test('[部署-5] a team talent holds 抵抗 after its seconds; two sources give 抵抗 once, and an effect that is a stun lasts half as long', () => {
  const a = arena({ fieldTalents: [{ all: true, bb: {}, status: { key: 'buffres', value: 0.5 }, after: 1 }, { all: true, bb: {}, status: { key: 'buffres', value: 0.5 } }] });
  a.frames(1);
  assert.equal(statsOf(a.g).statusRes, 0.5, 'the second has no wait');
  a.c.operators.guard.fieldTalents = [{ all: true, bb: {}, status: { key: 'buffres', value: 0.5 }, after: 1 }];
  a.frames(1);
  assert.equal(held(a.g, 'buffres').length, 0, 'and the first waits');
  a.frames(30);
  assert.deepEqual([held(a.g, 'buffres').length, statsOf(a.g).statusRes], [1, 0.5]);
  a.c.operators.guard.fieldTalents = [{ all: true, bb: {}, status: { key: 'buffres', value: 0.5 }, after: 1 }, { all: true, bb: {}, status: { key: 'buffres', value: 0.5 } }];
  a.frames(1);
  assert.deepEqual([held(a.g, 'buffres').length, statsOf(a.g).statusRes], [2, 0.5], 'two of one name: 0.5, not 0');
  applyStatus(a.g, 'stun', { seconds: 4 });
  let lasted = 0;
  while (held(a.g, 'stun').length && lasted < 200) { a.frames(1); lasted++; }
  assert.ok(lasted >= 59 && lasted <= 61, 'four seconds at half the time');
});

test('[部署-7] a timed talent gives its status when the step comes, for good; [部署-8] a deployment talent from the deployment', () => {
  const a = arena({ timedTalents: [{ kind: 'after', seconds: 1, max: 1, mods: { atkPct: 0.1 }, status: { key: 'buffres', value: 0.5 } }], deployTalents: [{ status: { key: 'weaken', value: 0.2 } }] });
  assert.deepEqual([held(a.g, 'weaken').length, held(a.g, 'buffres').length], [1, 0], 'at the deployment, not yet');
  a.frames(20);
  assert.equal(held(a.g, 'buffres').length, 0);
  a.frames(15);
  assert.deepEqual([held(a.g, 'buffres').map((b) => [b.value, b.left, b.src === a.g.id]), a.events.filter(([, s]) => s === 'buffres')], [[[0.5, -1, true]], [['guard', 'buffres', 0.5]]]);
  assert.ok(Math.abs(statsOf(a.g).atk - a.g.base.atk * 1.1 * 0.8) < 1e-9, 'the modifiers with it, and the other status');
});

test('[部署-7] [部署-8] a 「部署后N秒内」 talent gives its status from the deployment, for its seconds (it has no step to give it)', () => {
  const a = arena({ timedTalents: [{ kind: 'during', seconds: 2, max: 1, mods: { atkPct: 0.1 }, status: { key: 'buffres', value: 0.5 } }] });
  assert.deepEqual(held(a.g, 'buffres').map((b) => [b.value, b.left <= 60 && b.left >= 58, b.src === a.g.id]), [[0.5, true, true]], 'at the deployment, for 2 s');
  assert.deepEqual([statsOf(a.g).statusRes, Math.abs(statsOf(a.g).atk - a.g.base.atk * 1.1) < 1e-9, a.events.filter(([, s]) => s === 'buffres')], [0.5, true, [['guard', 'buffres', 0.5]]], 'with its modifiers');
  a.frames(61);
  assert.deepEqual([held(a.g, 'buffres').length, statsOf(a.g).statusRes, a.g.buffs.some((b) => b.key === 'timed:0')], [0, 1, false], 'both end together');
});

test('[职业-10] the status a trait gives its operator is held from the deployment, as a talent gives it: next to another source of its name the strongest counts, not both', () => {
  const a = arena({ trait: { selfStatus: { key: 'buffres', value: 0.5 } } });
  assert.deepEqual([held(a.g, 'buffres').map((b) => [b.value, b.left, b.src === a.g.id]), statsOf(a.g).statusRes, a.events.filter(([, s]) => s === 'buffres')], [[[0.5, -1, true]], 0.5, [['guard', 'buffres', 0.5]]]);
  a.c.operators.guard.fieldTalents = [{ all: true, bb: {}, status: { key: 'buffres', value: 0.5 } }];
  a.frames(2);
  assert.deepEqual([held(a.g, 'buffres').length, statsOf(a.g).statusRes], [2, 0.5], 'two of one name: 0.5, not 0.25');
});

test('[部署-5] a status that has no modifiers and is 同类效果取最高 is its own key: two of one status keep the strongest, two of different statuses are both held', () => {
  const a = arena({ fieldTalents: [{ all: true, bb: {}, status: { key: 'buffres', value: 0.3 }, max: true }, { all: true, bb: {}, status: { key: 'buffres', value: 0.5 }, max: true }, { all: true, bb: {}, status: { key: 'fragile', value: 0.2 }, max: true }] });
  a.frames(2);
  assert.deepEqual([held(a.g, 'buffres').map((b) => b.value), held(a.g, 'fragile').map((b) => b.value), statsOf(a.g).statusRes], [[0.5], [0.2], 0.5], 'the strongest of the name; the other name too');
  a.c.operators.guard.fieldTalents = [{ all: true, bb: {}, status: { key: 'buffres', value: 0.5 }, max: true }, { all: true, bb: {}, status: { key: 'buffres', value: 0.3 }, max: true }];
  a.frames(2);
  assert.deepEqual([held(a.g, 'buffres').map((b) => b.value), held(a.g, 'fragile').length], [[0.5], 0], 'the same either way round; the one that is no more is gone');
  assert.equal(a.events.filter(([, s]) => s === 'buffres').length, 1, 'given once');
});

test('[职业-25] a run of kills gives its status with the first step, for good', () => {
  const a = arena({ talentTrait: { stacks: [{ on: 'kill', every: 2, max: 1, mods: { aspd: 15 }, gives: { key: 'buffres', value: 0.5 } }] } });
  const kill = () => { const e = a.foe(1, 2); e.hp = 1; creditedDamage(a.w, a.c, a.g, e, { type: 'true', amount: 10 }); };
  kill();
  assert.deepEqual([held(a.g, 'buffres').length, statsOf(a.g).statusRes], [0, 1]);
  kill();
  assert.deepEqual([held(a.g, 'buffres').map((b) => b.tag), statsOf(a.g).statusRes], [['stack:0'], 0.5]);
  kill();
  assert.equal(held(a.g, 'buffres').length, 1, 'once');
});

test('[职业-25] a stack that is full has its extra modifiers: the steps\' own until then', () => {
  const a = arena({ talentTrait: { stacks: [{ on: 'status', status: 'sluggish', max: 2, mods: { aspd: 1 }, full: { atkPct: 0.12 } }] } });
  const e = a.foe(1, 2);
  inflict(a.w, e, 'sluggish', { seconds: 1, src: a.g });
  assert.deepEqual(a.g.buffs.find((b) => b.key === 'stack:0')?.mods, { aspd: 1 });
  inflict(a.w, e, 'sluggish', { seconds: 1, src: a.g });
  assert.deepEqual(a.g.buffs.find((b) => b.key === 'stack:0')?.mods, { aspd: 2, atkPct: 0.12 });
});

test('[职业-31] what a heal leaves can be a status: for its seconds, the time set again by the next heal, longer above the HP share', () => {
  const a = arena({ talentTrait: { healGives: { seconds: 2, mods: {}, status: { key: 'buffres', value: 0.5 }, above: 0.75, aboveSeconds: 4 } } });
  const u = a.g;
  healGives(a.c, a.g, u, 0.5, a.w);
  assert.deepEqual(held(u, 'buffres').map((b) => [b.left, b.tag]), [[60, `healGives:${a.g.id}`]]);
  a.frames(30);
  healGives(a.c, a.g, u, 0.9, a.w);
  assert.deepEqual([held(u, 'buffres').length, held(u, 'buffres')[0].left], [1, 120], 'one status, its time set again');
  assert.equal(a.events.filter(([, s]) => s === 'buffres').length, 1);
});

test('[职业-34] 脆弱 growing with the time in range is one 脆弱 the aura holds: its strength follows the time', () => {
  const a = arena({ talentTrait: { stayVuln: { base: 1.12, after: 7, max: 1.16 } } });
  const e = a.foe(1, 2);
  a.frames(2);
  assert.deepEqual(held(e, 'fragile').map((b) => [b.value, b.tag]), [[1.12 - 1, 'held:stayVuln:' + a.g.id]]);
  a.frames(7 * 30);
  auras(a.w, a.c);
  assert.deepEqual([held(e, 'fragile').map((b) => b.value), prod(e, 'dmgTakenMul')], [[1.16 - 1], 1.16]);
  assert.equal(a.events.filter(([, s]) => s === 'fragile').length, 1);
});

test('[职业-28] more arts damage when the target holds every status of the pair', () => {
  const a = arena({ talentTrait: { vs: [{ when: 'statusAny', statuses: ['sluggish', 'root'], on: 'damage', arts: 0.5, both: 1.2, later: true }] } });
  const root = a.foe(0, 4), both = a.foe(0, 5);
  applyStatus(both, 'sluggish', { seconds: 5 });
  const lost = (/** @type {Unit} */ e) => {
    const hp = e.hp;
    creditedDamage(a.w, a.c, a.g, e, { type: 'true', amount: 100 });
    a.frames(4);
    return Math.round((hp - e.hp) * 1e6) / 1e6;
  };
  assert.deepEqual([lost(root), lost(both)], [100 + 50 * 0.5, 100 + 50 * 0.5 * 1.2], 'the later arts damage, × 1.2 with both');
});
