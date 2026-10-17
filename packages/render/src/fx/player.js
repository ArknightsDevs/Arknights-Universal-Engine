// The effect player (docs/spec/render.md 渲染-10): an effect instance is an exported effect played at a root (a place
// and its axes in the world — the battle's own: x east, y north, z down; one unit a tile) — its particle systems, trails (TrailRenderer:
// the points its node leaves, kept for its time) and meshes (MeshRenderer at its node), each a batch of triangles by
// the particle shaders' rule. It waits its prefab's wait first; a start or hit effect's looping systems run for at most
// a second, a projectile's until it lands; once stopped its trails and meshes fade out over 0.4–1 s.
import * as THREE from 'three';
import { mm, mmLow, grad, current, animate, scroll, uvs, rot, clamp } from './curves.js';
import { FxSystem } from './system.js';
import { FxBatch, fxMaterial, toWorld, dirWorld, strip, quad, particleAxes } from './geometry.js';

/** The camera's axes in the world. @typedef {{ right: number[], up: number[], view: number[] }} Cam */
/** @typedef {import('./geometry.js').Root} Root */
/** An effect pack: the exported data and its textures by key. @typedef {{ data: any, textures: Map<string, THREE.Texture> }} FxPack */

/** Whether a system is drawn by more than a coloured texture (a mesh, a dissolve, a distortion, a tiling, a scroll…). @param {any} p */
const shaded = (p) => !!(p.mesh || p.diss || p.dist || p.mul || p.uvst || p.uvspd || p.tw || p.uvrot || (p.an && (p.an.ust || p.an.dst || p.an.amt || p.an.bw || p.an.xst || p.an.xi)));

/** How long before an effect shows anything: its wait plus its earliest system delay (渲染-11). @param {any} e */
export const effectLead = (e) => (e.w || 0) + Math.min(...e.ps.filter((/** @type {any} */ p) => p.subOf === undefined).map((/** @type {any} */ p) => mmLow(p.delay)), e.tr.length ? 0 : Infinity);

/** The coordinates of (u, v) through a renderer's material now. @param {any} d @param {any} cur @param {number[]} sc @param {{ c1?: number[] | null, cx?: number[] | null }} [o] */
const uvOf = (d, cur, sc, o = {}) => (/** @type {number} */ u, /** @type {number} */ v) => uvs(d, cur, sc, [u, v], { ...o, out: new Array(8).fill(0) });

class FxTrail {
  /** @param {any} t @param {FxInstance} inst */
  constructor(t, inst) {
    this.t = t; this.inst = inst; this.cur = current(t);
    /** @type {{ p: number[], age: number }[]} */
    this.pts = [];
    this.b = new FxBatch(fxMaterial(t, inst.tex));
  }

  /** @param {number} dt */
  step(dt) {
    const t = this.t, inst = this.inst;
    animate(this.cur, t.an, inst.t);
    if (!this.cur.on) { this.pts.length = 0; return; }
    for (const p of this.pts) p.age += dt;
    this.pts = this.pts.filter((p) => p.age < t.time);
    if (inst.stopped) return;
    const pt = toWorld(inst.R, this.cur.pos), last = this.pts[0];
    if (!last || Math.hypot(pt[0] - last.p[0], pt[1] - last.p[1], pt[2] - last.p[2]) > 0.02) this.pts.unshift({ p: pt, age: 0 });
    else { last.p = pt; last.age = 0; }
    if (this.pts.length > 40) this.pts.length = 40;
  }

  /** @param {Cam} cam */
  draw(cam) {
    const t = this.t, cur = this.cur, b = this.b, P = cur.on ? this.pts.map((p) => p.p) : [], L = P.length;
    b.begin();
    if (L >= 2) {
      const U = [], W = [], C = [], tint = cur.tint, a = this.inst.fade;
      let dist = 0;
      for (let i = 0; i < L; i++) {
        const u = i / (L - 1), g = grad(t.grad, u);
        if (i) dist += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1], P[i][2] - P[i - 1][2]);
        U.push(t.texMode === 1 ? dist : t.texMode === 3 ? i : u);
        W.push(cur.wid * (t.wcurve ? mm(t.wcurve, u, 0.5) : 1));
        C.push([g[0] * tint[0], g[1] * tint[1], g[2] * tint[2], g[3] * tint[3] * a]);
      }
      strip(b, { P, U, W, C }, uvOf(t, cur, scroll(t, this.inst.t)), [cur.amt, cur.bw, cur.xi[0], cur.xi[1]], cam.view);
    }
    b.end();
  }

  get alive() { return this.pts.length > 0 || !this.inst.stopped; }
}

