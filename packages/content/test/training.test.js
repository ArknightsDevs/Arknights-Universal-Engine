// The training level IG-TR-1 (act1multi_tr01) played headless with nobody playing (docs/spec/waves.md 波次-7, 波次-8):
// its partner's predefined operators come in for the last seat at their tiles and trainings, 米格鲁 again after the
// intermission; its stories are told in the order of PRTS's 关卡内剧情; its own cards give the fixed lineup (关卡-7).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, predefinedKey, deployProblem, deck as decks } from '@aue/sim';
import { LEVELS, matchContent } from '../src/index.js';

const lv = LEVELS['act1multi_tr01'];

test('[关卡-7] IG-TR-1\'s own cards: 克洛丝, 蛇屠箱, 末药 and 流星 at elite 1, their skills at 7, and 赛场啦啦队 hidden at first', () => {
  assert.deepEqual(lv.level.cards.operators.map((/** @type {any} */ x) => [x.key, x.build.elite, x.build.level, x.build.skill, x.build.skillLevel, x.build.trust]), [
    ['char_124_kroos', 1, 50, 0, 7, 100], ['char_150_snakek', 1, 60, 1, 7, 100], ['char_117_myrrh', 1, 50, 1, 7, 100], ['char_126_shotst', 1, 50, 1, 7, 100]]);
  assert.deepEqual(lv.level.cards.tokens, [{ key: 'trap_201_muulco', alias: 'trap_201_muulco', count: 1, hidden: true }]);
});

test('[波次-7] [波次-8] IG-TR-1 headless: the partner\'s operators for the last seat, 米格鲁 back after the intermission, the stories in order', async () => {
  const deck = lv.level.cards.operators.map((/** @type {any} */ x) => ({ id: x.key, build: x.build }));
  const c = await matchContent({ level: 'act1multi_tr01', difficulty: 'NORMAL', seed: 7, decks: [deck, []] });
  assert.equal(c.operators[predefinedKey('char_002_amiya')].char, 'char_002_amiya');
  const w = createWorld(c, { seed: 7, players: 2 });
  /** @type {string[]} */
  const stories = [];
  /** @type {[string, number, string][]} */
  const deploys = [];
  for (let f = 0; f < 30 * 240 && w.result < 0; f++) {
    step(w, c, []);
    for (const e of w.events) {
      if (e.type === 'story') stories.push(String(e.key).split('_').pop() ?? '');
      if (e.type === 'deploy') {
        const u = w.units.find((x) => x.id === e.id);
        deploys.push([String(e.key), Number(e.owner), `${u?.y},${u?.x}`]);
      }
    }
  }
  assert.deepEqual(stories, ['a', 'b', 'c', 'e', 'f', 'd', 'g']);
  assert.deepEqual(deploys, [['char_122_beagle#pre', 1, '4,5'], ['char_282_catap#pre', 1, '4,7'], ['char_120_hibisc#pre', 1, '3,7'], ['char_002_amiya#pre', 1, '3,6'], ['char_122_beagle#pre', 1, '4,5']], 'each at its tile');
  assert.ok(w.result >= 0, 'the battle ends');
});

/** 基础专项's runes: its attack and its device card (符文-6). @type {import('../src/runes.js').SeatRune[]} */
const BASIC = [{ key: 'char_attribute_mul', professions: 639, board: [['atk', 1.1]] },
  { key: 'insert_token_card', professions: 384, board: [['token_key', 'trap_201_muulco'], ['level', 1], ['skill', 0], ['count', 1], ['skill_level', 1]] }];

test('[波次-9] 赛场啦啦队\'s card is held back until the third wave activates it: not shown, not deployed; then as any card', async () => {
  const deck = lv.level.cards.operators.map((/** @type {any} */ x) => ({ id: x.key, build: x.build }));
  const c = await matchContent({ level: 'act1multi_tr01', difficulty: 'NORMAL', seed: 7, decks: [deck, []], runes: [BASIC, []] });
  const w = createWorld(c, { seed: 7, players: 2 }), card = 'trap_201_muulco#0';
  assert.ok(c.decks?.[0].includes(card));
  const put = /** @type {any} */ ({ type: 'deploy', op: card, row: 3, col: 3, dir: 1 });
  assert.equal(deployProblem(w, c, 0, put), 'card held back');
  assert.equal(decks.cardHidden(w, c, card), true);
  let shown = -1;
  for (let f = 0; f < 30 * 120 && shown < 0; f++) {
    step(w, c, []);
    if (w.events.some((e) => e.type === 'predefine' && e.key === 'trap_201_muulco')) shown = w.frame;
  }
  assert.ok(shown > 30 * 40, 'in the third wave');
  assert.equal(decks.cardHidden(w, c, card), false);
  assert.notEqual(deployProblem(w, c, 0, put), 'card held back');
});
