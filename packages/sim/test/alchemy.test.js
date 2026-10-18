// 炼金单元 (docs/spec/skills.md 技能-13): where a skill throws it, its damage every interval with the attack it kept, the
// modifiers of the units in it, the heavy enemies', its drift, its end; it stays when its thrower leaves.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent } from '@aue/testkit';
import { createWorld, step, stateHash } from '../src/index.js';
import { kindOf } from '../src/skills.js';
import { forceSp } from '../src/sp.js';
import { makeEnemy, makeOperator } from '../src/units.js';
import { applyStatus } from '../src/status.js';
import { statsOf } from '../src/attrs.js';
import { traitWhiles } from '../src/whiles.js';
import { takeSnapshot, restoreSnapshot } from '../src/snapshot.js';

/** @typedef {import('../src/types.js').SkillDef} SkillDef @typedef {import('../src/types.js').Unit} Unit @typedef {import('../src/types.js').AlchemyDef} AlchemyDef */

/** A MANUAL skill that throws this. @param {AlchemyDef} alchemy @param {Partial<SkillDef>} [o] @returns {SkillDef} */
const sk = (alchemy, o = {}) => ({ id: 'throw', type: 'MANUAL', sp: 'time', cost: 5, init: 0, charges: 1, duration: -1, ammo: false, bb: { atk_scale: 9 }, alchemy, ...o });

/**
 * The tiny level without spawns: the guard (attack 50; range: its tile and two ahead) with the skill and trait (no
 * attacks where its own would add to the damage), at (1, 1) facing right; `foe` adds a rooted enemy with a billion HP, `ally` another operator.
 * @param {SkillDef} skill @param {Record<string, any>} [trait]
 */
function arena(skill, trait = {}) {
  const c = /** @type {any} */ (tinyContent());
  c.level.waves = [];
  Object.assign(c.operators.guard, { skill, trait, range: [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }] });
  const w = createWorld(c, { seed: 1, players: 2 });
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 1, dir: 0 }]]);
  const op = /** @type {Unit} */ (w.units.find((u) => u.key === 'guard'));
  /** @param {number} row @param {number} col @param {Record<string, any>} [over] */
  const foe = (row, col, over = {}) => {
    const e = makeEnemy(w, c, { key: 'slime', route: 0 });
    e.x = col; e.y = row;
    e.base = { ...e.base, maxHp: 1e9, def: 0, res: 0, ...over };
    e.hp = 1e9; e.maxHp = 1e9;
    applyStatus(e, 'root', {});
    w.units.push(e);
    return e;
  };
  /** @param {number} row @param {number} col */
  const ally = (row, col) => { const u = makeOperator(w, c, { key: 'sniper', owner: 0, row, col, dir: 0 }); w.units.push(u); return u; };
  /** The skill command after filling the SP; the frame's events. */
  const cast = () => { forceSp(/** @type {any} */ (op.skill), 99); return step(w, c, [[0, { type: 'skill', unit: op.id }]]); };
  return { w, c, op, foe, ally, cast };
}

/** Runs n frames. @param {any} w @param {any} c @param {number} n */
const run = (w, c, n) => { for (let i = 0; i < n; i++) step(w, c, []); };

test('[技能-13] a skill that throws a 炼金单元 is instant; it lands on the target\'s tile, hurts every second with the attack it kept, weakens', () => {
  assert.equal(kindOf(sk({ at: 'enemy', seconds: 3, radius: 1 })), 'instant', 'not the next attack its atk_scale would make it');
  const { w, c, op, foe, cast } = arena(sk({ at: 'enemy', seconds: 3, radius: 1, scale: 0.5, foeMods: { atkMul: 0.75 } }), { noAttack: true });
  const e = foe(1, 2), far = foe(1, 4, { atk: 100 });
  e.base = { ...e.base, atk: 100 };
  const ev = cast();
  assert.deepEqual([w.alchemy?.length, w.alchemy?.[0].cx, w.alchemy?.[0].cy, op.skill?.active], [1, 2, 1, false]);
  assert.deepEqual(ev.filter((x) => x.type === 'alchemy').map((x) => [x.x, x.y, x.r, x.frames]), [[2, 1, 1, 90]]);
  assert.deepEqual([statsOf(e).atk, statsOf(far).atk], [75, 100], '虚弱 in it only');
  op.base = { ...op.base, atk: 500 };
  const hp = e.hp;
  run(w, c, 30);
  assert.equal(hp - e.hp, 25, 'a second on: 50 (the attack as it threw) × 0.5, arts');
  run(w, c, 61);
  assert.deepEqual([hp - e.hp, w.alchemy?.length, statsOf(e).atk], [75, 0, 100], 'three ticks, then gone with its modifiers');
});

