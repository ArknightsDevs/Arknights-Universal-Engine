// Tactical points (docs/spec/summons.md 召唤-11), 不死 (status.md 状态-5, damage.md 伤害-9) and units that cannot retreat
// (field.md 撤退-1) on the tiny level. Test names cite the clauses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent } from '@aue/testkit';
import { createWorld, step, takeSnapshot, restoreSnapshot, stateHash } from '../src/index.js';
import { makeEnemy } from '../src/units.js';
import { statsOf } from '../src/attrs.js';
import { makeBuff, addBuff } from '../src/buffs.js';
import { dealDamage, setHp } from '../src/damage.js';
import { selectable } from '../src/targeting.js';
import { spawnSummon } from '../src/summons.js';
import { atPoint } from '../src/tactical.js';

/** @typedef {import('../src/types.js').Unit} Unit @typedef {import('../src/types.js').World} World */

/** The tiny level without spawns; the sniper's summon `crab` is a tactical point: 2 s at its point, one more blocked. */
function arena() {
  const c = tinyContent();
  c.level.waves = [];
  c.operators.crab = {
    name: 'crab', position: 'MELEE', cost: 0, blockCnt: 0, baseAttackTime: 1, maxHp: 400, atk: 10, def: 0, res: 0, range: [{ row: 0, col: 0 }],
    respawnTime: 10, summoner: 'sniper', summon: { deployLimit: 1, holdLimit: 1, supply: 1, occupy: 0, respawn: 'default', tactical: { every: 2, block: 1 } },
  };
  const w = createWorld(c, { seed: 1, players: 1 });
  w.players[0].cost = 99;
  /** @param {string} op @param {number} row @param {number} col */
  const deploy = (op, row, col) => ({ type: /** @type {const} */ ('deploy'), op, row, col, dir: 0 });
  /** @param {number} unit */
  const retreat = (unit) => ({ type: /** @type {const} */ ('retreat'), unit });
  /** @param {string} key @returns {Unit | undefined} */
  const unit = (key) => w.units.find((u) => u.key === key);
  return { w, c, deploy, retreat, unit };
}

/** A rooted enemy on a tile, with a lot of HP. @param {World} w @param {any} c @param {number} row @param {number} col */
function foe(w, c, row, col) {
  const e = makeEnemy(w, c, { key: 'slime', route: 0 });
  e.x = col; e.y = row;
  e.hp = statsOf(e).maxHp;
  w.units.push(e);
  return e;
}

test('[召唤-11] knocked out in its summon form, a tactical point: invincible, undying, no attacks, unselectable, blocking nothing, not retreated; back at full HP after its time', () => {
  const { w, c, deploy, retreat, unit } = arena();
  step(w, c, [[0, deploy('sniper', 2, 2)]]);
  step(w, c, [[0, deploy('crab', 1, 2)]]);
  const crab = /** @type {Unit} */ (unit('crab'));
  assert.deepEqual([statsOf(crab).blockCnt, atPoint(crab)], [1, false], 'its summon form blocks one more than its data');
  const e = foe(w, c, 1, 2);
  e.blockedBy = crab.id;
  setHp(crab, 0);
  step(w, c);
  assert.equal(unit('crab'), crab, 'still on the field');
  const s = statsOf(crab);
  assert.deepEqual([atPoint(crab), crab.hp, s.blockCnt, e.blockedBy, selectable(crab)], [true, 1, 0, -1, false]);
  assert.deepEqual([s.invincible, s.flags.undying, s.flags.noAttack, s.flags.noRetreat], [true, true, true, true]);
  assert.equal(dealDamage(w, e, crab, { type: 'phys', amount: 999 }, c), 0, 'invincible');
  step(w, c, [[0, retreat(crab.id)]]);
  assert.equal(unit('crab'), crab, 'its point is not retreated');
  const snap = takeSnapshot(w), again = restoreSnapshot(snap);
  for (let i = 0; i < 58; i++) { step(w, c); step(again, c); }
  assert.equal(atPoint(crab), true, 'one frame short of 2 s');
  step(w, c); step(again, c);
  assert.equal(atPoint(crab), false, '2 s after: its summon form again');
  assert.deepEqual([crab.hp, statsOf(crab).blockCnt], [400, 1], 'at full HP');
  assert.equal(stateHash(again), stateHash(w), 'its form is state: a snapshot runs on the same');
});

test('[召唤-11] its player\'s retreat turns its summon form into its point; its owner\'s leaving takes it off; one content summoned has no forms', () => {
  const { w, c, deploy, retreat, unit } = arena();
  step(w, c, [[0, deploy('sniper', 2, 2)]]);
  step(w, c, [[0, deploy('crab', 1, 2)]]);
  const crab = /** @type {Unit} */ (unit('crab')), sniper = /** @type {Unit} */ (unit('sniper'));
  step(w, c, [[0, retreat(crab.id)]]);
  assert.deepEqual([unit('crab') === crab, atPoint(crab), crab.hp], [true, true, 400]);
  step(w, c, [[0, retreat(sniper.id)]]);
  assert.equal(unit('crab'), undefined, 'gone with its owner, point and all (召唤-5)');
  w.players[0].cards.sniper.ready = 0;
  step(w, c, [[0, deploy('sniper', 2, 2)]]);
  const owner = /** @type {Unit} */ (unit('sniper')), spawned = /** @type {Unit} */ (spawnSummon(w, c, owner, 'crab', { row: 1, col: 3 }));
  assert.equal(statsOf(spawned).blockCnt, 0, 'no summon form');
  setHp(spawned, 0);
  step(w, c);
  assert.equal(w.units.includes(spawned), false, 'at 0 HP it leaves');
});

test('[状态-5] [伤害-9] 不死: neither damage nor a set HP takes it below 1', () => {
  const { w, c, deploy, unit } = arena();
  step(w, c, [[0, deploy('sniper', 2, 2)]]);
  const sniper = /** @type {Unit} */ (unit('sniper'));
  addBuff(sniper, makeBuff({ key: 'undying', flags: { undying: true } }));
  dealDamage(w, null, sniper, { type: 'true', amount: 1e6 }, c);
  assert.equal(sniper.hp, 1);
  setHp(sniper, 0);
  step(w, c);
  assert.deepEqual([sniper.hp, unit('sniper') === sniper], [1, true]);
});

test('[撤退-1] an operator that cannot retreat (noRetreat) stays', () => {
  const { w, c, deploy, retreat, unit } = arena();
  step(w, c, [[0, deploy('sniper', 2, 2)]]);
  const sniper = /** @type {Unit} */ (unit('sniper'));
  addBuff(sniper, makeBuff({ key: 'held', flags: { noRetreat: true } }));
  step(w, c, [[0, retreat(sniper.id)]]);
  assert.equal(unit('sniper'), sniper);
});
