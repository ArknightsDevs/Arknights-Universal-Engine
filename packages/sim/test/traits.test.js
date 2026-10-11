// Traits (docs/spec/traits.md) and the deck (docs/spec/field.md 部署-3, 撤退-1): the defaults by position, healers,
// target counts and hits, lasting modifiers and on-hit statuses, cost on a kill, behaviours by branch; the deploy cost
// the 再部署惩罚 raises, the 再部署时间, the retreat refund.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent } from '@aue/testkit';
import { KIND } from '@aue/schema';
import { createWorld, step, deployProblem, stateHash, takeSnapshot, restoreSnapshot } from '../src/index.js';
import { defaultTrait, traitTargets, traitOfDef } from '../src/traits.js';
import { deployCost, cardOf, MAX_PENALTY } from '../src/deck.js';
import { makeEnemy } from '../src/units.js';
import { applyStatus } from '../src/status.js';
import { statsOf } from '../src/attrs.js';
import { pickTarget, targetsOf } from '../src/combat.js';
import { BEHAVIOR_API_VERSION, CONTEXT_MEMBERS, SKILL_CONTEXT_MEMBERS } from '../src/api.js';

/** @typedef {import('../src/types.js').Unit} Unit @typedef {import('../src/types.js').World} World */

/**
 * The tiny level without spawns; `tweak` changes the content first. Rooted foes are added with `foe`.
 * @param {(c: any) => void} [tweak]
 */
function arena(tweak) {
  const c = tinyContent();
  c.level.spawns = [];
  tweak?.(c);
  const w = createWorld(c, { seed: 1, players: 2 });
  /** A rooted enemy at (row, col) with HP and over. @param {number} row @param {number} col @param {Record<string, any>} [over] */
  const foe = (row, col, over = {}) => {
    const e = makeEnemy(w, c, { key: 'slime', route: 0 });
    e.x = col; e.y = row;
    e.base = { ...e.base, ...over };
    e.hp = e.maxHp = statsOf(e).maxHp;
    applyStatus(e, 'root', {});
    w.units.push(e);
    return e;
  };
  return { w, c, foe };
}
/**
 * Runs n frames, collecting the events with their frame. Commands in the first: [seat, command], or a bare command of
 * seat 0. @param {World} w @param {any} c @param {number} n @param {any[]} [cmds]
 */
function run(w, c, n, cmds = []) {
  const first = /** @type {[number, any][]} */ (cmds.map((x) => (Array.isArray(x) ? x : [0, x])));
  /** @type {any[]} */
  const out = [];
  for (let i = 0; i < n; i++) for (const e of step(w, c, i === 0 ? first : [])) out.push({ ...e, f: w.frame - 1 });
  return out;
}
/** A deploy command. @param {string} op @param {number} row @param {number} col @returns {import('@aue/schema').DeployCommand} */
const deploy = (op, row, col, dir = 0) => ({ type: 'deploy', op, row, col, dir });

test('[职业-1] defaults by position: melee prefers what it blocks and cannot select other flyers; ranged can', () => {
  assert.deepEqual([defaultTrait('MELEE').blockedFirst, defaultTrait('MELEE').antiAir, defaultTrait('RANGED').blockedFirst, defaultTrait('RANGED').antiAir],
    [true, false, false, true]);
  assert.deepEqual(traitOfDef(/** @type {any} */ ({ position: 'MELEE', trait: { hits: 2 } })).hits, 2);
  const { w, c, foe } = arena();
  run(w, c, 1, [deploy('guard', 1, 1)]);
  const guard = w.units[0], flyer = foe(1, 2, { motion: 'FLY' });
  assert.equal(pickTarget(w, c, guard), null, 'a flyer in range: a melee operator cannot select it');
  c.operators.guard.trait = { antiAir: true };
  assert.equal(pickTarget(w, c, guard), flyer, '可对空');
});

test('[职业-1] [阻挡-2] a trait flag lets a melee operator block a flyer; then it attacks it, flying and out of range', () => {
  const { w, c, foe } = arena((cc) => { cc.operators.guard.trait = { flags: { blockFly: true } }; cc.operators.guard.range = [{ row: 0, col: 5 }]; });
  run(w, c, 1, [deploy('guard', 1, 1)]);
  const guard = w.units[0], flyer = foe(1, 1.2, { motion: 'FLY', maxHp: 1e6 });
  run(w, c, 2);
  assert.equal(flyer.blockedBy, guard.id);
  assert.deepEqual(targetsOf(w, c, guard), [flyer]);
});

