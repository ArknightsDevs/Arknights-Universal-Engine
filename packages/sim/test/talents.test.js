// What talents add (docs/spec/traits.md 职业-24, docs/spec/field.md 部署-4, 部署-5, docs/spec/combat.md 攻击-4): the trait
// additions merged after the trait's own, the conditions and target 倍率 only talents use, their hit effects, their
// always-on effects and 生命回复速度（百分比）, the chance talents' new effects, and on-field team talents for everyone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent } from '@aue/testkit';
import { createWorld, step } from '../src/index.js';
import { makeEnemy, makeOperator } from '../src/units.js';
import { applyStatus } from '../src/status.js';
import { statsOf } from '../src/attrs.js';
import { addBuff, makeBuff } from '../src/buffs.js';
import { traitOfDef, traitHit } from '../src/traits.js';
import { traitWhiles } from '../src/whiles.js';
import { vsDamage } from '../src/vs.js';
import { auras } from '../src/aura.js';
import { regenAll } from '../src/damage.js';

/** @typedef {import('../src/types.js').Unit} Unit */

/**
 * The tiny level without spawns, the guard (its tile and two ahead) with these record fields, deployed at (1, 1) facing
 * right; `foe` adds a rooted enemy; `ally` another operator. @param {Record<string, any>} rec
 */
function arena(rec = {}) {
  const c = tinyContent();
  c.level.waves = [];
  Object.assign(c.operators.guard, { range: [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }], ...rec });
  const w = createWorld(c, { seed: 1, players: 2 });
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 1, dir: 0 }]]);
  const op = /** @type {Unit} */ (w.units.find((u) => u.key === 'guard'));
  /** @param {number} row @param {number} col @param {Record<string, any>} [over] */
  const foe = (row, col, over = {}) => {
    const e = makeEnemy(w, c, { key: 'slime', route: 0 });
    e.x = col; e.y = row;
    e.base = { ...e.base, maxHp: 1e6, def: 0, res: 0, ...over };
    e.hp = statsOf(e).maxHp;
    applyStatus(e, 'root', {});
    w.units.push(e);
    return e;
  };
  /** @param {number} row @param {number} col @param {Record<string, any>} [o] */
  const ally = (row, col, o = {}) => {
    const u = makeOperator(w, c, { key: 'sniper', owner: 1, row, col, dir: 0, ...o });
    w.units.push(u);
    return u;
  };
  /** Which of its `while:` buffs the guard has after its turn's update, in order. */
  const on = () => { traitWhiles(w, c, op); return op.buffs.filter((b) => b.key.startsWith('while:')).map((b) => Number(b.key.slice(6))).sort((x, y) => x - y); };
  return { w, c, op, foe, ally, on };
}

test('[职业-24] the talents\' additions after the trait\'s own: conditions, 倍率, hit effects; arts on hits summed; more targets', () => {
  const d = /** @type {any} */ ({ position: 'MELEE', trait: { vs: [{ when: 'flying', atk: 1.1 }], whiles: [{ when: 'always', mods: { aspd: 1 } }], extraArts: 0.1, targets: 1 },
    talentTrait: { vs: [{ when: 'blocked', atk: 1.2 }], whiles: [{ when: 'blocking', mods: { aspd: 2 } }], onHit: [{ status: { key: 'stun', seconds: 1 } }], extraArts: 0.2, targets: 2 } });
  const t = traitOfDef(d);
  assert.deepEqual([t.vs.map((v) => v.when), t.whiles.map((x) => x.when), t.onHit.length, t.extraArts, t.targets], [['flying', 'blocked'], ['always', 'blocking'], 1, 0.30000000000000004, 2]);
  assert.equal(traitOfDef(d), t, 'the same trait while nothing changed');
  assert.equal(traitOfDef({ ...d, trait: { targets: 'blockCnt' } }).targets, 'blockCnt', 'a target count that is not a number stays');
  assert.deepEqual(traitOfDef(/** @type {any} */ ({ position: 'MELEE' })).onHit, [], 'none without talents');
});

