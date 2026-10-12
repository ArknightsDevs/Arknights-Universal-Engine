// 禁锢 and 解放 (docs/spec/foes.md 敌能-17) on the real prisoners of IG-S-2 爬高上低, placed on the tiny map and rooted:
// three attacks confined, liberated before the fourth; 传奇重犯's first liberation frees every prisoner; 神射手囚犯's
// liberated attacks are arts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, attrs, status } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { skeletonContent } from '../src/index.js';
import { withFoeExtras } from '../src/foes.js';
import hard02 from '../data/levels/act1multi_hard-02.json' with { type: 'json' };

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit */

/**
 * The tiny map with IG-S-2's enemies: `foes` spawn in frame 0 and are rooted at their (row, col); then a guard of a
 * million HP (and the given resistances) is deployed on (1, 1).
 * @param {[string, number, number][]} foes @param {{ def?: number, res?: number }} [guard]
 */
function arena(foes, guard = {}) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies = Object.fromEntries(Object.entries(/** @type {any} */ (hard02).enemies).map(([k, e]) => [k, withFoeExtras(k, /** @type {any} */ (e))]));
  c.behaviors = skeletonContent.behaviors;
  c.level.waves = [oneWave(foes.map(([k]) => spawnAt(0, k)))];
  c.level.options = { ...c.level.options, initialCost: 50, maxCost: 99, costIncreaseTime: 1000 };
  Object.assign(c.operators.guard, { cost: 0, maxHp: 1e6, ...guard });
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  const es = w.units.filter((u) => u.owner < 0);
  es.forEach((e, i) => { e.x = foes[i][2]; e.y = foes[i][1]; status.applyStatus(e, 'root', {}); });
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 1, dir: 0 }]]);
  return { c, w, es };
}

/** Whether a unit is liberated. @param {Unit} u */
const free = (u) => u.buffs.some((b) => b.key === 'liberty');

/** Runs until `e` is liberated (at most n frames): its hits before, then all hits by it. @param {World} w @param {any} c @param {Unit} e @param {number} n */
function untilFree(w, c, e, n) {
  /** @type {any[]} */
  const hits = [];
  let before = -1;
  for (let i = 0; i < n; i++) {
    for (const ev of step(w, c)) if (ev.type === 'hit' && ev.id === e.id) hits.push(ev);
    if (before < 0 && free(e)) before = hits.length;
  }
  return { before, hits };
}

test('[敌能-17] 老练囚犯: confined, 攻击速度 −50; liberated before its 4th attack: 攻击力 +50 %, the 禁锢 gone', () => {
  const { c, w, es: [e] } = arena([['enemy_1116_liprr_2', 1, 1]]);
  const atk = attrs.statsOf(e).atk;
  assert.equal(attrs.statsOf(e).aspd, 50);
  const { before } = untilFree(w, c, e, 900);
  assert.equal(before, 3, 'three hits confined');
  assert.deepEqual([attrs.statsOf(e).aspd, attrs.statsOf(e).atk, e.buffs.some((b) => b.key === 'confinement')], [100, atk * 1.5, false]);
});

test('[敌能-17] 传奇重犯: confined with 防御力 +300; its first liberation frees every prisoner on the field', () => {
  const { c, w, es: [boss, other] } = arena([['enemy_1121_lifbos_2', 1, 1], ['enemy_1116_liprr_2', 0, 5]]);
  const def = attrs.statsOf(boss).def;
  untilFree(w, c, boss, 1200);
  assert.ok(free(boss) && free(other), 'the other prisoner, which never attacked, is free too');
  assert.equal(attrs.statsOf(boss).def, def - 300);
});

test('[敌能-17] 神射手囚犯: liberated, its attacks deal arts damage', () => {
  const { c, w, es: [e] } = arena([['enemy_1117_liiprr_2', 1, 2]], { def: 0, res: 50 });
  const atk = attrs.statsOf(e).atk;
  const { before, hits } = untilFree(w, c, e, 1500);
  assert.ok(before === 3 && hits.length > 4, `${before} confined, ${hits.length} in all`);
  assert.equal(hits[0].damage, atk, 'physical while confined, the guard\'s 防御力 0');
  assert.equal(hits[hits.length - 1].damage, atk * 1.5 * 0.5, 'arts at 50 % 法术抗性 once liberated');
});
