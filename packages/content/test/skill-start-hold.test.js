// 齐尔查克 S1 starts as she is about to attack, and the skill text holds new attacks (技能-3, 技能-15).
// No kit: the attack already due on the start frame is not fired and the cooldown stays 0; on the frame the skill ends she attacks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { secondsToFrames } from '@aue/math';
import { createWorld, step, buffs } from '@aue/sim';
import { oneWave, spawnAt, tinyContent } from '@aue/testkit';
import { loadTraining, operatorAt, skeletonContent } from '../src/index.js';

/** E2 at the level cap, skill level 7: 开锁工具 costs 12 and starts with 9, recovering SP on attack. */
const BUILD = { elite: 2, level: 80, potential: 1, trust: 0, skill: 0, skillLevel: 7 };

/** @param {import('@aue/sim').OperatorDef} def */
function field(def) {
  const c = /** @type {any} */ (tinyContent());
  c.level.waves = [oneWave([spawnAt(0, 'slime')])];
  Object.assign(c.level.options, { initialCost: 99, maxCost: 99, characterLimit: 4 });
  c.enemies.slime = { ...c.enemies.slime, maxHp: 1e9, atk: 0, def: 0, res: 0, moveSpeed: 0 };
  c.operators = { chilc: def };
  c.behaviors = skeletonContent.behaviors;
  return { w: createWorld(c, { seed: 1, players: 1 }), c };
}

/** The dummy, rooted on the tile in front of a melee operator facing right. @param {any} u */
function rootAhead(u) {
  u.x = 2;
  u.y = 1;
  u.base = { ...u.base, moveSpeed: 0 };
  if (!u.buffs.some((/** @type {any} */ b) => b.key === 'test:still')) buffs.addBuff(u, buffs.makeBuff({ key: 'test:still', flags: { root: true } }));
}

/** @param {any[]} ev @param {number} id */
const shots = (ev, id) => ev.filter((e) => e.type === 'attack' && e.id === id).length;

/**
 * One frame of the first cast. `held` is only the frames strictly between the start and the end.
 * @param {{ was: boolean, now: boolean, n: number, frame: number, atkCd: number }} turn
 * @param {{ before: number, atStart: number, cd: number, held: number, atEnd: number, started: number, ended: number }} acc
 */
function note(turn, acc) {
  if (!turn.was && turn.now) {
    acc.started = turn.frame;
    acc.atStart = turn.n;
    acc.cd = turn.atkCd;
    return;
  }
  if (turn.was && !turn.now) {
    acc.ended = turn.frame;
    acc.atEnd = turn.n;
    return;
  }
  if (turn.now) acc.held += turn.n;
  else acc.before += turn.n;
}

test('[技能-3] 齐尔查克 S1 开锁工具, no kit: no attack the frame it starts; she attacks the frame it ends', async () => {
  const training = await loadTraining('char_4144_chilc');
  assert.equal(training.skills[0]?.name, '开锁工具');
  const def = /** @type {any} */ (operatorAt(training, BUILD));
  assert.deepEqual([def.skill.id, def.skill.type, def.skill.sp, def.skill.extra?.stopAttack], ['skchr_chilc_1', 'AUTO', 'attack', {}]);
  const { w, c } = field(def);
  step(w, c, [[0, { type: 'deploy', op: 'chilc', row: 1, col: 1, dir: 0 }]]);
  const me = /** @type {any} */ (w.units.find((u) => u.key === 'chilc'));
  const foe = /** @type {any} */ (w.units.find((u) => u.key === 'slime'));
  rootAhead(foe);
  const acc = { before: 0, atStart: -1, cd: -1, held: 0, atEnd: -1, started: -1, ended: -1 };
  while (acc.ended < 0 && w.frame < 600) {
    const was = me.skill.active;
    const ev = step(w, c, []);
    note({ was, now: me.skill.active, n: shots(ev, me.id), frame: w.frame - 1, atkCd: me.atkCd }, acc);
  }
  assert.ok(acc.before > 0, 'attack recovery fills the cost with real attacks before the skill starts');
  assert.equal(acc.atStart, 0, 'the start frame does not fire the attack already due');
  assert.equal(acc.cd, 0, 'that dropped attack does not restart the cooldown');
  assert.equal(acc.held, 0, 'she makes no attack while 停止攻击 holds');
  assert.equal(acc.atEnd, 1, 'the frame the skill ends, she attacks');
  assert.equal(acc.ended, acc.started + secondsToFrames(def.skill.duration));
  assert.equal(me.skill.active, false);
  assert.deepEqual([foe.x, foe.y], [2, 1], 'the dummy stayed in range');
});
