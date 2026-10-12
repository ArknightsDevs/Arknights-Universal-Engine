// Stronghold's battle over the engine's world (docs/spec/compat.md 兼容-4): the object its kits receive — the hook bus
// and timers on the engine's (钩子-1…钩子-3) with contexts in Stronghold's shape, its units (unit.js), random numbers,
// cost, buffs and statuses on the engine's own. Kit code runs with the level's grid size (兼容-1); a kit's handler that
// throws is skipped and recorded (Stronghold isolates content errors the same way). Times are seconds to the kits and
// whole frames to the engine (时间-2).
import { secondsToFrames } from '@aue/math';
import { KIND, bus, buffs, status, traits, draw, weightedPick } from '@aue/sim';
import { withGrid } from './grid.js';
import { ShUnit } from './unit.js';
import { STATUS_NAME, statusKeyOf, modsOf, flagsOf } from './mods.js';
import * as field from './field.js';
import { ShGrid } from './tiles.js';
import { CompatGap } from './sh/gap.js';

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Content} Content @typedef {import('@aue/sim').Unit} Unit */
/** @typedef {(ctx: any, b: ShBattle) => void} Handler */

/** Seconds a frame (时间-1). */
export const TICK = 1 / 30;



/** Stronghold's buff refresh rules → the engine's same-key rules (状态-2). @type {Record<string, string>} */
const RULES = { extend: 'extend', stack: 'stack', independent: 'independent' };

/** A unit as a kit sees it, or null. @param {ShBattle} b @param {Unit | null | undefined} u */
const sh = (b, u) => (u ? b.unitOf(u) : null);

/**
 * An engine event's context as Stronghold's (兼容-4), by event: units as ShUnits, `frames` as `dt` seconds; the damage
 * info is the engine's own (the same names, ADR 0012); what a handler may change reads and writes the engine's context.
 * @type {Record<string, (b: ShBattle, k: Record<string, any>) => Record<string, any>>}
 */
const SHAPES = {
  deploy: (b, k) => ({ unit: sh(b, k.unit), initial: k.initial }),
  death: (b, k) => ({ unit: sh(b, k.unit), reason: k.reason, killer: sh(b, k.killer), dying: false }),
  kill: (b, k) => ({ killer: sh(b, k.killer), victim: sh(b, k.victim) }),
  enemySpawn: (b, k) => ({ enemy: sh(b, k.enemy) }),
  tick: (_b, k) => ({ dt: k.frames * TICK }),
  hit: (b, k) => ({ source: sh(b, k.source), target: sh(b, k.target), dmg: k.dmg, credit: sh(b, k.source) }),
  dodge: (b, k) => ({ source: sh(b, k.source), target: sh(b, k.target), dmg: k.dmg }),
  damaged: (b, k) => ({ source: sh(b, k.source), target: sh(b, k.target), amount: k.amount, type: k.type, dmg: k.dmg, credit: sh(b, k.source) }),
  hpDamage: (b, k) => ({ source: sh(b, k.source), target: sh(b, k.target), dmg: k.dmg, credit: sh(b, k.source),
    get amount() { return k.amount; }, set amount(v) { k.amount = v; } }),
  fatal: (b, k) => ({ unit: sh(b, k.unit), source: sh(b, k.source), credit: sh(b, k.source), dmg: k.dmg, amount: k.amount,
    get prevented() { return k.prevented; }, set prevented(v) { k.prevented = v; } }),
  heal: (b, k) => ({ source: sh(b, k.source), target: sh(b, k.target), opts: {}, get amount() { return k.amount; }, set amount(v) { k.amount = v; } }),
  beforeAttack: (b, k) => ({ attacker: sh(b, k.attacker), targets: k.targets.map((/** @type {Unit} */ t) => b.unitOf(t)), isSkill: k.isSkill, profile: sh(b, k.attacker)?.profile }),
  attack: (b, k) => ({ attacker: sh(b, k.attacker), targets: k.targets.map((/** @type {Unit} */ t) => b.unitOf(t)), isSkill: k.isSkill }),
  skillStart: (b, k) => ({ unit: sh(b, k.unit), skill: sh(b, k.unit)?.skill ?? null, reason: k.reason }),
  skillEnd: (b, k) => ({ unit: sh(b, k.unit), skill: sh(b, k.unit)?.skill ?? null, reason: k.reason }),
  beforeStatus: (b, k) => ({ source: sh(b, k.source), target: sh(b, k.target), status: STATUS_NAME[k.status] ?? k.status,
    get duration() { return k.frames < 0 ? Infinity : k.frames * TICK; }, set duration(v) { k.frames = v === Infinity ? -1 : secondsToFrames(Math.max(0, Number(v) || 0)); },
    get value() { return k.strength; }, set value(v) { k.strength = v; }, get cancel() { return k.cancel; }, set cancel(v) { k.cancel = v; } }),
};

