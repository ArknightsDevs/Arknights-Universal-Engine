// Enemy abilities (docs/spec/foes.md 敌能-1…敌能-4): the hooks through which the content's behaviours act on an enemy's
// talents and skills, the skills' cooldowns, delayed explosions and 直击 bolts.
import { secondsToFrames, FPS } from '@aue/math';
import { KIND } from '@aue/schema';
import { statsOf } from './attrs.js';
import { addBuff, removeBuff, makeBuff, retune } from './buffs.js';
import { applyStatus } from './status.js';
import { dealDamage, heal } from './damage.js';
import { dealEp } from './elements.js';
import { selectable, sortAllies } from './targeting.js';
import { tileOf } from './body.js';
import { tileAt } from './level.js';
import { board, alight } from './routes.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Content} Content @typedef {import('./types.js').Unit} Unit */
/** @typedef {import('./types.js').EnemyDef} EnemyDef @typedef {import('./types.js').Blast} Blast @typedef {import('./types.js').Bolt} Bolt */
/** @typedef {import('./types.js').DamageType} DamageType @typedef {import('./skills.js').AttackMods} AttackMods */

/** A 直击 bolt's speed in tiles per second, and the radius it hits within (敌能-4). */
export const BOLT_SPEED = 10;
export const BOLT_RADIUS = 0.3;

/**
 * What an explosion or a bolt does to a unit it hits (敌能-3, 敌能-4): damage, and a status.
 * @typedef {{ type: DamageType, amount: number, status?: { key: string, seconds: number } }} Payload
 */

/**
 * An enemy ability's context (敌能-2): the common members (技能-6) and the enemy's own.
 * @typedef {object} FoeContext
 * @property {Unit} self
 * @property {Record<string, number>} bb the ability's blackboard
 * @property {number} sp a skill's SP cost (0 for a talent or a skill without)
 * @property {number} frame
 * @property {(u: Unit) => import('./attrs.js').Stats} stats
 * @property {(t: Unit, init: import('./buffs.js').BuffInit) => void} addBuff
 * @property {(t: Unit, key: string) => void} removeBuff
 * @property {(t: Unit, key: string, o?: object) => void} applyStatus
 * @property {(t: Unit, dmg: { type: DamageType, amount: number }) => number} dealDamage
 * @property {(t: Unit, el: string, amount: number) => number} dealEp
 * @property {(t: Unit, amount: number) => number} heal
 * @property {(n: number) => void} gainCost no effect for an enemy
 * @property {{ get: (k: string) => number, set: (k: string, v: number) => void }} state its own ability state
 * @property {boolean} blocked
 * @property {boolean} hurt it took damage since its last turn
 * @property {boolean} unblocked its block ended since its last turn
 * @property {boolean} ready a skill's cooldown is over
 * @property {() => void} use a skill was used: its cooldown starts again
 * @property {(seconds: number) => number} frames seconds as whole frames (时间-2)
 * @property {(name: string) => Record<string, number> | null} talent another talent's blackboard
 * @property {(radius: number) => Unit[]} foes the units it may attack within `radius` of it
 * @property {(units: Unit[]) => Unit[]} order units it may attack in the order its attack picks them (索敌-5)
 * @property {(radius: number) => Unit[]} allies the enemies (not neutral units) on the field within `radius` of it, itself too
 * @property {(u: Unit, name: string) => Record<string, number> | null} talentOf another enemy's talent blackboard
 * @property {(u: Unit, key: string) => number | null} buffValue the value of a unit's buff of a key, or null
 * @property {(u: Unit, key: string, value: number, mods: Record<string, number>) => void} setBuff gives a unit a buff of a key
 *   without an end, or retunes the one it has (属性-4)
 * @property {(t: Unit, n: number) => void} drainCost an operator's player loses n cost, down to 0 (费用-1)
 * @property {() => Unit | null} blocker the unit blocking it, or null
 * @property {(u: Unit) => string[]} tagsOf an enemy's tags (关卡-1)
 * @property {() => string} tileKey the key of the tile it stands on ('' off the map)
 * @property {(u: Unit) => void} board takes an enemy aboard as a passenger (敌能-16)
 * @property {() => number} passengers how many passengers it carries
 * @property {() => void} alight its passengers alight (敌能-16)
 * @property {() => Unit[]} inLine the units in its row or column a 直击 may select, nearest first
 * @property {(b: { x: number, y: number, radius: number, delay: number, air: boolean, sourced: boolean } & Payload) => void} blast
 * @property {(b: { dx: number, dy: number, blast?: number } & Payload) => void} bolt
 */