test('[技能-13] with no enemy in range it lands on the farthest tile straight ahead; a heavy enemy takes more and its own slow', () => {
  const { w, c, foe, cast } = arena(sk({ at: 'enemy', seconds: 5, radius: 0.6, scale: 0.2, heavy: { weight: 3, scale: 1, mods: { movePct: -0.7 } } }), { noAttack: true });
  cast();
  assert.deepEqual([w.alchemy?.[0].cx, w.alchemy?.[0].cy], [3, 1], 'two tiles ahead');
  const light = foe(1, 3), heavy = foe(1, 3, { massLevel: 3 });
  const [h1, h2] = [light.hp, heavy.hp];
  run(w, c, 30);
  assert.deepEqual([h1 - light.hp, h2 - heavy.hp], [10, 60]);
  assert.deepEqual([statsOf(light).moveSpeed, Math.round(statsOf(heavy).moveSpeed * 100) / 100], [1, 0.3]);
});

test('[技能-13] at the friendly units: the one in range with the lowest HP share; its tile and the 8 around regenerate and defend', () => {
  const { w, c, op, ally, cast } = arena(sk({ at: 'ally', seconds: 4, radius: 0, square: true, regen: 0.2, allyMods: { defFlat: 75 } }));
  const hurt = ally(1, 3), out = ally(0, 5);
  hurt.hp = 100;
  cast();
  step(w, c, []);
  assert.deepEqual([w.alchemy?.[0].cx, w.alchemy?.[0].cy], [3, 1], 'the wounded one\'s tile');
  assert.deepEqual([statsOf(hurt).def, statsOf(hurt).hpRecoveryPerSec, statsOf(op).def, statsOf(out).def], [20 + 75, 10, 100, 20], 'the guard two tiles off, one out of reach');
});

test('[技能-13] it drifts away from its thrower and grows; extended while another operator is in range; it stays when its thrower retreats', () => {
  const { w, c, op, foe, ally, cast } = arena(sk({ at: 'enemy', seconds: 2, radius: 1, scale: 1, drift: { speed: 0.3, seconds: 1, grow: 0.6 }, extend: 1 }));
  foe(1, 2);
  ally(1, 3);
  cast();
  run(w, c, 30);
  const a = /** @type {any} */ (w.alchemy?.[0]);
  assert.deepEqual([Math.round(a.cx * 1e6) / 1e6, a.cy, Math.round(a.r * 1e6) / 1e6, a.end - a.born], [2.3, 1, 1.6, 90], 'a second: 0.3 on, 0.6 wider; 2 + 1 s');
  run(w, c, 30);
  assert.equal(Math.round(a.cx * 1e6) / 1e6, 2.3, 'its drift over');
  step(w, c, [[0, { type: 'retreat', unit: op.id }]]);
  assert.deepEqual([w.units.includes(op), w.alchemy?.length], [false, 1]);
});

test('[技能-13] an AUTO one at the enemies waits for a target; 炼金单元 on the field for 职业-18\'s `alchemy`; snapshots carry them', () => {
  const { w, c, op, foe } = arena(sk({ at: 'enemy', seconds: 2, radius: 1, scale: 0.1 }, { type: 'AUTO' }), { whiles: [{ when: 'alchemy', mods: { spRecoveryFlat: 0.1 } }] });
  forceSp(/** @type {any} */ (op.skill), 99);
  run(w, c, 10);
  assert.equal(w.alchemy?.length ?? 0, 0, 'no target, no throw');
  traitWhiles(w, c, op);
  assert.equal(op.buffs.some((b) => b.key.startsWith('while:')), false);
  foe(1, 2);
  run(w, c, 40);
  assert.equal(w.alchemy?.length, 1);
  traitWhiles(w, c, op);
  assert.equal(op.buffs.some((b) => b.key === 'while:0'), true);
  const copy = restoreSnapshot(takeSnapshot(w));
  run(w, c, 20); run(copy, c, 20);
  assert.equal(stateHash(copy), stateHash(w));
});
