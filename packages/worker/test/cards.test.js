// The deck's state the battle UI reads (界面-10, 界面-23) and the deploy marks of a summon (召唤-4, 渲染-8). Test names
// cite the clauses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step } from '@aue/sim';
import { tinyContent } from '@aue/testkit';
import { operatorCards, summonCards } from '../src/cards.js';
import { deployableKeys } from '../src/marks.js';

const base = tinyContent();
/** A summon record of the guard. @param {Record<string, any>} s @returns {any} */
const summon = (s) => ({
  name: 'wolf', position: 'MELEE', cost: 0, blockCnt: 1, baseAttackTime: 1, maxHp: 100, atk: 10, def: 0, res: 0, range: [{ row: 0, col: 0 }], respawnTime: 10,
  summoner: 'guard', summon: { deployLimit: 1, holdLimit: 1, supply: 1, occupy: 1, respawn: 'default', ...s },
});
const c = /** @type {any} */ ({ ...base, operators: { ...base.operators, wolf: summon({ ownerRange: true }), mark: summon({ respawn: 'unique', occupy: 0 }), probe: summon({ supply: 0 }) },
  decks: [['guard', 'sniper']] });
const deploy = (/** @type {Record<string, any>} */ o) => /** @type {any} */ ({ type: 'deploy', op: 'guard', row: 1, col: 2, dir: 0, ...o });

test('[界面-23] [召唤-4] the summon cards: shown with their owner on the field, the copies, full, a deploy place taken', () => {
  const w = createWorld(c, { seed: 1, players: 1 });
  assert.deepEqual(Object.keys(summonCards(w, c, 0)), ['wolf', 'mark'], 'a summon with no card has none');
  assert.equal(summonCards(w, c, 0).wolf.shown, false, 'its owner not on the field');
  assert.equal(summonCards(w, c, 0).mark.shown, false);
  step(w, c, [[0, deploy({})]]);
  assert.deepEqual(summonCards(w, c, 0).wolf, { cost: 0, ready: 0, held: 1, cooling: 0, shown: true, full: false, occupy: true });
  step(w, c, [[0, deploy({ op: 'wolf', col: 3 })], [0, deploy({ op: 'mark', col: 1 })]]);
  const s = summonCards(w, c, 0);
  assert.deepEqual([s.wolf.shown, s.wolf.held, s.wolf.full], [false, 0, true], '默认: all used, none shown');
  assert.deepEqual([s.mark.shown, s.mark.held, s.mark.full], [true, 0, true], '唯一: shown while its one is on the field');
  assert.equal(operatorCards(w, c, 0).slots, 0, 'the guard and the wolf (部署占用数 1) take the two places');
  assert.deepEqual(operatorCards(w, c, 0).cards.guard, { cost: 5, ready: 0 });
});

test('[召唤-4] [渲染-8] a summon that may only stand in its owner\'s range: its marks are the free tiles the owner reaches now', () => {
  const w = createWorld(c, { seed: 1, players: 1 });
  assert.deepEqual(deployableKeys(w, c, 'wolf', 0), [], 'no owner: nowhere');
  step(w, c, [[0, deploy({})]]);
  assert.deepEqual(deployableKeys(w, c, 'wolf', 0), [1 * 6 + 3], 'the guard reaches (1, 2) and (1, 3); it stands on (1, 2)');
  assert.ok(deployableKeys(w, c, 'mark', 0).length > 1, 'any other summon: every tile it fits');
});
