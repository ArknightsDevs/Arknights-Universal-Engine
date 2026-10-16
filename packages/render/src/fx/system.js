// A particle system of an effect (docs/spec/render.md 渲染-10), simulated in the effect's space (x forward, y up, z
// away; one unit a tile): emission over time, over distance and in bursts (a sub-emitter's from its parent's
// particles), the emission shapes, velocity and force over life, gravity, limit velocity, noise, inherited velocity,
// collision planes, and its node's animation (local-space particles move with it; switched on, it starts over).
import { mm, lerp, unitVector, euler, rot, rotT, current, animate, noise3, startColor } from './curves.js';

/**
 * A particle: place, velocity (and the velocity it moved by this step: svx…), age and life, start size and rotation
 * (with a 3D start rotation, also about x and y: rx, ry), start colour, three randoms, the root it was born under
 * (world-space systems), a trail of past places.
 * @typedef {{ x: number, y: number, z: number, vx: number, vy: number, vz: number, svx?: number, svy?: number, svz?: number,
 *   age: number, life: number, size: number, sizeY: number, sizeZ?: number, rot: number, rx?: number, ry?: number, col: number[], r1: number, r2: number, r3: number,
 *   R: any, tr?: { x: number, y: number, z: number, a: number }[], trLife?: number, subs?: Record<number, any> }} Particle
 */
/**
 * A particle's 3D start: its rotation about x and y (radians; about z it is its rotation) and its size on z (scaled
 * as its other sizes). @param {Particle} q @param {any} p @param {number} tn @param {() => number} r @param {number} sz
 */
function start3D(q, p, tn, r, sz) {
  if (p.rot3D) { q.rx = p.rotX ? mm(p.rotX, tn, r()) : 0; q.ry = p.rotY ? mm(p.rotY, tn, r()) : 0; }
  if (p.size3D && p.sizeZ) q.sizeZ = mm(p.sizeZ, tn, r()) * sz;
}

/** A particle's rotation about x and y over its life (separate axes; radians a second). @param {Particle} q @param {any} p @param {number} tl @param {number} dt */
function spin3D(q, p, tl, dt) {
  if (p.rotOLX) q.rx = (q.rx ?? 0) + mm(p.rotOLX, tl, q.r3) * dt;
  if (p.rotOLY) q.ry = (q.ry ?? 0) + mm(p.rotOLY, tl, q.r3) * dt;
}

/** The instance a system belongs to (player.js). @typedef {{ t: number, R: any, v: number[], rand: () => number, stopped: boolean, kind: string, sysAt: (FxSystem | null)[], uiScale?: number }} Host */

/** A sphere or hemisphere (shell or volume) point. @param {any} sh @param {() => number} r */
function sphere(sh, r) {
  const d = unitVector(r);
  if (sh.type >= 2) d[2] = Math.abs(d[2]);
  const rr = sh.radius * (sh.type === 1 || sh.type === 3 ? 1 : lerp(1, Math.cbrt(r()), sh.thick ?? 1));
  return { p: [d[0] * rr, d[1] * rr, d[2] * rr], d };
}

/** A cone point (from its base, shell or volume). @param {any} sh @param {() => number} r @param {number} a */
function cone(sh, r, a) {
  const f = sh.type === 7 || sh.type === 9 ? 1 : lerp(1, Math.sqrt(r()), sh.thick ?? 1), ang = ((sh.angle * Math.PI) / 180) * f;
  const p = [Math.cos(a) * f * sh.radius, Math.sin(a) * f * sh.radius, 0];
  const d = [Math.sin(ang) * Math.cos(a), Math.sin(ang) * Math.sin(a), Math.cos(ang)];
  if (sh.type === 8 || sh.type === 9) { const l = r() * sh.len; for (let i = 0; i < 3; i++) p[i] += d[i] * l; }
  return { p, d };
}

/** A circle point (edge or area). @param {any} sh @param {() => number} r @param {number} a */
function circle(sh, r, a) {
  const f = sh.type === 11 ? 1 : lerp(1, Math.sqrt(r()), sh.thick ?? 1);
  return { p: [Math.cos(a) * f * sh.radius, Math.sin(a) * f * sh.radius, 0], d: [Math.cos(a), Math.sin(a), 0] };
}

