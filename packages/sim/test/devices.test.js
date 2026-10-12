// Devices (docs/spec/devices.md 装置-1, 装置-2) on the tiny level: a visible barricade on the road from the start, a hidden
// device that a wave brings and takes away; the barricade blocks the slime, which attacks it, and no operator stands on it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { KIND } from '@aue/schema';
import { createWorld, step } from '../src/index.js';

const record = (/** @type {number} */ blockCnt) => ({ name: 'd', maxHp: 500, atk: 0, def: 0, res: 0, blockCnt, baseAttackTime: 1, aspd: 100, tauntLevel: 0, massLevel: 0, talentBb: {} });
const act = (/** @type {string} */ type, /** @type {string} */ key, /** @type {number} */ at) => ({ type, key, route: -1, count: 1, preDelay: at, interval: 0 });

/** The tiny level with a barricade on (1, 3) and a hidden flag on (0, 4) that the wave brings at 1 s and takes at 2 s. */
function field() {
  const c = /** @type {any} */ (tinyContent());
  c.level.predefines = [{ alias: 'wall#1', key: 'wall', hidden: false, row: 1, col: 3, dir: 'UP' }, { alias: 'flag#1', key: 'flag', hidden: true, row: 0, col: 4, dir: 'UP' }];
  c.devices = { wall: record(20), flag: record(0) };
  c.level.waves = [oneWave([spawnAt(0, 'slime'), act('ACTIVATE', 'flag#1', 1), act('WITHDRAW', 'flag#1', 2)])];
  c.enemies.slime = { ...c.enemies.slime, atk: 100, maxHp: 1e6 };
  return { c, w: createWorld(c, { seed: 1, players: 1 }) };
}

const devicesOn = (/** @type {any} */ w) => w.units.filter((/** @type {any} */ u) => u.kind === KIND.DEVICE).map((/** @type {any} */ u) => [u.alias, u.x, u.y, u.owner, u.hp]);

test('[装置-1] the visible device stands from the start; a hidden one comes with ACTIVATE and goes with WITHDRAW', () => {
  const { c, w } = field();
  assert.deepEqual(devicesOn(w), [['wall#1', 3, 1, -1, 500]]);
  for (let f = 0; f < 45; f++) step(w, c);
  assert.deepEqual(devicesOn(w).map((/** @type {any[]} */ d) => d[0]), ['wall#1', 'flag#1']);
  for (let f = 0; f < 45; f++) step(w, c);
  assert.deepEqual(devicesOn(w).map((/** @type {any[]} */ d) => d[0]), ['wall#1']);
});

test('[装置-2] a device blocks ground enemies, which attack it; no operator is deployed on it; at 0 HP it leaves', () => {
  const { c, w } = field();
  assert.equal(step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 3, dir: 0 }]]).some((e) => e.type === 'deploy'), false, 'its tile is taken');
  const wall = /** @type {any} */ (w.units.find((u) => u.kind === KIND.DEVICE));
  let blocked = false;
  for (let f = 0; f < 900 && wall.hp > 0; f++) { step(w, c); blocked ||= w.units.some((u) => u.kind === KIND.ENEMY && u.blockedBy === wall.id); }
  assert.ok(blocked, 'the slime was blocked by it');
  for (let f = 0; f < 900 && w.units.includes(wall); f++) step(w, c);
  assert.equal(w.units.includes(wall), false, 'attacked down to 0 HP, it left');
});
