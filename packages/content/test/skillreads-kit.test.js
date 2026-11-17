// What the engine reads of a skill's description beside the sentences 技能-9 reads before (docs/spec/skills.md 技能-4, 技能-9) is
// not done again for an operator that fights by a Stronghold kit (docs/spec/compat.md 兼容-5): 娜仁图亚 S3 (「每次攻击发射{cnt}个回旋投射物」)
// hits as the kit says, not for the kit and again for the engine; 假日威龙陈 S2 (a 蓄力 part) keeps the kit's SP and is never
// charged by the engine's rule. Alone against a still dummy for 40 s, its manual skill started whenever it is ready, with the kit
// and without.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { oracleDir, oneWave, spawnAt } from '@aue/testkit';
import { createWorld, step, bus, buffs, sp } from '@aue/sim';
import { loadKits, loadTraining, matchContent } from '../src/index.js';

/** The pinned commit's root as a URL. */
let root = '';

before(() => {
  const compat = new URL('../src/compat/', import.meta.url).href;
  root = pathToFileURL(`${oracleDir()}/`).href;
  register(new URL('hook.js', compat), { data: { root, compat } });
});

/**
 * The match of an operator at elite 2, a skill at level 7, in a small arena with a still dummy (1e7 HP, no defences) next to it.
 * @param {string} id @param {number} slot @param {Record<string, any>} kits the kits loaded (none: it fights on the engine's own)
 */
async function arena(id, slot, kits) {
  const t = await loadTraining(id);
  const build = { elite: 2, level: t.phases[2].maxLevel, potential: 1, trust: 0, skill: slot, skillLevel: 7 };
  const c = /** @type {any} */ (await matchContent({ level: 'act1multi_01', difficulty: 'NORMAL', seed: 1, decks: [[{ id, build }]] }, { kits }));
  const tile = { key: 'tile_road', height: 'LOWLAND', buildable: 'ALL', passable: 'ALL', side: 'ALL' };
  c.level = { id: 'arena', width: 8, height: 3, options: { maxLifePoint: 3, initialCost: 99, maxCost: 99, costIncreaseTime: 1, characterLimit: 8, moveMultiplier: 1 },
    tiles: Array.from({ length: 3 }, () => Array.from({ length: 8 }, () => ({ ...tile }))),
    routes: [{ start: { row: 0, col: 0 }, end: { row: 2, col: 7 }, motion: 'WALK', checkpoints: [], spawnOffset: { x: 4, y: 1 } }], waves: [oneWave([spawnAt(0, 'dummy')])] };
  c.enemies = { dummy: { name: 'dummy', maxHp: 1e7, atk: 0, def: 0, res: 0, moveSpeed: 1, massLevel: 1 } };
  return { c, key: `${id}#0` };
}

/**
 * What the player does in a frame: starts the manual skill when it is ready; with `full`, the skill holds all its SP first.
 * @param {import('@aue/sim').Unit | undefined} u @param {boolean} full @returns {any[]}
 */
function commands(u, full) {
  const st = u?.skill;
  if (!u || !st || st.active) return [];
  if (full) sp.forceSp(st, st.cap);
  return st.sp >= st.cost ? [[0, { type: 'skill', unit: u.id }]] : [];
}

/**
 * 40 s of it: its hits of attacks on the dummy, its attacks (and those made while the skill runs), the skill's starts and the starts the engine's 蓄力 rule held at.
 * @param {string} id @param {number} slot @param {Record<string, any>} kits @param {boolean} [full] the skill holds all its SP whenever it is not running
 */
async function fight(id, slot, kits, full = false) {
  const { c, key } = await arena(id, slot, kits);
  const w = createWorld(c, { seed: 7, players: 1 }), op = () => w.units.find((u) => u.key === key);
  const n = { hits: 0, attacks: 0, skillAttacks: 0, starts: 0, charged: 0 };
  bus.on(w, 'damaged', (k) => { if (k.source === op() && k.dmg.isAttack && !k.dmg.isSplash) n.hits++; });
  bus.on(w, 'attack', (k) => { if (k.attacker === op()) { n.attacks++; n.skillAttacks += op()?.skill?.active ? 1 : 0; } });
  bus.on(w, 'skillStart', (k) => { if (k.unit === op()) { n.starts++; n.charged += k.unit.skill?.charged ? 1 : 0; } });
  bus.on(w, 'enemySpawn', (k) => { buffs.addBuff(k.enemy, buffs.makeBuff({ key: 'still', flags: { root: true } })); }, { priority: 1e9 });
  step(w, c, [[0, { type: 'deploy', op: key, row: 1, col: 3, dir: 0 }]]);
  for (let i = 1; i < 40 * 30; i++) step(w, c, commands(op(), full));
  return n;
}

test('[兼容-5] [技能-9] a kit\'s boomerangs are its own: 娜仁图亚 S3 hits as many times as the kit says, not the kit\'s and the engine\'s `cnt`', async () => {
  const id = 'char_4138_narant', { kits } = await loadKits(root, [id]);
  assert.deepEqual(Object.keys(kits), [id]);
  const kitted = await fight(id, 2, kits), plain = await fight(id, 2, {});
  assert.ok(kitted.attacks > 10 && plain.attacks > 10);
  const level = (await loadTraining(id)).skills[2]?.levels[6], cnt = level?.blackboard.find((b) => b.key === 'cnt')?.value ?? 0;
  assert.ok(cnt >= 2);
  assert.ok(kitted.skillAttacks > 0 && plain.skillAttacks > 0, 'attacks are made while the skill runs');
  // One hit an attack, `cnt` an attack while the skill runs: not the kit's `cnt` and the engine's `cnt` on top, nor one more or less.
  for (const n of [kitted, plain]) {
    assert.equal(n.hits, n.attacks + (cnt - 1) * n.skillAttacks, `${n === kitted ? 'with' : 'without'} the kit: ${n.hits} hits of ${n.attacks} attacks, ${n.skillAttacks} of them with the skill`);
  }
});

test('[兼容-5] [技能-4] a kit\'s 蓄力 skill is the kit\'s: 假日威龙陈 S2 is never charged by the engine\'s rule with the kit, and is without it', async () => {
  const id = 'char_1013_chen2', { kits } = await loadKits(root, [id]);
  const kitted = await fight(id, 1, kits, true), plain = await fight(id, 1, {}, true);
  assert.ok(kitted.starts >= 1 && plain.starts >= 1);
  assert.equal(kitted.charged, 0, 'the kit\'s own SP and charges');
  assert.equal(plain.charged, plain.starts, 'on the engine\'s own every start with all its SP is charged');
});