/** A point and a direction of an emission shape (Unity's shape types by number). @param {any} sh @param {() => number} r */
export function shapePoint(sh, r) {
  const a = (r() * ((sh.arc ?? 360) * Math.PI)) / 180;
  if (sh.type <= 3) return sphere(sh, r);
  if ([4, 7, 8, 9].includes(sh.type)) return cone(sh, r, a);
  if ([5, 15, 16].includes(sh.type)) return { p: [r() - 0.5, r() - 0.5, r() - 0.5], d: [0, 0, 1] }; // boxes
  if ([10, 11, 17].includes(sh.type)) return circle(sh, r, a);
  if (sh.type === 12) return { p: [(r() * 2 - 1) * sh.radius, 0, 0], d: [0, 1, 0] }; // edge
  if (sh.type === 18) return { p: [r() - 0.5, r() - 0.5, 0], d: [0, 0, 1] }; // rectangle
  return { p: [0, 0, 0], d: unitVector(r) };
}

/** The shape's point turned, scaled and moved as its module says. @param {any} sh @param {number[] | null} shM @param {() => number} r */
function shaped(sh, shM, r) {
  let { p, d } = shapePoint(sh, r);
  if (sh.randDir > 0 || sh.sph > 0) { const u = unitVector(r), k = Math.max(sh.randDir, sh.sph); d = d.map((v, i) => lerp(v, u[i], k)); }
  const b = sh.box || [1, 1, 1];
  p = [p[0] * b[0], p[1] * b[1], p[2] * b[2]];
  if (shM) { p = rot(shM, p); d = rot(shM, d); }
  return { p: [p[0] + sh.pos[0], p[1] + sh.pos[1], p[2] + sh.pos[2]], d };
}

export class FxSystem {
  /** @param {any} p the system's data @param {Host} inst */
  constructor(p, inst) {
    this.p = p; this.inst = inst; this.t = 0; this.acc = 0; this.fired = new Set();
    /** @type {Particle[]} */
    this.ps = [];
    this.delay = mm(p.delay, 0, inst.rand());
    this.cur = current(p);
    this.sub = p.subOf !== undefined;
    /** @type {number[]} */ this.M = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    /** @type {number[]} */ this.pos = [0, 0, 0];
    /** @type {number[]} */ this.shs = [1, 1, 1];
    this.sz = 1;
    this.place();
    /** @type {number[] | null} */
    this.shM = p.shape.on && p.shape.rot.some((/** @type {number} */ a) => a) ? euler(p.shape.rot) : null;
    // emitting until: a projectile's looping systems until it lands, a lasting effect's (a tile, a status) until it is
    // stopped, a start or hit effect's for a second; a system with bursts only until its last burst
    const rateOn = (p.rate && (p.rate.sc > 0 || p.rate.mn > 0)) || (p.rateD && p.rateD.sc > 0), dur = Math.max(0.01, p.dur);
    const lastBurst = Math.max(0, ...(p.bursts || []).map((/** @type {any} */ b) => (b.cycles > 0 ? b.t + (b.cycles - 1) * b.iv : dur)));
    const once = rateOn ? dur : Math.min(dur, lastBurst + 0.25);
    this.end = p.loop ? (inst.kind === 'trail' || inst.kind === 'loop' ? Infinity : rateOn ? Math.min(1, dur) : once) : once;
    /** @type {any} */
    this.lastR = null;
  }

  place() {
    const p = this.p, c = this.cur, s = p.scaling === 1 ? p.ls || [1, 1, 1] : p.scaling === 2 ? [1, 1, 1] : c.scl;
    // (a UI's: a system scaled by its own transform only — local or shape scaling — keeps its size whatever its parents' scale, 渲染-18)
    this.M = c.M; this.pos = c.pos; this.shs = c.scl; this.sz = (Math.abs(s[0]) || 1) * (p.scaling ? this.inst.uiScale ?? 1 : 1);
  }

  get emitting() { return !this.inst.stopped && this.t < this.end && !this.sub && !!this.cur.on; }