test('[职业-24] conditions from talents: blocking at least so many, a wounded enemy in range, a burst of one element', () => {
  const { op, foe, on } = arena({ talentTrait: { whiles: [
    { when: 'blockingAtLeast', value: 2, mods: { aspd: 1 } }, { when: 'lowHpEnemies', value: 0.5, mods: { aspd: 1 } }, { when: 'burstEnemies', el: 'DARK', mods: { aspd: 1 } },
  ] } });
  const a = foe(1, 1), b = foe(1, 2);
  a.blockedBy = op.id;
  assert.deepEqual(on(), []);
  b.blockedBy = op.id;
  b.hp = 0.4 * statsOf(b).maxHp;
  assert.deepEqual(on(), [0, 1]);
  addBuff(a, makeBuff({ key: 'burst:FIRE' }));
  assert.deepEqual(on(), [0, 1], 'another element');
  addBuff(a, makeBuff({ key: 'burst:DARK' }));
  assert.deepEqual(on(), [0, 1, 2]);
});

test('[职业-24] the operator\'s tile and the 4 next to it: no enemy, exactly one, no other friendly unit (summons too); its skill not running', () => {
  const { op, foe, ally, on } = arena({ talentTrait: { whiles: [
    { when: 'noEnemies4', mods: { aspd: 1 } }, { when: 'soleEnemy4', mods: { aspd: 1 } }, { when: 'aloneUnits4', mods: { aspd: 1 } }, { when: 'notInSkill', mods: { aspd: 1 } },
  ] } });
  assert.deepEqual(on(), [0, 2, 3]);
  foe(0, 2);
  assert.deepEqual(on(), [0, 2, 3], 'a diagonal enemy is not on them');
  foe(1, 1);
  assert.deepEqual(on(), [1, 2, 3], 'one on its own tile');
  foe(1, 2);
  assert.deepEqual(on(), [2, 3]);
  ally(2, 1, { summoner: 99 });
  op.skill = /** @type {any} */ ({ active: true });
  assert.deepEqual(on(), [], 'a summon next to it; its skill runs');
});

test('[职业-24] target 倍率 from talents: blocked by no one, not by it, above a share of HP, light, a tag, a ranged attack, a status; more 无视防御', () => {
  const { w, c, op, foe } = arena({ talentTrait: { vs: [
    { when: 'unblocked', atk: 2 }, { when: 'notOwnBlocked', atk: 3 }, { when: 'hpAbove', value: 0.8, atk: 5 }, { when: 'light', value: 1, atk: 7 },
    { when: 'tag', tag: 'sarkaz', atk: 11 }, { when: 'rangedFoe', atk: 13 }, { when: 'status', status: 'stun', atk: 17 }, { when: 'heavy', value: 3, defFlat: 200, defPct: 0.3 },
  ] } });
  c.enemies.slime = { ...c.enemies.slime, tags: ['sarkaz'] };
  const t = foe(1, 2, { massLevel: 3, applyWay: 'MELEE' });
  t.hp = 0.5 * statsOf(t).maxHp;
  const hit = () => { const d = /** @type {any} */ ({ type: 'phys', amount: 1 }); vsDamage(w, c, op, t, d); return d; };
  assert.equal(hit().amount, 2 * 3 * 11, 'unblocked, not its own, a sarkaz');
  t.blockedBy = op.id;
  t.hp = statsOf(t).maxHp;
  t.base = { ...t.base, massLevel: 1, applyWay: 'RANGED' };
  applyStatus(t, 'stun', { seconds: 1 });
  assert.equal(hit().amount, 5 * 7 * 11 * 13 * 17, 'its own blocked one at full HP, light, ranged, stunned');
  t.base = { ...t.base, massLevel: 3 };
  const d = hit();
  assert.deepEqual([d.defIgnoreFlat, d.defIgnorePct], [200, 0.3], 'a heavy one: more 无视防御 on the hit');
});

