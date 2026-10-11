// Operators' talents and modules (docs/spec/operators.md 干员-4, 干员-5): extraction from small hand-made tables, and a
// few real operators of the committed files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extractTraining } from '../src/index.js';
import { modulesOf } from '../src/modules.js';
import { talentsOf } from '../src/talents.js';

const cand = (/** @type {Record<string, unknown>} */ more = {}) => ({
  unlockCondition: { phase: 'PHASE_1', level: 10 }, requiredPotentialRank: 0, prefabKey: '1', name: 'T', description: 'd<@ba.kw>x</>', rangeId: null,
  blackboard: [{ key: 'atk', value: 0.5, valueStr: null }], tokenKey: null, isHideTalent: false, ...more,
});
const partTalent = (/** @type {Record<string, unknown>} */ more = {}) => ({ ...cand(), talentIndex: 0, upgradeDescription: 'up', validModeIndices: null, displayRangeId: false, ...more });
const part = (/** @type {string} */ target, /** @type {Record<string, unknown>} */ more = {}) => ({
  resKey: null, target, isToken: false, validInGameTag: null, validInMapTag: null,
  addOrOverrideTalentDataBundle: { candidates: null }, overrideTraitDataBundle: { candidates: null }, ...more,
});
const traitPart = (/** @type {string} */ target, /** @type {Record<string, unknown>} */ more = {}) => part(target, {
  overrideTraitDataBundle: { candidates: [{
    additionalDescription: 'add', overrideDescripton: null, unlockCondition: { phase: 'PHASE_2', level: 60 }, requiredPotentialRank: 0,
    blackboard: [{ key: 'cnt', value: 1, valueStr: null }], prefabKey: null, rangeId: '1-3', ...more,
  }] },
});
const equipDict = {
  u_1: { uniEquipName: 'Badge', typeName1: 'ORIGINAL', typeName2: null, unlockEvolvePhase: 'PHASE_0', unlockLevel: 0, charId: 'char_x' },
  u_2: { uniEquipName: 'Mod', typeName1: 'SUM', typeName2: 'X', unlockEvolvePhase: 'PHASE_2', unlockLevel: 60, charId: 'char_x' },
  u_3: { uniEquipName: 'Mod B', typeName1: 'SUM', typeName2: 'Y', unlockEvolvePhase: 'PHASE_2', unlockLevel: 40, charId: 'char_x' },
};
const tables = (/** @type {Record<string, unknown>} */ battle) => ({ uniequip: { equipDict, charEquip: { char_x: ['u_1', 'u_2', 'u_3'] } }, battle });
const battle = {
  u_2: { phases: [
    { equipLevel: 1, attributeBlackboard: [{ key: 'max_hp', value: 100, valueStr: null }, { key: 'attack_speed', value: 3, valueStr: null }], tokenAttributeBlackboard: {}, parts: [traitPart('TRAIT')] },
    {
      equipLevel: 2, attributeBlackboard: [{ key: 'atk', value: 40, valueStr: null }],
      tokenAttributeBlackboard: { tok_b: [{ key: 'max_deck_stack_cnt', value: 3, valueStr: null }], tok_a: [{ key: 'cost', value: -1, valueStr: null }] },
      parts: [
        traitPart('DISPLAY', { additionalDescription: null, overrideDescripton: 'over' }),
        part('TALENT_DATA_ONLY', { isToken: true, validInGameTag: 'roguelike', addOrOverrideTalentDataBundle: { candidates: [partTalent({ requiredPotentialRank: 4, validModeIndices: [0, 1] })] } }),
        part('TALENT', { addOrOverrideTalentDataBundle: { candidates: [partTalent({ talentIndex: -1, name: null, isHideTalent: true })] } }),
      ],
    },
  ] },
  u_3: { phases: [{ equipLevel: 1, attributeBlackboard: [], tokenAttributeBlackboard: {}, parts: [] }] },
};

