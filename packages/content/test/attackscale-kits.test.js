// An operator that fights by a Stronghold kit does not get a reading of docs/spec/skills.md 技能-5 twice (兼容-5): the
// kit's spec runs its skill in place of the generic effect, so the interval, the attributes and the attack 倍率 the
// description gives the generic one are not added to the kit's own.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { oracleDir, tinyContent } from '@aue/testkit';
import { createWorld, step, skills, attrs } from '@aue/sim';
import { loadUnderGrid } from '../src/compat/grid.js';
import { defOf } from '../src/compat/records.js';
import { kitsBehaviors } from '../src/compat/kits.js';
import { loadTraining, operatorAt } from '../src/operators.js';

/** @type {Record<string, any>} */
const factories = {};

before(async () => {
  const compat = new URL('../src/compat/', import.meta.url).href;
  register(new URL('hook.js', compat), { data: { root: pathToFileURL(`${oracleDir()}/`).href, compat } });
  for (const [id, file] of [['char_2013_cerber', 'op-cerber.js'], ['char_1035_wisdel', 'op-wisdel.js']]) {
    factories[id] = (await loadUnderGrid(() => import(pathToFileURL(join(oracleDir(), 'server', 'sim', 'content', 'kits', 'ops', file)).href))).default[id];
  }
});

/** The engine's record without its talents: the kit applies them. @param {Record<string, any>} d */
const bare = ({ talentBb, fieldTalents, rangeTalents, critTalents, timedTalents, deployTalents, ...rest }) => rest;

/** The kit's operator with skill `skill` in the tiny level, its skill started. @param {string} id @param {number} skill */
async function started(id, skill) {
  const training = await loadTraining(id), b = { elite: 2, level: 90, potential: 6, trust: 100, skill, skillLevel: 7 };
  const c = /** @type {any} */ (tinyContent());
  c.level.waves = [];
  Object.assign(c.level.options, { initialCost: 40, maxCost: 99 });
  c.operators = { op: bare(operatorAt(training, b)) };
  c.decks = [['op']];
  c.behaviors = kitsBehaviors({ op: { factory: factories[id], def: defOf(id, training, b) } }, () => {});
  const w = createWorld(c, { seed: 3, players: 1 });
  // the tiny level's road takes melee operators, its high ground ranged ones
  const [row, col] = c.operators.op.position === 'MELEE' ? [1, 3] : [2, 2];
  step(w, c, [[0, { type: 'deploy', op: 'op', row, col, dir: 2 }]]);
  const op = /** @type {any} */ (w.units.find((u) => u.key === 'op'));
  op.skill.sp = op.skill.cost;
  step(w, c, [[0, { type: 'skill', unit: op.id }]]);
  return { w, c, op, def: c.operators.op.skill };
}

test('[技能-5] [兼容-5] 刻俄柏 S2: the engine reads her interval as ×0.4 from PRTS, her kit gives its own; the skill buff has the kit\'s only', async () => {
  const { op, def } = await started('char_2013_cerber', 1);
  assert.deepEqual([def.extra.mods.batFlat, def.extra.mods.batMul], [0, 0.4], 'the definition says what the description says');
  assert.equal(op.skill.active, true);
  const mods = op.buffs.find((/** @type {any} */ x) => x.key === 'skill')?.mods ?? {};
  assert.equal(mods.batMul, undefined, 'not also the generic one\'s ×0.4');
  assert.equal(mods.batPct, -0.6, 'the kit\'s own: a share of the base interval');
  assert.ok(Math.abs(attrs.statsOf(op).bat - 0.4 * op.base.bat) < 1e-9, 'the interval is ×0.4 once: 0.64 s of 1.6 s, not 0.256 s');
});

test('[技能-5] [兼容-5] 维什戴尔 S3: the attack keys of her definition do not reach her kit\'s attack', async () => {
  const { w, c, op, def } = await started('char_1035_wisdel', 2);
  assert.equal(def.extra.scaleKey, 'attack@atk_scale_3', 'the definition names the key');
  assert.equal(skills.skillMods(def.bb, def.extra.hitScale, def.extra.scaleKey).scale, 1.9);
  const kit = skills.attackMods(w, c, op).scale;
  def.extra.scaleKey = undefined;
  assert.equal(skills.attackMods(w, c, op).scale, kit, 'the same 倍率 without the key: the spec of the kit gives it, the key of the definition is not read');
});
