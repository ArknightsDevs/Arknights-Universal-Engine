// Stronghold's kit projectiles (docs/spec/compat.md 兼容-4, Stronghold's server/sim/projectiles.js ported): a kit's own
// shot homes on a unit or flies to a point at its speed and, arriving, runs its `onHit`; one whose target leaves the
// field (or was deployed anew) fizzles unless `hitDead`, then it lands at the last place it knew; after `maxAge` s it
// arrives wherever it is. They are kit state, as the kits' `mem` (ADR 0057), moved each frame first of the `tick`
// handlers; nothing draws them yet.

/** @typedef {import('./battle.js').ShBattle} ShBattle @typedef {import('./unit.js').ShUnit} ShUnit */

/** A kit shot's speed when it gives none (tiles/s, Stronghold's PROJECTILE_SPEED). */
const SPEED = 12;

/** @param {unknown} v @param {number} d */
const fin = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);

/**
 * What a kit gives for a shot, settled: its callback, look, source, hitDead, data, speed and longest flight.
 * @param {Record<string, any>} p
 */
const settled = (p) => ({
  onHit: typeof p.onHit === 'function' ? /** @type {(ctx: Record<string, any>) => void} */ (p.onHit) : null, visual: String(p.visual ?? 'arrow'),
  source: p.source ?? (p.from?.id != null ? p.from : null), hitDead: !!p.hitDead, data: p.data ?? null,
  speed: p.speed > 0 ? Number(p.speed) : SPEED, maxAge: p.maxAge > 0 ? Number(p.maxAge) : 10,
});

/** A kit's shot as kits see it: its id and where it is (read only), where it goes, its target, data and callback. */
export class KitShot {
  #id; #x; #y; #tx; #ty;

  /** @param {number} id @param {Record<string, any>} p */
  constructor(id, p) {
    const from = p.from ?? { x: 0, y: 0 }, target = p.target && typeof p.target === 'object' ? /** @type {ShUnit} */ (p.target) : null;
    this.#id = id;
    this.#x = fin(from.x, 0); this.#y = fin(from.y, 0);
    /** @type {ShUnit | null} */
    this.target = target;
    this.tseq = target?.deploySeq ?? 0;
    const to = p.to ?? target ?? { x: this.#x, y: this.#y }, o = settled(p);
    this.#tx = fin(to.x, this.#x); this.#ty = fin(to.y, this.#y);
    this.onHit = o.onHit; this.visual = o.visual; this.source = o.source; this.hitDead = o.hitDead; this.data = o.data;
    this.speed = o.speed; this.maxAge = o.maxAge; this.age = 0;
  }

  get id() { return this.#id; }
  get x() { return this.#x; }
  get y() { return this.#y; }

  /** A homing shot keeps to its target; whether it flies on (no: it fizzled). */
  follow() {
    const t = this.target;
    if (!t) return true;
    if (t.alive && !t.hidden && (t.deploySeq ?? 0) === this.tseq) { this.#tx = fin(t.x, this.#tx); this.#ty = fin(t.y, this.#ty); return true; }
    if (!this.hitDead) return false;
    this.target = null;
    return true;
  }

  /** One frame's flight of `dt` seconds; whether it arrived. @param {number} dt */
  fly(dt) {
    this.age += dt;
    const dx = this.#tx - this.#x, dy = this.#ty - this.#y, d = Math.sqrt(dx * dx + dy * dy), step = this.speed * dt;
    if (d <= step || this.age >= this.maxAge) { this.#x = this.#tx; this.#y = this.#ty; return true; }
    this.#x += (dx / d) * step; this.#y += (dy / d) * step;
    return false;
  }
}

export class ShProjectiles {
  /** @param {ShBattle} b */
  constructor(b) {
    this.b = b;
    /** @type {KitShot[]} */
    this.list = [];
    this.seq = 0;
  }

  /** A kit's shot (Stronghold's addProjectile): from `from` to `target` (a unit) or `to` ({x, y}). @param {Record<string, any>} p */
  add(p) {
    const shot = new KitShot(++this.seq, p);
    this.list.push(shot);
    return shot;
  }

  /** One frame of every shot (`dt` seconds): those arriving run their onHit, in the order they were fired. @param {number} dt */
  update(dt) {
    if (this.list.length === 0) return;
    /** @type {KitShot[]} */
    const keep = [];
    /** @type {KitShot[]} */
    const arrived = [];
    for (const p of this.list) {
      if (!p.follow()) continue;
      (p.fly(dt) ? arrived : keep).push(p);
    }
    this.list = keep;
    for (const p of arrived) this.land(p);
  }

  /** A shot arrives: its onHit with Stronghold's context. @param {KitShot} p */
  land(p) {
    if (!p.onHit) return;
    const t = p.target && p.target.alive && (p.target.deploySeq ?? 0) === p.tseq ? p.target : null, hit = p.onHit;
    this.b.safe(() => hit({ battle: this.b, projectile: p, target: t, x: p.x, y: p.y }), 'projectile.onHit', p.source);
  }
}
