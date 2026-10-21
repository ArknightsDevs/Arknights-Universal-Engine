// Talents on the operators around and on the field (docs/spec/traits.md 职业-32, docs/spec/field.md 部署-6): buffs for
// the field by what a unit is, kill stacks shared with a faction, gains shared with allies chosen at random, in-range
// talents for others, by the source's state, behind it and facing its way, and the conditions by allies, blocked
// enemies, factions, tiles and time.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent } from '@aue/testkit';
import { createWorld, step } from '../src/index.js';
import { makeEnemy, makeOperator } from '../src/units.js';
import { applyStatus } from '../src/status.js';
import { statsOf } from '../src/attrs.js';
import { addBuff, makeBuff } from '../src/buffs.js';
import { traitWhiles } from '../src/whiles.js';
import { auras } from '../src/aura.js';
import { withdraw } from '../src/deck.js';

/** @typedef {import('../src/types.js').Unit} Unit */

/**
 * The tiny level without waves for two seats, cost enough; the guard (its tile and two ahead) with these record fields,
 * more records over the sniper's. `deploy` deploys a record of seat 0 facing right, `put` puts a unit of seat 1 there
 * (facing `dir`), `foe` a rooted enemy, `frames` steps; `buff` the modifiers of a unit's buff whose key begins so.
 * @param {Record<string, any>} rec @param {Record<string, Record<string, any>>} [others]
 */
function arena(rec = {}, others = {}) {
  const c = tinyContent();
  c.level.waves = [];
  Object.assign(c.operators.guard, { range: [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }], ...rec });
  for (const [k, v] of Object.entries(others)) c.operators[k] = { ...c.operators.sniper, ...v };
  const w = createWorld(c, { seed: 1, players: 2 });
  w.players[0].cost = 99;
  const unit = (/** @type {string} */ key) => /** @type {Unit} */ (w.units.find((u) => u.key === key));
  const deploy = (key = 'guard', row = 1, col = 1) => { step(w, c, [[0, { type: 'deploy', op: key, row, col, dir: 0 }]]); return unit(key); };
  const put = (/** @type {string} */ key, /** @type {number} */ row, /** @type {number} */ col, /** @type {any} */ dir = 0) => {
    const u = makeOperator(w, c, { key, owner: 1, row, col, dir });
    w.units.push(u);
    return u;
  };
  /** @param {number} row @param {number} col */
  const foe = (row, col) => {
    const e = makeEnemy(w, c, { key: 'slime', route: 0 });
    e.x = col; e.y = row;
    applyStatus(e, 'root', {});
    w.units.push(e);
    return e;
  };
  const frames = (/** @type {number} */ n) => { for (let i = 0; i < n; i++) step(w, c, []); };
  const buff = (/** @type {Unit} */ u, /** @type {string} */ key) => u.buffs.find((b) => b.key.startsWith(key))?.mods;
  return { w, c, deploy, put, foe, frames, buff, unit };
}

test('[职业-32] field buffs by block count and position, by rarity, by profession with another one there, by ammo skill twice for a faction', () => {
  const skill = { id: 's', type: 'MANUAL', sp: 'none', cost: 10, init: 0, charges: 1, duration: 5, ammo: true, bb: {} };
  const a = arena({ talentTrait: { fieldBuffs: [{ melee: true, minBlock: 3, mods: { aspd: 8 } }, { rarity: 3, mods: { atkPct: 0.11 } },
    { profession: 'MEDIC', needOther: true, mods: { atkPct: 0.1 } }, { ammo: true, mods: { atkPct: 0.13 }, double: { power: 'laterano', mul: 2 } }] } },
  { tank: { position: 'MELEE', blockCnt: 3, rarity: 3 }, medic: { profession: 'MEDIC' }, gunner: { skill, powers: ['laterano'] }, rifle: { skill } });
  a.c.operators.guard.profession = 'MEDIC';
  const g = a.deploy(), [tank, medic, gunner, rifle] = [a.put('tank', 1, 3), a.put('medic', 0, 2), a.put('gunner', 0, 3), a.put('rifle', 2, 2)];
  auras(a.w, a.c);
  assert.deepEqual([a.buff(tank, 'fieldBuff:'), a.buff(medic, 'fieldBuff:'), a.buff(gunner, 'fieldBuff:'), a.buff(rifle, 'fieldBuff:')],
    [{ aspd: 8 }, { atkPct: 0.1 }, { atkPct: 0.26 }, { atkPct: 0.13 }]);
  assert.deepEqual([tank.buffs.filter((b) => b.key.startsWith('fieldBuff:')).length, a.buff(g, 'fieldBuff:')], [2, { atkPct: 0.1 }], 'block 3 and 3 stars; the holder a medic too');
  medic.hp = 0;
  a.frames(1);
  auras(a.w, a.c);
  assert.deepEqual([a.buff(g, 'fieldBuff:'), a.buff(tank, 'fieldBuff:')], [undefined, { aspd: 8 }], 'no other medic');
  withdraw(a.w, a.c, g);
  auras(a.w, a.c);
  assert.equal(a.buff(tank, 'fieldBuff:'), undefined, 'gone with the holder');
});

