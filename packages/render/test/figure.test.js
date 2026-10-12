// A figure over time: the deploy clip, attacks paced to land their OnAttack on the hit frame, idle after an attack,
// the die clip (docs/spec/render.md 渲染-3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ANIM } from '@aue/schema';
import { newFigure, follow, attacked, dies, deathOver, clipAt } from '../src/figure.js';
import { tinyModel } from './model.js';

/** A view unit doing `anim`. @param {number} kind @param {number} anim */
const unit = (kind, anim) => ({ id: 1, kind, owner: 0, x: 1, y: 1, z: 0, dir: 0, hp: 1, maxHp: 1, anim, sp: -1, spCost: 0, skill: 0, skillLeft: -1, status: 0, element: 0, ep: 1, burst: 0 });
/** A clip's name, time rounded to 1e-9, and looping. @param {{ name: string, time: number, loop: boolean }} c */
const at = (c) => [c.name, Math.round(c.time * 1e9) / 1e9, c.loop];

test('[渲染-3] an operator plays its deploy clip once, then what the view says', () => {
  const f = /** @type {import('../src/figure.js').Figure} */ (newFigure({ front: tinyModel() }, unit(0, ANIM.IDLE), 30));
  follow(f, unit(0, ANIM.IDLE), 30);
  assert.deepEqual(at(clipAt(f, 33)), ['Start', 0.1, false]);
  assert.deepEqual(at(clipAt(f, 45)), ['Idle', 0.1, true]);
  const enemy = /** @type {import('../src/figure.js').Figure} */ (newFigure({ front: tinyModel() }, unit(1, ANIM.MOVE), 0));
  follow(enemy, unit(1, ANIM.MOVE), 0);
  assert.deepEqual(at(clipAt(enemy, 3)), ['Move', 0.1, true]);
});

test('[渲染-3] an attack starts its clip paced to land OnAttack on the hit frame, then idles; idle in the view does not cut it', () => {
  const f = /** @type {import('../src/figure.js').Figure} */ (newFigure({ front: tinyModel() }, unit(1, ANIM.IDLE), 0));
  follow(f, unit(1, ANIM.ATTACK), 10);
  attacked(f, 15, 10);
  assert.equal(f.rate, 0.5);
  assert.deepEqual(at(clipAt(f, 25)), ['Attack', 0.25, false]);
  follow(f, unit(1, ANIM.IDLE), 26);
  assert.equal(f.role, 'attack');
  assert.deepEqual(at(clipAt(f, 34)), ['Attack', 0.4, false]);
  assert.deepEqual(at(clipAt(f, 46)), ['Idle', 0.1, true]);
  attacked(f, 0, 50);
  assert.equal(f.rate, 1);
  follow(f, unit(1, ANIM.MOVE), 52);
  assert.deepEqual(at(clipAt(f, 55)), ['Move', 0.1, true]);
});

test('[渲染-3] a figure that died plays its die clip once and is over after it', () => {
  const f = /** @type {import('../src/figure.js').Figure} */ (newFigure({ front: tinyModel() }, unit(1, ANIM.MOVE), 0));
  assert.equal(dies(f, 60), true);
  assert.deepEqual(at(clipAt(f, 75)), ['Die', 0.5, false]);
  assert.equal(deathOver(f, 77), false);
  assert.equal(deathOver(f, 78), true);
});