/**
 * What a handler changed in place, written back to the engine's context after each handler (兼容-4): the targets an
 * attack locks.
 * @type {Record<string, (ctx: Record<string, any>, k: Record<string, any>) => void>}
 */
const BACK = {
  beforeAttack: (ctx, k) => { k.targets = (Array.isArray(ctx.targets) ? ctx.targets : []).map((/** @type {any} */ t) => t?.u).filter(Boolean); },
};

/**
 * An engine event's context as Stronghold's (兼容-4); a custom event's as it is.
 * @param {ShBattle} b @param {string} name @param {Record<string, any>} k @returns {Record<string, any>}
 */
const shapeOf = (b, name, k) => (Object.hasOwn(SHAPES, name) ? SHAPES[name](b, k) : k);

export class ShBattle {
  /** @param {World} w @param {Content} c */
  constructor(w, c) {
    /** @type {World} */
    this.w = w;
    /** @type {Content} */
    this.c = c;
    this.dt = TICK; this.started = false;
    /** the level's tiles as Stronghold's grid */
    this.grid = new ShGrid(c.level);
    /** @type {{ label: string, who: string, message: string }[]} handler errors, recorded and skipped */
    this.errors = [];
    /** @type {WeakMap<object, any>} the data a kit stored with a buff */
    this.buffData = new WeakMap();
    /** @type {Map<string, ShUnit>} the deck pieces, by `seat|key` */
    this.pieces = new Map();
    /** @type {WeakMap<Unit, ShUnit>} */
    this.others = new WeakMap();
    /** @type {WeakMap<object, Record<string, any>>} each engine context's Stronghold shape, shared by its handlers */
    this.shapes = new WeakMap();
    this.rng = makeRng(w);
  }

  // ---- units -------------------------------------------------------------------------------------------------------

  /** The ShUnit of an engine unit: an operator's deck piece, else one made for it. @param {Unit} u @returns {ShUnit} */
  unitOf(u) {
    if (u.kind === KIND.OPERATOR) {
      const p = this.pieces.get(`${u.owner}|${u.key}`);
      if (p) return p;
    }
    let s = this.others.get(u);
    if (!s) {
      const op = u.kind === KIND.OPERATOR, d = op ? this.c.operators[u.key] : this.c.enemies[u.key];
      s = new ShUnit(this, { kind: op ? 'op' : 'enemy', key: u.key, ownerId: u.owner, def: d ? { name: d.name, profession: /** @type {any} */ (d).profession ?? null } : null, unit: u });
      this.others.set(u, s);
    }
    return s;
  }

  /** The unit of an engine id on the field, or null. @param {number} id @returns {ShUnit | null} */
  unitById(id) {
    const u = this.w.units.find((x) => x.id === id);
    return u ? this.unitOf(u) : null;
  }

  /** Every ally: the pieces, on the field or not, and the other operators on the field. */
  get allyUnits() {
    const others = this.w.units.filter((u) => u.kind === KIND.OPERATOR && !this.pieces.has(`${u.owner}|${u.key}`)).map((u) => this.unitOf(u));
    return [...this.pieces.values(), ...others];
  }
  /** The enemies on the field. */
  get enemies() { return this.w.units.filter((u) => u.kind === KIND.ENEMY).map((u) => this.unitOf(u)); }
  /** The allies on the field (no devices), of one player or of all. @param {number | null} [ownerId] */
  allies(ownerId = null) { return this.allyUnits.filter((a) => a.alive && a.kind !== 'device' && (ownerId == null || a.ownerId === ownerId)); }
  /** Whether an ability of ally `by` may select ally `a`: never a 孤立 one (flag `isolated`) but itself. @param {ShUnit} a @param {ShUnit | null} [by] */
  allySelectable(a, by = null) { return !!a && (a === by || !a.s?.flags.isolated); }
  /** The allies on the field an ability of `by` may select. @param {ShUnit} by @param {number | null} [ownerId] */
  alliesFor(by, ownerId = null) { return this.allies(ownerId).filter((a) => this.allySelectable(a, by)); }