class FxMesh {
  /** @param {any} d @param {FxInstance} inst */
  constructor(d, inst) { this.d = d; this.inst = inst; this.cur = current(d); this.b = new FxBatch(fxMaterial(d, inst.tex)); }

  step() { animate(this.cur, this.d.an, this.inst.t); }

  draw() {
    const d = this.d, cur = this.cur, m3 = d.mesh, n = m3.v.length / 3, b = this.b, inst = this.inst;
    b.begin();
    if (cur.on && !inst.stopped && b.room(n, m3.f.length)) {
      const t = cur.tint, C = [t[0], t[1], t[2], t[3] * inst.fade], S = [cur.amt, cur.bw, cur.xi[0], cur.xi[1]], uv = uvOf(d, cur, scroll(d, inst.t));
      for (let j = 0; j < n; j++) {
        const w = rot(cur.M, [m3.v[j * 3] * cur.scl[0], m3.v[j * 3 + 1] * cur.scl[1], m3.v[j * 3 + 2] * cur.scl[2]]);
        b.vert(toWorld(inst.R, [cur.pos[0] + w[0], cur.pos[1] + w[1], cur.pos[2] + w[2]]), uv(m3.uv[j * 2], m3.uv[j * 2 + 1]), C, S);
      }
      for (let j = 0; j < m3.f.length; j += 3) b.tri(m3.f[j], m3.f[j + 1], m3.f[j + 2]);
    }
    b.end();
  }
}

/** A system's batches and how it draws its particles. */
class FxDrawn {
  /** @param {FxSystem} S @param {FxInstance} inst */
  constructor(S, inst) {
    this.S = S; this.inst = inst; this.plain = !shaded(S.p);
    this.b = new FxBatch(fxMaterial(S.p, inst.tex));
    const trl = S.p.trl;
    this.tb = trl && inst.tex.get(trl.tex) ? new FxBatch(fxMaterial(trl, inst.tex)) : null;
    this.tcur = trl ? current(trl) : null;
  }

  /** @param {Cam} cam */
  draw(cam) {
    const S = this.S;
    this.b.begin(); this.tb?.begin();
    const sc = scroll(S.p, this.inst.t);
    if (S.cur.on) for (const q of S.ps) this.particle(q, cam, sc);
    this.b.end(); this.tb?.end();
  }

  /** @param {any} q @param {Cam} cam @param {number[]} sc */
  particle(q, cam, sc) {
    const p = this.S.p, tl = q.age / q.life, R = q.R || this.inst.R, { size, sizeY, sizeZ } = sizesOf(p, q, tl);
    const oc = p.col ? grad(p.col, tl) : [1, 1, 1, 1], tint = this.S.cur.tint;
    if (q.tr && this.tb) this.ribbon(q, { tl, size, col: q.col.map((/** @type {number} */ v, /** @type {number} */ i) => v * oc[i]), R }, cam);
    if (!(Math.abs(size) > 1e-3) || p.render.mode === 5) return;
    const C = q.col.map((/** @type {number} */ v, /** @type {number} */ i) => v * tint[i] * oc[i]), S = this.dissolve(q, tl, C, q.col[3] * oc[3]);
    if (this.plain) brighten(p, C);
    if (C[3] <= 0.004) return;
    const cell = sheetCell(p, tl, q), o = this.customData(q, tl), uv = uvOf(p, this.S.cur, sc, o);
    if (p.render.mode === 4 && p.mesh) this.meshParticle(q, { size, sizeY, sizeZ, R }, uv, { C, S });
    else quad(this.b, particleAxes(p, q, { R, M: this.S.M, size, sizeY }, cam), cell, uv, { C, S });
  }

  /** Custom data's texture offsets: main and dissolve (c1), distortion (c2's last two). @param {any} q @param {number} tl */
  customData(q, tl) {
    const p = this.S.p, D = p.diss, X = p.dist, on = p.cd && ((D && D.cd) || (X && X.cd)), c1 = on && p.cd.c1, c2 = on && p.cd.c2;
    const cv = (/** @type {any} */ c, /** @type {number} */ j, /** @type {number} */ r) => (c && c[j] ? mm(c[j], tl, r) : 0);
    return { c1: c1 ? [cv(c1, 0, q.r1), cv(c1, 1, q.r2), cv(c1, 2, q.r3), cv(c1, 3, q.r1)] : null, cx: c2 && X && X.cd ? [cv(c2, 2, q.r2), cv(c2, 3, q.r3)] : null };
  }

