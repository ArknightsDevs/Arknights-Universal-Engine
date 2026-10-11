// Whole levels at a difficulty (docs/spec/level.md 关卡-2), and the real act1multi_01 played headless: deterministic,
// its waves, stage and civilians at work.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, stateHash } from '@aue/sim';
import { levelContent, levelAt, LEVELS } from '../src/index.js';

const raw = LEVELS.act1multi_01;

test('[关卡-2] at a difficulty: its hidden groups and life point; enemy multipliers on the base values; replacements', () => {
  const normal = levelAt('act1multi_01', 'NORMAL'), hard = levelAt('act1multi_01', 'FOUR_STAR');
  assert.deepEqual([normal.level.hiddenGroups, normal.level.options.maxLifePoint], [['normal'], 8]);
  assert.deepEqual([hard.level.hiddenGroups, hard.level.options.maxLifePoint], [['raid'], 5]);
  const k = 'enemy_1404_msnip', e = raw.enemies[k];
  assert.deepEqual([hard.enemies[k].atk, hard.enemies[k].def, hard.enemies[k].maxHp], [e.atk * 1.4, e.def * 1.2, e.maxHp * 1.2]);
  assert.deepEqual([normal.enemies[k].atk, normal.enemies[k].maxHp], [e.atk, e.maxHp]);
  assert.equal(normal.level.stages?.length, 2);
});

test('[关卡-2] replacements, filters and fields an enemy lacks; unsupported runes and unknown levels refused', () => {
  const save = structuredClone(raw.difficulties.FOUR_STAR);
  try {
    raw.difficulties.FOUR_STAR.replace = { enemy_1404_msnip: 'enemy_1404_msnip_2' };
    raw.difficulties.FOUR_STAR.enemyMul = [{ mods: { attack_speed: 2, move_speed: 2 }, enemy: ['enemy_1404_msnip_2'] }, { mods: { mass_level: 2 }, exclude: ['enemy_1404_msnip_2'] }];
    const hard = levelAt('act1multi_01', 'FOUR_STAR', (key) => ({ attack: { duration: 1, hit: 0.5, key } }));
    const spawned = hard.level.waves.flatMap((w) => w.fragments.flatMap((f) => f.actions)).filter((a) => a.type === 'SPAWN').map((a) => a.key);
    assert.ok(!spawned.includes('enemy_1404_msnip') && spawned.includes('enemy_1404_msnip_2'));
    assert.equal(hard.enemies.enemy_1404_msnip, undefined, 'only the enemies that still spawn');
    const two = /** @type {any} */ (hard.enemies.enemy_1404_msnip_2);
    assert.deepEqual([two.aspd, two.moveSpeed, two.massLevel, two.attack.key], [200, raw.enemies.enemy_1404_msnip_2.moveSpeed * 2, raw.enemies.enemy_1404_msnip_2.massLevel, 'enemy_1404_msnip_2']);
    assert.equal(/** @type {any} */ (hard.enemies.enemy_3001_upeopl).massLevel, raw.enemies.enemy_3001_upeopl.massLevel * 2);
    raw.difficulties.FOUR_STAR.unsupported = ['char_blockcnt_add'];
    assert.throws(() => levelAt('act1multi_01', 'FOUR_STAR'), /runes not supported yet: char_blockcnt_add/);
  } finally {
    raw.difficulties.FOUR_STAR = save;
  }
  assert.throws(() => levelAt('nope', 'NORMAL'), /no level nope/);
  assert.throws(() => levelAt('act1multi_01', /** @type {any} */ ('EASY')), /no difficulty EASY/);
});

test('[波次-2] [合作-6] [合作-9] the real act1multi_01 plays out headless the same way twice: its waves, its stage, civilians walking in', () => {
  const c = levelContent('act1multi_01', 'NORMAL');
  /** @returns {[number, Record<string, number>, number]} */
  const play = () => {
    const w = createWorld(c, { seed: 1209492319, players: 2 });
    /** @type {Record<string, number>} */
    const seen = {};
    for (let f = 0; f < 30 * 200 && w.result < 0; f++) for (const e of step(w, c)) seen[e.type] = (seen[e.type] ?? 0) + 1;
    return [stateHash(w), seen, w.frame];
  };
  const [h1, seen, frames] = play(), [h2] = play();
  assert.equal(h1, h2);
  assert.ok(seen.spawn > 10 && seen.goal > 0 && seen.stage === 1 && seen.predefine === 1, JSON.stringify(seen));
  assert.ok(frames < 30 * 150, 'nobody defends: lost before the first stage is settled');
  assert.equal(seen.end, 1);
});