/**
 * An enemy ability's behaviour (敌能-2).
 * @typedef {object} FoeBehavior
 * @property {(ctx: FoeContext) => void} [spawn]
 * @property {(ctx: FoeContext) => void} [tick]
 * @property {(ctx: FoeContext, cands: Unit[]) => Unit[]} [targets]
 * @property {(ctx: FoeContext, mods: AttackMods) => AttackMods} [attack]
 * @property {(ctx: FoeContext) => void} [death]
 * @property {(ctx: FoeContext, target: Unit, dealt: number, ranged: boolean) => void} [hit] a hit of its normal attack
 *   dealt damage (`ranged`: it came by a projectile)
 */

/** The squared distance between two points. @param {{ x: number, y: number }} a @param {{ x: number, y: number }} b */
const dist2 = (a, b) => (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y);

/** The units an enemy may attack (敌人攻击-1, 合作-9): operators and neutral units. @param {Unit} u @param {Unit} e */
export const isFoeOf = (u, e) => u !== e && (u.kind === KIND.OPERATOR || (u.kind === KIND.ENEMY && u.base.neutral === true));

/** @param {Content} c @param {Unit} e @returns {EnemyDef} */
const defOf = (c, e) => c.enemies[e.key];

/** The abilities of an enemy that have a behaviour: [name, blackboard, skill or null]. @param {Content} c @param {Unit} e */
function abilities(c, e) {
  const d = defOf(c, e), own = c.behaviors?.foes ?? {};
  /** @type {[string, Record<string, number>, import('./types.js').FoeSkill | null][]} */
  const out = [];
  for (const [k, bb] of Object.entries(d.talents ?? {})) if (Object.hasOwn(own, k)) out.push([k, bb, null]);
  for (const s of d.skills ?? []) if (Object.hasOwn(own, s.key)) out.push([s.key, s.bb, s]);
  return out;
}

/**
 * An ability's context (敌能-2): `of` is the ability — its name, blackboard and skill (null for a talent).
 * @param {World} w @param {Content} c @param {Unit} e
 * @param {{ name: string, bb: Record<string, number>, skill: import('./types.js').FoeSkill | null }} of @returns {FoeContext}
 */
function contextOf(w, c, e, of) {
  const { name, bb, skill } = of;
  const ab = e.ab;
  return {
    self: e, bb, sp: skill?.sp ?? 0, frame: w.frame, stats: statsOf,
    addBuff: (t, init) => { addBuff(t, makeBuff({ src: e.id, ...init })); },
    removeBuff: (t, key) => { removeBuff(t, key); },
    applyStatus: (t, key, o) => { applyStatus(t, /** @type {any} */ (key), { ...o, src: e }); },
    dealDamage: (t, dmg) => dealDamage(w, e, t, dmg),
    dealEp: (t, el, amount) => dealEp(w, t, /** @type {any} */ (el), amount),
    heal: (t, amount) => heal(e, t, amount),
    gainCost: () => {},
    state: { get: (k) => ab[`${name}.${k}`] ?? 0, set: (k, v) => { ab[`${name}.${k}`] = v; } },
    blocked: e.blockedBy >= 0,
    hurt: (ab['@hurt'] ?? 0) === 1,
    unblocked: (ab['@unblocked'] ?? 0) === 1,
    ready: skill !== null && (ab[`${name}.cd`] ?? 0) <= 0,
    use: () => { if (skill) ab[`${name}.cd`] = secondsToFrames(skill.cooldown); },
    frames: secondsToFrames,
    talent: (t) => defOf(c, e).talents?.[t] ?? null,
    foes: (radius) => w.units.filter((u) => isFoeOf(u, e) && selectable(u) && dist2(u, e) <= radius * radius),
    order: (units) => sortAllies(e, units, FPS),
    allies: (radius) => w.units.filter((u) => u.kind === KIND.ENEMY && u.base.neutral !== true && u.hp > 0 && !u.hidden && dist2(u, e) <= radius * radius),
    talentOf: (u, t) => (u.kind === KIND.ENEMY ? defOf(c, u).talents?.[t] ?? null : null),
    buffValue: (u, key) => u.buffs.find((b) => b.key === key)?.value ?? null,
    setBuff: (u, key, value, mods) => {
      const b = u.buffs.find((x) => x.key === key);
      if (b) retune(u, b, value, mods);
      else addBuff(u, makeBuff({ key, src: e.id, value, mods }));
    },
    blocker: () => (e.blockedBy >= 0 ? w.units.find((u) => u.id === e.blockedBy) ?? null : null),
    tagsOf: (u) => (u.kind === KIND.ENEMY ? defOf(c, u).tags ?? [] : []),
    tileKey: () => { const [r, col] = tileOf(e); return tileAt(c.level, r, col)?.key ?? ''; },
    board: (u) => { if (u !== e && u.kind === KIND.ENEMY && !u.hidden && !carried(u)) { board(u); u.ab['@carrier'] = e.id; } },
    passengers: () => w.units.filter((u) => u.ab['@carrier'] === e.id).length,
    alight: () => { releasePassengers(w, c, e); },
    drainCost: (t, n) => { const p = t.kind === KIND.OPERATOR ? w.players[t.owner] : undefined; if (p) p.cost = Math.max(0, p.cost - n); },
    inLine: () => inLine(w, e),
    blast: (b) => { w.blasts.push({ x: b.x, y: b.y, radius: b.radius, left: secondsToFrames(b.delay), air: b.air, src: b.sourced ? e.id : -1, type: b.type, amount: b.amount, status: b.status ?? null }); },
    bolt: (b) => {
      w.bolts.push({ src: e.id, x: e.x, y: e.y, dx: b.dx, dy: b.dy, type: b.type, amount: b.amount, status: b.status ?? null, blast: b.blast ?? 0 });
      w.events.push({ type: 'bolt', id: e.id });
    },
  };
}

