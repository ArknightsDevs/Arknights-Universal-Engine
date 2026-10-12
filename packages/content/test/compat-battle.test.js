// Stronghold's kits in a battle (docs/spec/compat.md 兼容-4): the battle a kit sees over the engine's world — its units,
// hooks, timers, buffs and SP — with 推进之王's kit from the pinned oracle, unchanged, in a tiny level: her talents'
// aura and self buff, her module's trait while she blocks, 粉碎's SP, a second deployment; a kit's errors; the same
// battle twice.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { oracleDir, tinyContent } from '@aue/testkit';
import { createWorld, step, stateHash, bus } from '@aue/sim';
import { loadUnderGrid } from '../src/compat/grid.js';
import { defOf } from '../src/compat/records.js';
import { kitsWorld } from '../src/compat/kits.js';
import { loadTraining, operatorAt } from '../src/operators.js';

/** @typedef {import('../src/compat/battle.js').ShBattle} ShBattle */

const SIEGE = 'char_112_siege';
/** E2 90, 潜能 6, S3 at 专精 3, SOL-X “糖果盒” at stage 3. */
const BUILD = { elite: 2, level: 90, potential: 6, trust: 100, skill: 2, skillLevel: 10, module: 0, moduleLevel: 3 };
/** @type {any} */
let factory;
/** @type {any} */
let training;

before(async () => {
  const compat = new URL('../src/compat/', import.meta.url).href;
  register(new URL('hook.js', compat), { data: { root: pathToFileURL(`${oracleDir()}/`).href, compat } });
  const mod = await loadUnderGrid(() => import(pathToFileURL(join(oracleDir(), 'server', 'sim', 'content', 'kits', 'ops', 'op-siege.js')).href));
  factory = mod.default[SIEGE];
  training = await loadTraining(SIEGE);
});

/** The engine's record without its talents: her kit applies them. @param {Record<string, any>} d */
const bare = ({ talentBb, fieldTalents, rangeTalents, critTalents, timedTalents, deployTalents, ...rest }) => rest;

/**
 * The tiny level with 推进之王 (her kit), a 先锋 without a kit and a sniper; tougher enemies, more cost.
 * @param {Record<string, any>} [kits] other kits instead of hers @param {string[]} [deck]
 */
function match(kits, deck = ['siege', 'texas', 'sniper']) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies.slime.maxHp = 4000;
  Object.assign(c.level.options, { initialCost: 40, maxCost: 99, characterLimit: 4 });
  c.operators.siege = { ...bare(operatorAt(training, BUILD)), respawnTime: 1 };
  c.operators.texas = { ...c.operators.guard, name: 'texas', profession: 'PIONEER' };
  c.decks = [deck];
  const box = /** @type {{ b: any }} */ ({ b: null });
  c.behaviors = { world: kitsWorld(kits ?? { siege: { factory, def: defOf(SIEGE, training, BUILD) } }, (x) => { box.b = x; }) };
  const w = createWorld(c, { seed: 1, players: 1 });
  return { c, w, b: /** @type {ShBattle} */ (box.b) };
}

/** @type {Record<string, any>} */
const DEPLOY = Object.freeze({
  siege: [0, { type: 'deploy', op: 'siege', row: 1, col: 3, dir: 2 }],
  texas: [0, { type: 'deploy', op: 'texas', row: 1, col: 4, dir: 2 }],
  sniper: [0, { type: 'deploy', op: 'sniper', row: 0, col: 2, dir: 0 }],
});

/** @param {any} w @param {string} key */
const unit = (w, key) => w.units.find((/** @type {any} */ u) => u.key === key);
/** A unit's buffs: key → mods. @param {any} u */
const buffsOf = (u) => Object.fromEntries(u.buffs.map((/** @type {any} */ x) => [x.key, x.mods]));

test('[兼容-4] her talents: the aura on every 先锋 on the field at the talent’s own value, her module’s extra on herself', () => {
  const { c, w, b } = match();
  step(w, c, [DEPLOY.siege, DEPLOY.texas, DEPLOY.sniper]);
  for (let i = 0; i < 30; i++) step(w, c);
  const pioneers = { atkPct: 0.1, defPct: 0.1 };
  assert.deepEqual(buffsOf(unit(w, 'siege')), { 'talent:siege:self': { atkPct: 0.08, defPct: 0.08 }, 'talent:siege:pioneers': pioneers });
  assert.deepEqual(buffsOf(unit(w, 'texas')), { 'talent:siege:pioneers': pioneers }, 'a 先锋 without a kit');
  assert.deepEqual(buffsOf(unit(w, 'sniper')), {}, 'not a 先锋');
  assert.deepEqual(b.errors, []);
});

