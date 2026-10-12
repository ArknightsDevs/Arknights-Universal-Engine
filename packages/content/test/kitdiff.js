// The per-kit differential (docs/spec/compat.md 兼容-6, ADR 0058): one kit, one skill, in the pinned Stronghold's own
// battle harness and in our engine through the compat layer — the same training (its 自选 elite form: E2 60, 潜能 6,
// trust 0, skill rank 7, its last module at stage 3), alone against a still dummy (1e7 HP, 0 DEF and RES) in front of
// it for 40 s; a MANUAL skill starts as soon as it is ready on our side (the player's). Compared: the buffs one second
// after deployment (those that change something, the skill's aside), the HP each of its hits took (元素损伤 aside) and
// each of its heals gave (as sets, Stronghold's attributes rounded, so within 0.5 %), the skill starts (±1), the
// statuses it applied (key and seconds), and our side's recorded kit errors.
// The kits load from a copy of the commit's content files (.cache/kitroot/), so the compat hook never touches
// Stronghold's own harness, which runs from the commit itself.
import { register } from 'node:module';
import { cpSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { oracleDir, STRONGHOLD, oneWave, spawnAt } from '@aue/testkit';
import { createWorld, step, bus, buffs as buffKit } from '@aue/sim';
import { KIT_FILES } from '../src/index.js';
import { loadUnderGrid } from '../src/compat/grid.js';
import { defOf, tokenDefOf } from '../src/compat/records.js';
import { kitsBehaviors } from '../src/compat/kits.js';
import { STATUS_NAME } from '../src/compat/mods.js';
import { loadTraining, operatorAt } from '../src/operators.js';
import { TOKENS, loadToken, tokenAt } from '../src/tokens.js';

const SECONDS = 40;
/**
 * AUE_KITDIFF_TRACE=<char id>:<skill index> prints every damaged event of that run on both sides (a debugging aid).
 * @type {{ on: boolean }}
 */
const TRACE = { on: false };

/** @param {number} x */
const r1 = (x) => Math.round(x * 10) / 10;
/** @param {[string, unknown]} a @param {[string, unknown]} b */
const byKey = (a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);

/**
 * Buffs as key → sorted mods, without the ones that change nothing and the skill's. The branch trait's buff — our
 * engine's `trait` (职业-6), Stronghold's `trait:<branch>` — counts as `trait` by its modifiers alone: Stronghold keeps a
 * trait's flags in the unit's profile instead. @param {any[]} list @param {string} branch
 */
const buffMap = (list, branch) => Object.fromEntries(list
  .map((b) => (b.key === 'trait' || b.key === `trait:${branch}` ? { key: 'trait', mods: b.mods } : b))
  .filter((b) => !String(b.key).startsWith('skill') && (Object.keys(b.mods ?? {}).length > 0 || Object.values(b.flags ?? {}).some(Boolean)))
  .map((b) => /** @type {[string, unknown]} */ ([b.key, Object.fromEntries(Object.entries(b.mods ?? {}).sort(byKey).map(([k, v]) => [k, Math.round(Number(v) * 1e6) / 1e6]))]))
  .sort(byKey));

/** A Stronghold unit's branch (its profile's `sub`), '' for none. @param {any} u @returns {string} */
const branchOf = (u) => u.profile?.sub ?? '';

/** @type {{ harness: any, kitRoot: string } | null} */
let ready = null;

/** The kits' copy of the commit's content files and Stronghold's harness, made once. */
async function setUp() {
  if (ready) return ready;
  const oracle = oracleDir(), kitDir = join(oracle, '..', '..', 'kitroot', STRONGHOLD.sha.slice(0, 12));
  if (!existsSync(join(kitDir, 'server', 'sim', 'content'))) cpSync(join(oracle, 'server', 'sim', 'content'), join(kitDir, 'server', 'sim', 'content'), { recursive: true });
  const kitRoot = pathToFileURL(`${kitDir}/`).href, compat = new URL('../src/compat/', import.meta.url).href;
  register(new URL('hook.js', compat), { data: { root: kitRoot, compat } });
  const harness = await import(pathToFileURL(join(oracle, 'test', 'helpers', 'battleHarness.js')).href);
  ready = { harness, kitRoot };
  return ready;
}

/** Stronghold's run. @param {any} H the harness @param {string} charId @param {number} skillIndex @param {string | null} uniEquipId */
function strongholdRun(H, charId, skillIndex, uniEquipId) {
  const h = H.makeBattle({
    defs: { enemies: { enemy_dummy: H.enemyRec({ key: 'enemy_dummy', hp: 1e7, speed: 0 }) } },
    units: [{ diy: { slot: 6, charId, skillIndex, ...(uniEquipId ? { uniEquipId } : {}) }, elite: true, row: 10, col: 4 }],
    enemies: [{ key: 'enemy_dummy', pos: [10, 5] }], hooks: ['damaged', 'heal', 'skillStart', 'beforeStatus'], captureNoisy: true, flags: { startOpCooldown: 0 },
  });
  h.step(1);
  const u = h.allies()[0];
  h.run(1);
  const buffs = buffMap(u.buffs, branchOf(u));
  h.run(SECONDS - 1);
  const mine = (/** @type {any} */ x) => x.source === u || x.source?.id === u.id;
  const damaged = h.hooksOf('damaged');
  if (TRACE.on) for (const x of damaged) console.log(`stronghold ${x.source?.defId ?? '-'} → ${x.target?.defId ?? '-'} ${r1(x.amount)} ${x.type} ${(x.dmg?.tags ?? []).join(',')}`);
  return {
    atk: u.base.atk, buffs,
    hits: damaged.filter((/** @type {any} */ x) => mine(x) && x.type !== 'element').map((/** @type {any} */ x) => r1(x.amount)),
    heals: h.hooksOf('heal').filter(mine).map((/** @type {any} */ x) => r1(x.amount)),
    starts: h.hooksOf('skillStart').filter((/** @type {any} */ x) => x.unit === u || x.unit?.id === u.id).length,
    statuses: [...new Set(h.hooksOf('beforeStatus').filter(mine).map((/** @type {any} */ x) => `${x.status}:${r1(x.duration)}`))].sort(),
  };
}

/** Our level: 7 × 3 open tiles; the operator at (1, 2) facing right, the dummy appearing at (1, 3) at once. */
function level() {
  const t = { key: 'tile_road', height: 'LOWLAND', buildable: 'ALL', passable: 'ALL', side: 'ALL' };
  return { id: 'kitdiff', width: 7, height: 3, options: { maxLifePoint: 3, initialCost: 99, maxCost: 99, costIncreaseTime: 1, characterLimit: 8, moveMultiplier: 1 },
    tiles: [0, 1, 2].map(() => Array.from({ length: 7 }, () => t)), routes: [{ start: { row: 1, col: 3 }, end: { row: 1, col: 6 }, motion: 'WALK', checkpoints: [] }],
    waves: [oneWave([spawnAt(0, 'dummy')])] };
}

/** The engine's record without its talents: the kit applies them. @param {Record<string, any>} d */
const bare = ({ talentBb, fieldTalents, rangeTalents, critTalents, timedTalents, deployTalents, ...rest }) => rest;

/**
 * What our run records of the operator: the HP its hits take, its heals, its skill starts, the statuses it applies.
 * @param {any} w @param {() => any} op @param {{ hits: number[], heals: number[], starts: number, statuses: Set<string> }} log
 */
function record(w, op, log) {
  bus.on(w, 'damaged', (k) => {
    if (TRACE.on) console.log(`ours ${w.frame} ${k.source?.key ?? '-'} → ${k.target?.key ?? '-'} ${r1(k.amount)} ${k.type} ${(k.dmg?.tags ?? []).join(',')}`);
    if (k.source === op()) log.hits.push(r1(k.amount));
  }, { priority: -1e9 });
  bus.on(w, 'heal', (k) => { if (k.source === op()) log.heals.push(r1(k.amount)); }, { priority: -1e9 });
  bus.on(w, 'skillStart', (k) => { if (k.unit === op()) log.starts++; });
  bus.on(w, 'beforeStatus', (k) => { if (k.source === op()) log.statuses.add(`${STATUS_NAME[k.status] ?? k.status}:${k.frames < 0 ? Infinity : r1(k.frames / 30)}`); }, { priority: -1e9 });
}

/** The skill command for a MANUAL skill that is ready (the player's part). @param {any} u */
const startWhenReady = (u) => /** @type {any[]} */ (u?.skill && !u.skill.active && u.skill.sp >= u.skill.cost ? [[0, { type: 'skill', unit: u.id }]] : []);

/**
 * Our run. @param {string} charId @param {Function} factory @param {number} skill @param {number} module
 */
async function ourRun(charId, factory, skill, module) {
  const t = await loadTraining(charId), b = { elite: 2, level: 60, potential: 6, trust: 0, skill, skillLevel: 7, ...(module >= 0 ? { module, moduleLevel: 3 } : {}) };
  const c = /** @type {any} */ ({ level: level(), enemies: { dummy: { name: 'dummy', maxHp: 1e7, atk: 0, def: 0, res: 0, moveSpeed: 1, massLevel: 1 } }, operators: { op: bare(operatorAt(t, b)) }, decks: [['op']] });
  /** @type {Record<string, any>} */
  const tokens = {};
  for (const id of (t.tokens ?? []).filter((x) => Object.hasOwn(TOKENS, x))) {
    const token = await loadToken(id);
    c.operators[`${id}#0`] = { ...bare(tokenAt(token, id, t, b)), char: id, summoner: 'op' };
    tokens[id] = tokenDefOf(id, token, t, b);
  }
  const box = /** @type {{ b: any }} */ ({ b: null });
  c.behaviors = kitsBehaviors({ op: { factory: /** @type {any} */ (factory), def: defOf(charId, t, b), tokens } }, (x) => { box.b = x; });
  const w = createWorld(c, { seed: 7, players: 1 }), log = { hits: /** @type {number[]} */ ([]), heals: /** @type {number[]} */ ([]), starts: 0, statuses: /** @type {Set<string>} */ (new Set()) };
  // held in place as Stronghold's speed-0 dummy: by a buff that is no status (束缚 is one a kit may look for)
  bus.on(w, 'enemySpawn', (k) => { buffKit.addBuff(k.enemy, buffKit.makeBuff({ key: 'kitdiff:still', flags: { root: true } })); }, { priority: 1e9 });
  const op = () => w.units.find((x) => x.key === 'op');
  record(w, op, log);
  step(w, c, [[0, { type: 'deploy', op: 'op', row: 1, col: 2, dir: 0 }]]);
  for (let i = 0; i < 30; i++) step(w, c);
  const u = op(), buffs = u ? buffMap(u.buffs, c.operators.op.branch ?? '') : null, manual = c.operators.op.skill?.type === 'MANUAL';
  for (let i = 30; i < SECONDS * 30; i++) step(w, c, manual ? startWhenReady(op()) : []);
  return { atk: c.operators.op.atk, buffs, ...log, statuses: [...log.statuses].sort(), errors: [...new Set(box.b.errors.map((/** @type {any} */ e) => `${e.label}: ${e.message}`))] };
}

/** @param {number[]} xs @param {number} k */
const distinct = (xs, k) => [...new Set(xs.map((x) => r1(x * k)))].sort((a, b) => a - b);
/** @param {number[]} a @param {number[]} b */
const near = (a, b) => a.length === b.length && a.every((x, i) => Math.abs(x - b[i]) <= Math.max(1, Math.abs(b[i]) * 0.005));

/**
 * The differences of one kit's skills between Stronghold and us; none for each skill that matches.
 * @param {string} charId @returns {Promise<{ skill: number, diffs: string[] }[]>}
 */
export async function kitDiff(charId) {
  const { harness, kitRoot } = await setUp();
  const factory = (await loadUnderGrid(() => import(kitRoot + KIT_FILES[charId]))).default[charId], t = await loadTraining(charId);
  const m = t.modules.length - 1, uni = m >= 0 ? t.modules[m].id : null, out = [];
  for (let skill = 0; skill < t.skills.length; skill++) {
    TRACE.on = process.env['AUE_KITDIFF_TRACE'] === `${charId}:${skill}`;
    const sh = strongholdRun(harness, charId, skill, uni), ours = await ourRun(charId, factory, skill, m), k = sh.atk / ours.atk, d = [];
    TRACE.on = false;
    if (JSON.stringify(sh.buffs) !== JSON.stringify(ours.buffs)) d.push(`buffs ${JSON.stringify(sh.buffs)} ≠ ${JSON.stringify(ours.buffs)}`);
    if (!near(distinct(ours.hits, k), distinct(sh.hits, 1))) d.push(`hits ${distinct(sh.hits, 1).slice(0, 8)} ≠ ${distinct(ours.hits, k).slice(0, 8)}`);
    if (!near(distinct(ours.heals, k), distinct(sh.heals, 1))) d.push(`heals ${distinct(sh.heals, 1).slice(0, 6)} ≠ ${distinct(ours.heals, k).slice(0, 6)}`);
    if (Math.abs(sh.starts - ours.starts) > 1) d.push(`starts ${sh.starts} ≠ ${ours.starts}`);
    if (JSON.stringify(sh.statuses) !== JSON.stringify(ours.statuses)) d.push(`statuses ${sh.statuses} ≠ ${ours.statuses}`);
    if (ours.errors.length) d.push(`errors ${ours.errors.join(' | ')}`);
    out.push({ skill, diffs: d });
  }
  return out;
}