  /**
   * A particle at the system's shape (from: a parent particle, for a sub-emitter; inh: what it takes from it — colour
   * 1, size 2, rotation 4, lifetime 8). @param {number} tn @param {any} [from] @param {number} [inh]
   */
  spawn(tn, from, inh) {
    const p = this.p, r = this.inst.rand;
    if (this.ps.length >= Math.min(p.max || 1000, 120)) return;
    const { p: pt, d } = p.shape.on ? shaped(p.shape, this.shM, r) : { p: [0, 0, 0], d: [0, 0, 1] }, s = this.shs;
    const P = rot(this.M, [pt[0] * s[0], pt[1] * s[1], pt[2] * s[2]]), D = rot(this.M, d), sp = mm(p.speed, tn, r()) * this.sz;
    const o = from || { x: this.pos[0], y: this.pos[1], z: this.pos[2] };
    /** @type {Particle} */
    const q = { x: o.x + P[0], y: o.y + P[1], z: o.z + P[2], vx: D[0] * sp, vy: D[1] * sp, vz: D[2] * sp, age: 0,
      life: Math.max(0.02, mm(p.life, tn, r())), size: mm(p.size, tn, r()) * this.sz, sizeY: p.size3D ? mm(p.sizeY, tn, r()) * this.sz : 0,
      rot: mm(p.rot, tn, r()), col: startColor(p.color, tn, r()), r1: r(), r2: r(), r3: r(), R: from ? from.R : p.space === 1 ? { ...this.inst.R } : null };
    start3D(q, p, tn, r, this.sz);
    if (p.inh) { const k = mm(p.inh.c, tn, r()), v = this.inst.v; q.vx += v[0] * k; q.vy += v[1] * k; q.vz += v[2] * k; }
    if (from && inh) inherit(q, from, inh);
    if (p.trl && r() < (p.trl.ratio ?? 1)) { q.tr = []; q.trLife = Math.max(0.02, mm(p.trl.life, 0, r()) * q.life); }
    this.ps.push(q);
  }

  restart() { this.t = 0; this.acc = 0; this.fired.clear(); this.delay = mm(this.p.delay, 0, this.inst.rand()); this.ps.length = 0; }

  /** Local-space particles carried from the node's old place (P0 M0 S0) to its new one. @param {number[]} P0 @param {number[]} M0 @param {number[]} S0 */
  carry(P0, M0, S0) {
    const P1 = this.pos, M1 = this.M, S1 = this.shs, k = [0, 1, 2].map((i) => (Math.abs(S0[i]) > 1e-4 ? S1[i] / S0[i] : 1));
    for (const q of this.ps) {
      const l = rotT(M0, [q.x - P0[0], q.y - P0[1], q.z - P0[2]]), v = rotT(M0, [q.vx, q.vy, q.vz]);
      const w = rot(M1, [l[0] * k[0], l[1] * k[1], l[2] * k[2]]), u = rot(M1, [v[0] * k[0], v[1] * k[1], v[2] * k[2]]);
      q.x = P1[0] + w[0]; q.y = P1[1] + w[1]; q.z = P1[2] + w[2]; q.vx = u[0]; q.vy = u[1]; q.vz = u[2];
    }
  }

  /** The node's animation; false when the system is switched off. */
  animated() {
    const p = this.p;
    if (!p.an) return true;
    const was = this.cur.on, P0 = this.pos, M0 = this.M, S0 = this.shs;
    animate(this.cur, p.an, this.inst.t);
    if (p.an.tr) { this.place(); if (!p.space) this.carry(P0, M0, S0); }
    if (this.cur.on && !was) this.restart();
    else if (!this.cur.on) { this.ps.length = 0; return false; }
    return true;
  }

  /** @param {number} dt seconds of effect time */
  step(dt) {
    dt *= this.p.speedMul || 1;
    if (!this.animated()) return;
    if (this.sub) { this.age(dt); return; }
    if (this.delay > 0) { this.delay -= dt; this.age(dt); return; }
    if (this.emitting) this.emit(dt);
    this.t += dt;
    this.age(dt);
  }

  /** Emission over time and over distance (per unit the root moved), and the bursts due. @param {number} dt */
  emit(dt) {
    const p = this.p, dur = Math.max(0.01, p.dur), lt = this.t % dur, lp = Math.floor(this.t / dur), tn = lt / dur, R = this.inst.R, r = this.inst.rand;
    this.acc += (p.rate ? mm(p.rate, tn, r()) : 0) * dt;
    if (p.rateD && this.lastR) this.acc += mm(p.rateD, tn, r()) * Math.hypot(R.o[0] - this.lastR[0], R.o[1] - this.lastR[1], R.o[2] - this.lastR[2]);
    this.lastR = R.o.slice();
    while (this.acc >= 1) { this.acc -= 1; this.spawn(tn); }
    (p.bursts || []).forEach((/** @type {any} */ b, /** @type {number} */ i) => {
      const cycles = b.cycles > 0 ? b.cycles : Math.min(30, Math.floor((dur - b.t) / Math.max(0.01, b.iv)) + 1);
      for (let c = 0; c < cycles; c++) {
        const key = `${lp}:${i}:${c}`;
        if (lt < b.t + c * b.iv || this.fired.has(key)) continue;
        this.fired.add(key);
        for (let k = Math.round(mm(b.n, tn, r())); k > 0; k--) this.spawn(tn);
      }
    });
  }