test('[职业-32] field buffs for a faction above an HP share, with flags, × after the holder has been on the field a while', () => {
  const a = arena({ talentTrait: { fieldBuffs: [{ power: 'kjerag', hpAbove: 0.5, mods: { defFlat: 80 }, flags: { 'immune:freeze': true }, after: 15, afterMul: 2 }] } },
    { kj: { powers: ['kjerag'] } });
  a.deploy();
  const k = a.put('kj', 0, 2);
  auras(a.w, a.c);
  assert.deepEqual([a.buff(k, 'fieldBuff:'), statsOf(k).flags['immune:freeze']], [{ defFlat: 80 }, true]);
  a.frames(450);
  auras(a.w, a.c);
  assert.deepEqual(a.buff(k, 'fieldBuff:'), { defFlat: 160 });
  k.hp = 0.4 * statsOf(k).maxHp;
  auras(a.w, a.c);
  assert.equal(a.buff(k, 'fieldBuff:'), undefined);
});

test('[职业-32] kill stacks shared with the other units of a faction, × the steps', () => {
  const a = arena({ powers: ['abyssal'], talentTrait: { stacks: [{ on: 'kill', max: 10, shared: true, mods: { atkFlat: 30 } }], stackShare: { power: 'abyssal', mods: { atkFlat: 15 } } } },
    { hunter: { powers: ['abyssal'] } });
  const g = a.deploy(), h = a.put('hunter', 0, 2);
  auras(a.w, a.c);
  assert.equal(a.buff(h, 'stackShare:'), undefined);
  addBuff(g, makeBuff({ key: 'stack:0', src: g.id, value: 3, mods: { atkFlat: 90 } }));
  auras(a.w, a.c);
  assert.deepEqual([a.buff(h, 'stackShare:'), a.buff(g, 'stackShare:')], [{ atkFlat: 45 }, undefined]);
});

test('[职业-32] a gain shared with allies at random: those in range now, the rest for ones that arrive, the holder\'s own once shared; gone as it leaves', () => {
  const a = arena({ talentTrait: { shareGain: { inRange: true, count: 2, self: true, mods: { atkPct: 0.1 } } } }, { mate: {}, mate2: { position: 'MELEE' }, far: {} });
  const m = a.put('mate', 1, 2), f = a.put('far', 2, 5), g = a.deploy();
  assert.deepEqual([a.buff(m, 'share:'), a.buff(f, 'share:'), a.buff(g, 'shareSelf'), g.buffs.find((b) => b.key === 'shareLeft')?.value], [{ atkPct: 0.1 }, undefined, { atkPct: 0.1 }, 1]);
  const m2 = a.deploy('mate2', 1, 3);
  assert.deepEqual([a.buff(m2, 'share:'), g.buffs.some((b) => b.key === 'shareLeft')], [{ atkPct: 0.1 }, false]);
  withdraw(a.w, a.c, g);
  assert.deepEqual([a.buff(m, 'share:'), a.buff(m2, 'share:')], [undefined, undefined]);
});

test('[职业-32] a gain shared after a while, for one of a faction with an ammo skill', () => {
  const skill = { id: 's', type: 'MANUAL', sp: 'none', cost: 10, init: 0, charges: 1, duration: 5, ammo: true, bb: {} };
  const a = arena({ talentTrait: { shareGain: { power: 'laterano', ammo: true, count: 1, after: 20, mods: { ammoFlat: 1 } } } }, { gunner: { skill, powers: ['laterano'] }, plain: { powers: ['laterano'] } });
  const p = a.put('plain', 0, 2), gun = a.put('gunner', 0, 3);
  a.deploy();
  a.frames(599);
  assert.equal(a.buff(gun, 'share:'), undefined);
  a.frames(1);
  assert.deepEqual([a.buff(gun, 'share:'), a.buff(p, 'share:')], [{ ammoFlat: 1 }, undefined]);
});