test('[干员-4] talents: candidates in order with unlock, texts verbatim, numbers and texts of the blackboard, hidden ones kept', () => {
  const raw = [
    { candidates: [cand(), cand({ requiredPotentialRank: 5, blackboard: [{ key: 'atk', value: 0.7, valueStr: null }, { key: 'range_id', value: 0, valueStr: 'x-1' }], rangeId: 'x-1' })] },
    { candidates: [cand({ name: null, description: null, isHideTalent: true, tokenKey: 'token_a', blackboard: [] })] },
    { candidates: null },
  ];
  const t = /** @type {any[][]} */ (talentsOf(raw, 'talents'));
  assert.deepEqual(t.map((c) => c.length), [2, 1, 0]);
  assert.deepEqual(t[0][0], { phase: 1, level: 10, potential: 0, name: 'T', description: 'd<@ba.kw>x</>', rangeId: null, bb: { atk: 0.5 }, hidden: false, token: null });
  assert.deepEqual([t[0][1].potential, t[0][1].bb, t[0][1].text, t[0][1].rangeId], [5, { atk: 0.7 }, { range_id: 'x-1' }, 'x-1']);
  assert.deepEqual([t[1][0].name, t[1][0].description, t[1][0].hidden, t[1][0].token, 'text' in t[1][0]], [null, null, true, 'token_a', false]);
  assert.deepEqual(talentsOf(null, 'talents'), []);
  assert.throws(() => talentsOf([{ candidates: [cand({ blackboard: [{ key: 'a', value: 1, valueStr: null }, { key: 'a', value: 2, valueStr: null }] })] }], 'talents'), /duplicate a/);
  assert.throws(() => talentsOf([{ candidates: [cand({ unlockCondition: { phase: 'PHASE_3', level: 1 } })] }], 'talents'), /PHASE_0…PHASE_2/);
});

test('[干员-5] modules: only those with battle data, in charEquip order, with name, type, unlock and every level', () => {
  const m = /** @type {any[]} */ (modulesOf('char_x', tables(battle)));
  assert.deepEqual(m.map((x) => [x.id, x.name, x.type, x.phase, x.level, x.levels.length]), [['u_2', 'Mod', 'SUM-X', 2, 60, 2], ['u_3', 'Mod B', 'SUM-Y', 2, 40, 1]]);
  assert.deepEqual(modulesOf('char_none', tables(battle)), []);
  assert.deepEqual(modulesOf('char_x', tables({})), []);
});

test('[干员-5] a module level: attribute additions by engine name, token attributes by token, trait and talent parts', () => {
  const [mod] = /** @type {any[]} */ (modulesOf('char_x', tables(battle)));
  assert.deepEqual(mod.levels[0].stats, { maxHp: 100, aspd: 3 });
  assert.deepEqual(mod.levels[0].parts, [{
    target: 'TRAIT', token: false, gameTag: null, mapTag: null, talents: [],
    trait: [{ phase: 2, level: 60, potential: 0, add: 'add', override: null, rangeId: '1-3', bb: { cnt: 1 } }],
  }]);
  const l = mod.levels[1];
  assert.deepEqual([l.level, l.stats, Object.keys(l.tokens), l.tokens.tok_a, l.tokens.tok_b], [2, { atk: 40 }, ['tok_a', 'tok_b'], { cost: -1 }, { maxDeckStackCnt: 3 }]);
  assert.deepEqual(l.parts.map((/** @type {any} */ p) => [p.target, p.token, p.gameTag]), [['DISPLAY', false, null], ['TALENT_DATA_ONLY', true, 'roguelike'], ['TALENT', false, null]]);
  assert.deepEqual([l.parts[0].trait[0].add, l.parts[0].trait[0].override], [null, 'over']);
  assert.deepEqual(l.parts[1].talents, [{
    index: 0, phase: 1, level: 10, potential: 4, name: 'T', upgrade: 'up', rangeId: null, bb: { atk: 0.5 }, hidden: false, modes: [0, 1],
  }]);
  assert.deepEqual([l.parts[2].talents[0].index, l.parts[2].talents[0].name, l.parts[2].talents[0].hidden], [-1, null, true]);
});