  // ---- hooks and timers --------------------------------------------------------------------------------------------

  /** Runs kit code: with the level's grid, an error recorded and skipped. @template T @param {() => T} fn @param {string} label @param {unknown} owner @returns {T | undefined} */
  safe(fn, label, owner) {
    try {
      return withGrid(this.c.level, fn);
    } catch (e) {
      this.errors.push({ label, who: owner instanceof ShUnit ? owner.defId : '', message: String(e instanceof Error ? e.message : e) });
      return undefined;
    }
  }

  /** @param {string} name @param {Handler} fn @param {{ priority?: number, owner?: unknown, once?: boolean }} [o] */
  on(name, fn, o = {}) {
    return bus.on(this.w, name, (k) => {
      let ctx = this.shapes.get(k);
      if (!ctx) { ctx = shapeOf(this, name, k); this.shapes.set(k, ctx); }
      this.safe(() => fn(ctx, this), `hook:${name}`, o.owner);
      if (ctx.stopPropagation) k.stopPropagation = true;
      if (Object.hasOwn(BACK, name)) BACK[name](ctx, k);
    }, o);
  }

  /** @param {any} h a handle from `on` */
  off(h) { bus.off(this.w, h); }
  /** @param {unknown} owner */
  offOwner(owner) { bus.offOwner(this.w, owner); }
  /** @param {string} name */
  hasHook(name) { return bus.hasHook(this.w, name); }
  /** A custom event. @param {string} name @param {Record<string, any>} ctx */
  emit(name, ctx) { return bus.emit(this.w, name, ctx); }

  /** @param {number} seconds @param {(b: ShBattle, s: any) => void} fn @param {{ owner?: unknown }} [o] */
  after(seconds, fn, o = {}) {
    const t = bus.after(this.w, secondsToFrames(Math.max(0, Number(seconds) || 0)), () => this.safe(() => fn(this, t), 'after', o.owner), o);
    return t;
  }

  /** @param {number} seconds @param {(b: ShBattle, s: any) => void} fn @param {{ owner?: unknown, immediate?: boolean }} [o] */
  every(seconds, fn, o = {}) {
    const t = /** @type {any} */ (bus.every(this.w, secondsToFrames(Math.max(TICK, Number(seconds) || TICK)), () => { t.count++; this.safe(() => fn(this, t), 'every', o.owner); }, o));
    t.count = 0;
    return t;
  }

  // ---- the field (field.js) ----------------------------------------------------------------------------------------

  /** @param {Iterable<number> | null | undefined} keys @param {ShUnit | null} attacker @param {Record<string, any>} [profile] */
  enemiesInKeys(keys, attacker, profile) { return field.enemiesInKeys(this, keys, attacker, profile); }
  /** @param {number} x @param {number} y @param {number} r @param {boolean} [centre] */
  enemiesInRadius(x, y, r, centre = false) { return field.enemiesInRadius(this, x, y, r, centre); }
  /** @param {number} x @param {number} y @param {number} r @param {boolean} [centre] */
  foesInRadius(x, y, r, centre = false) { return field.foesInRadius(this, x, y, r, centre); }
  /** @param {number} r @param {number} c */
  unitAt(r, c) { return field.unitAt(this, r, c); }
  /** @param {ShUnit} unit */
  alliesInGrid(unit) { return field.alliesInGrid(this, unit); }
  /** @param {ShUnit} u @param {Record<string, any>} [profile] */
  blockedTargets(u, profile) { return field.blockedTargets(u, profile); }
  /** @param {ShUnit | null} source @param {ShUnit} target @param {Record<string, any>} dmg */
  dealDamage(source, target, dmg) { return field.dealDamage(this, source, target, dmg); }
  /** @param {ShUnit | null} source @param {ShUnit} target @param {number} amount */
  heal(source, target, amount) { return field.heal(this, source, target, amount); }
  /** @param {ShUnit} target @param {number} amount @param {{ source?: ShUnit | null, tags?: string[] }} [o] */
  loseHp(target, amount, o) { return field.loseHp(this, target, amount, o); }
  /** @param {ShUnit} unit */
  retreat(unit) { field.retreat(this, unit); }

  /** Presentation effects (`(kind, params)`; none drawn yet). */
  fx() {}

  /** Cost for a player (费用-1: up to the level's cap). @param {number} playerId @param {number} n */
  addDp(playerId, n) { traits.gainCost(this.w, this.c, playerId, n); }