test('[职业-2] a healer heals the ally in range with the lowest HP ratio, never one at full HP or under 禁疗', () => {
  const { w, c } = arena((cc) => {
    cc.operators.medic = { ...cc.operators.sniper, name: 'medic', atk: 100, trait: { heal: true }, range: [{ row: 0, col: 0 }, { row: -1, col: 0 }, { row: -1, col: -1 }, { row: -1, col: 1 }] };
  });
  run(w, c, 1, [[0, deploy('medic', 2, 2)], [0, deploy('guard', 1, 2)], [1, deploy('guard', 1, 3)]]);
  const [medic, g1, g2] = w.units;
  assert.deepEqual([medic.owner, g1.owner, g2.owner], [0, 0, 1]);
  assert.equal(targetsOf(w, c, medic).length, 0, 'all at full HP: no target, no attack');
  g1.hp = 600; g2.hp = 500;
  const ev = run(w, c, 1);
  assert.deepEqual(ev.filter((e) => e.type === 'heal').map((e) => [e.target, e.amount]), [[g2.id, 100]], 'the lower ratio, the other player\'s included');
  assert.equal(g2.hp, 600);
  applyStatus(g2, 'healFree', {});
  assert.deepEqual(targetsOf(w, c, medic), [g1], '禁疗: not a target');
  assert.equal(ev.filter((e) => e.type === 'hit').length, 0, 'it hits no enemy');
});

test('[职业-3] targets: the 阻挡数 (blocked first, then others in range), every candidate, or the skill\'s if more', () => {
  const { w, c, foe } = arena((cc) => {
    cc.operators.guard.trait = { targets: 'blockCnt' };
    cc.operators.guard.range = [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }, { row: 0, col: 3 }];
  });
  run(w, c, 1, [deploy('guard', 1, 1)]);
  const guard = w.units[0];
  for (const col of [2, 3, 4]) foe(1, col, { maxHp: 1e6 });
  assert.equal(traitTargets({ ...defaultTrait('MELEE'), targets: 'blockCnt' }, guard), 2);
  let ev = run(w, c, 1);
  assert.equal(ev.filter((e) => e.type === 'attack').length, 2, '阻挡数 2: two of the three in range, none blocked');
  c.operators.guard.trait = { targets: 'all' };
  guard.atkCd = 0;
  ev = run(w, c, 1);
  assert.equal(ev.filter((e) => e.type === 'attack').length, 3);
  assert.equal(traitTargets({ ...defaultTrait('MELEE'), targets: 'blockCnt' }, { ...guard, base: { ...guard.base, blockCnt: 0 } }), 1, 'never below 1');
});

test('[职业-3] hits: each target takes the trait\'s hits per attack (剑豪: two)', () => {
  const { w, c, foe } = arena((cc) => { cc.operators.guard.trait = { hits: 2 }; });
  run(w, c, 1, [deploy('guard', 1, 1)]);
  const e = foe(1, 2, { maxHp: 1e6, def: 0 });
  const ev = run(w, c, 1);
  assert.deepEqual(ev.filter((x) => x.type === 'hit').map((x) => [x.target, x.damage]), [[e.id, 50], [e.id, 50]]);
  assert.equal(ev.filter((x) => x.type === 'attack').length, 1, 'one attack');
});

test('[职业-4] lasting modifiers and flags while deployed; a status on each hit (凝滞师: 停顿 0.8 s)', () => {
  const { w, c, foe } = arena((cc) => {
    cc.operators.sniper.trait = { mods: { taunt: -1, dodgePhys: 0.5 }, hitStatus: { key: 'sluggish', seconds: 0.8 } };
    cc.operators.sniper.dmgType = 'arts';
  });
  run(w, c, 1, [deploy('sniper', 2, 2)]);
  const sn = w.units[0];
  assert.equal(statsOf(sn).taunt, -1);
  assert.deepEqual(sn.buffs.map((b) => b.key), ['trait']);
  const e = foe(1, 3, { maxHp: 1e6 });
  const ev = run(w, c, 4);
  assert.deepEqual(ev.filter((x) => x.type === 'shot').map((x) => x.f), [1], 'a ranged attack launches a projectile (攻击-3)');
  const hitAt = ev.find((x) => x.type === 'hit')?.f;
  assert.equal(hitAt, 4, '√2 tiles at 12 tiles/s: 0.4 a frame, it arrives in the fourth frame');
  assert.equal(e.buffs.find((b) => b.key === 'sluggish')?.left, 24);
  assert.equal(statsOf(e).moveSpeed, 0.2);
});

