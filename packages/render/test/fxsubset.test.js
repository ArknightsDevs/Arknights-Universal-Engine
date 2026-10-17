// An effect pack cut down to a match's units (docs/spec/render.md 渲染-10), and the textures a match draws with.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { effectIndex, effectSubsetJson } from '../src/fx/subset.js';
import { matchTextureKeys } from '../src/index.js';

const pack = {
  by: { char_a: { s: 'a_start', h: 'a_hit', m: { 2: { s: 'a_skill' } } }, enemy_b: { h: 'b_hit' }, char_c: { h: 'c_hit' } },
  common: { phys: 'hit_phys' }, named: { deploy: 'birth', status_stun: 'stun' },
  fx: {
    a_start: { d: 1, ps: [{ tex: 't1' }] }, a_hit: { d: 1, ps: [{ tex: 't2' }, { tex: 't1' }] }, a_skill: { d: 1, ps: [{ wt: 't3' }] },
    b_hit: { d: 1, ps: [] }, c_hit: { d: 1, ps: [{ tex: 't9' }] }, hit_phys: { d: 1, ps: [{ tex: 't4' }] }, birth: { d: 2, tr: [{ tex: 't5' }] }, stun: { d: 1, ps: [] },
  },
  tex: { t1: 'data:1', t2: 'data:2', t3: 'data:3', t4: 'data:4', t5: 'data:5', t9: 'data:9' },
  clamp: ['t2', 't9'],
};

test('[渲染-10] a pack for some units: their effects (skills too), the shared ones, only the textures those name', () => {
  const index = effectIndex(pack), got = JSON.parse(effectSubsetJson(index, ['enemy_b', 'char_a', 'char_a', 'nobody']));
  assert.deepEqual(Object.keys(got.by), ['char_a', 'enemy_b']);
  assert.deepEqual(Object.keys(got.fx), ['a_hit', 'a_skill', 'a_start', 'b_hit', 'birth', 'hit_phys', 'stun']);
  assert.deepEqual(got.fx.a_hit, pack.fx.a_hit, 'each effect as it was');
  assert.deepEqual(got.tex, { t1: 'data:1', t2: 'data:2', t3: 'data:3', t4: 'data:4', t5: 'data:5' }, 'not char_c\'s t9');
  assert.deepEqual(got.clamp, ['t2']);
  assert.deepEqual([got.common, got.named], [pack.common, pack.named]);
  assert.equal(Object.keys(JSON.parse(effectSubsetJson(index, [])).fx).length, 3, 'no units: the shared ones');
});

test('[渲染-23] the textures a match draws with: the UI\'s, its tiles\', each unit\'s card by its kind', () => {
  const level = { width: 2, height: 1, tiles: [[{ key: 'tile_road', height: 'LOWLAND' }, { key: 'tile_wall', height: 'HIGHLAND' }]] };
  assert.deepEqual(matchTextureKeys(level, { operators: ['char_a'], enemies: ['enemy_b'], devices: ['trap_x'] }), ['ui:bar', 'ui:shadow', 'ui:range',
    'ui:directionRing', 'ui:directionArrow', 'tile:tile_road', 'tile:tile_wall', 'avatar:char_a', 'enemy:enemy_b', 'device:trap_x']);
});