  /**
   * A buff (兼容-4): Stronghold's refresh rule as the engine's (状态-2); seconds as frames; one that `persist`s is given
   * again at every deployment of the unit; on a unit off the field only such a one is kept, for its next deployment.
   * @param {ShUnit} unit @param {Record<string, any>} spec
   */
  addBuff(unit, spec) {
    if (spec.persist) unit.persist = [...unit.persist.filter((x) => x.key !== spec.key), spec];
    if (unit.deployed) this.giveBuff(unit, spec);
  }

  /** @param {ShUnit} unit @param {Record<string, any>} spec */
  giveBuff(unit, spec) {
    const u = /** @type {Unit} */ (unit.u), there = u.buffs.find((x) => x.key === spec.key);
    if (there && spec.refresh === 'keep') return;
    if (there && !RULES[spec.refresh ?? 'replace']) buffs.removeBuff(u, there);
    const b = buffs.makeBuff({ key: spec.key, src: spec.source?.u?.id ?? -1, rule: /** @type {any} */ (RULES[spec.refresh] ?? 'queue'), mods: modsOf(spec.mods),
      flags: flagsOf(spec.flags), stacks: spec.stacks ?? 1, maxStacks: spec.maxStacks ?? 1, left: framesLeft(spec.duration) });
    if (spec.data !== undefined) this.buffData.set(b, spec.data);
    buffs.addBuff(u, b);
  }

  /**
   * 效果取最高 (状态-2, the engine's rule `max`): of the buffs of the key the strongest value takes effect, the weaker
   * wait with their own time.
   * @param {ShUnit} target @param {string} key @param {{ duration?: number, value?: number, mods?: (v: number) => Record<string, number>, source?: ShUnit | null }} [o]
   */
  applyStrongest(target, key, o = {}) {
    const v = Number(o.value);
    if (!target?.alive || !(Number(o.duration) > 0) || !Number.isFinite(v) || typeof o.mods !== 'function') return false;
    buffs.addBuff(/** @type {Unit} */ (target.u), buffs.makeBuff({ key, src: o.source?.u?.id ?? -1, rule: 'max', value: v, mods: modsOf(o.mods(v)), left: framesLeft(o.duration) }));
    return true;
  }

  /** @param {ShUnit} unit @param {string | { key: string }} which */
  removeBuff(unit, which) {
    const key = typeof which === 'string' ? which : which.key;
    unit.persist = unit.persist.filter((x) => x.key !== key);
    if (!unit.u) return;
    for (const b of unit.u.buffs.filter((x) => x.key === key)) buffs.removeBuff(unit.u, b);
  }

  /**
   * A status (状态-5): the engine's catalogue, seconds as frames; whether it took hold.
   * @param {ShUnit} target @param {string} key @param {{ duration?: number, source?: ShUnit | null, value?: number }} [o]
   */
  applyStatus(target, key, o = {}) {
    if (!target.alive) return false;
    const k = statusKeyOf(key), frames = o.duration === undefined ? undefined : secondsToFrames(Math.max(0, o.duration));
    if (!Object.hasOwn(status.STATUS, k)) throw new CompatGap(`status.${key}`);
    return status.inflict(this.w, /** @type {Unit} */ (target.u), /** @type {any} */ (k), { frames, src: o.source?.u ?? null, value: o.value }) !== null;
  }
}

/** A buff's seconds as frames left, −1 for none. @param {number | undefined} seconds */
const framesLeft = (seconds) => (seconds === undefined || seconds === Infinity ? -1 : secondsToFrames(Math.max(0, seconds)));

/**
 * Stronghold's random numbers over the battle's own stream (随机-1): `rng()` in [0, 1), chance, pick, int, range,
 * shuffle and weighted picks.
 * @param {World} w
 */
function makeRng(w) {
  const r = () => draw(w);
  return Object.assign(r, {
    /** @param {number} p */ chance: (p) => draw(w) < p,
    /** @template T @param {T[]} list @returns {T | undefined} */ pick: (list) => (list.length ? list[Math.floor(draw(w) * list.length)] : undefined),
    /** @param {number} a @param {number} b */ int: (a, b) => a + Math.floor(draw(w) * (b - a + 1)),
    /** @param {number} a @param {number} b */ range: (a, b) => a + draw(w) * (b - a),
    /** @template T @param {T[]} list */ shuffle: (list) => { for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(draw(w) * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; } return list; },
    /** @param {number[]} weights */ weighted: (weights) => weightedPick(w, weights),
  });
}
