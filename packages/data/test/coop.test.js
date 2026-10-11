// Co-op data (docs/spec/coop.md 合作-1, 合作-2): a goal tile's side from its blackboard, and the 共同敌手 a level's
// rune lists.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractTiles } from '../src/skeleton-world.js';
import { sharedEnemies } from '../src/skeleton.js';

const tile = (/** @type {string} */ key, /** @type {any} */ blackboard = null) => ({
  tileKey: key, heightType: 'LOWLAND', buildableType: 'NONE', passableMask: 'ALL', playerSideMask: 'ALL', blackboard,
});
const side = (/** @type {string} */ v) => [{ key: 'side', value: 0, valueStr: v }];

test('[合作-1] goal tiles take their side from the blackboard: Side_A, Side_B, Shared; other tiles have none', () => {
  const g = extractTiles({
    map: [[0, 1, 2, 3, 4]],
    tiles: [tile('tile_end_cooperate', side('Side_A')), tile('tile_end_cooperate', side('Side_B')), tile('tile_end_cooperate', side('Shared')),
      tile('tile_start_cooperate', side('Side_A')), tile('tile_end')],
  });
  assert.deepEqual(g.tiles[0].map((t) => t.goal), ['A', 'B', 'Shared', undefined, undefined]);
});

test('[合作-2] the 共同敌手 are the enemies of the cooperate_enemy_side_shared rune', () => {
  const rune = (/** @type {string} */ key, /** @type {string} */ enemies) => ({ key: 'env_gbuff_new_with_verify', blackboard: [{ key: 'enemy', value: 0, valueStr: enemies }, { key: 'key', value: 0, valueStr: key }] });
  assert.deepEqual([...sharedEnemies([rune('cooperate_enemy_side_shared', 'enemy_a|enemy_b'), rune('other', 'enemy_c'), { key: 'global_lifepoint', blackboard: [] }])], ['enemy_a', 'enemy_b']);
  assert.deepEqual([...sharedEnemies(null)], []);
});
