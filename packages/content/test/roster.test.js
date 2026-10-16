// Every operator of the roster in a match (docs/spec/operators.md 干员-1, 干员-2; lockstep.md 同步-9): at its top
// training it assembles into a match's content, deploys on a tile it fits and fights for 20 seconds, its skill asked
// for every 2 seconds, without an error. The engine's own implementation: no kits here (兼容-6 has those).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, deployProblem } from '@aue/sim';
import { ROSTER, loadTraining, matchContent } from '../src/index.js';

/** An operator's top training: its last promotion and level, its last open skill at its highest level. @param {string} id */
async function topBuild(id) {
  const t = await loadTraining(id), elite = t.phases.length - 1;
  const open = t.skills.flatMap((s) => (s !== null && s.phase <= elite ? [s] : [])), skill = open.length - 1;
  return { elite, level: t.phases[elite].maxLevel, potential: 1, trust: 100, skill, skillLevel: skill >= 0 ? Math.min(open[skill].levels.length, elite === 2 ? 10 : 7) : 1 };
}

/** The first tile an operator may be deployed on, as a command. @param {any} w @param {any} c @param {string} key */
function firstDeploy(w, c, key) {
  for (let row = 0; row < c.level.height; row++) {
    for (let col = 0; col < c.level.width; col++) {
      const cmd = { type: /** @type {const} */ ('deploy'), op: key, row, col, dir: 0 };
      if (deployProblem(w, c, 0, cmd) === null) return cmd;
    }
  }
  return null;
}

test('[干员-1] [干员-2] [同步-9] every operator of the roster at its top training: assembled, deployed and fighting for 20 seconds', { timeout: 120000 }, async () => {
  /** @type {string[]} */
  const failed = [];
  for (const id of Object.keys(ROSTER)) {
    try {
      const c = await matchContent({ level: 'act1multi_01', difficulty: 'NORMAL', seed: 1, decks: [[{ id, build: await topBuild(id) }]] });
      const w = createWorld(c, { seed: 1, players: 1 }), key = `${id}#0`;
      w.players[0].cost = 99;
      const cmd = firstDeploy(w, c, key);
      if (!cmd) { failed.push(`${id}: no tile`); continue; }
      step(w, c, [[0, cmd]]);
      const unit = w.units.find((u) => u.key === key)?.id ?? -1;
      for (let i = 0; i < 600; i++) step(w, c, i % 60 === 30 ? [[0, { type: 'skill', unit }]] : []);
    } catch (e) {
      failed.push(`${id}: ${/** @type {Error} */ (e).message}`);
    }
  }
  assert.ok(Object.keys(ROSTER).length >= 461);
  assert.deepEqual(failed, []);
});