/**
 * The units in an enemy's row or column a 直击 may select (敌能-4, 敌能-9): ones it may attack, on the field, not
 * disappeared, camouflage or not; nearest first.
 * @param {World} w @param {Unit} e @returns {Unit[]}
 */
function inLine(w, e) {
  const [r, col] = tileOf(e);
  return w.units.filter((u) => {
    if (!isFoeOf(u, e) || !selectable(u, { ignoreCamou: true, canHitFly: true })) return false;
    const [ur, uc] = tileOf(u);
    return (ur === r) !== (uc === col);
  }).toSorted((a, b) => Math.abs(a.x - e.x) + Math.abs(a.y - e.y) - (Math.abs(b.x - e.x) + Math.abs(b.y - e.y)) || a.id - b.id);
}

/** Runs a hook of every ability of an enemy that has one. @param {World} w @param {Content} c @param {Unit} e @param {(b: FoeBehavior, ctx: FoeContext) => void} run */
function each(w, c, e, run) {
  const own = c.behaviors?.foes ?? {};
  for (const [name, bb, skill] of abilities(c, e)) run(own[name], contextOf(w, c, e, { name, bb, skill }));
}

/**
 * A new enemy (敌能-2): its skills' first cooldowns, then its abilities' spawn.
 * @param {World} w @param {Content} c @param {Unit} e
 */
export function foeSpawn(w, c, e) {
  for (const s of defOf(c, e).skills ?? []) e.ab[`${s.key}.cd`] = secondsToFrames(s.initCooldown);
  e.ab['@hp'] = e.hp;
  e.ab['@blocked'] = e.blockedBy >= 0 ? 1 : 0;
  each(w, c, e, (b, ctx) => b.spawn?.(ctx));
}

/**
 * The start of an enemy's turn (敌能-2): whether it was hurt or unblocked since its last turn, its abilities' tick,
 * then a frame off its skills' cooldowns — a skill with n frames of cooldown is ready n frames after it was used.
 * @param {World} w @param {Content} c @param {Unit} e
 */
export function foeTick(w, c, e) {
  const ab = e.ab, blocked = e.blockedBy >= 0 ? 1 : 0;
  ab['@hurt'] = e.hp < (ab['@hp'] ?? e.hp) ? 1 : 0;
  ab['@unblocked'] = (ab['@blocked'] ?? 0) === 1 && blocked === 0 ? 1 : 0;
  each(w, c, e, (b, ctx) => b.tick?.(ctx));
  for (const s of defOf(c, e).skills ?? []) if ((ab[`${s.key}.cd`] ?? 0) > 0) ab[`${s.key}.cd`]--;
  ab['@hp'] = e.hp;
  ab['@blocked'] = e.blockedBy >= 0 ? 1 : 0;
}

/** The candidates of an enemy's attack after its abilities (敌能-2). @param {World} w @param {Content} c @param {Unit} e @param {Unit[]} cands */
export function foeTargets(w, c, e, cands) {
  let out = cands;
  each(w, c, e, (b, ctx) => { if (b.targets) out = b.targets(ctx, out); });
  return out;
}

/** The mods of an enemy's attack after its abilities (敌能-2). @param {World} w @param {Content} c @param {Unit} e @param {AttackMods} mods */
export function foeAttack(w, c, e, mods) {
  let out = mods;
  each(w, c, e, (b, ctx) => { if (b.attack) out = b.attack(ctx, out); });
  return out;
}

/** Whether an enemy rides a carrier (敌能-16). @param {Unit} u */
export const carried = (u) => Object.hasOwn(u.ab, '@carrier');