  /**
   * The dissolve and distortion values of a particle: the material's (animated), custom data 2's (amount; border, or
   * the distortion's strength), or the vertex alpha (VertexColor Major: amount 1 − alpha, the colour's alpha undone).
   * @param {any} q @param {number} tl @param {number[]} C @param {number} va
   */
  dissolve(q, tl, C, va) {
    const p = this.S.p, cur = this.S.cur, D = p.diss, X = p.dist, S = [cur.amt, cur.bw, cur.xi[0], cur.xi[1]];
    const c2 = p.cd && ((D && D.cd) || (X && X.cd)) && p.cd.c2, cv = (/** @type {number} */ j, /** @type {number} */ r) => (c2 && c2[j] ? mm(c2[j], tl, r) : 0);
    if (D && D.vc) { S[0] = 1 - va; C[3] /= Math.max(1e-4, va); return S; }
    if (!c2) return S;
    S[0] += cv(0, q.r2);
    if (X && X.cd) { const a = cv(1, q.r3); S[2] += a; S[3] += a; } else S[1] = clamp(S[1] + cv(1, q.r3), 1e-4, 1);
    return S;
  }

  /**
   * A mesh particle: the mesh scaled by the size, turned by the rotation — for one facing the view, a 3D one as Unity's
   * Euler order, about z, then x, then y, mirrored with the flipped z (x and y turn the other way) — and by the system's
   * place when aligned to the world or the system (those take their x and y turns from that place, as before).
   */
  meshParticle(/** @type {any} */ q, /** @type {{ size: number, sizeY: number, sizeZ: number, R: Root }} */ s, /** @type {(u: number, v: number) => number[]} */ uv, /** @type {{ C: number[], S: number[] }} */ k) {
    const p = this.S.p, m3 = p.mesh, nv = m3.v.length / 3, b = this.b;
    if (!b.room(nv, m3.f.length)) return;
    const c = Math.cos(q.rot), si = Math.sin(q.rot), M = p.render.align === 2 || p.render.align === 1 ? this.S.M : null, base = b.n;
    const ax = !M && q.rx ? [Math.cos(-q.rx), Math.sin(-q.rx)] : null, ay = !M && q.ry ? [Math.cos(-q.ry), Math.sin(-q.ry)] : null;
    for (let j = 0; j < nv; j++) {
      const x = m3.v[j * 3] * s.size, y = m3.v[j * 3 + 1] * s.sizeY, z = m3.v[j * 3 + 2] * s.sizeZ * (this.inst.flipZ ? -1 : 1);
      let w = [x * c - y * si, x * si + y * c, z];
      if (ax) w = [w[0], w[1] * ax[0] - w[2] * ax[1], w[1] * ax[1] + w[2] * ax[0]];
      if (ay) w = [w[0] * ay[0] + w[2] * ay[1], w[1], -w[0] * ay[1] + w[2] * ay[0]];
      if (M) w = rot(M, w);
      b.vert(toWorld(s.R, [q.x + w[0], q.y + w[1], q.z + w[2]]), uv(m3.uv[j * 2], m3.uv[j * 2 + 1]), k.C, k.S);
    }
    for (let j = 0; j < m3.f.length; j += 3) b.tri(base + m3.f[j], base + m3.f[j + 1], base + m3.f[j + 2]);
  }

  /**
   * A particle's trail (the trail module): its past places, as wide as the particle (× width over the trail), coloured
   * by it (× colour over its life and over the trail). @param {any} q @param {{ tl: number, size: number, col: number[], R: Root }} s @param {Cam} cam
   */
  ribbon(q, s, cam) {
    const T = this.S.p.trl, pts = [{ x: q.x, y: q.y, z: q.z }, ...q.tr];
    if (pts.length < 2 || !this.tb || !this.tcur) return;
    const n = pts.length, P = [], U = [], W = [], C = [], cl = T.colL ? grad(T.colL.gmax ?? T.colL, s.tl) : [1, 1, 1, 1], tint = this.tcur.tint;
    let dist = 0;
    for (let i = 0; i < n; i++) {
      const a = pts[i], u = i / (n - 1), ct = T.colT ? grad(T.colT.gmax ?? T.colT, u) : [1, 1, 1, 1], pc = T.inhCol ? s.col : [1, 1, 1, 1];
      if (i) dist += Math.hypot(a.x - pts[i - 1].x, a.y - pts[i - 1].y, a.z - pts[i - 1].z);
      P.push(toWorld(s.R, [a.x, a.y, a.z])); U.push(T.texMode === 1 ? dist : T.texMode === 3 ? i : u);
      W.push((T.sizeW ? s.size : 1) * (T.w ? mm(T.w, u, 0.5) : 1));
      C.push([0, 1, 2, 3].map((j) => pc[j] * cl[j] * ct[j] * tint[j]));
    }
    strip(this.tb, { P, U, W, C }, uvOf(T, this.tcur, scroll(T, this.inst.t)), [this.tcur.amt, this.tcur.bw, 0, 0], cam.view);
  }

