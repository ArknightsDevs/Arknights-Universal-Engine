// Summons on the field (docs/spec/summons.md 召唤-4…召唤-6) on the tiny level. Test names cite the clauses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, deployProblem, summons, bus, targeting } from '../src/index.js';
import { tinyContent } from '@aue/testkit';

/** @typedef {import('../src/types.js').OperatorDef} OperatorDef @typedef {import('../src/types.js').SummonDef} SummonDef */

const base = tinyContent();
/** A summon record of `owner`. @param {string} owner @param {Partial<OperatorDef>} o @param {Partial<SummonDef>} s @returns {OperatorDef} */
const summon = (owner, o, s) => ({
  name: 'summon', position: 'MELEE', cost: 2, blockCnt: 1, baseAttackTime: 1, maxHp: 100, atk: 10, def: 0, res: 0, range: [{ row: 0, col: 0 }],
  respawnTime: 10, ...o, summoner: owner, summon: { deployLimit: 2, holdLimit: 3, supply: 2, occupy: 1, respawn: 'default', ...s },
});
const c = {
  ...base,
  level: { ...base.level, options: { ...base.level.options, characterLimit: 9 } },
  operators: {
    ...base.operators,
    tentacle: summon('guard', {}, {}),
    drone: summon('sniper', { position: 'ALL', cost: 1 }, { deployLimit: 1, holdLimit: 1, supply: 1, occupy: 0, respawn: 'unique' }),
    relay: summon('guard', { cost: 0, respawnTime: 5 }, { supply: 2, holdLimit: 2, occupy: 0, respawn: 'queue' }),
    probe: summon('guard', {}, { supply: 0, occupy: 0, stays: true }),
    shadow: summon('guard', {}, { supply: 0, occupy: 0 }),
  },
};
/** @param {Partial<import('@aue/schema').DeployCommand>} o @returns {import('@aue/schema').DeployCommand} */
const deploy = (o) => ({ type: 'deploy', op: 'guard', row: 1, col: 2, dir: 0, ...o });
const fresh = () => {
  const w = createWorld(c, { seed: 1, players: 1 });
  w.players[0].cost = 99;
  return w;
};
/** @param {ReturnType<typeof fresh>} w @param {number} n */
const run = (w, n) => { for (let i = 0; i < n; i++) step(w, c); };
/** @param {ReturnType<typeof fresh>} w @param {string} key */
const unitsOf = (w, key) => w.units.filter((u) => u.key === key);
/** @param {ReturnType<typeof fresh>} w @param {string} key */
const card = (w, key) => summons.summonCardOf(w.players[0], key);
/** @param {ReturnType<typeof fresh>} w @param {string} key */
const kill = (w, key) => { for (const u of unitsOf(w, key)) u.hp = 0; step(w, c); };

test('[召唤-4] the owner\'s deployment fills the card up to the hold limit; deploying takes a copy and the cost, 默认 cools from the deploy', () => {
  const w = fresh();
  assert.equal(deployProblem(w, c, 0, deploy({ op: 'tentacle', col: 3 })), 'summoner not on the field');
  step(w, c, [[0, deploy({})]]);
  assert.deepEqual(card(w, 'tentacle'), { held: 2, ready: 0, cooling: 0 });
  assert.equal(deployProblem(w, c, 0, deploy({ op: 'shadow', col: 3 })), 'no card for this summon');
  const cost = w.players[0].cost, at = w.frame;
  step(w, c, [[0, deploy({ op: 'tentacle', col: 3 })]]);
  const t = unitsOf(w, 'tentacle')[0];
  assert.equal(t.summoner, unitsOf(w, 'guard')[0].id);
  assert.equal(w.players[0].cost, cost - 2);
  assert.deepEqual(card(w, 'tentacle'), { held: 1, ready: at + 300, cooling: 0 });
  assert.equal(deployProblem(w, c, 0, deploy({ op: 'tentacle', col: 4 })), 'redeploying');
  run(w, 300);
  step(w, c, [[0, deploy({ op: 'tentacle', col: 4 })]]);
  assert.equal(unitsOf(w, 'tentacle').length, 2);
  assert.equal(card(w, 'tentacle').held, 0);
  run(w, 300);
  assert.equal(deployProblem(w, c, 0, deploy({ op: 'tentacle', col: 1 })), 'none held');
  kill(w, 'tentacle');
  assert.equal(card(w, 'tentacle').held, 0, '默认: the copies are spent');
  step(w, c, [[0, { type: 'retreat', unit: unitsOf(w, 'guard')[0].id }]]);
  w.players[0].cards.guard.ready = 0;
  step(w, c, [[0, deploy({ col: 1 })]]);
  assert.equal(card(w, 'tentacle').held, 2, 'deployed again, the owner fills the card again');
  step(w, c, [[0, { type: 'retreat', unit: unitsOf(w, 'guard')[0].id }]]);
  w.players[0].cards.guard.ready = 0;
  w.players[0].cost = 99;
  step(w, c, [[0, deploy({ col: 1 })]]);
  assert.equal(card(w, 'tentacle').held, 3, 'up to the hold limit');
});

