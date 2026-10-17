// What a module changes about an operator's card and summons (docs/spec/traits.md 职业-21): its first deployment's cost,
// its first retreat's 再部署时间, a refund without the cap, summons that take no place, boosted summons, and the auras
// on the operator in front and on its summons, the flags while its skill runs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { secondsToFrames } from '@aue/math';
import { createWorld, step, deployProblem } from '../src/index.js';
import { tinyContent } from '@aue/testkit';
import { deployCost, withdraw, cardOf } from '../src/deck.js';
import { statsOf } from '../src/attrs.js';
import { makeOperator } from '../src/units.js';
import { auras } from '../src/aura.js';
import { traitWhiles } from '../src/whiles.js';

/** @typedef {import('../src/types.js').Unit} Unit @typedef {import('../src/types.js').OperatorDef} OperatorDef */

/** A summon record of the guard's. @param {Partial<OperatorDef>} o @returns {OperatorDef} */
const summon = (o = {}) => ({
  name: 'summon', position: 'MELEE', cost: 2, blockCnt: 1, baseAttackTime: 1, maxHp: 100, atk: 10, def: 0, res: 0, range: [{ row: 0, col: 0 }],
  respawnTime: 10, ...o, summoner: 'guard', summon: { deployLimit: 3, holdLimit: 3, supply: 3, occupy: 1, respawn: 'default' },
});
/** The tiny level, the guard with this trait, a summon of its, a deploy limit. @param {Record<string, any>} trait @param {number} [limit] */
function arena(trait, limit = 9) {
  const base = tinyContent();
  const c = /** @type {any} */ ({ ...base, level: { ...base.level, waves: [], options: { ...base.level.options, characterLimit: limit } },
    operators: { ...base.operators, guard: { ...base.operators.guard, trait }, tentacle: summon({ respawnTime: 0 }) } });
  const w = createWorld(c, { seed: 1, players: 1 });
  w.players[0].cost = 99;
  return { w, c };
}
/** @param {Partial<import('@aue/schema').DeployCommand>} o @returns {import('@aue/schema').DeployCommand} */
const deploy = (o) => ({ type: 'deploy', op: 'guard', row: 1, col: 1, dir: 0, ...o });
/** @param {any} w @param {string} key @returns {Unit} */
const unitOf = (w, key) => /** @type {Unit} */ (w.units.find((/** @type {Unit} */ u) => u.key === key));

test('[职业-21] [部署-3] before its first deployment the cost changes, never below 0; not after', () => {
  const { w, c } = arena({ firstCost: -4 });
  assert.equal(deployCost(c, w.players[0], 'guard'), 1);
  c.operators.guard.trait = { firstCost: -9 };
  assert.equal(deployCost(c, w.players[0], 'guard'), 0);
  step(w, c, [[0, deploy({})]]);
  assert.equal(deployCost(c, w.players[0], 'guard'), 5, 'on the field: not a first deployment');
  withdraw(w, c, unitOf(w, 'guard'));
  assert.equal(deployCost(c, w.players[0], 'guard'), 7);
});

test('[职业-21] [撤退-1] its first retreat\'s 再部署时间 × the share; a refund without the cap at its initial cost', () => {
  const { w, c } = arena({ firstRetreatRespawn: 0.65, refund: 0.8, refundUncapped: true });
  c.operators.guard.respawnTime = 20;
  step(w, c, [[0, deploy({})]]);
  const g = unitOf(w, 'guard');
  g.paid = 10;
  w.players[0].cost = 0;
  const cost = w.players[0].cost;
  withdraw(w, c, g);
  assert.deepEqual([w.players[0].cost - cost, cardOf(w.players[0], 'guard').ready - w.frame], [8, secondsToFrames(20 * 0.65)]);
  w.players[0].cards.guard.ready = w.frame;
  step(w, c, [[0, deploy({})]]);
  withdraw(w, c, unitOf(w, 'guard'));
  assert.equal(cardOf(w.players[0], 'guard').ready - w.frame, secondsToFrames(20), 'its second retreat: the whole time');
});

test('[职业-21] [部署-2] some of its summons take no place in the deploy limit', () => {
  const { w, c } = arena({ freeSummons: 1 }, 2);
  step(w, c, [[0, deploy({})]]);
  step(w, c, [[0, deploy({ op: 'tentacle', col: 2 })]]);
  assert.equal(deployProblem(w, c, 0, deploy({ op: 'tentacle', col: 3 })), null, 'the first summon took no place');
  step(w, c, [[0, deploy({ op: 'tentacle', col: 3 })]]);
  assert.equal(deployProblem(w, c, 0, deploy({ op: 'tentacle', col: 4 })), 'deploy limit reached');
});

test('[职业-21] a summon deployed from its card is boosted at the chance', () => {
  const sure = arena({ summonBoost: { prob: 1, scale: 2 } }), never = arena({ summonBoost: { prob: 0, scale: 2 } });
  for (const { w, c } of [sure, never]) {
    step(w, c, [[0, deploy({})]]);
    step(w, c, [[0, deploy({ op: 'tentacle', col: 2 })]]);
  }
  assert.deepEqual([statsOf(unitOf(sure.w, 'tentacle')).dmgDealtMul, statsOf(unitOf(never.w, 'tentacle')).dmgDealtMul], [2, 1]);
});

test('[职业-21] while its skill runs: the operator in front of it, and flags on itself; its summons all the while', () => {
  const { w, c } = arena({
    auras: [{ to: 'frontAlly', skill: true, mods: { blockCnt: 1 } }, { to: 'summons', mods: { blockedTakenMul: 0.85 } }],
    whiles: [{ when: 'inSkill', mods: {}, flags: { camou: true } }],
  });
  step(w, c, [[0, deploy({})]]);
  const g = unitOf(w, 'guard'), front = makeOperator(w, c, { key: 'sniper', owner: 0, row: 1, col: 2, dir: 0 });
  const mine = makeOperator(w, c, { key: 'tentacle', owner: 0, row: 2, col: 3, dir: 0, summoner: g.id });
  w.units.push(front, mine);
  const keys = (/** @type {Unit} */ u) => u.buffs.filter((b) => b.key.startsWith('mod:')).map((b) => b.key.split(':')[2]);
  auras(w, c);
  assert.deepEqual([keys(front), keys(mine), statsOf(g).flags.camou], [[], ['1'], undefined]);
  g.skill = /** @type {any} */ ({ active: true });
  auras(w, c);
  traitWhiles(w, c, g);
  assert.deepEqual([keys(front), statsOf(front).blockCnt, statsOf(g).flags.camou], [['0'], c.operators.sniper.blockCnt + 1, true]);
});