test('[职业-5] a kill by the operator\'s attack or skill gives the trait\'s cost (冲锋手); a dead target gives none', () => {
  const { w, c, foe } = arena((cc) => {
    cc.operators.guard.trait = { killCost: 1 };
    cc.operators.guard.skill = { id: 'zap', type: 'MANUAL', sp: 'time', cost: 1, init: 1, charges: 1, duration: 0, ammo: false, bb: { cost: 0 } };
    cc.behaviors = { skills: { zap: { start: (/** @type {any} */ ctx) => { for (const u of /** @type {any} */ (globalThis).__targets) ctx.dealDamage(u, { type: 'true', amount: 1e9 }); } } } };
  });
  run(w, c, 1, [deploy('guard', 1, 1)]);
  const guard = w.units[0];
  foe(1, 2, { maxHp: 40, def: 0 });
  const cost = w.players[0].cost;
  run(w, c, 1);
  assert.equal(w.players[0].cost, cost + 1, 'its hit killed the slime');
  const far = foe(0, 5, { maxHp: 10 });
  const dead = foe(2, 5, { maxHp: 10 });
  dead.hp = 0;
  /** @type {any} */ (globalThis).__targets = [far, dead];
  const before = w.players[0].cost;
  run(w, c, 1, [[0, { type: 'skill', unit: guard.id }]]);
  assert.equal(w.players[0].cost, before + 1, 'the skill killed one; the dead one gives nothing');
  delete (/** @type {any} */ (globalThis).__targets);
});

test('[职业-6] behaviours by branch act through the context: at deployment, on each hit, after a kill', () => {
  /** @type {string[]} */
  const log = [];
  const { w, c, foe } = arena((cc) => {
    cc.operators.guard.branch = 'test_branch';
    cc.behaviors = { traits: { test_branch: {
      deploy: (/** @type {any} */ ctx) => { log.push(`deploy ${ctx.self.key}`); ctx.addBuff(ctx.self, { key: 'own', mods: { atkFlat: 10 } }); },
      hit: (/** @type {any} */ ctx, /** @type {any} */ t) => { log.push(`hit ${t.id}`); },
      kill: (/** @type {any} */ ctx) => { log.push('kill'); ctx.gainCost(2); },
    } } };
  });
  run(w, c, 1, [deploy('guard', 1, 1)]);
  const e = foe(1, 2, { maxHp: 60, def: 0 }), cost = w.players[0].cost;
  run(w, c, 1);
  assert.deepEqual(log, ['deploy guard', 'kill', `hit ${e.id}`]);
  assert.equal(statsOf(w.units[0]).atk, 60);
  assert.equal(w.players[0].cost, Math.min(12, cost + 2));
});

test('[职业-6] every context function acts on the battle: stats, buffs, statuses, damage, 元素损伤, healing, cost', () => {
  /** @type {any} */
  let seen = null;
  const { w, c, foe } = arena((cc) => {
    cc.operators.guard.branch = 'ctx_branch';
    cc.operators.guard.trait = { bb: { k: 3 } };
    cc.behaviors = { traits: { ctx_branch: { hit: (/** @type {any} */ ctx, /** @type {any} */ t) => {
      if (seen) return;
      ctx.addBuff(t, { key: 'mark', mods: { defFlat: -5 } });
      ctx.removeBuff(t, 'mark');
      ctx.applyStatus(t, 'stun', { seconds: 1 });
      seen = { bb: ctx.bb.k, frame: ctx.frame, atk: ctx.stats(ctx.self).atk, dmg: ctx.dealDamage(t, { type: 'true', amount: 7 }), ep: ctx.dealEp(t, 'FIRE', 100) };
      ctx.self.hp = 900;
      seen.healed = ctx.heal(ctx.self, 50);
      ctx.gainCost(1);
    } } } };
  });
  run(w, c, 1, [deploy('guard', 1, 1)]);
  const e = foe(1, 2, { maxHp: 1e6, def: 0 }), cost = w.players[0].cost;
  run(w, c, 1);
  assert.deepEqual(seen, { bb: 3, frame: 1, atk: 50, dmg: 7, ep: 100, healed: 50 });
  assert.deepEqual(e.buffs.map((b) => b.key), ['root', 'stun']);
  assert.equal(e.ep.FIRE, 900);
  assert.equal(w.units[0].hp, 950);
  assert.equal(w.players[0].cost, Math.min(12, cost + 1));
});

