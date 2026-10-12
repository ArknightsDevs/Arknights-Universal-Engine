// 玉门天灾工事 (docs/spec/field.md 地图-3) on the tiny level with (1, 2) a 工事: with the level's rule a ground unit on it
// deals ×dealt to ground units on ordinary tiles and takes ×taken from them, and the two do not block each other.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent } from '@aue/testkit';
import { createWorld } from '../src/index.js';
import { makeEnemy, makeOperator } from '../src/units.js';
import { dealDamage } from '../src/damage.js';
import { tryBlock } from '../src/blocking.js';
import { worksMul, onWorks } from '../src/works.js';

const WORKS = { key: 'tile_passable_wall', height: 'LOWLAND', buildable: 'RANGED', passable: 'ALL', side: 'ALL' };

/** The tiny level with a 工事 on (1, 2), the rule on or off; a sniper on it, a slime on the road at (1, 4). @param {boolean} rule */
function field(rule) {
  const c = /** @type {any} */ (tinyContent());
  c.level.tiles[1][2] = WORKS;
  if (rule) c.level.works = { dealt: 1.3, taken: 0.7 };
  c.enemies.slime = { ...c.enemies.slime, maxHp: 1000, def: 0 };
  const w = createWorld(c, { seed: 1, players: 1 }), op = makeOperator(w, c, { key: 'sniper', owner: 0, row: 1, col: 2, dir: 0 }), e = makeEnemy(w, c, { key: 'slime', route: 0 });
  e.x = 4; e.y = 1;
  w.units.push(op, e);
  return { c, w, op, e };
}

test('[地图-3] [伤害-7] on a 工事: ×1.3 dealt to a ground unit on an ordinary tile, ×0.7 taken from one; flying units and same ground are untouched', () => {
  const { c, w, op, e } = field(true);
  assert.deepEqual([onWorks(c, op), onWorks(c, e)], [true, false]);
  assert.equal(dealDamage(w, op, e, { type: 'true', amount: 100 }, c), 130);
  assert.equal(dealDamage(w, e, op, { type: 'true', amount: 100 }, c), 70);
  assert.equal(dealDamage(w, op, e, { type: 'true', amount: 100 }), 100, 'without the content, no 工事 rule');
  assert.equal(dealDamage(w, op, e, { type: 'true', amount: 100, sourceless: true }, c), 100, 'a sourceless hit takes none of its source\'s multipliers');
  e.x = 2.2;
  assert.equal(worksMul(c, op, e), 1, 'both on the 工事');
  e.x = 4;
  e.base = { ...e.base, motion: 'FLY' };
  assert.equal(worksMul(c, op, e), 1, 'a flying target');
  assert.equal(worksMul(field(false).c, op, e), 1, 'no rule, no multiplier');
});

test('[地图-3] [阻挡-1] with the rule, a unit on a 工事 and an enemy on an ordinary tile do not block each other; on the same ground they do', () => {
  for (const [rule, x, blocked] of /** @type {[boolean, number, boolean][]} */ ([[true, 2.6, false], [false, 2.6, true], [true, 2.3, true]])) {
    const { c, w, op, e } = field(rule);
    e.x = x;
    assert.equal(tryBlock(w, c, e), blocked, `rule ${rule}, enemy at x ${x}`);
    assert.equal(e.blockedBy === op.id, blocked);
  }
});
