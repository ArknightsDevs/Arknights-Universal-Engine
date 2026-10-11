// HP and SP bars without a GPU: which bars a unit has, their colors and fill, and where they sit (docs/spec/render.md 渲染-5).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SKILL_STATE } from '@aue/schema';
import { tinyContent } from '@aue/testkit';
import { barsOf, BAR, createOverlays } from '../src/overlays.js';

/** A view unit. @param {Record<string, number>} v */
const unit = (v) => ({ id: 1, kind: 0, owner: 0, x: 1, y: 1, z: 0, dir: 0, hp: 50, maxHp: 100, anim: 0, sp: -1, spCost: 0, skill: SKILL_STATE.NONE, skillLeft: -1, ...v });

test('[渲染-5] bars: blue HP for operators, orange for enemies, red for leaders; SP gathering, ready, running', () => {
  const c = BAR.colors;
  assert.deepEqual(barsOf(unit({}), false, 0), [{ ratio: 0.5, color: c.ours, height: BAR.hp }]);
  assert.equal(barsOf(unit({ kind: 1 }), false, 0)[0].color, c.enemy);
  assert.equal(barsOf(unit({ kind: 1 }), true, 0)[0].color, c.leader);
  assert.deepEqual(barsOf(unit({ sp: 5, spCost: 20, skill: SKILL_STATE.CHARGING }), false, 0)[1], { ratio: 0.25, color: c.sp, height: BAR.sp });
  assert.deepEqual(barsOf(unit({ sp: 20, spCost: 20, skill: SKILL_STATE.READY }), false, 0)[1], { ratio: 1, color: c.ready, height: BAR.sp });
  assert.deepEqual(barsOf(unit({ sp: 0, spCost: 20, skill: SKILL_STATE.RUNNING, skillLeft: 30 }), false, 120)[1], { ratio: 0.25, color: c.running, height: BAR.sp });
  assert.equal(barsOf(unit({ kind: 1, sp: 3, spCost: 3, skill: SKILL_STATE.READY }), false, 0).length, 1);
  assert.equal(barsOf(unit({ hp: 150 }), false, 0)[0].ratio, 1);
});

test('[渲染-5] overlays: two sprites a bar, under the feet, drawn without depth; no bar texture, no bars', () => {
  const level = tinyContent().level, view = { frame: 1, players: [], units: [unit({ sp: 5, spCost: 10, skill: SKILL_STATE.CHARGING })] };
  const o = createOverlays(new Map([['ui:bar', new THREE.Texture()]]));
  o.update(view, { 1: 'x' }, level);
  const sprites = /** @type {THREE.Sprite[]} */ (o.scene.children);
  assert.equal(sprites.length, 4);
  assert.ok(sprites.every((s) => s.material.depthTest === false && s.material.depthWrite === false));
  const camera = new THREE.PerspectiveCamera();
  camera.updateMatrixWorld();
  o.pose(camera);
  assert.ok(sprites[0].position.y < 0 && sprites[2].position.y < sprites[0].position.y, 'HP under the feet, SP under the HP');
  assert.ok(Math.abs(sprites[1].scale.x - BAR.width / 2) < 1e-12, 'half the HP');
  o.update({ ...view, units: [] }, {}, level);
  assert.equal(o.scene.children.length, 0);
  const none = createOverlays(new Map());
  none.update(view, { 1: 'x' }, level);
  assert.equal(none.scene.children.length, 0);
});