test('[职业-6] [技能-6] the behaviour interface, version 1: a skill’s and a trait’s contexts have exactly the listed members', () => {
  /** @type {any[]} */
  const got = [];
  const { w, c, foe } = arena((cc) => {
    cc.operators.guard.branch = 'b';
    cc.operators.guard.skill = { id: 's', type: 'AUTO', sp: 'time', cost: 1, init: 1, charges: 1, duration: 0, ammo: false, bb: { cost: 0 } };
    cc.behaviors = { skills: { s: { trigger: 'ready', start: (/** @type {any} */ ctx) => { got.push(['skill', Object.keys(ctx)]); } } },
      traits: { b: { deploy: (/** @type {any} */ ctx) => { got.push(['trait', Object.keys(ctx)]); } } } };
  });
  run(w, c, 2, [deploy('guard', 1, 1)]);
  foe(1, 2);
  assert.equal(BEHAVIOR_API_VERSION, 1);
  assert.deepEqual(got, [['trait', [...CONTEXT_MEMBERS]], ['skill', [...SKILL_CONTEXT_MEMBERS]]]);
  assert.deepEqual(SKILL_CONTEXT_MEMBERS.filter((k) => !CONTEXT_MEMBERS.includes(k)), ['kind']);
});

test('[部署-3] the 再部署惩罚: each leaving adds a layer (at most 2), the cost × 1.5 then × 2, rounded down', () => {
  const { w, c } = arena((cc) => { cc.operators.guard.cost = 9; cc.operators.guard.respawnTime = 2; cc.level.options.maxCost = 99; });
  const p = w.players[0];
  p.cost = 99;
  assert.equal(deployCost(c, p, 'guard'), 9);
  const costs = [];
  for (let i = 0; i < 4; i++) {
    costs.push(deployCost(c, p, 'guard'));
    const before = p.cost;
    run(w, c, 1, [deploy('guard', 1, 1)]);
    assert.equal(before - p.cost, costs[i], 'paid what it cost then');
    const u = /** @type {Unit} */ (w.units.find((x) => x.kind === KIND.OPERATOR));
    assert.equal(u.paid, costs[i]);
    u.hp = 0;
    run(w, c, 1);
    assert.equal(deployProblem(w, c, 0, deploy('guard', 1, 1)), 'redeploying');
    run(w, c, 59);
    assert.equal(deployProblem(w, c, 0, deploy('guard', 1, 1)), null, '2 s later');
  }
  assert.deepEqual(costs, [9, 13, 18, 18]);
  assert.equal(cardOf(p, 'guard').penalty, MAX_PENALTY);
});

test('[撤退-1] a retreat returns ⌊min(paid × 返还倍率, initial cost)⌋: half by default, all for 冲锋手, none for 行商; a fall none', () => {
  const refund = (/** @type {number} */ rate, /** @type {number} */ penalty) => {
    const { w, c } = arena((cc) => { cc.operators.guard.cost = 9; cc.operators.guard.trait = { refund: rate }; cc.level.options.maxCost = 99; });
    const p = w.players[0];
    p.cost = 50;
    p.cards.guard = { penalty, ready: 0 };
    run(w, c, 1, [deploy('guard', 1, 1)]);
    const after = p.cost;
    run(w, c, 1, [[0, { type: 'retreat', unit: w.units[0].id }]]);
    return p.cost - after;
  };
  assert.deepEqual([refund(0.5, 0), refund(0.5, 1), refund(0.5, 2), refund(1, 0), refund(1, 1), refund(0, 0)], [4, 6, 9, 9, 9, 0],
    '⌊4.5⌋, ⌊6.5⌋, min(9, 9), 9, min(13, 9), 0');
  const { w, c } = arena();
  run(w, c, 1, [deploy('guard', 1, 1)]);
  w.players[0].cost = 11;
  run(w, c, 1, [[0, { type: 'retreat', unit: w.units[0].id }]]);
  assert.equal(w.players[0].cost, 12, 'at most the level\'s maximum (费用-1)');
  const fall = arena();
  run(fall.w, fall.c, 1, [deploy('guard', 1, 1)]);
  const left = fall.w.players[0].cost;
  fall.w.units[0].hp = 0;
  run(fall.w, fall.c, 1);
  assert.equal(fall.w.players[0].cost, left);
});

test('[部署-3] [同步-1] cards and paid costs are state: a snapshot restores to the same hash and runs on the same', () => {
  const { w, c } = arena((cc) => { cc.operators.guard.respawnTime = 1; });
  run(w, c, 1, [deploy('guard', 1, 1)]);
  run(w, c, 1, [[0, { type: 'retreat', unit: w.units[0].id }]]);
  const copy = restoreSnapshot(JSON.parse(JSON.stringify(takeSnapshot(w))));
  assert.equal(stateHash(copy), stateHash(w));
  run(w, c, 40, [[0, deploy('guard', 1, 1)]]);
  run(copy, c, 40, [[0, deploy('guard', 1, 1)]]);
  assert.equal(stateHash(copy), stateHash(w));
  assert.deepEqual(copy.players[0].cards.guard, { penalty: 1, ready: 31 });
});
