// Stronghold's skill specs on the engine's skill runtime (docs/spec/compat.md 兼容-5): 推进之王's S3 and S2 as her kit from
// the pinned oracle describes them, in the tiny level — the player starts S3; S2 starts on its own at her attack.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { oracleDir, tinyContent } from '@aue/testkit';
import { createWorld, step, bus, attrs } from '@aue/sim';
import { loadUnderGrid } from '../src/compat/grid.js';
import { defOf } from '../src/compat/records.js';
import { kitsBehaviors } from '../src/compat/kits.js';
import { loadTraining, operatorAt } from '../src/operators.js';

const SIEGE = 'char_112_siege';
/** @type {any} */
let factory;
/** @type {any} */
let training;

before(async () => {
  const compat = new URL('../src/compat/', import.meta.url).href;
  register(new URL('hook.js', compat), { data: { root: pathToFileURL(`${oracleDir()}/`).href, compat } });
  factory = (await loadUnderGrid(() => import(pathToFileURL(join(oracleDir(), 'server', 'sim', 'content', 'kits', 'ops', 'op-siege.js')).href))).default[SIEGE];
  training = await loadTraining(SIEGE);
});

/** The engine's record without its talents: her kit applies them. @param {Record<string, any>} d */
const bare = ({ talentBb, fieldTalents, rangeTalents, critTalents, timedTalents, deployTalents, ...rest }) => rest;

/** 推进之王 with skill `skill` against tough slimes, in the tiny level. @param {number} skill */
function match(skill) {
  const b = { elite: 2, level: 90, potential: 6, trust: 100, skill, skillLevel: 10, module: 0, moduleLevel: 3 };
  const c = /** @type {any} */ (tinyContent());
  c.enemies.slime.maxHp = 1e6;
  Object.assign(c.level.options, { initialCost: 40, maxCost: 99 });
  c.operators = { siege: bare(operatorAt(training, b)) };
  c.decks = [['siege']];
  const box = /** @type {{ b: any }} */ ({ b: null });
  c.behaviors = kitsBehaviors({ siege: { factory, def: defOf(SIEGE, training, b) } }, (x) => { box.b = x; });
  const w = createWorld(c, { seed: 3, players: 1 }), log = /** @type {string[]} */ ([]);
  bus.on(w, 'hit', (k) => { if (k.source?.key === 'siege') log.push(`hit:${(k.dmg.amount / attrs.statsOf(k.source).atk).toFixed(2)}:${k.dmg.isSkill}`); });
  bus.on(w, 'beforeStatus', (k) => log.push(`status:${k.status}:${k.frames}`));
  bus.on(w, 'skillStart', (k) => log.push(`start:${k.reason}`));
  bus.on(w, 'skillEnd', (k) => log.push(`end:${k.reason}`));
  step(w, c, [[0, { type: 'deploy', op: 'siege', row: 1, col: 3, dir: 2 }]]);
  return { c, w, log, b: box.b, siege: /** @type {any} */ (w.units.find((u) => u.key === 'siege')) };
}

test('[兼容-5] S3 by the player: her kit’s mods while it runs (attack interval +1 s), 380 % ATK, 40 % to stun 1.5 s; it ends after 25 s', () => {
  const { c, w, log, b, siege } = match(2);
  while (siege.skill.sp < siege.skill.cost) step(w, c);
  step(w, c, [[0, { type: 'skill', unit: siege.id }]]);
  assert.ok(Math.abs((siege.buffs.find((/** @type {any} */ x) => x.key === 'skill')?.mods.batPct ?? 0) - 1 / 1.05) < 1e-9, 'batPct +1.0 s ÷ 1.05 s');
  assert.ok(Math.abs(attrs.statsOf(siege).bat - 2.05) < 1e-9);
  for (let i = 0; i < 30 * 26; i++) step(w, c);
  const hits = log.filter((x) => x.startsWith('hit:')), stuns = log.filter((x) => x === 'status:stun:45');
  assert.ok(hits.length >= 8 && hits.every((x) => x === 'hit:3.80:true' || x === 'hit:1.00:false'), hits.join(' '));
  assert.ok(stuns.length > 0 && stuns.length < hits.length, `${stuns.length} of ${hits.length}`);
  assert.deepEqual(log.filter((x) => x.startsWith('start') || x.startsWith('end')), ['start:manual', 'end:duration']);
  assert.equal(siege.buffs.some((/** @type {any} */ x) => x.key === 'skill'), false, 'its mods gone with it');
  assert.deepEqual(b.errors, []);
});

test('[兼容-5] S2 on its own at her attack: +3 cost and 340 % ATK on the next attack, one charge spent', () => {
  const { c, w, log, b } = match(1);
  const cost = () => w.players[0].cost;
  while (!log.some((x) => x.startsWith('start'))) step(w, c);
  const before = cost() - 3;
  while (!log.some((x) => x.startsWith('hit'))) step(w, c);
  assert.ok(cost() >= before + 3, `${before} → ${cost()}`);
  assert.equal(log.find((x) => x.startsWith('hit')), 'hit:3.40:true');
  assert.deepEqual(log.filter((x) => x.startsWith('start') || x.startsWith('end')).slice(0, 2), ['start:auto', 'end:instant']);
  assert.deepEqual(b.errors, []);
});