  get meshes() { return [this.b.mesh, ...(this.tb ? [this.tb.mesh] : [])]; }
  dispose() { this.b.dispose(); this.tb?.dispose(); }
}

/**
 * A particle's size now on each axis: its start size — each axis its own when the system starts them apart — times its
 * size over its life — each axis its own when the system sizes them apart, even from one start size; a mesh's depth its
 * own start size on z then, else its width. @param {any} p @param {any} q @param {number} tl
 */
export function sizesOf(p, q, tl) {
  const sOL = p.sizeOL ? mm(p.sizeOL, tl, q.r2) : 1, size = q.size * sOL;
  if (!p.size3D && !p.sizeOLY) return { size, sizeY: size, sizeZ: size };
  const y0 = p.size3D ? q.sizeY : q.size, z0 = p.size3D ? q.sizeZ : q.size;
  return { size, sizeY: y0 * (p.sizeOLY ? mm(p.sizeOLY, tl, q.r2) : sOL), sizeZ: z0 ? z0 * (p.sizeOLZ ? mm(p.sizeOLZ, tl, q.r2) : sOL) : size };
}

/** A texture-sheet cell of a particle now: its frame and the sheet's size. @param {any} p @param {number} tl @param {any} q */
function sheetCell(p, tl, q) {
  if (!p.uv) return { f: 0, tx: 1, ty: 1 };
  const tx = p.uv.x, ty = p.uv.y, nF = tx * ty, fv = mm(p.uv.f, (tl * (p.uv.cycles || 1)) % 1, q.r1);
  return { f: (((Math.min(nF - 1, Math.floor(fv * nF)) + Math.floor(mm(p.uv.start, 0, q.r3))) % nF) + nF) % nF, tx, ty };
}

/** A plain additive particle brighter than white keeps its hue: the colour scaled down, the alpha up. @param {any} p @param {number[]} C */
function brighten(p, C) {
  if (p.blend !== 'add') return;
  const m = Math.max(C[0], C[1], C[2]);
  if (m > 1) { C[0] /= m; C[1] /= m; C[2] /= m; C[3] *= m; }
  C[3] = Math.min(1, C[3]);
}

export class FxInstance {
  /**
   * @param {any} e the effect's data @param {Root} R
   * @param {{ kind: string, speed?: number, tex: Map<string, THREE.Texture>, rand?: () => number, order?: number, flipMeshZ?: boolean, uiScale?: number }} o `order`: the render
   *   order its renderers start from (after the units by default); `flipMeshZ`: mesh particles' z turned the other way, `uiScale`: a UI
   *   particle component's scale (a UI's, 渲染-18)
   */
  constructor(e, R, o) {
    this.e = e; this.R = R; this.kind = o.kind; this.sp = o.speed || 1; this.tex = o.tex; this.rand = o.rand || Math.random; this.flipZ = !!o.flipMeshZ; this.uiScale = o.uiScale ?? 1;
    this.t = 0; this.wait = e.w || 0; this.stopped = false; this.stopT = 0; this.fade = 1; this.v = [0, 0, 0];
    /** @type {Root | null} */ this.Rp = null;
    this.group = new THREE.Group();
    const has = (/** @type {any} */ d) => this.tex.has(d.tex);
    /** @type {FxTrail[]} */
    this.trails = e.tr.filter(has).map((/** @type {any} */ t) => new FxTrail(t, this));
    /** @type {FxMesh[]} */
    this.meshes = (e.mr || []).filter(has).map((/** @type {any} */ m) => new FxMesh(m, this));
    /** @type {(FxSystem | null)[]} */
    this.sysAt = e.ps.map((/** @type {any} */ p) => (has(p) ? new FxSystem(p, this) : null));
    // drawn in the prefab's order, a higher sorting fudge further back
    this.drawn = this.sysAt.filter((s) => s !== null).sort((a, b) => (b.p.render.fudge || 0) - (a.p.render.fudge || 0)).map((s) => new FxDrawn(s, this));
    [...this.drawn.flatMap((d) => d.meshes), ...this.trails.map((t) => t.b.mesh), ...this.meshes.map((m) => m.b.mesh)].forEach((m, i) => { m.renderOrder = (o.order ?? 10) + i * 0.001; this.group.add(m); });
    this.cap = o.kind === 'trail' || o.kind === 'loop' ? Infinity : Math.min(3, Math.max(0.3, e.d));
    this.hold = Math.min(this.cap, Math.max(0.05, ...[...e.ps, ...e.tr, ...(e.mr || [])].map((d) => (d.an && !d.an.loop ? d.an.L : 0))));
  }

