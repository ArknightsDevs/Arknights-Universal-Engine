// Talents on the deck, the cost and deployments (docs/spec/field.md 部署-10, docs/spec/traits.md 职业-30): a starting
// cost, cost recovery, first deployments, cuts after a retreat, on deployments, in the deck and from the field; SP and
// cost on deployments, answers to skills starting in range, the first skill's end, SP pulses and SP on attacks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent } from '@aue/testkit';
import { createWorld, step } from '../src/index.js';
import { deployCost, withdraw, leaveField } from '../src/deck.js';
import { statsOf } from '../src/attrs.js';
import { makeOperator } from '../src/units.js';
import { activate, endSkill } from '../src/skills.js';
import { hurtAttackSp } from '../src/talentfx.js';

/** @typedef {import('../src/types.js').Unit} Unit @typedef {import('../src/types.js').World} World */

/** A skill record that gains no SP by itself. @param {Record<string, unknown>} [o] */
const skill = (o = {}) => ({ id: 's', type: 'MANUAL', sp: 'none', cost: 99, init: 0, charges: 1, duration: 5, ammo: false, bb: {}, ...o });

/**
 * The tiny level without waves (maximum cost 99, room for 9 operators) for two seats, its records changed — each key's
 * fields over its record, or over the record `from` names for a new one —, with decks when given.
 * @param {Record<string, Record<string, any>>} ops @param {string[][]} [decks] @param {Record<string, number>} [options]
 */
function arena(ops, decks, options = {}) {
  const base = tinyContent();
  const c = /** @type {any} */ ({ ...base, level: { ...base.level, waves: [], options: { ...base.level.options, maxCost: 99, characterLimit: 9, ...options } }, operators: { ...base.operators } });
  for (const [k, { from, ...o }] of Object.entries(ops)) c.operators[k] = { ...c.operators[from ?? k], ...o };
  if (decks) c.decks = decks;
  const w = createWorld(c, { seed: 1, players: 2 });
  return { w, c };
}
/** @param {string} op @param {number} row @param {number} col @returns {[number, import('@aue/schema').Command]} */
const deploy = (op, row, col, seat = 0) => [seat, { type: 'deploy', op, row, col, dir: 0 }];
/** @param {World} w @param {string} key @returns {Unit} */
const unitOf = (w, key) => /** @type {Unit} */ (w.units.find((u) => u.key === key));
/** @param {World} w @param {any} c @param {number} n */
const frames = (w, c, n) => { for (let i = 0; i < n; i++) step(w, c, []); };
/** An operator retreats and may be deployed again at once. @param {World} w @param {any} c @param {string} key */
const back = (w, c, key) => { withdraw(w, c, unitOf(w, key)); w.players[0].cards[key].ready = w.frame; };

test('[部署-10] [费用-1] a seat starts with more cost by its deck\'s talents, not above the maximum; the other seat not', () => {
  const { w } = arena({ guard: { talentTrait: { startCost: 2 } } }, [['guard'], ['sniper']]);
  assert.deepEqual(w.players.map((p) => p.cost), [12, 10]);
  const capped = arena({ guard: { talentTrait: { startCost: 2 } } }, [['guard'], ['sniper']], { maxCost: 11 });
  assert.deepEqual(capped.w.players.map((p) => p.cost), [11, 10]);
});

test('[部署-10] [费用-1] while an operator with a cost recovery talent is on the field its seat\'s cost comes × it faster, what runs over kept', () => {
  const { w, c } = arena({ guard: { talentTrait: { costRate: 1.1 } } });
  step(w, c, [deploy('guard', 1, 1)]);
  for (const p of w.players) p.cost = 0;
  frames(w, c, 290);
  assert.deepEqual(w.players.map((p) => p.cost), [10, 9], '290 frames: 319 against 290 of the timer, 30 a point');
});

test('[部署-10] [职业-30] the talents\' first-deployment cost adds to the trait\'s; the modifiers while on the field for the first time', () => {
  const { w, c } = arena({ guard: { trait: { firstCost: -1 }, talentTrait: { firstCost: -3, whiles: [{ when: 'firstDeploy', mods: { atkPct: 0.15 } }] } } });
  assert.equal(deployCost(c, w.players[0], 'guard'), 1);
  step(w, c, [deploy('guard', 1, 1)]);
  frames(w, c, 1);
  assert.ok(Math.abs(statsOf(unitOf(w, 'guard')).atk - 57.5) < 1e-9);
  back(w, c, 'guard');
  step(w, c, [deploy('guard', 1, 1)]);
  frames(w, c, 1);
  assert.equal(statsOf(unitOf(w, 'guard')).atk, 50, 'the second time');
});