  /** Ages the particles and moves them by the modules. @param {number} dt */
  age(dt) {
    this.ps = this.ps.filter((q) => (q.age += dt) < q.life);
    for (const q of this.ps) this.move(q, dt);
  }

  /** Force over life, gravity and limit velocity change the particle's own velocity. @param {Particle} q @param {number} tl @param {number} dt */
  accelerate(q, tl, dt) {
    const p = this.p;
    if (p.force) { const f = [mm(p.force.x, tl, q.r1), mm(p.force.y, tl, q.r2), mm(p.force.z, tl, q.r3)], F = p.force.world ? f : rot(this.M, f); q.vx += F[0] * dt; q.vy += F[1] * dt; q.vz += F[2] * dt; }
    if (p.gravity) q.vy -= mm(p.gravity, 0, 0.5) * 9.81 * dt;
    if (p.damp && p.damp.v) this.limit(q, tl, dt);
  }

  /** The velocity the particle moves by now: its own, plus velocity over life and the noise. @param {Particle} q @param {number} tl */
  velocity(q, tl) {
    const p = this.p, v = [q.vx, q.vy, q.vz];
    if (p.vel) { const w = [mm(p.vel.x, tl, q.r1), mm(p.vel.y, tl, q.r2), mm(p.vel.z, tl, q.r3)], V = p.vel.world ? w : rot(this.M, w); for (let i = 0; i < 3; i++) v[i] += V[i] * this.sz; }
    if (p.noise) { const n = this.noise(q, tl); for (let i = 0; i < 3; i++) v[i] += n[i]; }
    return v;
  }

  /** @param {Particle} q @param {number} dt */
  move(q, dt) {
    const p = this.p, tl = q.age / q.life;
    this.accelerate(q, tl, dt);
    const v = this.velocity(q, tl);
    q.x += v[0] * dt; q.y += v[1] * dt; q.z += v[2] * dt;
    q.svx = v[0]; q.svy = v[1]; q.svz = v[2];
    if (p.rotOL) q.rot += mm(p.rotOL, tl, q.r3) * dt;
    if (p.rotOLX || p.rotOLY) spin3D(q, p, tl, dt);
    if (p.coll && p.coll.pl) this.collide(q, tl);
    if (p.sub) this.emitSubs(q, dt);
    if (q.tr) this.trailPoint(q, dt);
  }

  /** Limit velocity: the speed above the limit damped. @param {Particle} q @param {number} tl @param {number} dt */
  limit(q, tl, dt) {
    const p = this.p, lim = mm(p.damp.v, tl, q.r2), v = Math.hypot(q.vx, q.vy, q.vz);
    if (v > lim && v > 0) { const k = Math.pow(1 - p.damp.d * (1 - lim / v), dt * 30); q.vx *= k; q.vy *= k; q.vz *= k; }
  }

  /** @param {Particle} q @param {number} dt */
  trailPoint(q, dt) {
    const T = /** @type {NonNullable<Particle['tr']>} */ (q.tr), l = T[0];
    for (const s of T) s.a += dt;
    while (T.length && T[T.length - 1].a > /** @type {number} */ (q.trLife)) T.pop();
    if (!l || Math.hypot(q.x - l.x, q.y - l.y, q.z - l.z) > Math.max(0.02, this.p.trl.minDist || 0)) T.unshift({ x: q.x, y: q.y, z: q.z, a: 0 });
    if (T.length > 40) T.length = 40;
  }

