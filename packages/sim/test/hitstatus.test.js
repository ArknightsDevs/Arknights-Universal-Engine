// What a skill's hit gives its target (docs/spec/skills.md 技能-9, 元素-2): a status with its seconds on the main target
// and on the others, one that is not given to a target already asleep, 隐匿失效 with it, and 元素损伤 of a share of the
// damage a hit did.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent } from '@aue/testkit';
import { createWorld, step, bus } from '../src/index.js';
import { forceSp } from '../src/sp.js';
import { makeEnemy } from '../src/units.js';
import { applyStatus } from '../src/status.js';
import { statsOf } from '../src/attrs.js';
import { addBuff, makeBuff } from '../src/buffs.js';
import { epOf } from '../src/elements.js';
import { stealthed } from '../src/targeting.js';

/** @typedef {import('../src/types.js').SkillDef} SkillDef @typedef {import('../src/types.js').Unit} Unit */

/** A MANUAL skill running 20 s with a plain attack. @param {Partial<SkillDef>} o @returns {SkillDef} */
const sk = (o) => ({ id: 'hits', type: 'MANUAL', sp: 'time', cost: 5, init: 0, charges: 1, duration: 20, ammo: false, bb: {}, ...o });
/** The guard's trait with a splash: radius 1, half the damage. */
const SPLASH = { splash: { radius: 1, scale: 0.5, ground: true } };

/**
 * The tiny level without spawns: the guard (attack 50, an attack a second; range: its tile and the next) with the skill,
 * at (1, 1) facing right, with the trait given; rooted enemies, def 0, a billion HP, at the given x on its row, `prep`
 * changing them; the skill started. The statuses the guard gives are recorded as [target id, frames].
 * @param {SkillDef} skill @param {number[]} at @param {{ trait?: object, prep?: (e: Unit) => void }} [o]
 */
function arena(skill, at, o = {}) {
  const c = /** @type {any} */ (tinyContent());
  c.level.waves = [];
  c.operators.guard.skill = skill;
  if (o.trait) c.operators.guard.trait = o.trait;
  const w = createWorld(c, { seed: 1, players: 2 });
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 1, dir: 0 }]]);
  const op = /** @type {Unit} */ (w.units.find((u) => u.key === 'guard'));
  const foes = at.map((x) => {
    const e = makeEnemy(w, c, { key: 'slime', route: 0 });
    e.x = x; e.y = 1; e.base = { ...e.base, maxHp: 1e9, def: 0, res: 0, moveSpeed: 1 }; e.hp = 1e9; e.maxHp = 1e9;
    w.units.push(e);
    applyStatus(e, 'root', {});
    o.prep?.(e);
    return e;
  });
  /** @type {[number, number][]} */
  const given = [];
  bus.on(w, 'beforeStatus', (k) => { if (k.source === op) given.push([k.target.id, k.frames]); });
  forceSp(/** @type {any} */ (op.skill), 99);
  step(w, c, [[0, { type: 'skill', unit: op.id }]]);
  return { w, c, op, foes, given };
}

/** Runs n frames. @param {any} w @param {any} c @param {number} n */
const run = (w, c, n) => { for (let i = 0; i < n; i++) step(w, c, []); };

test('[技能-9] a status on the attack\'s main target for its `main` seconds, on one splashed to for its own', () => {
  const { w, c, foes, given } = arena(sk({ extra: { attack: { hitStatus: { key: 'stun', seconds: 0.8, main: 1.5 } } } }), [2, 2.5], { trait: SPLASH });
  run(w, c, 25);
  const [main, splashed] = foes;
  assert.deepEqual(given.filter(([id]) => id === main.id).map(([, f]) => f), [45], '1.5 s on the main target');
  assert.deepEqual(given.filter(([id]) => id === splashed.id).map(([, f]) => f), [24], '0.8 s on the one around it');
});

test('[技能-9] a status for the main target only (seconds 0): the one splashed to is not given it, and no event is sent for it', () => {
  const { w, c, foes, given } = arena(sk({ extra: { attack: { hitStatus: { key: 'levitate', seconds: 0, main: 2 } } } }), [2, 2.5], { trait: SPLASH });
  run(w, c, 25);
  assert.deepEqual(given, [[foes[0].id, 60]], 'the main target only');
});

test('[技能-9] a 沉睡 for a target that is not asleep: one already asleep is not given another', () => {
  const skill = sk({ extra: { attack: { hitStatus: { key: 'sleep', seconds: 5, unless: 'sleep' } } } });
  const asleep = arena(skill, [2], { prep: (e) => applyStatus(e, 'sleep', { seconds: 100 }) });
  run(asleep.w, asleep.c, 70);
  assert.deepEqual(asleep.given, [], 'asleep: none');
  const awake = arena(skill, [2]);
  run(awake.w, awake.c, 70);
  assert.equal(awake.given.length, 1, 'awake: it sleeps at the first hit, and the next ones find it asleep');
});

