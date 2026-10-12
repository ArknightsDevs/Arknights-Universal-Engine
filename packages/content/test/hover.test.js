// 破烂发明家's 装甲 and 山海众掌令使's 山海密语仪 of IG-S-2 爬高上低 (docs/spec/foes.md 敌能-20, 敌能-21) on the tiny map:
// blocked once, it hovers over its blocker without attacking, then lands with far less defence; a flag-bearer places a
// 山海密语仪 on the first free 玉门天灾工事 it walks over.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, attrs, displacement, KIND } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { skeletonContent } from '../src/index.js';
import { withFoeExtras } from '../src/foes.js';
import { profiledDevices } from '../src/devices.js';
import hard02 from '../data/levels/act1multi_hard-02.json' with { type: 'json' };

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit */

const WORKS = { key: 'tile_passable_wall', height: 'LOWLAND', buildable: 'RANGED', passable: 'ALL', side: 'ALL' };

/**
 * The tiny map with one enemy of IG-S-2 spawning at once; IG-S-2's devices; `tweak` changes the content first; a guard
 * deployed in frame 1 when given (row, col).
 * @param {string} key @param {{ guard?: [number, number], tweak?: (c: any) => void }} [o]
 */
function arena(key, o = {}) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies = { [key]: withFoeExtras(key, /** @type {any} */ (hard02).enemies[key]) };
  c.behaviors = skeletonContent.behaviors;
  c.devices = profiledDevices(/** @type {any} */ (hard02).devices).devices;
  c.level.waves = [oneWave([spawnAt(0, key)])];
  c.level.options = { ...c.level.options, initialCost: 50, maxCost: 99, costIncreaseTime: 1000 };
  Object.assign(c.operators.guard, { cost: 0, maxHp: 1e7 });
  o.tweak?.(c);
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c, o.guard ? [[0, { type: 'deploy', op: 'guard', row: o.guard[0], col: o.guard[1], dir: 0 }]] : []);
  return { c, w, e: /** @type {Unit} */ (w.units.find((u) => u.key === key)) };
}

test('[敌能-20] 破烂发明家: 免疫失衡; blocked once, it hovers 3.5 s — in the air, no attacks — over its blocker, then lands with 防御力 −1300', () => {
  const { c, w, e } = arena('enemy_1412_mmjump_2', { guard: [1, 2], tweak: (cc) => { cc.level.options.moveMultiplier = 0.4; } });
  const def = attrs.statsOf(e).def;
  assert.equal(displacement.displaceable(e), false);
  let lifted = -1, hits = 0;
  for (let f = 0; f < 300 && lifted < 0; f++) { step(w, c); if (e.buffs.some((b) => b.key === 'hover')) lifted = w.frame; }
  assert.ok(lifted > 0 && e.blockedBy === -1 && attrs.statsOf(e).flying, 'released and flying');
  let landed = -1;
  for (let f = 0; f < 200 && landed < 0; f++) {
    const events = step(w, c);
    if (!attrs.statsOf(e).flying) landed = w.frame;
    else hits += events.filter((ev) => ev.type === 'hit' && ev.id === e.id).length;
  }
  assert.equal(hits, 0, 'no attacks while hovering');
  assert.ok(Math.abs(landed - lifted - 105) <= 1, `3.5 s in the air: ${landed - lifted} frames`);
  assert.ok(e.x > 2.71, `it went on over the guard and out of its reach: x ${e.x}`);
  assert.equal(attrs.statsOf(e).def, def - 1300);
});

test('[敌能-21] [装置-5] 山海众掌令使: unblocked, it places a 山海密语仪 on the first free 玉门天灾工事 it walks over, once', () => {
  const { c, w } = arena('enemy_1297_ymflag_2', {
    tweak: (cc) => {
      cc.level.tiles[1][3] = WORKS;
      cc.level.tiles[1][4] = WORKS;
      cc.level.predefines = [{ alias: 'flag#1', key: 'trap_096_gflag', hidden: false, row: 1, col: 3, dir: 'UP' }];
    },
  });
  for (let f = 0; f < 900 && w.result < 0; f++) step(w, c);
  const flags = w.units.filter((u) => u.kind === KIND.DEVICE).map((u) => [(u.alias ?? '').startsWith('trap_096_gflag@'), u.y, u.x]);
  assert.deepEqual(flags, [[false, 1, 3], [true, 1, 4]], '(1, 3) held the predefined one; the next 工事 got the new one');
  assert.equal(c.devices.trap_096_gflag.side, 'ENEMY');
});