test('[干员-5] an unknown attribute, target or another operator\'s module is an error', () => {
  const bad = (/** @type {unknown} */ phase) => tables({ u_2: { phases: [phase] } });
  const level = { equipLevel: 1, attributeBlackboard: [], tokenAttributeBlackboard: {}, parts: [] };
  assert.throws(() => modulesOf('char_x', bad({ ...level, attributeBlackboard: [{ key: 'move_speed', value: 1, valueStr: null }] })), /unsupported attribute move_speed/);
  assert.throws(() => modulesOf('char_x', bad({ ...level, tokenAttributeBlackboard: { t: [{ key: 'move_speed', value: 1, valueStr: null }] } })), /unsupported attribute move_speed/);
  assert.throws(() => modulesOf('char_x', bad({ ...level, parts: [part('NEW_TARGET')] })), /unsupported NEW_TARGET/);
  assert.throws(() => modulesOf('char_y', { uniequip: { equipDict, charEquip: { char_y: ['u_2'] } }, battle }), /is not char_y/);
});

test('[干员-4] [干员-5] an operator\'s training data carries its talents and modules', () => {
  const char = {
    name: 'Op', position: 'MELEE', profession: 'WARRIOR', subProfessionId: 'fighter', rarity: 'TIER_4', skills: [], talents: [{ candidates: [cand()] }],
    phases: [{ maxLevel: 50, rangeId: 'r', attributesKeyFrames: [{ level: 1, data: stat() }, { level: 50, data: stat() }] }],
  };
  const t = /** @type {any} */ (extractTraining(char, 'char_x', { r: { grids: [] } }, {}, tables(battle)));
  assert.deepEqual([t.talents.length, t.modules.map((/** @type {any} */ x) => x.id)], [1, ['u_2', 'u_3']]);
});

/** @returns {Record<string, number>} */
function stat() {
  return { maxHp: 1, atk: 1, def: 1, magicResistance: 0, cost: 1, blockCnt: 1, baseAttackTime: 1, respawnTime: 1, attackSpeed: 100, tauntLevel: 0, massLevel: 0 };
}

const real = (/** @type {string} */ id) => /** @type {any} */ (JSON.parse(readFileSync(new URL(`../../content/data/operators/${id}.json`, import.meta.url), 'utf8')));

test('[干员-4] real operators: Amiya\'s talent with its potential candidate, a hidden talent of a summoner', () => {
  const amiya = real('char_002_amiya');
  const last = amiya.talents[0].at(-1);
  assert.deepEqual([last.phase, last.potential, last.name, last.bb], [2, 5, '情绪吸收', { 'amiya_t_1[atk].sp': 3, 'amiya_t_1[kill].sp': 10 }]);
  assert.match(last.description, /<@ba\.talpu>（\+1）<\/>/);
  const buddy = real('char_4215_buddy');
  assert.deepEqual(buddy.talents.map((/** @type {any[]} */ c) => c.every((x) => x.hidden)), [true, false]);
  assert.equal(buddy.talents[0][0].token, 'token_10063_buddy_bddg');
});

test('[干员-5] real operators: Magallan has two modules with token attributes; Pallas overrides the trait; Rosmon has text entries', () => {
  const mgllan = real('char_248_mgllan');
  assert.deepEqual(mgllan.modules.map((/** @type {any} */ m) => [m.id, m.type, m.phase, m.level, m.levels.length]), [['uniequip_002_mgllan', 'SUM-X', 2, 60, 3], ['uniequip_003_mgllan', 'SUM-Y', 2, 60, 3]]);
  assert.deepEqual(mgllan.modules[0].levels.map((/** @type {any} */ l) => l.stats), [{ maxHp: 100, atk: 30 }, { maxHp: 130, atk: 40 }, { maxHp: 150, atk: 50 }]);
  assert.deepEqual(mgllan.modules[1].levels[1].tokens.token_10005_mgllan_drone2, { cost: -3, maxDeckStackCnt: 3 });
  const pallas = real('char_485_pallas').modules[0].levels[0];
  assert.deepEqual([pallas.stats, pallas.parts[0].target, pallas.parts[0].trait[0].bb], [{ maxHp: 150, atk: 55 }, 'TRAIT_DATA_ONLY', { atk_scale: 1.3 }]);
  assert.match(pallas.parts[0].trait[0].override, /^可以攻击到<@ba\.kw>较远敌人<\/>/);
  const overwrite = real('char_391_rosmon').modules[1].levels[2].parts.find((/** @type {any} */ p) => p.target === 'OVERWRITE_BATTLE_DATA');
  assert.deepEqual([overwrite.trait[0].text, overwrite.trait[0].bb], [{ game_tag_meta: 'roguelike', extra_profession: 'caster' }, {}]);
});