test('[部署-6] [职业-32] in-range talents: others with less HP than the source, only while the source does not block, behind it turned with it, facing its way', () => {
  const a = arena({ rangeTalents: [
    { side: 'ally', ranged: false, others: true, when: { when: 'hpRatioAtMostSrc' }, mods: { physTakenMul: 0.84 } },
    { side: 'ally', ranged: false, area: [{ row: 1, col: 0 }], srcWhen: 'notBlocking', mods: { defPct: 0.12 } },
    { side: 'ally', ranged: false, area: [{ row: 0, col: -1 }], rotate: true, professions: ['WARRIOR'], mods: { defFlat: 70 } },
    { side: 'ally', ranged: false, area: [{ row: 0, col: 0 }, { row: 0, col: 1 }], when: { when: 'sameDir' }, mods: { hpPct: 0.04 } },
  ] }, { mate: {}, below: {}, back: { profession: 'WARRIOR' } });
  const g = a.deploy('guard', 1, 2), m = a.put('mate', 1, 3), b = a.put('below', 2, 2, 'DOWN'), back = a.put('back', 1, 1);
  m.hp = 0.5 * statsOf(m).maxHp;
  auras(a.w, a.c);
  const keys = (/** @type {Unit} */ u) => u.buffs.filter((x) => x.key.startsWith('range:')).map((x) => Number(x.key.split(':')[2])).sort();
  assert.deepEqual([keys(g), keys(m), keys(b), keys(back)], [[3], [0, 3], [1], [2]]);
  a.foe(1, 2).blockedBy = g.id;
  g.dir = 'LEFT';
  auras(a.w, a.c);
  assert.deepEqual([keys(b), keys(back)], [[], [0]], 'blocking; turned, the tile behind is another — that one now in its range');
});

test('[职业-32] conditions: allies or a faction in its range or its summons\', allies around, blocked enemies beyond the first, a faction on the field, 高地 around, water, time', () => {
  const a = arena({ talentTrait: { whiles: [
    { when: 'rangeAllyOnly', power: 'abyssal', mods: { atkPct: 0.09 } }, { when: 'rangeAlly', power: 'abyssal', mods: { atkPct: 0.18 } },
    { when: 'alliesNear', per: 8, mods: { atkPct: 0.06 } }, { when: 'blockedExtra', per: 9, mods: { defPct: 0.05 } },
    { when: 'powerOnField', power: 'laterano', per: 4, mods: { ammoFlat: 1 } }, { when: 'highAround', value: 2, mods: { defPct: 0.1 } },
    { when: 'waterMap', mods: { atkPct: 0.24 } }, { when: 'onFieldFor', value: 20, mods: { ammoFlat: 3 } },
  ] } }, { mate: {}, hunter: { powers: ['abyssal'] }, lat: { powers: ['laterano'] } });
  const g = a.deploy('guard', 1, 2);
  const on = () => { traitWhiles(a.w, a.c, g); return g.buffs.filter((b) => b.key.startsWith('while:')).map((b) => Number(b.key.slice(6))).sort((x, y) => x - y); };
  assert.deepEqual(on(), [5]);
  a.put('mate', 1, 3);
  a.put('lat', 2, 3);
  for (const col of [2, 3]) a.foe(1, col).blockedBy = g.id;
  assert.deepEqual([on(), a.buff(g, 'while:2'), a.buff(g, 'while:3'), a.buff(g, 'while:4')], [[0, 2, 3, 4, 5], { atkPct: 0.12 }, { defPct: 0.05 }, { ammoFlat: 1 }]);
  a.put('hunter', 1, 4);
  assert.deepEqual(on().slice(0, 2), [1, 2]);
  a.c.level.tiles[0][0] = { ...a.c.level.tiles[0][0], key: 'tile_deepwater' };
  const b = arena({ talentTrait: { whiles: [{ when: 'waterMap', mods: { atkPct: 0.24 } }, { when: 'onFieldFor', value: 20, mods: { ammoFlat: 3 } }] } });
  b.c.level.tiles[0][0] = { ...b.c.level.tiles[0][0], key: 'tile_deepwater' };
  const g2 = b.deploy();
  b.frames(600);
  traitWhiles(b.w, b.c, g2);
  assert.deepEqual([a.buff(g2, 'while:0'), a.buff(g2, 'while:1')], [{ atkPct: 0.24 }, { ammoFlat: 3 }]);
});