test('[兼容-4] her module’s trait while she blocks; 粉碎: an enemy killed on her tile or the four next to it gives her 1 SP', () => {
  const { c, w, b } = match(), seen = /** @type {string[]} */ ([]);
  step(w, c, [DEPLOY.siege, DEPLOY.texas]);
  const siege = unit(w, 'siege'), piece = b.unitOf(siege);
  siege.skill.sp = 0;
  bus.on(w, 'death', (k) => { const before = siege.skill.sp; seen.push(`${k.unit.key}:${before}`); }, { priority: 2e9 });
  bus.on(w, 'death', () => { seen.push(`after:${siege.skill.sp}`); }, { priority: -1 });
  let on = -1, off = -1;
  for (let i = 0; i < 900 && off < 0; i++) {
    step(w, c);
    const has = 'trait:siege:block' in buffsOf(siege);
    if (has && on < 0) { on = w.frame; assert.deepEqual(buffsOf(siege)['trait:siege:block'], { atkPct: 0.08, defPct: 0.08 }); }
    if (!has && on >= 0) off = w.frame;
  }
  assert.ok(on > 0 && off > on, `on at ${on}, off at ${off}`);
  assert.deepEqual(seen.map((s) => s.replace(/:\d+$/, '')), ['slime', 'after', 'slime', 'after'], 'both enemies she blocked died');
  for (const i of [0, 2]) assert.equal(Number(seen[i + 1].split(':')[1]) - Number(seen[i].split(':')[1]), 1, '+1 SP each');
  assert.ok(seen.length === 4 && !unit(w, 'slime'), 'the field is clear');
  const slime = { kind: 1, key: 'slime', owner: -1, id: 999, x: 0, y: 2, hp: 0, buffs: [], base: {} }, sp = () => siege.skill.sp;
  const s0 = sp();
  bus.emit(w, 'death', { unit: slime, reason: 'killed', killer: null });
  assert.equal(sp(), s0, 'killed far from her: nothing');
  Object.assign(slime, { x: siege.x - 1, y: siege.y });
  bus.emit(w, 'death', { unit: slime, reason: 'leak', killer: null });
  assert.equal(sp(), s0, 'next to her but leaked: nothing');
  bus.emit(w, 'death', { unit: slime, reason: 'killed', killer: null });
  assert.equal(sp(), s0 + 1);
  assert.equal(piece.deploySeq, 1);
  assert.deepEqual(b.errors, []);
});

test('[兼容-4] each deployment binds her piece: her hooks stay installed once, her lasting buffs are given again; the aura ends when she leaves', () => {
  const { c, w, b } = match();
  step(w, c, [DEPLOY.siege, DEPLOY.texas]);
  for (let i = 0; i < 30; i++) step(w, c);
  step(w, c, [[0, { type: 'retreat', unit: unit(w, 'siege').id }]]);
  for (let i = 0; i < 30; i++) step(w, c);
  assert.equal(unit(w, 'siege'), undefined);
  assert.deepEqual(buffsOf(unit(w, 'texas')), {}, 'the aura ran out with her gone');
  for (let i = 0; i < 300 && !unit(w, 'siege'); i++) step(w, c, [DEPLOY.siege]);
  const siege = unit(w, 'siege'), piece = b.unitOf(siege);
  assert.ok(siege, 'deployed again');
  step(w, c);
  assert.equal(piece.deploySeq, 2);
  assert.deepEqual(buffsOf(siege)['talent:siege:self'], { atkPct: 0.08, defPct: 0.08 });
  for (let i = 0; i < 15; i++) step(w, c);
  assert.deepEqual(Object.keys(buffsOf(unit(w, 'texas'))), ['talent:siege:pioneers'], 'the aura’s next beat (every 0.5 s)');
  const slime = { kind: 1, key: 'slime', owner: -1, id: 999, x: siege.x, y: siege.y, hp: 0, buffs: [], base: {} }, s0 = siege.skill.sp;
  bus.emit(w, 'death', { unit: slime, reason: 'killed', killer: null });
  assert.equal(siege.skill.sp, s0 + 1, 'one handler, not one a deployment');
  assert.deepEqual(b.errors, []);
});

test('[兼容-4] SP by Stronghold’s rules: none while a timed skill runs or under 阻回 but at deployment; never past the bar', () => {
  const { c, w, b } = match();
  step(w, c, [DEPLOY.siege, DEPLOY.texas]);
  const siege = unit(w, 'siege'), sk = /** @type {import('../src/compat/skill.js').ShSkill} */ (b.unitOf(siege).skill), st = siege.skill;
  assert.deepEqual([sk.kind, sk.isTimed, sk.noSkill, sk.spCost], ['duration', true, false, 30]);
  st.sp = 0;
  assert.equal(sk.gainSp(2, 'talent'), 2);
  st.active = true;
  assert.deepEqual([sk.gainSp(1, 'talent'), sk.gainSp(1, 'init'), sk.gainSp(1, 'talent', false, { ignoreLock: true })], [0, 1, 1]);
  st.active = false;
  assert.ok(b.applyStatus(b.unitOf(siege), 'noSp', { duration: 1 }));
  assert.deepEqual([sk.gainSp(1, 'talent'), sk.gainSp(1, 'init')], [0, 1]);
  for (let i = 0; i < 31; i++) step(w, c);
  assert.equal(sk.gainSp(100, 'talent'), st.cap - 5, 'up to the bar');
  assert.equal(sk.gainSp(1, 'talent'), 0);
  const texas = /** @type {import('../src/compat/skill.js').ShSkill} */ (b.unitOf(unit(w, 'texas')).skill);
  assert.deepEqual([texas.noSkill, texas.gainSp(1)], [true, 0], 'an operator without a skill');
});

