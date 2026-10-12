// The helpers behind the deploy highlight and the range preview (docs/spec/render.md 渲染-8, 渲染-9): which tiles an
// operator may stand on, and what it would reach deployed somewhere — the same as what it reaches once deployed there.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent } from '@aue/testkit';
import { DIR } from '@aue/schema';
import { createWorld, step, fitsTile, placedReach, reachKeys } from '../src/index.js';

test('[渲染-8] fitsTile: the tiles of the operator\'s position (部署-1); an unknown operator fits nowhere', () => {
  const c = tinyContent();
  // tiny level, row 0 nearest: floor floor wall wall floor floor / road ×5 end / start floor wall wall floor floor
  assert.deepEqual([fitsTile(c, 'guard', 1, 1), fitsTile(c, 'guard', 0, 0), fitsTile(c, 'guard', 0, 2)], [true, false, false]);
  assert.deepEqual([fitsTile(c, 'sniper', 0, 2), fitsTile(c, 'sniper', 1, 1)], [true, false]);
  c.operators.guard.trait = { rangedTiles: true };
  assert.equal(fitsTile(c, 'guard', 0, 2), true, 'a melee operator whose trait allows ranged tiles');
  assert.equal(fitsTile(c, 'nobody', 1, 1), false);
});

test('[渲染-9] placedReach: the operator\'s own range turned with it, as once deployed; heals by its trait', () => {
  const c = tinyContent(), w = createWorld(c, { seed: 1, players: 1 });
  assert.deepEqual([...placedReach(c, 'guard', 1, 1, DIR.RIGHT).keys].sort(), [7, 8]);
  assert.deepEqual([...placedReach(c, 'guard', 1, 1, DIR.LEFT).keys].sort(), [6, 7]);
  step(w, c, [[0, { type: 'deploy', op: 'sniper', row: 0, col: 2, dir: DIR.UP }]]);
  const op = w.units.find((u) => u.key === 'sniper');
  assert.ok(op);
  assert.deepEqual([...placedReach(c, 'sniper', 0, 2, DIR.UP).keys].sort(), [...reachKeys(c, op)].sort());
  assert.equal(placedReach(c, 'sniper', 0, 2, DIR.UP).heal, false);
  c.operators.sniper.trait = { heal: true };
  assert.equal(placedReach(c, 'sniper', 0, 2, DIR.UP).heal, true);
});