test('[召唤-4] the field limit, the deploy limit with 部署占用数 1, no penalty and no refund', () => {
  const w = fresh(), tight = { ...c, level: { ...c.level, options: { ...c.level.options, characterLimit: 2 } } };
  step(w, c, [[0, deploy({})]]);
  w.players[0].summons = { ...w.players[0].summons, tentacle: { held: 3, ready: 0, cooling: 0 } };
  step(w, c, [[0, deploy({ op: 'tentacle', col: 3 })]]);
  assert.equal(deployProblem(w, tight, 0, deploy({ op: 'sniper', row: 0, col: 2 })), 'deploy limit reached');
  assert.equal(deployProblem(w, tight, 0, deploy({ op: 'relay', col: 4 })), null, '部署占用数 0 takes no place');
  w.players[0].summons = { ...w.players[0].summons, tentacle: { held: 3, ready: 0, cooling: 0 } };
  step(w, c, [[0, deploy({ op: 'tentacle', col: 4 })]]);
  w.players[0].summons = { ...w.players[0].summons, tentacle: { held: 3, ready: 0, cooling: 0 } };
  assert.equal(deployProblem(w, c, 0, deploy({ op: 'tentacle', col: 1 })), 'summon limit reached');
  const cost = w.players[0].cost, [t] = unitsOf(w, 'tentacle');
  step(w, c, [[0, { type: 'retreat', unit: t.id }]]);
  assert.equal(w.players[0].cost, cost, 'a summon\'s retreat returns nothing');
  assert.deepEqual(w.players[0].cards, {});
});

test('[召唤-4] 全部位 stands on melee and ranged tiles; 唯一 blocks while on the field and cools after it leaves', () => {
  const w = fresh();
  step(w, c, [[0, deploy({ op: 'sniper', row: 0, col: 2 })]]);
  assert.equal(deployProblem(w, c, 0, deploy({ op: 'drone', row: 0, col: 3 })), null);
  step(w, c, [[0, deploy({ op: 'drone', row: 1, col: 1 })]]);
  assert.equal(unitsOf(w, 'drone').length, 1);
  assert.deepEqual(card(w, 'drone'), { held: 0, ready: 0, cooling: 0 });
  w.players[0].summons = { drone: { held: 1, ready: 0, cooling: 0 } };
  assert.equal(deployProblem(w, c, 0, deploy({ op: 'drone', row: 0, col: 3 })), 'already deployed');
  w.players[0].summons = { drone: { held: 0, ready: 0, cooling: 0 } };
  kill(w, 'drone');
  assert.deepEqual(card(w, 'drone'), { held: 1, ready: w.frame - 1 + 300, cooling: 0 });
});

