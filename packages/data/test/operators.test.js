// Operators' training data (docs/spec/operators.md): phases, trust, potentials, skills with every level, trait
// candidates; and, with AUE_GAMEDATA, the committed files equal a fresh extraction.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extractRoster, extractTraining } from '../src/index.js';
import { extractRosterFromCheckout } from '../src/cli/operators.js';

const stats = (/** @type {number} */ k) => ({
  maxHp: 100 * k, atk: 10 * k, def: 5 * k, magicResistance: 0, cost: 10, blockCnt: 2, baseAttackTime: 1.2, respawnTime: 70, attackSpeed: 100, tauntLevel: 0, massLevel: 0,
  moveSpeed: 1, hpRecoveryPerSec: 0,
});
const level = (/** @type {number} */ n, /** @type {string} */ description) => ({
  skillType: 'MANUAL', durationType: 'NONE', duration: 10 + n, spData: { spType: 'INCREASE_WITH_TIME', spCost: 30 - n, initSp: 0, maxChargeTime: 1, levelUpCost: null },
  blackboard: [{ key: 'atk', value: n / 10, valueStr: null }], description, name: 'x', rangeId: null, prefabId: 'p',
});
const char = (/** @type {Record<string, unknown>} */ more = {}) => ({
  name: 'Op', position: 'MELEE', profession: 'WARRIOR', subProfessionId: 'fighter', rarity: 'TIER_4',
  phases: [{ maxLevel: 50, rangeId: 'r', attributesKeyFrames: [{ level: 1, data: stats(1) }, { level: 50, data: stats(2) }] }],
  favorKeyFrames: [{ level: 0, data: stats(0) }, { level: 50, data: stats(0.5) }],
  potentialRanks: [{ type: 'BUFF', buff: { attributes: { attributeModifiers: [{ attributeType: 'COST', formulaItem: 'ADDITION', value: -1 }] } } }, { type: 'CUSTOM', buff: null }],
  skills: [{ skillId: 'sk', unlockCond: { phase: 'PHASE_0', level: 1 } }],
  trait: { candidates: [{ unlockCondition: { phase: 'PHASE_0', level: 1 }, requiredPotentialRank: 0, blackboard: [{ key: 'cost', value: 1 }] }] },
  ...more,
});
const ranges = { r: { grids: [{ row: 0, col: 0 }, { row: 0, col: 1 }] } };
const equip = { uniequip: { equipDict: {}, charEquip: {} }, battle: {} };
const skills = { sk: { levels: [level(1, '攻击力提升'), level(2, '可随时停止技能')] } };

test('[干员-1] [干员-2] [干员-3] an operator\'s training data: phases with range and keyframes, trust, potentials, skill levels, trait candidates', () => {
  const t = /** @type {any} */ (extractTraining(char(), 'char_x', ranges, skills, equip));
  assert.deepEqual([t.name, t.position, t.profession, t.branch, t.rarity], ['Op', 'MELEE', 'WARRIOR', 'fighter', 4]);
  assert.deepEqual(t.phases[0].range, [{ row: 0, col: 0 }, { row: 0, col: 1 }]);
  assert.deepEqual(t.phases[0].frames[1], { level: 50, stats: { maxHp: 200, atk: 20, def: 10, res: 0, cost: 10, blockCnt: 2, baseAttackTime: 1.2, respawnTime: 70, aspd: 100, tauntLevel: 0, massLevel: 0 } });
  assert.deepEqual([t.favor.level, t.favor.stats.atk], [50, 5]);
  assert.deepEqual(t.potentials, [{ cost: -1 }, {}]);
  assert.deepEqual(t.skills[0].levels.map((/** @type {any} */ l) => [l.duration, l.spData, l.blackboard, l.stoppable]), [
    [11, { spType: 'INCREASE_WITH_TIME', spCost: 29, initSp: 0, maxChargeTime: 1 }, [{ key: 'atk', value: 0.1 }], false],
    [12, { spType: 'INCREASE_WITH_TIME', spCost: 28, initSp: 0, maxChargeTime: 1 }, [{ key: 'atk', value: 0.2 }], true],
  ]);
  assert.deepEqual(t.traits, [{ phase: 0, level: 1, potential: 0, bb: { cost: 1 } }]);
  const none = /** @type {any} */ (extractTraining(char({ trait: null, favorKeyFrames: null, potentialRanks: null }), 'char_x', ranges, skills, equip));
  assert.deepEqual([none.traits, none.favor, none.potentials], [[], null, []]);
  assert.throws(() => extractTraining(char({ potentialRanks: [{ buff: { attributes: { attributeModifiers: [{ attributeType: 'SP', formulaItem: 'ADDITION', value: 1 }] } } }] }), 'char_x', ranges, skills, equip), /unsupported SP ADDITION/);
  assert.throws(() => extractTraining(char({ skills: [{ skillId: 'sk', unlockCond: { phase: 'PHASE_7', level: 1 } }] }), 'char_x', ranges, skills, equip), /PHASE_0…PHASE_2/);
});

test('[干员-1] the roster: every character that is not a token or a trap, in id order', () => {
  const r = extractRoster({ char_b: char(), char_a: char(), token_x: char({ profession: 'TOKEN' }), char_t: char({ profession: 'TRAP' }), trap_1: char() }, ranges, skills, equip);
  assert.deepEqual(Object.keys(r), ['char_a', 'char_b']);
});

test('[干员-1] the committed operator files are a fresh extraction of the pinned data', { skip: process.env.AUE_GAMEDATA ? false : 'AUE_GAMEDATA is not set' }, () => {
  const { source, operators } = /** @type {any} */ (extractRosterFromCheckout(/** @type {string} */ (process.env.AUE_GAMEDATA)));
  const dir = new URL('../../content/data/operators/', import.meta.url);
  for (const id of ['char_122_beagle', 'char_002_amiya', 'char_1012_skadi2']) {
    assert.equal(`${JSON.stringify(operators[id])}\n`, readFileSync(new URL(`${id}.json`, dir), 'utf8'), id);
  }
  const index = JSON.parse(readFileSync(new URL('index.json', dir), 'utf8'));
  assert.deepEqual([index.source, Object.keys(index.operators).length], [source, Object.keys(operators).length]);
});
