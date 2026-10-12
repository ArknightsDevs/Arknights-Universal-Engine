// Stronghold's units over the engine's (docs/spec/compat.md 兼容-4): a kit sees a unit with Stronghold's fields and
// getters. An operator is its deck piece — one per deck entry for the whole battle, as Stronghold's board pieces: bound
// to the engine's unit while it is deployed, unbound in between — so the hooks its kit installs once see every
// deployment. An enemy is the engine's unit itself. Fields Stronghold's kits keep their own state in (`mem`, `trait`)
// live here, outside the engine's state (ADR 0057).
import { KIND, attrs, body, traits, buffs, status, reachKeys } from '@aue/sim';
import { ShSkill } from './skill.js';

/** @typedef {import('@aue/sim').Unit} Unit @typedef {import('@aue/sim').Buff} Buff @typedef {import('./battle.js').ShBattle} ShBattle */

/** Frames a second (时间-1). */
const FPS = 30;

/** The engine's status keys that Stronghold names otherwise (状态-5). @type {Record<string, string>} */
export const STATUS_NAME = Object.freeze(/** @type {Record<string, string>} */ ({ root: 'bind', buffres: 'resist', enemyCold: 'cold', enemyFreeze: 'freeze' }));

/**
 * A buff as a kit sees it: its key, the status it is (Stronghold's name), who gave it, its data, the seconds left, its
 * modifiers (which a kit may replace: the holder's HP keeps its ratio, 属性-4), flags and shield.
 */
export class ShBuff {
  /** @param {ShBattle} b @param {Unit} holder @param {Buff} buff */
  constructor(b, holder, buff) {
    this.b = b;
    /** @type {Unit} */
    this.holder = holder;
    /** @type {Buff} */
    this.buff = buff;
  }
  get key() { return this.buff.key; }
  /** The status it is, or null. @returns {string | null} */
  get status() { const k = this.buff.key; return Object.hasOwn(status.STATUS, k) ? STATUS_NAME[k] ?? k : null; }
  get flags() { return this.buff.flags; }
  get shield() { return this.buff.shield; }
  get value() { return this.buff.value; }
  /** The unit that gave it, or null. */
  get source() { return this.b.unitById(this.buff.src); }
  /** The data its giver stored with it. */
  get data() { return this.b.buffData.get(this.buff) ?? null; }
  /** Seconds left, Infinity for none. */
  get timeLeft() { return this.buff.left < 0 ? Infinity : this.buff.left / FPS; }
  get stacks() { return this.buff.stacks; }
  get mods() { return this.buff.mods; }
  set mods(m) { buffs.retune(this.holder, this.buff, this.buff.value, m ?? {}); }
}

export class ShUnit {
  /** @type {'op' | 'enemy' | 'token' | 'device'} */
  #kind;
  /** @type {ShSkill | null} */
  #skill;

  /**
   * @param {ShBattle} b @param {{ kind: 'op' | 'enemy' | 'token' | 'device', key: string, ownerId: number, def: Record<string, any> | null, unit?: Unit }} o
   */
  constructor(b, o) {
    this.b = b; this.#kind = o.kind; this.defId = o.key; this.def = o.def; this.ownerId = o.ownerId;
    /** @type {Unit | null} the engine's unit while deployed */
    this.u = o.unit ?? null;
    this.side = o.kind === 'enemy' ? 'enemy' : 'ally';
    /** @type {Record<string, any>} */ this.mem = {};
    /** @type {Record<string, any>} */ this.trait = {};
    /** @type {Record<string, any>[]} buffs that outlive a deployment (`persist`), given again at each */
    this.persist = [];
    this.deploySeq = 0;
    this.#skill = o.kind === 'op' ? new ShSkill(this, null) : null;
    /** @type {any} the kit installed for it */
    this.kit = null;
    this.stats = { dmg: 0, kills: 0, heal: 0, taken: 0, attacks: 0 };
  }

