// What a skill's description says its hits do (docs/spec/skills.md 技能-9): a status at a chance, timed modifiers on the
// target, the operator's HP back for each attack, 元素损伤 of a share of its attack, for a passive skill's every attack;
// and the regeneration of a share of the maximum HP while a skill runs (技能-5).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent } from '@aue/testkit';
import { createWorld, step } from '../src/index.js';
import { forceSp } from '../src/sp.js';
import { makeEnemy } from '../src/units.js';
import { applyStatus } from '../src/status.js';
import { statsOf } from '../src/attrs.js';
import { epOf } from '../src/elements.js';

/** @typedef {import('../src/types.js').SkillDef} SkillDef @typedef {import('../src/types.js').Unit} Unit */

/** A MANUAL skill. @param {Partial<SkillDef>} o @returns {SkillDef} */
const sk = (o) => ({ id: 'hits', type: 'MANUAL', sp: 'time', cost: 5, init: 0, charges: 1, duration: 20, ammo: false, bb: {}, ...o });

/**
 * The tiny level without spawns: the guard (attack 50, an attack a second; range: its tile and one ahead) with the skill,
 * at (1, 1) facing right; a rooted enemy at (1, 2), def 0, a billion HP. Its skill started unless passive.
 * @param {SkillDef} skill
 */
function arena(skill) {
  const c = /** @type {any} */ (tinyContent());
  c.level.waves = [];
  c.operators.guard.skill = skill;
  const w = createWorld(c, { seed: 1, players: 2 });
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 1, dir: 0 }]]);
  const op = /** @type {Unit} */ (w.units.find((u) => u.key === 'guard'));
  const e = makeEnemy(w, c, { key: 'slime', route: 0 });
  e.x = 2; e.y = 1; e.base = { ...e.base, maxHp: 1e9, def: 0, res: 0, moveSpeed: 1 }; e.hp = 1e9; e.maxHp = 1e9;
  applyStatus(e, 'root', {});
  w.units.push(e);
  if (skill.type !== 'PASSIVE') { forceSp(/** @type {any} */ (op.skill), 99); step(w, c, [[0, { type: 'skill', unit: op.id }]]); }
  return { w, c, op, e };
}

/** Runs n frames. @param {any} w @param {any} c @param {number} n */
const run = (w, c, n) => { for (let i = 0; i < n; i++) step(w, c, []); };

test('[技能-9] a status at its chance: 1 always, 0 never', () => {
  const always = arena(sk({ extra: { attack: { hitStatus: { key: 'silence', seconds: 3, prob: 1 } } } }));
  const never = arena(sk({ extra: { attack: { hitStatus: { key: 'silence', seconds: 3, prob: 0 } } } }));
  for (const a of [always, never]) run(a.w, a.c, 45);
  assert.deepEqual([always.e.buffs.some((b) => b.key === 'silence'), never.e.buffs.some((b) => b.key === 'silence')], [true, false]);
});

test('[技能-9] timed modifiers on the target: each hit starts their time again; gone after it', () => {
  const { w, c, e } = arena(sk({ duration: 2.5, extra: { attack: { hitDebuff: { seconds: 1.5, mods: { defFlat: -30, movePct: -0.5 } } } } }));
  e.base = { ...e.base, def: 100 };
  run(w, c, 45);
  const b = e.buffs.find((x) => x.key.startsWith('hitDebuff:'));
  assert.deepEqual([statsOf(e).def, statsOf(e).moveSpeed, e.buffs.filter((x) => x.key.startsWith('hitDebuff:')).length], [70, 0.5, 1], 'one buff for the source');
  assert.ok(b && b.left > 20, 'a later hit started it again');
  run(w, c, 30 * 4);
  assert.deepEqual([statsOf(e).def, e.buffs.some((x) => x.key.startsWith('hitDebuff:'))], [100, false], 'the skill over: the last hit\'s time run out');
});

test('[技能-9] the operator\'s HP back for each attack; 元素损伤 of a share of its attack on each hit', () => {
  const { w, c, op, e } = arena(sk({ extra: { attack: { selfHeal: 0.1, element: 'FIRE', epScale: 0.5 } } }));
  op.hp = 100;
  const ep = epOf(e, 'FIRE');
  run(w, c, 30);
  assert.deepEqual([op.hp, ep - epOf(e, 'FIRE')], [100 + 1000 * 0.1, 50 * 0.5], 'one attack: a tenth of 1000 back, 50 × 0.5 of 灼燃损伤');
});

