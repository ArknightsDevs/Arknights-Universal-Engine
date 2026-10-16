// Seat runes on a match's content (docs/spec/runes.md): which units they apply to, the records they change, the seat's
// deploy limit, and runes not supported yet.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchContent, seatRules, withRunes, PROFESSION_BITS } from '../src/index.js';

const BUILD = { elite: 2, level: 90, potential: 1, trust: 100, skill: 0, skillLevel: 10 };
/** The eight operator professions (符文-1). */
const OPERATORS = 639;
/** @param {string} key @param {[string, number | string][]} board @param {number} [professions] */
const rune = (key, board, professions = OPERATORS) => ({ key, professions, board });

/** Runes of the 促融共竞 play styles (activity_table MULTIPLAY_V3/act1multi squadEffectList), without the device cards. */
const STYLES = {
  基础: [rune('char_attribute_mul', [['atk', 1.1]])],
  驻场: [rune('char_respawntime_mul', [['scale', 1.15]]), rune('env_gbuff_new', [['key', 'attr_up_on_trigger[atk][max_hp]'], ['atk', 0.03], ['max_hp', 0.03], ['max_stack_cnt', 20], ['interval', 5]])],
  游走: [rune('char_respawntime_mul', [['scale', 0.8]]), rune('env_gbuff_new', [['key', 'modify_sp[born]'], ['sp', 10]]), rune('env_gbuff_new', [['key', 'sp_recovery_reduction'], ['sp_recovery_per_sec', 1]]),
    rune('global_deck_placeable_char_num_add', [['value', -1]])],
  攻坚: [rune('char_attribute_mul', [['attack_speed', 1.2]]), rune('char_blockcnt_add', [['value', 0]]), rune('env_gbuff_new', [['key', 'attack_prob_get[sp][char]'], ['prob', 0.1], ['sp', 1]]),
    rune('env_gbuff_new', [['key', 'damage_scale[input][char]'], ['damage_scale', 1.2]])],
  支援: [rune('char_dynamic_ability_new', [['key', 'dyn_attr_get_in_attack_range[modify_sp]'], ['sp', 1], ['interval', 1]]), rune('env_gbuff_new', [['key', 'damage_scale[out]'], ['damage_scale', 0.9]]),
    rune('env_gbuff_new', [['key', 'heal_scale[advanced][out]'], ['heal_scale', 1.4]])],
};

test('[符文-1] the profession bits; 639 is the eight operator professions, without summons and devices', () => {
  assert.deepEqual(PROFESSION_BITS, { WARRIOR: 1, SNIPER: 2, TANK: 4, MEDIC: 8, SUPPORT: 16, CASTER: 32, SPECIAL: 64, TOKEN: 128, TRAP: 256, PIONEER: 512 });
  const ops = Object.entries(PROFESSION_BITS).filter(([, b]) => (OPERATORS & b) !== 0).map(([p]) => p);
  assert.deepEqual(ops, ['WARRIOR', 'SNIPER', 'TANK', 'MEDIC', 'SUPPORT', 'CASTER', 'SPECIAL', 'PIONEER']);
});

test('[符文-1] [符文-2] [符文-3] [符文-4] [符文-5] each play style\'s runes are supported; a rune not supported is named', () => {
  for (const [name, runes] of Object.entries(STYLES)) assert.deepEqual(seatRules(runes).unsupported, [], name);
  assert.equal(seatRules(STYLES.游走).limitAdd, -1);
  assert.deepEqual(seatRules([rune('insert_token_card', [['token_key', 'trap_201_muulco']], 384), rune('env_gbuff_new', [['key', 'nope']])]).unsupported,
    ['insert_token_card', 'env_gbuff_new:nope']);
});

test('[符文-1] [符文-2] [符文-3] a unit whose profession is in the mask takes the runes: base attributes, redeployment, block, SP at deployment, buffs', () => {
  const sniper = /** @type {any} */ ({ name: 'x', profession: 'SNIPER', atk: 100, aspd: 100, maxHp: 1000, respawnTime: 70, blockCnt: 1, skill: { init: 5 } });
  const r = seatRules([...STYLES.基础, ...STYLES.驻场, ...STYLES.游走, ...STYLES.攻坚, ...STYLES.支援]), d = /** @type {any} */ (withRunes(sniper, r.effects));
  assert.deepEqual([d.atk, d.aspd, d.respawnTime, d.blockCnt, d.skill.init], [100 * 1.1, 100 * 1.2, 70 * 1.15 * 0.8, 1, 15]);
  assert.deepEqual(d.runeMods, { spRecoveryMul: 1, dmgTakenMul: 1.2, dmgDealtMul: 0.9, healingDealtMul: 1.4 });
  assert.deepEqual(d.timedTalents, [{ kind: 'stack', seconds: 5, max: 20, mods: { atkPct: 0.03, hpPct: 0.03 } }]);
  assert.deepEqual([d.probSp, d.rangeSp], [[{ prob: 0.1, sp: 1 }], { sp: 1, interval: 1 }]);
  const token = { ...sniper, profession: 'TOKEN' };
  assert.equal(withRunes(token, r.effects), token, 'a summon is not in 639');
  assert.equal(sniper.atk, 100, 'the record given is not changed');
});

test('[符文-1] [符文-2] a match with runes: each seat\'s own operators and summons by profession, the seat\'s deploy limit; runes not supported are refused', async () => {
  const decks = [[{ id: 'char_1035_wisdel', build: BUILD }], [{ id: 'char_1035_wisdel', build: BUILD }]];
  const plain = await matchContent({ level: 'act1multi_01', difficulty: 'NORMAL', seed: 1, decks });
  const c = await matchContent({ level: 'act1multi_01', difficulty: 'NORMAL', seed: 1, decks, runes: [[...STYLES.基础, ...STYLES.游走], []] });
  const op = (/** @type {any} */ x, /** @type {string} */ k) => x.operators[k];
  assert.equal(op(c, 'char_1035_wisdel#0').atk, op(plain, 'char_1035_wisdel#0').atk * 1.1);
  assert.equal(op(c, 'char_1035_wisdel#0').skill.init, op(plain, 'char_1035_wisdel#0').skill.init + 10);
  assert.equal(op(c, 'char_1035_wisdel#1').atk, op(plain, 'char_1035_wisdel#1').atk, 'the other seat as it was');
  assert.equal(op(c, 'token_10035_wisdel_wward#0').atk, op(plain, 'token_10035_wisdel_wward#0').atk, 'her summon is a TOKEN');
  assert.deepEqual(c.level.options.characterLimitAdd, [-1, 0]);
  assert.equal(plain.level.options.characterLimitAdd, undefined);
  await assert.rejects(matchContent({ level: 'act1multi_01', difficulty: 'NORMAL', seed: 1, decks, runes: [[rune('nope', [])], []] }), /seat 0: runes not supported yet: nope/);
});