  get kind() { return this.#kind; }
  /** An operator's skill runtime (skill.js); null for an enemy. */
  get skill() { return this.#skill; }
  /** On the field (its engine unit is). */
  get deployed() { return !!this.u && this.b.w.units.includes(this.u); }
  /** On the field with HP left. */
  get alive() { return this.deployed && /** @type {Unit} */ (this.u).hp > 0; }
  get removed() { return !this.deployed; }
  get id() { return this.u ? this.u.id : -1; }
  get name() { return this.def?.name ?? this.defId; }
  get x() { return this.u ? this.u.x : NaN; }
  get y() { return this.u ? this.u.y : NaN; }
  get tileR() { return this.u ? body.tileOf(this.u)[0] : -1; }
  get tileC() { return this.u ? body.tileOf(this.u)[1] : -1; }
  /** @returns {import('@aue/sim').Dir} */
  get dir() { return this.u ? this.u.dir : 'RIGHT'; }
  get hp() { return this.u ? this.u.hp : 0; }
  get hitArea() { return /** @type {any} */ (this.u?.base)?.hitArea ?? null; }
  get hidden() { return !!this.u?.hidden; }
  /** The unit's attributes now (属性-1…属性-3). */
  get s() { return this.u ? attrs.statsOf(this.u) : null; }
  get maxHp() { return this.s?.maxHp ?? 0; }
  get atk() { return this.s?.atk ?? 0; }
  get hpRatio() { const m = this.maxHp; return m > 0 ? this.hp / m : 0; }
  /** The enemies it blocks. */
  get blocking() {
    const id = this.id;
    return id < 0 ? [] : this.b.w.units.filter((e) => e.kind === KIND.ENEMY && e.blockedBy === id).map((e) => this.b.unitOf(e));
  }
  /** Its attribute flags now (stun, sleep, …). */
  get flags() { return this.s?.flags ?? {}; }
  /** @param {string} k */
  hasFlag(k) { return !!this.flags[k]; }
  /** An air unit (飞行, 浮空…, 属性-2). */
  get isFlying() { return !!this.s?.flying; }
  /** On the field and not stunned, frozen, asleep or otherwise kept from acting. */
  get canAct() { return this.alive && !this.hidden && !this.s?.disabled; }
  /** Its 重量等级. */
  get weight() { return this.s?.massLevel ?? 0; }
  /** Its base attributes (属性-1). @returns {Record<string, any> | null} */
  get base() { return this.u?.base ?? null; }
  /** The unit that blocks it, or null. @returns {ShUnit | null} */
  get blockedBy() {
    const id = this.u?.blockedBy ?? -1;
    return id >= 0 ? this.b.unitById(id) : null;
  }
  /** An operator's attack range now (索敌-1, 技能-8): its tile keys. */
  get rangeKeySet() { return this.u && this.u.kind === KIND.OPERATOR ? reachKeys(this.b.c, this.u) : new Set(); }
  get rangeKeys() { return [...this.rangeKeySet]; }
  /** Its range grid as the record gives it. */
  get rangeGrid() { return this.def?.raw?.rangeGrid ?? this.def?.rangeGrid ?? null; }
  /**
   * What its attacks may select, as Stronghold's profile names it: an operator's trait (职业-1) — flying units when it can
   * hit them; an enemy's none.
   * @returns {Record<string, any>}
   */
  get profile() {
    if (!this.u || this.u.kind !== KIND.OPERATOR) return {};
    const t = traits.traitOf(this.b.c, this.u);
    return { canHitFly: t.antiAir, heal: t.heal, dmgType: this.u.base.dmgType };
  }
  get sp() { return this.skill?.sp ?? 0; }
  get spMax() { return this.skill?.spCost ?? 0; }
  isOp() { return this.kind === 'op'; }
  isEnemy() { return this.side === 'enemy'; }
  isAlly() { return this.side === 'ally'; }
  /** The buff of a key it has (the one in effect first), or null. @param {string} key */
  findBuff(key) {
    const buff = this.u?.buffs.find((x) => x.key === key);
    return buff && this.u ? new ShBuff(this.b, this.u, buff) : null;
  }
  /** @param {string} key */
  hasBuff(key) { return !!this.u?.buffs.some((x) => x.key === key); }
  /** Its buffs, in acquisition order. */
  get buffs() { const u = this.u; return u ? u.buffs.map((x) => new ShBuff(this.b, u, x)) : []; }
}