  /**
   * The noise module: a smooth field's push (units a second) on each axis, its strength over the particle's life (÷ the
   * frequency when damped), octaves, scrolling over time. @param {Particle} q @param {number} tl
   */
  noise(q, tl) {
    const N = this.p.noise, f = N.f || 0.5, k = (N.p ? mm(N.p, tl, 0.5) : 1) / (N.d ? f : 1);
    const s = [mm(N.s, tl, q.r1) * k, (N.sy ? mm(N.sy, tl, q.r2) : mm(N.s, tl, q.r1)) * k, (N.sz ? mm(N.sz, tl, q.r3) : mm(N.s, tl, q.r1)) * k];
    if (!(s[0] || s[1] || s[2])) return [0, 0, 0];
    const sc = (N.sc ? mm(N.sc, tl, 0.5) : 0) * this.inst.t, o = [0, 0, 0];
    let a = 1, fr = f;
    for (let i = 0; i < (N.o || 1); i++) {
      o[0] += a * noise3(q.x * fr + 13.1, q.y * fr, q.z * fr + sc);
      o[1] += a * noise3(q.x * fr, q.y * fr + 71.7, q.z * fr + sc);
      o[2] += a * noise3(q.x * fr + 37.3, q.y * fr + 5.9, q.z * fr + sc);
      a *= N.om ?? 0.5; fr *= N.os ?? 2;
    }
    return [o[0] * s[0], o[1] * s[1], o[2] * s[2]];
  }

  /** Planes the particle bounces off: the normal's part of its velocity × bounce, the rest dampened. @param {Particle} q @param {number} tl */
  collide(q, tl) {
    const C = this.p.coll, rad = (Math.abs(q.size) * (C.rs ?? 1)) / 2;
    for (const P of C.pl) {
      const d = (q.x - P[0]) * P[3] + (q.y - P[1]) * P[4] + (q.z - P[2]) * P[5];
      if (d >= rad) continue;
      const vn = q.vx * P[3] + q.vy * P[4] + q.vz * P[5];
      if (vn < 0) {
        const b = mm(C.b, tl, q.r2), k = 1 - mm(C.d, tl, q.r3);
        q.vx = (q.vx - (1 + b) * vn * P[3]) * k; q.vy = (q.vy - (1 + b) * vn * P[4]) * k; q.vz = (q.vz - (1 + b) * vn * P[5]) * k;
      }
      q.x += (rad - d) * P[3]; q.y += (rad - d) * P[4]; q.z += (rad - d) * P[5];
    }
  }

  /** Birth sub-emitters: each emits from the particle as its own emission says, over the particle's life. @param {Particle} q @param {number} dt */
  emitSubs(q, dt) {
    for (const L of this.p.sub) {
      const S = this.inst.sysAt[L.i];
      if (S && L.type === 0) S.emitFrom(q, dt, L, this.inst);
    }
  }

  /**
   * Emission from a parent particle (this system being its sub-emitter). @param {Particle} q @param {number} dt
   * @param {{ i: number, p: number, inh: number }} L @param {Host} host
   */
  emitFrom(q, dt, L, host) {
    const sp = this.p, r = host.rand, subs = q.subs || (q.subs = {});
    const st = subs[L.i] || (subs[L.i] = { acc: 0, fired: new Set(), last: null });
    const lt = q.age - dt, dur = Math.max(0.01, sp.dur);
    if (!sp.loop && lt > dur) return;
    const tn = (lt % dur) / dur, cyc = Math.floor(lt / dur), from = { ...q, R: q.R || (sp.space === 1 ? { ...host.R } : null) };
    st.acc += (sp.rate ? mm(sp.rate, tn, r()) : 0) * dt;
    if (sp.rateD && st.last) st.acc += mm(sp.rateD, tn, r()) * Math.hypot(q.x - st.last[0], q.y - st.last[1], q.z - st.last[2]);
    st.last = [q.x, q.y, q.z];
    while (st.acc >= 1) { st.acc -= 1; if (r() < L.p) this.spawn(tn, from, L.inh); }
    (sp.bursts || []).forEach((/** @type {any} */ b, /** @type {number} */ i) => {
      for (let c = 0; c < Math.max(1, b.cycles); c++) {
        const key = `${cyc}:${i}:${c}`;
        if ((lt % dur) < b.t + c * b.iv || st.fired.has(key)) continue;
        st.fired.add(key);
        for (let k = Math.round(mm(b.n, tn, r())); k > 0; k--) if (r() < L.p) this.spawn(tn, from, L.inh);
      }
    });
  }

  get alive() { return this.sub ? this.ps.length > 0 : this.emitting || this.delay > 0 || this.ps.length > 0; }
}

/** What a sub-emitter's particle takes from its parent. @param {Particle} q @param {Particle} from @param {number} inh */
function inherit(q, from, inh) {
  if (inh & 1) q.col = q.col.map((c, i) => c * from.col[i]);
  if (inh & 2) { q.size *= from.size; q.sizeY *= from.size; }
  if (inh & 4) q.rot += from.rot;
  if (inh & 8) q.life *= Math.max(0.02, (from.life - from.age) / from.life);
}
