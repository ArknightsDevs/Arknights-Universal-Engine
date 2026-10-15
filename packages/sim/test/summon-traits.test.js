// Traits about an operator's summons (docs/spec/traits.md 职业-14) on the tiny level: the enemies its summons block as
// candidates and their 倍率, the tiles its traps may not go on. Test names cite the clauses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent } from '@aue/testkit';
import { createWorld, step, deployProblem } from '../src/index.js';
import { makeEnemy } from '../src/units.js';
import { applyStatus } from '../src/status.js';
import { statsOf } from '../src/attrs.js';
import { targetsOf, traitScale } from '../src/combat.js';

/** @typedef {import('../src/types.js').Unit} Unit @typedef {import('../src/types.js').OperatorDef} OperatorDef */

/** A summon record of the sniper: melee, one held on its owner's deployment. @param {Partial<OperatorDef>} [o] @returns {OperatorDef} */
const pet = (o = {}) => ({
  name: 'pet', position: 'MELEE', cost: 0, blockCnt: 1, baseAttackTime: 1, maxHp: 100, atk: 10, def: 0, res: 0, range: [{ row: 0, col: 0 }],
  respawnTime: 10, ...o, summoner: 'sniper', summon: { deployLimit: 2, holdLimit: 2, supply: 2, occupy: 0, respawn: 'default' },
});

/**
 * The tiny level without spawns, the sniper's trait as given and a summon `pet` of it; `foe` adds a rooted enemy.
 * @param {Record<string, unknown>} trait
 */
function arena(trait) {
  const c = tinyContent();
  c.level.waves = [];
  c.operators.sniper.trait = trait;
  c.operators.pet = pet();
  const w = createWorld(c, { seed: 1, players: 1 });
  w.players[0].cost = 99;
  /** @param {number} row @param {number} col @param {Record<string, any>} [over] */
  const foe = (row, col, over = {}) => {
    const e = makeEnemy(w, c, { key: 'slime', route: 0 });
    e.x = col; e.y = row;
    e.base = { ...e.base, ...over };
    e.hp = statsOf(e).maxHp;
    applyStatus(e, 'root', {});
    w.units.push(e);
    return e;
  };
  /** @param {string} op @param {number} row @param {number} col */
  const deploy = (op, row, col) => ({ type: /** @type {const} */ ('deploy'), op, row, col, dir: 0 });
  return { w, c, foe, deploy };
}

test('[职业-14] the enemies its own summons block are candidates wherever they stand, sorted with the rest; × the trait\'s 倍率 against them', () => {
  const { w, c, foe, deploy } = arena({ summonBlocked: true, summonBlockedScale: 1.15 });
  step(w, c, [[0, deploy('sniper', 2, 2)]]);
  step(w, c, [[0, deploy('pet', 1, 0)]]);
  const sniper = /** @type {Unit} */ (w.units.find((u) => u.key === 'sniper')), p = /** @type {Unit} */ (w.units.find((u) => u.key === 'pet'));
  const held = foe(1, 0), loose = foe(1, 5);
  assert.deepEqual(targetsOf(w, c, sniper), [], 'out of range, blocked by no one');
  held.blockedBy = p.id;
  assert.deepEqual(targetsOf(w, c, sniper), [held], 'its summon blocks it: a candidate though out of range');
  assert.deepEqual([traitScale(w, c, sniper, held), traitScale(w, c, sniper, loose)], [1.15, 1]);
  c.operators.sniper.trait = {};
  assert.deepEqual([targetsOf(w, c, sniper), traitScale(w, c, sniper, held)], [[], 1], 'without the trait: neither');
});

test('[职业-14] a trap is refused on a tile a ground enemy stands on — a neutral one too; not a flying or disappeared one', () => {
  const { w, c, foe, deploy } = arena({ trapTiles: true });
  step(w, c, [[0, deploy('sniper', 2, 2)]]);
  const e = foe(1, 3);
  assert.equal(deployProblem(w, c, 0, deploy('pet', 1, 3)), 'an enemy on the tile');
  e.x = 3.4;
  assert.equal(deployProblem(w, c, 0, deploy('pet', 1, 3)), 'an enemy on the tile', 'the tile of its position');
  e.x = 3.6;
  assert.equal(deployProblem(w, c, 0, deploy('pet', 1, 3)), null, 'on the next tile now');
  foe(1, 1, { neutral: true });
  assert.equal(deployProblem(w, c, 0, deploy('pet', 1, 1)), 'an enemy on the tile', 'neutral');
  foe(1, 2, { motion: 'FLY' });
  assert.equal(deployProblem(w, c, 0, deploy('pet', 1, 2)), null, 'flying');
  foe(1, 0).hidden = true;
  assert.equal(deployProblem(w, c, 0, deploy('pet', 1, 0)), null, 'disappeared');
  c.operators.sniper.trait = {};
  assert.equal(deployProblem(w, c, 0, deploy('pet', 1, 1)), null, 'another owner\'s summons: anywhere');
  step(w, c, [[0, deploy('pet', 1, 1)]]);
  assert.equal(w.units.filter((u) => u.key === 'pet').length, 1);
});
