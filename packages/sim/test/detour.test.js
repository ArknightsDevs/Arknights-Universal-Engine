// A detour (docs/spec/paths.md 路线-6) and the way ahead of an enemy (寻路-2) on the tiny level, and the `fatal` hook of
// enemy abilities (docs/spec/foes.md 敌能-2): an ability may keep an enemy whose HP ran out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { KIND } from '@aue/schema';
import { createWorld, step } from '../src/index.js';
import { detour, wayKeys } from '../src/routes.js';
import { setHp } from '../src/damage.js';

/** The tiny level with one slime on the road at (1, 1), heading for the goal (1, 5). @param {any} [behaviors] */
function field(behaviors) {
  const c = /** @type {any} */ (tinyContent());
  c.level.waves = [oneWave([spawnAt(0, 'slime')])];
  if (behaviors) { c.behaviors = { foes: behaviors }; c.enemies.slime = { ...c.enemies.slime, talents: { keep: {} } }; }
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  const e = /** @type {any} */ (w.units.find((u) => u.kind === KIND.ENEMY));
  e.x = 1; e.y = 1; e.leg = 2; e.path = []; e.pt = 0;
  return { c, w, e };
}

test('[路线-6] [寻路-2] the way ahead: its tile to the end of its move; a detour goes to a tile centre first, then on to that end', () => {
  const { c, w, e } = field();
  assert.deepEqual(wayKeys(c, e), [7, 8, 9, 10, 11]);
  detour(c, e, 0, 2);
  assert.deepEqual(e.path, [2, 0, 5, 1]);
  let near = Infinity;
  for (let f = 0; f < 300 && w.units.includes(e); f++) { step(w, c); near = Math.min(near, Math.hypot(e.x - 2, e.y)); }
  assert.ok(near < 0.05, `it passed the centre of (0, 2): ${near}`);
  assert.equal(w.players[0].life, 2, 'and reached the goal');
});

test('[敌能-2] fatal: an ability that keeps an enemy whose HP ran out — its HP above 0 — keeps it on the field', () => {
  const keep = { fatal: (/** @type {any} */ ctx) => { ctx.setHp(ctx.self, 5); return true; } };
  const { c, w, e } = field({ keep });
  setHp(e, 0);
  step(w, c);
  assert.deepEqual([w.units.includes(e), e.hp], [true, 5]);
  const none = field({ keep: { fatal: () => true } });
  setHp(none.e, 0);
  step(none.w, none.c);
  assert.equal(none.w.units.includes(none.e), false, 'saying so is not enough: its HP is still 0');
});