  stop() { if (!this.stopped) { this.stopped = true; this.stopT = this.t; } }

  /** The root's velocity in the effect's axes (units a second), for systems that inherit it. @param {number} dt */
  track(dt) {
    const R = this.R, P = this.Rp;
    if (P && dt > 0) { const d = [0, 1, 2].map((i) => (R.o[i] - P.o[i]) / dt); this.v = [R.ex, R.ey, R.ez].map((a) => a[0] * d[0] + a[1] * d[1] + a[2] * d[2]); }
    this.Rp = { ...R, o: R.o.slice() };
  }

  /** @param {number} dt seconds */
  step(dt) {
    dt *= this.sp;
    this.track(dt);
    if (this.wait > 0) {
      this.wait -= dt;
      if (this.wait > 0) { if (this.stopped) this.fade = 0; return; }
      dt = -this.wait; this.wait = 0;
    }
    this.t += dt;
    if (this.t > this.cap && !this.stopped) this.stop();
    for (const m of this.meshes) m.step();
    for (const s of this.sysAt) s?.step(dt);
    for (const t of this.trails) t.step(dt);
    if (this.stopped) this.fade = clamp(1 - (this.t - this.stopT - 0.4) / 0.6, 0, 1);
  }

  /** @param {Cam} cam */
  draw(cam) {
    this.group.visible = this.wait <= 0;
    if (this.wait > 0) return;
    for (const d of this.drawn) d.draw(cam);
    for (const t of this.trails) t.draw(cam);
    for (const m of this.meshes) m.draw();
  }

  get done() {
    if (this.stopped && this.fade <= 0) return true;
    if (this.wait > 0 || this.t <= this.hold) return false;
    return !this.sysAt.some((s) => s?.alive) && !this.trails.some((t) => t.alive) && (!this.meshes.length || this.stopped || this.t > this.cap);
  }

  dispose() {
    for (const d of this.drawn) d.dispose();
    for (const t of this.trails) t.b.dispose();
    for (const m of this.meshes) m.b.dispose();
    for (const m of this.group.children) /** @type {THREE.Material} */ (/** @type {THREE.Mesh} */ (m).material).dispose();
  }
}

// (three.js: x east, y up, z south; the battle's north is −z, its down −y)
const UP = [0, 1, 0], DOWN = [0, -1, 0];
/** @param {number[]} a @param {number[]} b */
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/** A direction on the ground, of unit length (east without one). @param {number[]} d */
const ground = (d) => { const l = Math.hypot(d[0], d[2]); return l > 1e-9 ? [d[0] / l, 0, d[2] / l] : [1, 0, 0]; };

/** A root at a place in the battle's axes, mirrored along x when `facing` is −1. @param {number[]} o @param {number} facing @returns {Root} */
export const rootAt = (o, facing) => ({ o, ex: [facing, 0, 0], ey: [0, 0, -1], ez: DOWN });

/** A root turned on the ground so its y (north) points along a direction (a four-direction effect). @param {number[]} o @param {number[]} dir @returns {Root} */
export function rootToward(o, dir) {
  const y = ground(dir);
  return { o, ex: cross(y, UP), ey: y, ez: DOWN };
}

/** A root turned on the ground so its x (east) points along a direction (a projectile's flight). @param {number[]} o @param {number[]} dir @returns {Root} */
export function rootAlong(o, dir) {
  const x = ground(dir);
  return { o, ex: x, ey: cross(UP, x), ez: DOWN };
}

export { dirWorld };