test('[技能-9] [技能-5] a passive skill\'s hit effects ride on every attack; a share of the maximum HP regenerates while a skill runs', () => {
  const p = arena(sk({ type: 'PASSIVE', sp: 'none', duration: -1, extra: { attack: { hitStatus: { key: 'silence', seconds: 2 } } } }));
  run(p.w, p.c, 45);
  assert.equal(p.e.buffs.some((b) => b.key === 'silence'), true);
  const r = arena(sk({ bb: { hp_recovery_per_sec_by_max_hp_ratio: 0.05 } }));
  assert.equal(statsOf(r.op).hpRecoveryPerSec, 50, '5 % of 1000 a second');
});

test('[技能-9] [位移-2] [位移-4] a skill\'s push along the facing and its pull toward 0.5 tiles in front, once per attack on each target', () => {
  const p = arena(sk({ extra: { attack: { displace: { pull: false, force: 2, along: true } } } }));
  assert.ok(p.e.slide && p.e.slide.vx > 0 && p.e.slide.vy === 0, 'pushed east, along the facing');
  run(p.w, p.c, 20);
  assert.ok(p.e.x > 3, `slid on: at ${p.e.x}`);
  const q = arena(sk({ extra: { attack: { displace: { pull: true, force: 2 } } } }));
  assert.ok(q.e.slide?.pull, 'pulled');
  run(q.w, q.c, 10);
  assert.ok(q.e.x < 2 && q.e.x > 1, `toward the guard, not past it: at ${q.e.x}`);
});

test('[职业-23] PUS-Y a push one 力度 stronger while blocking two; HOK-Y a pull one stronger on a far target; HOK-X 移动创伤 a tile moved', async () => {
  const { PULL_FORCE } = await import('../src/displacement.js');
  const { attackMods } = await import('../src/skills.js');
  const p = arena(sk({ extra: { attack: { displace: { pull: false, force: 0, along: true } } } }));
  p.c.operators.guard.trait = { pushBoost: { cnt: 2, level: 1 } };
  p.e.slide = undefined; p.e.blockedBy = p.op.id;
  assert.equal(attackMods(p.w, p.c, p.op).displace?.force, 0, 'one blocked: as written');
  const extra = makeEnemy(p.w, p.c, { key: 'slime', route: 0 });
  extra.x = 1; extra.y = 1; extra.blockedBy = p.op.id; p.w.units.push(extra);
  assert.equal(attackMods(p.w, p.c, p.op).displace?.force, 1, 'two blocked: one 力度 more');
  const far = arena(sk({ extra: { attack: { displace: { pull: true, force: 1 } } } }));
  far.c.operators.guard.trait = { pullBoost: { range: 0.5, level: 1 }, pullTrauma: { perTile: 800, every: 0.066 } };
  far.c.operators.guard.range = [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }, { row: 0, col: 3 }];
  far.e.x = 4; far.e.slide = undefined; far.op.atkCd = 0;
  const hp = far.e.hp;
  run(far.w, far.c, 2);
  assert.equal(/** @type {any} */ (far.e).slide?.pull?.f, PULL_FORCE[2], '力度 1 + 1 at more than 0.5 tiles');
  const x0 = 4;
  run(far.w, far.c, 40);
  assert.ok(Math.abs((hp - far.e.hp) - (x0 - far.e.x) * 800) < 1e-6 * hp, `800 a tile: ${hp - far.e.hp} for ${x0 - far.e.x}`);
});

test('[职业-23] PUS-X half the cost back when deployed on a ranged tile, none on a melee one', () => {
  const c = /** @type {any} */ (tinyContent());
  c.level.waves = [];
  c.level.options.costIncreaseTime = 1e9;
  c.operators.guard.trait = { rangedTiles: true, rangedRefund: 0.5 };
  const w = createWorld(c, { seed: 1, players: 2 });
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 0, col: 2, dir: 0 }]]);
  assert.deepEqual([w.units.some((u) => u.key === 'guard'), w.players[0].cost], [true, 10 - 5 + 2], 'paid 5, 2 back');
  const m = createWorld(c, { seed: 1, players: 2 });
  step(m, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 1, dir: 0 }]]);
  assert.equal(m.players[0].cost, 5);
});
