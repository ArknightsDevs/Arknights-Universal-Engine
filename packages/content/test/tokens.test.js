// Summons at their owner's training (docs/spec/summons.md 召唤-1…召唤-4). Test names cite the clauses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROSTER, loadTraining } from '../src/operators.js';
import { TOKENS, SUMMON_PAGES, loadToken, tokenAt, tokenBuild, limitsAt, supplyAt } from '../src/tokens.js';

/** @param {Partial<import('../src/operators.js').Build>} o @returns {import('../src/operators.js').Build} */
const build = (o) => ({ elite: 2, level: 90, potential: 1, trust: 0, skill: 0, skillLevel: 7, ...o });

test('[召唤-1] summons are TOKEN entries with their deploy and stack bases, empty skill slots kept; an owner lists its summons', async () => {
  assert.equal(Object.keys(TOKENS).length, 74);
  const mon3tr = await loadToken('token_10002_kalts_mon3tr'), tentacle = await loadToken('token_10001_deepcl_tentac');
  assert.equal(mon3tr.profession, 'TOKEN');
  assert.deepEqual([mon3tr.phases[2].frames[0].stats.maxDeployCount, mon3tr.phases[2].frames[0].stats.maxDeckStackCnt], [1, 0]);
  assert.deepEqual(tentacle.skills, [null, null]);
  assert.deepEqual((await loadTraining('char_003_kalts')).tokens, ['token_10002_kalts_mon3tr']);
  const ling = await loadTraining('char_2023_ling');
  assert.deepEqual(ling.skills.map((s) => s?.token), ['token_10020_ling_soul1', 'token_10020_ling_soul2', 'token_10020_ling_soul3']);
  assert.ok(ling.tokens?.includes('token_10020_ling_soul3'));
  await assert.rejects(loadToken('token_nobody'), RangeError);
});

test('[召唤-2] a summon takes its owner\'s elite and level, no potential or trust; the module adds; the skill slot follows', async () => {
  const ling = await loadTraining('char_2023_ling'), soul = await loadToken('token_10020_ling_soul1');
  const top = soul.phases[2].frames.at(-1)?.stats ?? {};
  const plain = tokenAt(soul, 'token_10020_ling_soul1', ling, build({}));
  assert.deepEqual([plain.maxHp, plain.atk, plain.def], [top.maxHp, top.atk, top.def]);
  const trained = tokenAt(soul, 'token_10020_ling_soul1', ling, build({ potential: 6, trust: 200 }));
  assert.deepEqual([trained.maxHp, trained.atk], [top.maxHp, top.atk]);
  const moduled = tokenAt(soul, 'token_10020_ling_soul1', ling, build({ module: 0, moduleLevel: 3 }));
  assert.deepEqual([moduled.maxHp - top.maxHp, moduled.atk - top.atk, moduled.cost - top.cost], [150, 45, -3]);
  assert.equal(plain.skill?.id, 'sktok_ling_soul1');
  assert.equal(tokenAt(soul, 'token_10020_ling_soul1', ling, build({ skill: 1, skillLevel: 10 })).skill?.id, 'sktok_ling_soul1');
  const tentacle = await loadToken('token_10001_deepcl_tentac');
  assert.equal(tokenAt(tentacle, 'token_10001_deepcl_tentac', await loadTraining('char_110_deepcl'), build({ elite: 2, level: 70, skill: 1 })).skill, undefined);
  const dog = await loadToken('token_10063_buddy_bddg');
  assert.deepEqual(tokenBuild(dog, build({ elite: 2, level: 90 })), { elite: 0, level: 30, potential: 1, trust: 0, skill: -1, skillLevel: 7 });
});

test('[召唤-2] [召唤-3] a summon\'s talents unlock at its owner\'s potential: 望\'s 棋子 hold and deploy one more from potential 3', async () => {
  const stone = await loadToken('token_10064_wang_stone1');
  assert.deepEqual(limitsAt(stone, tokenBuild(stone, build({ potential: 2 })), null), { deployLimit: 6, holdLimit: 7 });
  assert.deepEqual(limitsAt(stone, tokenBuild(stone, build({ potential: 3 })), null), { deployLimit: 7, holdLimit: 8 });
});