test('[职业-24] a talent\'s hit effects: a status at a chance, modifiers for some seconds, only the first hit on each enemy', () => {
  const { w, c, op, foe } = arena({ talentTrait: { onHit: [
    { status: { key: 'sluggish', seconds: 2 }, prob: 1 }, { status: { key: 'stun', seconds: 1 }, prob: 0 },
    { debuff: { seconds: 1, mods: { resPct: -0.25 } } }, { status: { key: 'silence', seconds: 7 }, first: true },
  ] } });
  const t = foe(1, 2);
  traitHit(w, c, op, t);
  const keys = () => t.buffs.map((b) => b.key).sort();
  assert.deepEqual(keys(), ['root', `seen:${op.id}:3`, 'silence', 'sluggish', `talentHit:${op.id}:2`], 'no stun at a chance of 0');
  t.buffs = t.buffs.filter((b) => b.key !== 'silence');
  traitHit(w, c, op, t);
  assert.ok(!keys().includes('silence'), 'not again on the same enemy');
  assert.equal(t.buffs.filter((b) => b.key === `talentHit:${op.id}:2`).length, 1, 'the modifiers once, their time again');
  t.hp = 0;
  const other = foe(1, 3);
  traitHit(w, c, op, other);
  assert.ok(other.buffs.some((b) => b.key === 'silence'), 'the first hit on another enemy');
});

test('[部署-4] [属性-6] the always-on talents\' effects in the talent buff; 生命回复速度（百分比） of the maximum HP', () => {
  const { w, op } = arena({ talentBb: { atk: 0.1 }, talentMods: { dodgePhys: 0.4, defIgnoreFlat: 160, hpRegenRatio: 0.02 } });
  const b = op.buffs.find((x) => x.key === 'talent');
  assert.deepEqual(b?.mods, { atkPct: 0.1, dodgePhys: 0.4, defIgnoreFlat: 160, hpRegenRatio: 0.02 });
  assert.equal(statsOf(op).defIgnoreFlat, 160);
  op.hp = 100;
  regenAll(w);
  assert.equal(op.hp, 100 + (0.02 * statsOf(op).maxHp) / 30);
});

test('[攻击-4] a chance talent\'s attack bonus for that attack, 防御 ignored, more hits', () => {
  const { w, c, foe } = arena({ critTalents: [{ prob: 1, scale: 1, atk: 0.6, ignoreDef: 1, times: 2 }] });
  const t = foe(1, 2, { def: 1e4 });
  const hits = [];
  for (let i = 0; i < 40 && hits.length === 0; i++) hits.push(...step(w, c, []).filter((e) => e.type === 'hit' && e.target === t.id));
  for (let i = 0; i < 3; i++) hits.push(...step(w, c, []).filter((e) => e.type === 'hit' && e.target === t.id));
  assert.deepEqual(hits.map((e) => e.damage), [80, 80], 'attack 50 × 1.6, its 防御 ignored, twice');
});

test('[部署-5] on-field team talents for every friendly unit, with effects; 同类效果取最高 keeps the strongest of such talents', () => {
  const { w, c, op, ally } = arena({ fieldTalents: [{ all: true, bb: { sp_recovery_per_sec: 0.3 }, max: true }, { all: true, bb: {}, mods: { dodgePhys: 0.25 } }] });
  c.operators.sniper = { ...c.operators.sniper, profession: 'CASTER', fieldTalents: [{ profession: 'CASTER', bb: { sp_recovery_per_sec: 0.4 }, max: true }] };
  const s = ally(2, 2);
  auras(w, c);
  const field = (/** @type {Unit} */ u) => u.buffs.filter((b) => b.key.startsWith('field:')).map((b) => [b.key, b.mods]);
  assert.deepEqual(field(op), [['field:max:spRecoveryFlat', { spRecoveryFlat: 0.3 }], [`field:${op.id}:1`, { dodgePhys: 0.25 }]]);
  assert.deepEqual(field(s), [['field:max:spRecoveryFlat', { spRecoveryFlat: 0.4 }], [`field:${op.id}:1`, { dodgePhys: 0.25 }]], 'the caster\'s own is stronger');
  s.hp = 0;
  auras(w, c);
  assert.deepEqual(field(op).map(([k]) => k), ['field:max:spRecoveryFlat', `field:${op.id}:1`]);
});