test('[部署-10] a retreat with the talent cuts the cost of each card of the seat — itself too — until its next operator is deployed; a fall does not', () => {
  const { w, c } = arena({ guard: { talentTrait: { retreatCut: -1 } } });
  const p = w.players[0];
  p.cost = 99;
  step(w, c, [deploy('guard', 1, 1)]);
  back(w, c, 'guard');
  assert.deepEqual([deployCost(c, p, 'sniper'), deployCost(c, p, 'guard'), deployCost(c, w.players[1], 'sniper')], [2, 6, 3]);
  step(w, c, [deploy('sniper', 0, 2)]);
  assert.deepEqual([p.cut, deployCost(c, p, 'guard'), unitOf(w, 'sniper').paid], [undefined, 7, 2], 'the next one took it');
  step(w, c, [deploy('guard', 1, 1)]);
  const g = unitOf(w, 'guard');
  w.units.splice(w.units.indexOf(g), 1);
  leaveField(w, c, g, false);
  assert.equal(p.cut, undefined);
});

test('[部署-10] a deployment with the talent cuts each card of the profession not on the field, at most the most, until that card is deployed', () => {
  const { w, c } = arena({ guard: { profession: 'PIONEER', talentTrait: { deployCut: { profession: 'WARRIOR', value: -1, max: 2 } } }, sniper: { profession: 'WARRIOR' },
    caster: { from: 'sniper', profession: 'CASTER' } });
  const p = w.players[0];
  p.cost = 99;
  step(w, c, [deploy('guard', 1, 1)]);
  assert.deepEqual([deployCost(c, p, 'sniper'), deployCost(c, p, 'caster'), deployCost(c, w.players[1], 'sniper')], [2, 3, 3]);
  for (let i = 0; i < 2; i++) { back(w, c, 'guard'); step(w, c, [deploy('guard', 1, 1)]); }
  assert.equal(deployCost(c, p, 'sniper'), 1, 'at most 2');
  step(w, c, [deploy('sniper', 0, 2)]);
  assert.equal(p.cuts, undefined);
  back(w, c, 'guard');
  step(w, c, [deploy('guard', 1, 1)]);
  assert.equal(p.cuts, undefined, 'not for one on the field');
  back(w, c, 'sniper');
  assert.equal(deployCost(c, p, 'sniper'), 4);
});

test('[部署-10] cuts of a deck\'s talent: for the cards of a faction in that deck, one only until the first of them is deployed', () => {
  const { w, c } = arena({ guard: { powers: ['rhine'], talentTrait: { costCuts: [{ power: 'rhine', value: -2, first: true }] } }, sniper: { powers: ['rhine'] },
    medic: { from: 'sniper', powers: ['rhine'] }, caster: { from: 'sniper', powers: ['lungmen'] } }, [['guard', 'sniper', 'caster'], ['medic']]);
  const p = w.players[0];
  assert.deepEqual([deployCost(c, p, 'guard'), deployCost(c, p, 'sniper'), deployCost(c, p, 'caster'), deployCost(c, w.players[1], 'medic')], [3, 1, 3, 3]);
  step(w, c, [deploy('sniper', 0, 2)]);
  assert.equal(deployCost(c, p, 'guard'), 5);
});

test('[部署-10] cuts from the field: any seat\'s cards of the profession while the operator is on the field, the same talent of one id once', () => {
  const { w, c } = arena({ guard: { char: 'elysm', talentTrait: { costCuts: [{ profession: 'SNIPER', value: -2, field: true }] } }, sniper: { profession: 'SNIPER' } });
  const [p0, p1] = w.players;
  assert.equal(deployCost(c, p0, 'sniper', w), 3);
  step(w, c, [deploy('guard', 1, 1)]);
  assert.deepEqual([deployCost(c, p0, 'sniper', w), deployCost(c, p1, 'sniper', w), deployCost(c, p0, 'sniper'), deployCost(c, p0, 'guard', w)], [1, 1, 3, 5]);
  w.units.push(makeOperator(w, c, { key: 'guard', owner: 1, row: 1, col: 3, dir: 0 }));
  assert.equal(deployCost(c, p0, 'sniper', w), 1);
});

test('[职业-30] SP on deployments: its own on its first one, the others of the profession on the field as it is deployed, those that arrive while it is', () => {
  const { w, c } = arena({ guard: { profession: 'CASTER', skill: skill(), talentTrait: { deploySp: [{ who: 'self', first: true, sp: 35 }, { who: 'field', profession: 'CASTER', sp: 5 },
    { who: 'arriving', profession: 'CASTER', sp: 5 }] } }, sniper: { profession: 'CASTER', skill: skill() }, medic: { from: 'sniper', profession: 'MEDIC', skill: skill() },
  caster: { from: 'sniper', profession: 'CASTER', skill: skill() } });
  w.players[0].cost = 99;
  const sp = (/** @type {string} */ k) => unitOf(w, k)?.skill?.sp;
  step(w, c, [deploy('sniper', 0, 2)]);
  step(w, c, [deploy('guard', 1, 1)]);
  step(w, c, [deploy('medic', 2, 2)]);
  step(w, c, [deploy('caster', 2, 3)]);
  assert.deepEqual([sp('guard'), sp('sniper'), sp('medic'), sp('caster')], [35, 5, 0, 5]);
  back(w, c, 'guard');
  step(w, c, [deploy('guard', 1, 1)]);
  assert.deepEqual([sp('guard'), sp('sniper'), sp('caster')], [0, 10, 10], 'not its first');
});