/** The rich text and bracketed potential differences of a description removed. @param {string | null} d */
const plainText = (d) => (d ?? '').replace(/<[^>]*>/g, '').replace(/（\+\d+）|\(\+\d+\)/g, '');
const COUNT = /** @type {Record<string, number>} */ ({ 一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 });
/** @param {string} s */
const countOf = (s) => (/^\d+$/.test(s) ? Number(s) : COUNT[s]);

/**
 * Checks one owner talent candidate's counts against its summons' limits (召唤-3); how many summons it checked.
 * @param {import('../src/operators.js').Training} owner @param {import('../src/operators.js').TalentCandidate} c @param {boolean} bySkill
 */
async function checkCounts(owner, c, bySkill) {
  const text = plainText(c.description), use = /(?:使用|携带)(\d+|[一两二三四五六])(?:个|枚)/.exec(text);
  if (!use) return 0;
  const own = /最多拥有(\d+)/.exec(text), dep = /最多(?:同时)?(?:可)?部署(\d+)/.exec(text);
  const ids = c.token && Object.hasOwn(TOKENS, c.token) ? [c.token] : bySkill ? owner.skills.map((s) => /** @type {string} */ (s?.token)) : [];
  for (const t of ids) {
    const token = await loadToken(t), lim = limitsAt(token, tokenBuild(token, build({ elite: c.phase, level: Math.max(1, c.level), potential: c.potential + 1 })), null);
    const at = `${owner.name} ${TOKENS[t].name} elite ${c.phase} potential ${c.potential + 1}`;
    if (own) assert.equal(lim.holdLimit, Number(own[1]), at);
    if (dep) assert.equal(lim.deployLimit, Number(dep[1]), at);
    assert.ok(countOf(use[1]) <= lim.holdLimit, at);
  }
  return ids.length;
}

test('[召唤-3] every owner talent that says how many summons it may use, own and deploy agrees with the limits', async () => {
  let checked = 0;
  for (const id of Object.keys(ROSTER)) {
    const owner = await loadTraining(id), bySkill = owner.skills.length > 0 && owner.skills.every((s) => s?.token);
    for (const c of owner.talents.flat()) checked += await checkCounts(owner, c, bySkill);
  }
  assert.ok(checked >= 140, `${checked} talents checked`);
});

test('[召唤-4] the card: the talent cnt that names the summon, or talent 0\'s for the summon of the skill; the PRTS fields', async () => {
  const deepcl = await loadTraining('char_110_deepcl'), ling = await loadTraining('char_2023_ling'), ironmn = await loadTraining('char_4072_ironmn');
  assert.equal(supplyAt(deepcl, build({ level: 70 }), 'token_10001_deepcl_tentac'), 4);
  assert.equal(supplyAt(ling, build({ skill: 0 }), 'token_10020_ling_soul1'), 5);
  assert.equal(supplyAt(ling, build({ skill: 0 }), 'token_10020_ling_soul2'), 0);
  assert.equal(supplyAt(ironmn, build({ elite: 1, level: 1, skill: 1 }), 'token_10027_ironmn_pile2'), 3);
  assert.equal(supplyAt(await loadTraining('char_4215_buddy'), build({}), 'token_10063_buddy_bddg'), 0);
  const pile = tokenAt(await loadToken('token_10027_ironmn_pile2'), 'token_10027_ironmn_pile2', ironmn, build({ elite: 1, level: 1, skill: 1 }));
  assert.deepEqual(pile.summon, { deployLimit: 2, holdLimit: 2, supply: 3, occupy: 0, respawn: 'default' });
  const mon3tr = tokenAt(await loadToken('token_10002_kalts_mon3tr'), 'token_10002_kalts_mon3tr', await loadTraining('char_003_kalts'), build({}));
  assert.deepEqual(mon3tr.summon, { deployLimit: 1, holdLimit: 1, supply: 1, occupy: 1, respawn: 'unique' });
  assert.equal(SUMMON_PAGES.token_10070_aphris_pc.respawn, 'queue');
  assert.equal(tokenAt(await loadToken('token_10064_wang_stone1'), 'token_10064_wang_stone1', await loadTraining('char_2027_wang'), build({})).position, 'ALL');
  assert.equal(Object.keys(SUMMON_PAGES).length, 74);
  for (const [id, p] of Object.entries(SUMMON_PAGES)) assert.ok(Object.hasOwn(TOKENS, id) && p.oldid > 0 && [0, 1].includes(p.occupy), id);
});
