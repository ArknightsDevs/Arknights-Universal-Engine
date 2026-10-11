// Official skills (docs/spec/skills.md 技能-1, 技能-6): five real skill_table levels (test/fixtures/skill-levels.json,
// from ArknightsGameData) as the engine's skills, and a content behaviour acting through the skill context.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createWorld, step, skills, attrs } from '@aue/sim';
import { tinyContent } from '@aue/testkit';
import { skillDefOf, skillBehaviors } from '../src/index.js';

/** @type {Record<string, any>} */
const LEVELS = JSON.parse(readFileSync(new URL('fixtures/skill-levels.json', import.meta.url), 'utf8'));
/** @param {string} id */
const def = (id) => skillDefOf(id, LEVELS[id]);

test('[技能-1] skill_table levels as skills: trigger, SP type, cost, initial SP, charges, duration, ammo, blackboard', () => {
  assert.deepEqual(def('skcom_atk_up[3]'), { id: 'skcom_atk_up[3]', type: 'MANUAL', sp: 'time', cost: 30, init: 15, charges: 1, duration: 30, ammo: false, bb: { atk: 1 }, stoppable: false });
  assert.deepEqual([def('skchr_kroos_1').sp, skills.kindOf(def('skchr_kroos_1'))], ['attack', 'next']);
  assert.deepEqual([def('skchr_fuze_1').ammo, skills.kindOf(def('skchr_fuze_1')), def('skchr_fuze_1').bb['attack@trigger_time']], [true, 'ammo', 100]);
  assert.deepEqual([def('skcom_born_up[1]').sp, def('skcom_born_up[1]').charges, skills.kindOf(def('skcom_born_up[1]'))], ['none', 1, 'passive'], 'spType 8 recovers nothing');
  assert.equal(skills.kindOf(def('skcom_heal_self[2]')), 'instant');
  assert.throws(() => skillDefOf('x', { ...LEVELS['skcom_atk_up[3]'], skillType: 'TOGGLE' }), /unknown skillType TOGGLE/);
});

test('[技能-6] a content behaviour acts through the context: 生命回复 heals half the maximum HP at once', () => {
  const c = /** @type {any} */ (tinyContent());
  c.operators.guard.skill = { ...def('skcom_heal_self[2]'), init: 20 };
  c.behaviors = { skills: skillBehaviors };
  c.level.waves = [];
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 1, dir: 0 }]]);
  const g = w.units[0];
  g.hp = 100;
  const ev = step(w, c, [[0, { type: 'skill', unit: g.id }]]);
  assert.equal(g.hp, 100 + attrs.statsOf(g).maxHp * 0.5);
  assert.deepEqual(ev.filter((e) => e.type === 'skill').map((e) => e.active), [1, 0], 'instant: on and off');
  assert.equal(g.skill?.sp, 0);
});

test('[技能-7] a skill whose description says it can be stopped or closed at will is closable', () => {
  assert.deepEqual(Object.keys(LEVELS).filter((id) => def(id).stoppable), ['skchr_fuze_1'], '「可随时停止技能」');
  const level = LEVELS['skcom_atk_up[3]'];
  for (const d of ['技能持续时间无限，可主动关闭技能', '该技能可随时主动关闭', '手动停止或棋子耗尽后技能结束', '第一次使用可随时停止']) {
    assert.equal(skillDefOf('x', { ...level, description: d }).stoppable, true, d);
  }
  for (const d of ['停止攻击，攻击力+50%', '可随时<@ba.vup>+10%</>关闭', '']) assert.equal(skillDefOf('x', { ...level, description: d }).stoppable, false, d);
  const { description: _, ...bare } = level;
  assert.equal(skillDefOf('x', bare).stoppable, false, 'no description');
});
