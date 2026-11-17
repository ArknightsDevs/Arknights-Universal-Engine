// A skill a Stronghold kit describes gives no status and no 元素损伤 its description reads (docs/spec/compat.md 兼容-5,
// docs/spec/skills.md 技能-9): the kit says its own, so a hit stuns once, and carries its element once, not once for the
// kit and again for the engine's reading. 陈 S1 (「令命中目标晕眩{stun}秒」) and 真言 S1 (「附带伤害{ep_damage_ratio}的神经损伤」)
// alone against a still dummy for 40 s, with their kits and without.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { oracleDir, oneWave, spawnAt } from '@aue/testkit';
import { createWorld, step, bus, buffs } from '@aue/sim';
import { loadKits, loadTraining, matchContent } from '../src/index.js';

/** The pinned commit's root as a URL. */
let root = '';

before(() => {
  const compat = new URL('../src/compat/', import.meta.url).href;
  root = pathToFileURL(`${oracleDir()}/`).href;
  register(new URL('hook.js', compat), { data: { root, compat } });
});

/**
 * An operator at elite 2, a skill at level 7, alone against a still dummy (1e7 HP, no defences) next to it for 40 s: the
 * stuns it gave, the 元素损伤 it dealt (each hit's amount), the HP its hits took and its skill's starts.
 * @param {string} id @param {number} slot @param {Record<string, any>} kits the kits loaded (none: it fights on the engine's own)
 */
async function fight(id, slot, kits) {
  const t = await loadTraining(id);
  const build = { elite: 2, level: t.phases[2].maxLevel, potential: 1, trust: 0, skill: slot, skillLevel: 7 };
  const c = /** @type {any} */ (await matchContent({ level: 'act1multi_01', difficulty: 'NORMAL', seed: 1, decks: [[{ id, build }]] }, { kits }));
  const tile = { key: 'tile_road', height: 'LOWLAND', buildable: 'ALL', passable: 'ALL', side: 'ALL' };
  c.level = { id: 'arena', width: 8, height: 3, options: { maxLifePoint: 3, initialCost: 99, maxCost: 99, costIncreaseTime: 1, characterLimit: 8, moveMultiplier: 1 },
    tiles: Array.from({ length: 3 }, () => Array.from({ length: 8 }, () => ({ ...tile }))),
    routes: [{ start: { row: 0, col: 0 }, end: { row: 2, col: 7 }, motion: 'WALK', checkpoints: [], spawnOffset: { x: 4, y: 1 } }], waves: [oneWave([spawnAt(0, 'dummy')])] };
  c.enemies = { dummy: { name: 'dummy', maxHp: 1e7, atk: 0, def: 0, res: 0, moveSpeed: 1, massLevel: 1 } };
  const w = createWorld(c, { seed: 7, players: 1 }), key = `${id}#0`, op = () => w.units.find((u) => u.key === key);
  let stuns = 0, starts = 0, taken = 0;
  /** @type {number[]} */
  const ep = [];
  bus.on(w, 'beforeStatus', (k) => { if (k.source === op() && k.status === 'stun') stuns++; });
  bus.on(w, 'elementHit', (k) => { if (k.source === op()) ep.push(k.dmg.amount * k.dmg.mul); });
  bus.on(w, 'damaged', (k) => { if (k.source === op()) taken += k.amount; });
  bus.on(w, 'skillStart', (k) => { if (k.unit === op()) starts++; });
  bus.on(w, 'enemySpawn', (k) => { buffs.addBuff(k.enemy, buffs.makeBuff({ key: 'still', flags: { root: true } })); }, { priority: 1e9 });
  step(w, c, [[0, { type: 'deploy', op: key, row: 1, col: 3, dir: 0 }]]);
  for (let i = 1; i < 40 * 30; i++) step(w, c, []);
  return { stuns, starts, ep, taken };
}

test('[兼容-5] [技能-9] a kit\'s skill stuns once for each use of it: the status its description gives is the kit\'s to apply; without a kit the engine\'s reading stuns', async () => {
  const { kits } = await loadKits(root, ['char_010_chen']);
  assert.deepEqual(Object.keys(kits), ['char_010_chen']);
  const kitted = await fight('char_010_chen', 0, kits), plain = await fight('char_010_chen', 0, {});
  assert.ok(kitted.starts >= 5, `her skill starts ${kitted.starts} times`);
  assert.equal(kitted.stuns, kitted.starts, 'one stun for each use, not the kit\'s and the engine\'s');
  assert.ok(plain.stuns >= plain.starts, 'on the engine\'s own she stuns by the description, on each hit of the attack');
});

test('[兼容-5] [技能-9] a kit\'s skill carries its 元素损伤 once: the share of the damage its description reads is the engine\'s reading, which a kit leaves to its own', async () => {
  const id = 'char_4204_mantra', { kits } = await loadKits(root, [id]);
  assert.deepEqual(Object.keys(kits), [id]);
  const kitted = await fight(id, 0, kits), plain = await fight(id, 0, {});
  assert.ok(kitted.starts >= 5 && plain.starts >= 5, `her skill starts ${kitted.starts} and ${plain.starts} times`);
  assert.ok(plain.ep.length >= 5, 'on the engine\'s own her skill gives 神经损伤 by its description, on each use');
  // her kit gives 20 % of the damage as 神经损伤 as well, the same amount each time: the engine's share on top would show as one more hit
  assert.deepEqual(kitted.ep, plain.ep, 'the kit\'s 神经损伤 alone: not the kit\'s and the engine\'s share too');
});