test('[召唤-4] 队列: each copy that left cools in turn and comes back', () => {
  const w = fresh();
  step(w, c, [[0, deploy({})]]);
  step(w, c, [[0, deploy({ op: 'relay', col: 3 })], [0, deploy({ op: 'relay', col: 4 })]]);
  assert.deepEqual(card(w, 'relay'), { held: 0, ready: 0, cooling: 0 });
  kill(w, 'relay');
  const left = w.frame - 1;
  assert.deepEqual(card(w, 'relay'), { held: 0, ready: left + 150, cooling: 2 });
  run(w, left + 150 - w.frame);
  assert.deepEqual(card(w, 'relay'), { held: 0, ready: left + 150, cooling: 2 });
  step(w, c);
  assert.deepEqual(card(w, 'relay'), { held: 1, ready: left + 300, cooling: 1 });
  run(w, 150);
  assert.deepEqual(card(w, 'relay'), { held: 2, ready: left + 300, cooling: 0 });
});

test('[召唤-5] [召唤-6] content summons on a free tile for nothing; the summons leave with their owner, but one that stays', () => {
  const w = fresh();
  step(w, c, [[0, deploy({})]]);
  const owner = unitsOf(w, 'guard')[0], cost = w.players[0].cost;
  const s = summons.spawnSummon(w, c, owner, 'shadow', { row: 1, col: 3 });
  assert.equal(s?.summoner, owner.id);
  assert.equal(w.players[0].cost, cost);
  assert.equal(summons.spawnSummon(w, c, owner, 'shadow', { row: 1, col: 3 }), null, 'a taken tile');
  assert.equal(summons.spawnSummon(w, c, owner, 'shadow', { row: 7, col: 3 }), null, 'off the map');
  assert.equal(summons.spawnSummon(w, c, owner, 'nobody', { row: 1, col: 4 }), null);
  summons.spawnSummon(w, c, owner, 'probe', { row: 1, col: 4 });
  /** @type {string[]} */
  const left = [];
  bus.on(w, 'death', (ctx) => { left.push(`${ctx.unit.key}:${ctx.reason}`); });
  step(w, c, [[0, { type: 'retreat', unit: owner.id }]]);
  assert.deepEqual(w.units.map((u) => u.key), ['probe']);
  assert.deepEqual(left, ['guard:retreat', 'shadow:retreat']);
  assert.ok(w.events.some((e) => e.type === 'retreat' && e.id === s?.id));
  w.players[0].cards.guard.ready = 0;
  step(w, c, [[0, deploy({ col: 1 })]]);
  const again = unitsOf(w, 'guard')[0];
  summons.spawnSummon(w, c, again, 'shadow', { row: 1, col: 3 });
  again.hp = 0;
  step(w, c);
  assert.deepEqual(w.units.map((u) => u.key), ['probe'], 'a fallen owner\'s summons leave the same frame');
});

test('[召唤-7] a summon deploys with its record\'s flags and immunities: enemies do not select an untargetable one', () => {
  const marked = { ...c, operators: { ...c.operators, shadow: { ...c.operators.shadow, trait: { flags: { untargetable: true, healFree: true } }, immune: ['stun'] } } };
  const w = createWorld(marked, { seed: 1, players: 1 });
  step(w, marked, [[0, deploy({})]]);
  const s = /** @type {import('../src/types.js').Unit} */ (summons.spawnSummon(w, marked, unitsOf(w, 'guard')[0], 'shadow', { row: 1, col: 3 }));
  assert.equal(targeting.selectable(s), false);
  assert.deepEqual(s.base.immune, ['stun']);
  assert.equal(targeting.selectable(unitsOf(w, 'guard')[0]), true);
});

test('[召唤-4] a summon that may only stand in its owner\'s attack range: refused outside the range its owner has now', () => {
  const ranged = { ...c, operators: { ...c.operators, tentacle: { ...c.operators.tentacle, summon: { ...c.operators.tentacle.summon, ownerRange: true } } } };
  const w = createWorld(ranged, { seed: 1, players: 1 });
  w.players[0].cost = 99;
  step(w, ranged, [[0, deploy({})]]);
  assert.equal(deployProblem(w, ranged, 0, deploy({ op: 'tentacle', col: 4 })), 'outside the summoner\'s range');
  assert.equal(deployProblem(w, ranged, 0, deploy({ op: 'tentacle', col: 3 })), null);
});