test('[职业-30] cost for a deployment with no other operator on the 4 tiles next to it', () => {
  const { w, c } = arena({ guard: { talentTrait: { aloneCost: 3 } }, guard2: { from: 'guard' } });
  const p = w.players[0];
  p.cost = 50;
  step(w, c, [deploy('guard', 1, 1)]);
  assert.equal(p.cost, 48);
  back(w, c, 'guard');
  step(w, c, [deploy('guard2', 1, 2)]);
  const before = p.cost;
  step(w, c, [deploy('guard', 1, 1)]);
  assert.equal(p.cost, before - 7, 'one next to it');
});

test('[职业-30] a skill starting on a tile of its attack range: SP even while its own runs, and the modifiers for their seconds, again from the start', () => {
  const { w, c } = arena({ guard: { skill: skill(), talentTrait: { allySkill: { sp: 1, seconds: 10, mods: { aspd: 16 } } } }, guard2: { from: 'guard', talentTrait: undefined },
    guard3: { from: 'guard', talentTrait: undefined } });
  w.players[0].cost = 99;
  step(w, c, [deploy('guard', 1, 1)]);
  step(w, c, [deploy('guard2', 1, 2)]);
  step(w, c, [deploy('guard3', 1, 4)]);
  const [g, g2, g3] = ['guard', 'guard2', 'guard3'].map((k) => unitOf(w, k));
  activate(w, c, g3, 'manual', true);
  assert.equal(g.skill?.sp, 0, 'out of its range');
  activate(w, c, g2, 'manual', true);
  assert.deepEqual([g.skill?.sp, statsOf(g).aspd], [1, statsOf(g2).aspd + 16]);
  frames(w, c, 100);
  endSkill(w, c, g2);
  /** @type {any} */ (g.skill).active = true;
  activate(w, c, g2, 'manual', true);
  const b = g.buffs.find((x) => x.key === 'allySkill');
  assert.deepEqual([g.skill?.sp, b?.left, g.buffs.filter((x) => x.key === 'allySkill').length], [2, 300, 1]);
});

test('[职业-30] the first skill of the battle: SP as it ends, not when it is closed — then at the next end —, never again; not after a retreat before its end', () => {
  const rec = { guard: { skill: skill({ stoppable: true }), talentTrait: { talentSp: [{ on: 'firstSkillEnd', sp: 10 }] } } };
  const { w, c } = arena(rec);
  step(w, c, [deploy('guard', 1, 1)]);
  const g = unitOf(w, 'guard'), st = /** @type {any} */ (g.skill);
  activate(w, c, g, 'manual', true);
  endSkill(w, c, g, 'stopped');
  assert.equal(st.sp, 0);
  activate(w, c, g, 'manual', true);
  endSkill(w, c, g);
  assert.equal(st.sp, 10);
  activate(w, c, g, 'manual', true);
  endSkill(w, c, g);
  assert.equal(st.sp, 10);
  const a = arena(rec);
  step(a.w, a.c, [deploy('guard', 1, 1)]);
  activate(a.w, a.c, unitOf(a.w, 'guard'), 'manual', true);
  back(a.w, a.c, 'guard');
  step(a.w, a.c, [deploy('guard', 1, 1)]);
  const g2 = unitOf(a.w, 'guard');
  activate(a.w, a.c, g2, 'manual', true);
  endSkill(a.w, a.c, g2);
  assert.equal(g2.skill?.sp, 0);
});

test('[职业-30] SP pulses for the attack-recovery skills of a profession every interval from its deployment; SP for a hurt-recovery skill\'s attack while it is on the field', () => {
  const { w, c } = arena({ guard: { talentTrait: { spPulse: { profession: 'SNIPER', every: 2.5, sp: 1 }, hurtAttackSp: 1 } }, sniper: { profession: 'SNIPER', skill: skill({ sp: 'attack' }) },
    medic: { from: 'sniper', profession: 'SNIPER', skill: skill({ sp: 'hurt' }) }, caster: { from: 'sniper', profession: 'CASTER', skill: skill({ sp: 'attack' }) } });
  w.players[0].cost = 99;
  step(w, c, [deploy('sniper', 0, 2)]);
  step(w, c, [deploy('medic', 0, 3)]);
  step(w, c, [deploy('caster', 2, 2)]);
  hurtAttackSp(w, c, unitOf(w, 'medic'));
  assert.equal(unitOf(w, 'medic').skill?.sp, 0, 'not while it is not on the field');
  step(w, c, [deploy('guard', 1, 1)]);
  frames(w, c, 160);
  assert.deepEqual(['sniper', 'medic', 'caster'].map((k) => unitOf(w, k).skill?.sp), [2, 0, 0], 'at 75 and 150 frames');
  hurtAttackSp(w, c, unitOf(w, 'medic'));
  hurtAttackSp(w, c, unitOf(w, 'sniper'));
  assert.deepEqual([unitOf(w, 'medic').skill?.sp, unitOf(w, 'sniper').skill?.sp], [1, 2]);
});