/**
 * A carrier's passengers alight at the centre of its tile (敌能-16): when it says so, or when it leaves the field.
 * @param {World} w @param {Content} c @param {Unit} e
 */
export function releasePassengers(w, c, e) {
  for (const u of w.units) {
    if (u.ab['@carrier'] !== e.id) continue;
    delete u.ab['@carrier'];
    alight(c, u, e);
  }
}

/** An enemy knocked down (敌能-2). @param {World} w @param {Content} c @param {Unit} e */
export function foeDeath(w, c, e) {
  each(w, c, e, (b, ctx) => b.death?.(ctx));
}

/**
 * A hit of an enemy's normal attack dealt damage (敌能-2): its abilities' hit.
 * @param {World} w @param {Content} c @param {Unit} e @param {Unit} t @param {{ dealt: number, ranged: boolean }} how
 */
export function foeHit(w, c, e, t, how) {
  each(w, c, e, (b, ctx) => b.hit?.(ctx, t, how.dealt, how.ranged));
}

/**
 * A unit takes a bolt's or an explosion's payload (敌能-3, 敌能-4).
 * @param {World} w @param {Unit | null} src @param {Unit} t @param {{ type: DamageType, amount: number, status: { key: string, seconds: number } | null }} p
 */
function take(w, src, t, p) {
  dealDamage(w, src, t, { type: p.type, amount: p.amount });
  if (p.status && t.hp > 0) applyStatus(t, /** @type {any} */ (p.status.key), { seconds: p.status.seconds, src });
}

/**
 * The first unit a bolt's path comes within the hit radius of this frame (敌能-4): one an enemy may attack, on the
 * field, selectable camouflage or not; nearest along the path, then the earliest created.
 * @param {World} w @param {Bolt} b @param {number} step tiles it flies this frame @returns {Unit | null}
 */
function firstHit(w, b, step) {
  let hit = /** @type {Unit | null} */ (null), at = Infinity;
  for (const u of w.units) {
    if (u.hp <= 0 || u.hidden || !(u.kind === KIND.OPERATOR || u.base.neutral === true) || !selectable(u, { ignoreCamou: true, canHitFly: true })) continue;
    const along = (u.x - b.x) * b.dx + (u.y - b.y) * b.dy, off = Math.abs((u.x - b.x) * b.dy - (u.y - b.y) * b.dx);
    if (along >= -BOLT_RADIUS && along <= step + BOLT_RADIUS && off <= BOLT_RADIUS && along < at) { at = along; hit = u; }
  }
  return hit;
}

/**
 * One frame of the 直击 bolts (敌能-4): each moves; the first unit its path comes within the hit radius of takes it —
 * or an explosion goes off there; off the map it is gone.
 * @param {World} w @param {Content} c
 */
function flyBolts(w, c) {
  const step = BOLT_SPEED / FPS, { width, height } = c.level;
  /** @type {Bolt[]} */
  const keep = [];
  for (const b of w.bolts) {
    const src = w.units.find((u) => u.id === b.src) ?? null, nx = b.x + b.dx * step, ny = b.y + b.dy * step;
    const hit = firstHit(w, b, step);
    if (hit) {
      if (b.blast > 0) w.blasts.push({ x: hit.x, y: hit.y, radius: b.blast, left: 0, air: true, src: b.src, type: b.type, amount: b.amount, status: b.status });
      else take(w, src, hit, b);
      continue;
    }
    if (nx < -0.5 || ny < -0.5 || nx > width - 0.5 || ny > height - 0.5) continue;
    keep.push({ ...b, x: nx, y: ny });
  }
  w.bolts = keep;
}

/**
 * One frame of the delayed explosions (敌能-3): each counts down; at 0 every unit an enemy may attack within its radius
 * — flying ones only if it reaches the air — takes it, camouflage or not.
 * @param {World} w
 */
function blow(w) {
  /** @type {Blast[]} */
  const keep = [];
  for (const b of w.blasts) {
    if (b.left - 1 > 0) { keep.push({ ...b, left: b.left - 1 }); continue; }
    const src = b.src >= 0 ? w.units.find((u) => u.id === b.src) ?? null : null;
    w.events.push({ type: 'blast', x: b.x, y: b.y });
    for (const u of [...w.units]) {
      if (u.hp <= 0 || u.hidden || !(u.kind === KIND.OPERATOR || u.base.neutral === true)) continue;
      if (statsOf(u).flying && !b.air) continue;
      if (dist2(u, b) <= b.radius * b.radius) take(w, src, u, b);
    }
  }
  w.blasts = keep;
}

/** The bolts, then the explosions due this frame (帧-1 step 8, 敌能-3, 敌能-4). @param {World} w @param {Content} c */
export function foeEffects(w, c) {
  flyBolts(w, c);
  blow(w);
}