test('[兼容-4] a kit’s error is recorded and skipped, the battle goes on; timers count seconds as whole frames', () => {
  const fired = /** @type {number[]} */ ([]), box = /** @type {{ w: any }} */ ({ w: null });
  const kits = {
    sniper: { def: { name: 'sniper', skill: null, raw: {} }, factory: () => ({ skills: {}, install(/** @type {ShBattle} */ b, /** @type {any} */ u) {
      b.on('tick', () => { throw new Error('boom'); }, { owner: u });
      b.after(1, () => fired.push(box.w.frame), { owner: u });
      b.every(0.5, (_b, t) => { if (t.count <= 2) fired.push(-box.w.frame); }, { owner: u });
    } }) },
    texas: { def: { name: 'texas', skill: null, raw: {} }, factory: () => { throw new Error('no kit'); } },
  };
  const { c, w, b } = match(kits);
  box.w = w;
  for (let i = 0; i < 40; i++) step(w, c);
  assert.deepEqual(fired, [-15, 30, -30], 'every 15 frames, after 30');
  assert.deepEqual(b.errors[0], { label: 'kit', who: 'texas', message: 'no kit' });
  assert.equal(b.errors.filter((e) => e.label === 'hook:tick' && e.who === 'sniper' && e.message === 'boom').length, 40);
});

test('[兼容-4] the same battle twice: the same state frame by frame', () => {
  const run = () => {
    const { c, w } = match(), hashes = [];
    step(w, c, [DEPLOY.siege, DEPLOY.texas, DEPLOY.sniper]);
    for (let i = 0; i < 600; i++) { step(w, c); if (i % 60 === 0) hashes.push(stateHash(w)); }
    return hashes;
  };
  assert.deepEqual(run(), run());
});

test('[兼容-4] damage as a kit sees it: hit may scale it, hpDamage lower it, fatal prevent it; kill names the killer', () => {
  const log = /** @type {string[]} */ ([]);
  const kit = () => ({ skills: {}, install(/** @type {ShBattle} */ b, /** @type {any} */ u) {
    b.on('hit', (k) => { if (k.source === u) { k.dmg.mul *= 2; log.push(`hit:${k.dmg.isAttack ? 'attack' : 'other'}`); } }, { owner: u });
    b.on('hpDamage', (k) => { if (k.target === u) k.amount = Math.min(k.amount, 1); }, { owner: u });
    b.on('fatal', (k) => { if (k.unit === u && !u.mem.saved) { u.mem.saved = true; k.prevented = true; } }, { owner: u });
    b.on('kill', (k) => log.push(`kill:${k.killer?.defId}>${k.victim.defId}`), { owner: u });
    b.on('heal', (k) => { if (k.target === u) k.amount *= 2; }, { owner: u });
  } });
  const { c, w, b } = match({ guard: { def: { name: 'guard', skill: null, raw: {} }, factory: kit } }, ['guard']);
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 3, dir: 2 }]]);
  for (let i = 0; i < 60 && !unit(w, 'slime'); i++) step(w, c);
  const g = b.unitOf(unit(w, 'guard')), e = b.unitOf(unit(w, 'slime'));
  assert.equal(b.dealDamage(g, e, { amount: 100, type: 'phys' }), 180, '(100 − 10) × 2');
  assert.equal(b.dealDamage(null, g, { amount: 5000, type: 'true' }), 1, 'hpDamage: at most 1 a hit');
  /** @type {any} */ (g.u).hp = 1;
  assert.deepEqual([b.loseHp(g, 50), g.hp], [50, 1], 'fatal: kept at 1 HP');
  assert.deepEqual([b.heal(null, g, 10), g.hp], [20, 21]);
  assert.deepEqual([b.enemiesInKeys([e.tileR * 6 + e.tileC], g).map((x) => x.defId), b.foesInRadius(e.x, e.y, 0.4).length, b.unitAt(1, 3)?.defId], [['slime'], 1, 'guard']);
  while (unit(w, 'slime')) step(w, c);
  assert.ok(log.includes('hit:attack') && log.includes('kill:guard>slime'), log.join(' '));
  b.retreat(g);
  assert.equal(unit(w, 'guard'), undefined);
  assert.deepEqual(b.errors, []);
});