test('[技能-9] a chance of a status is drawn for every hit, a 余震 included', () => {
  const { w, c, given } = arena(sk({ extra: { attack: { hitStatus: { key: 'stun', seconds: 1, prob: 1 } } } }), [2], { trait: { aftershock: 0.5, aftershocks: 2 } });
  run(w, c, 25);
  assert.equal(given.length, 3, 'the attack and its two aftershocks each gave it');
});

test('[技能-9] [状态-5] 隐匿失效 with the hit (an attack that can hit 隐匿 ones): a buff flag for the same seconds, the time starting again at each hit; no status of its own', () => {
  const lurk = (/** @type {Unit} */ e) => {
    addBuff(e, makeBuff({ key: 'lurk', flags: { stealth: true } }));
    assert.equal(stealthed(e), true, 'hidden before the hit');
  };
  const { w, c, foes, given } = arena(sk({ duration: 1, extra: { attack: { hitStatus: { key: 'cold', seconds: 4 }, hitDebuff: { seconds: 4, mods: {}, flags: { unstealth: true } } } } }), [2], { prep: lurk, trait: { seeStealth: true } });
  const e = foes[0];
  run(w, c, 25);
  assert.equal(stealthed(e), false, '隐匿 does not take effect while the buff is on');
  assert.equal(statsOf(e).flags.unstealth, true);
  assert.deepEqual([...new Set(given.map(([, f]) => f))], [120], 'the status it gives is the 寒冷 alone');
  run(w, c, 4 * 30 + 5);
  assert.equal(stealthed(e), true, 'back after the seconds, the skill over');
});

test('[技能-9] [元素-2] 元素损伤 of a share of the damage a hit did: the HP it took, after the defences', () => {
  const ratio = sk({ bb: { atk_scale: 3 }, extra: { attack: { element: 'FIRE', epRatio: 0.5 } } });
  const open = arena(ratio, [2]);
  const ep0 = epOf(open.foes[0], 'FIRE');
  run(open.w, open.c, 30);
  assert.equal(ep0 - epOf(open.foes[0], 'FIRE'), 50 * 3 * 0.5, 'one attack of 150: half of it');
  const armoured = arena(ratio, [2], { prep: (e) => { e.base = { ...e.base, def: 60 }; } });
  const ep1 = epOf(armoured.foes[0], 'FIRE');
  run(armoured.w, armoured.c, 30);
  assert.equal(ep1 - epOf(armoured.foes[0], 'FIRE'), (150 - 60) * 0.5, 'the HP it took is 90: half of that');
  const share = arena(sk({ bb: { atk_scale: 3 }, extra: { attack: { element: 'FIRE', epScale: 0.5 } } }), [2]);
  const ep2 = epOf(share.foes[0], 'FIRE');
  run(share.w, share.c, 30);
  assert.equal(ep2 - epOf(share.foes[0], 'FIRE'), 50 * 0.5, 'a share of the operator\'s attack (epScale) is its own reading');
});

test('[技能-9] [元素-2] 元素损伤 of a share of the damage: a splashed target and each aftershock count the HP they took, not the main hit\'s', () => {
  const ratio = sk({ bb: { atk_scale: 3 }, extra: { attack: { element: 'FIRE', epRatio: 0.5 } } });
  const splash = arena(ratio, [2, 2.5], { trait: SPLASH });
  const hp = splash.foes.map((e) => e.hp), ep = splash.foes.map((e) => epOf(e, 'FIRE'));
  run(splash.w, splash.c, 30);
  assert.deepEqual(splash.foes.map((e, i) => hp[i] - e.hp), [150, 75], 'the main target takes 150, the one splashed to half of it');
  assert.deepEqual(splash.foes.map((e, i) => ep[i] - epOf(e, 'FIRE')), [75, 37.5], 'half of the HP each took');
  const shocks = arena(ratio, [2], { trait: { aftershock: 0.5, aftershocks: 2 } });
  const [foe] = shocks.foes, hp0 = foe.hp, ep0 = epOf(foe, 'FIRE');
  run(shocks.w, shocks.c, 30);
  assert.equal(hp0 - foe.hp, 150 + 75 + 75, 'the attack and its two aftershocks');
  assert.equal(ep0 - epOf(foe, 'FIRE'), (150 + 75 + 75) * 0.5, 'half of all three: the aftershocks carry it too');
});
