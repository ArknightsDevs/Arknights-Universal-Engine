// An effect renderer's triangles in the world (docs/spec/render.md 渲染-10), drawn by the particle shaders' rule: a
// distortion moves the main and dissolve UVs by (noise − anchor) × strength (× the weight texture's rg) × K; colour =
// texture × colour (× a multiply texture), each channel at most 1; alpha = texture alpha × colour alpha, times the
// dissolve's clamp((noise − amount) / border) (all of it at amount 0); written premultiplied, added or blended over.
// Textures and colours are used as they are (no colour-space conversion), as the effects were made.
import * as THREE from 'three';

const VERTEX = `attribute vec2 uvMain; attribute vec2 uvDiss; attribute vec4 uvAux; attribute vec4 tint; attribute vec4 ds;
varying vec2 vUv; varying vec2 vDv; varying vec4 vXv; varying vec4 vCol; varying vec4 vDs;
void main() {
  vUv = uvMain; vDv = uvDiss; vXv = uvAux; vCol = tint; vDs = ds;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const FRAGMENT = `uniform sampler2D uMain; uniform sampler2D uDiss; uniform sampler2D uDist; uniform sampler2D uAux;
uniform vec4 uMode; uniform vec4 uK; uniform vec2 uA;
varying vec2 vUv; varying vec2 vDv; varying vec4 vXv; varying vec4 vCol; varying vec4 vDs;
void main() {
  vec2 uv = vUv, dv = vDv;
  if (uMode.y > 0.5) {
    vec2 o = (texture2D(uDist, vXv.xy).r - uA) * vDs.zw;
    if (uMode.z > 0.5 && uMode.z < 1.5) o *= texture2D(uAux, vXv.zw).rg;
    uv += o * uK.xy; dv += o * uK.zw;
  }
  vec4 t = texture2D(uMain, uv);
  vec3 c = (t.a > 0.0 ? t.rgb / t.a : vec3(0.0)) * vCol.rgb;
  float a = t.a * vCol.a;
  if (uMode.z > 1.5) { vec4 m = texture2D(uAux, vXv.zw); c *= m.rgb; if (uMode.z > 2.5) a *= m.r; }
  a = clamp(a, 0.0, 1.0);
  if (uMode.x > 0.5) a *= clamp((texture2D(uDiss, dv).r - vDs.x + (vDs.x <= 0.0 ? vDs.y : 0.0)) / vDs.y, 0.0, 1.0);
  gl_FragColor = vec4(min(c, vec3(1.0)) * a, a);
}`;

const WHITE = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
WHITE.needsUpdate = true;

/**
 * The material of a renderer's data by the shaders' rule (its textures from `tex`; a white texel for those it lacks).
 * @param {any} d @param {Map<string, THREE.Texture>} tex
 */
export function fxMaterial(d, tex) {
  const { D, X, W, U } = fxTextures(d, tex), K = d.dist ? d.dist.K : [0, 0, 0, 0], add = d.blend === 'add';
  return new THREE.ShaderMaterial({
    vertexShader: VERTEX, fragmentShader: FRAGMENT, transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: add ? THREE.OneFactor : THREE.OneMinusSrcAlphaFactor,
    uniforms: {
      uMain: { value: tex.get(d.tex) ?? WHITE }, uDiss: { value: D || WHITE }, uDist: { value: X || WHITE }, uAux: { value: W || U || WHITE },
      uMode: { value: new THREE.Vector4(D ? 1 : 0, X ? 1 : 0, W ? 1 : U ? (d.mul.a ? 3 : 2) : 0, 0) },
      uK: { value: new THREE.Vector4(K[0], K[1], K[2], K[3]) }, uA: { value: new THREE.Vector2(...((d.dist && d.dist.A) || [0, 0])) },
    },
  });
}

/** A renderer's dissolve, distortion, weight and multiply textures, where it has them. @param {any} d @param {Map<string, THREE.Texture>} tex */
function fxTextures(d, tex) {
  const get = (/** @type {string | undefined} */ k) => (k ? tex.get(k) : undefined);
  return { D: get(d.diss?.tex), X: get(d.dist?.tex), W: d.dist ? get(d.dist.wt) : undefined, U: get(d.mul?.tex) };
}

/** Floats a vertex: position 3, main uv 2, dissolve uv 2, distortion + weight / multiply uv 4, colour 4, dissolve and distortion 4. */
const LAYOUT = /** @type {const} */ ([['position', 3], ['uvMain', 2], ['uvDiss', 2], ['uvAux', 4], ['tint', 4], ['ds', 4]]);

/** One renderer's triangles, rebuilt each frame: begin, vertices and triangles, end. */
export class FxBatch {
  /** @param {THREE.Material} material */
  constructor(material) {
    this.geometry = new THREE.BufferGeometry();
    this.mesh = new THREE.Mesh(this.geometry, material);
    this.mesh.frustumCulled = false;
    this.cap = 0; this.icap = 0; this.n = 0; this.ni = 0;
    /** @type {Record<string, Float32Array>} */
    this.a = {};
    this.index = new Uint32Array(0);
    this.grow(64, 96);
  }

  /** @param {number} nv @param {number} ni */
  grow(nv, ni) {
    if (nv > this.cap) {
      this.cap = Math.max(nv, this.cap * 2);
      for (const [k, s] of LAYOUT) {
        const x = new Float32Array(this.cap * s);
        if (this.a[k]) x.set(this.a[k]);
        this.a[k] = x;
        this.geometry.setAttribute(k, new THREE.BufferAttribute(x, s).setUsage(THREE.DynamicDrawUsage));
      }
    }
    if (ni > this.icap) {
      this.icap = Math.max(ni, this.icap * 2);
      const x = new Uint32Array(this.icap);
      x.set(this.index);
      this.index = x;
      this.geometry.setIndex(new THREE.BufferAttribute(x, 1).setUsage(THREE.DynamicDrawUsage));
    }
  }

  begin() { this.n = 0; this.ni = 0; }

  /** Room for nv more vertices and ni more indices. @param {number} nv @param {number} ni */
  room(nv, ni) { this.grow(this.n + nv, this.ni + ni); return true; }

  /**
   * A vertex: world position P, its coordinates U (uvs()), colour C, S = dissolve amount, border, distortion strength u v.
   * @param {number[]} P @param {number[]} U @param {number[]} C @param {number[]} S
   */
  vert(P, U, C, S) {
    const i = this.n, a = this.a;
    a.position.set(P, i * 3); a.uvMain[i * 2] = U[0]; a.uvMain[i * 2 + 1] = U[1]; a.uvDiss[i * 2] = U[2]; a.uvDiss[i * 2 + 1] = U[3];
    for (let k = 0; k < 4; k++) { a.uvAux[i * 4 + k] = U[4 + k]; a.tint[i * 4 + k] = C[k]; a.ds[i * 4 + k] = S[k]; }
    return this.n++;
  }

  /** @param {number} x @param {number} y @param {number} z */
  tri(x, y, z) { const I = this.index; I[this.ni++] = x; I[this.ni++] = y; I[this.ni++] = z; }

  end() {
    for (const [k] of LAYOUT) this.geometry.getAttribute(k).needsUpdate = true;
    /** @type {THREE.BufferAttribute} */ (this.geometry.getIndex()).needsUpdate = true;
    this.geometry.setDrawRange(0, this.ni);
    this.mesh.visible = this.ni > 0;
  }

  dispose() { this.geometry.dispose(); }
}

/** @typedef {{ o: number[], ex: number[], ey: number[], ez: number[] }} Root an effect's place: origin and its axes in the world */

/** An effect-space point in the world. @param {Root} R @param {number[]} v */
export const toWorld = (R, v) => [0, 1, 2].map((i) => R.o[i] + R.ex[i] * v[0] + R.ey[i] * v[1] + R.ez[i] * v[2]);
/** An effect-space direction in the world. @param {Root} R @param {number[]} v */
export const dirWorld = (R, v) => [0, 1, 2].map((i) => R.ex[i] * v[0] + R.ey[i] * v[1] + R.ez[i] * v[2]);

/** @param {number[]} a @param {number[]} b */
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/** @param {number[]} a */
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]); return l > 1e-9 ? a.map((v) => v / l) : null; };

/**
 * A strip through world points P with u along it (U), widths W (tiles) and colours C, turned to face the camera; its v
 * across (1 on one side, 0 on the other). @param {FxBatch} b @param {{ P: number[][], U: number[], W: number[], C: number[][] }} s
 * @param {(u: number, v: number) => number[]} uv the coordinates of (u, v) @param {number[]} S @param {number[]} view the camera's forward
 */
export function strip(b, s, uv, S, view) {
  const { P, U, W, C } = s, L = P.length;
  if (L < 2 || !b.room(L * 2, (L - 1) * 6)) return;
  const base = b.n;
  for (let i = 0; i < L; i++) {
    const t = P[Math.min(L - 1, i + 1)].map((v, k) => v - P[Math.max(0, i - 1)][k]), side = norm(cross(t, view)) || [0, 1, 0], w = W[i] / 2;
    b.vert(P[i].map((v, k) => v - side[k] * w), uv(U[i], 1), C[i], S);
    b.vert(P[i].map((v, k) => v + side[k] * w), uv(U[i], 0), C[i], S);
  }
  for (let i = 0; i < L - 1; i++) { const a = base + i * 2; b.tri(a, a + 1, a + 2); b.tri(a + 1, a + 3, a + 2); }
}

/**
 * A quad at world centre c with half axes a (the texture's u) and b (its v, up), a sheet cell (f of tx × ty).
 * @param {FxBatch} bt @param {{ c: number[], a: number[], b: number[] }} q @param {{ f: number, tx: number, ty: number }} cell
 * @param {(u: number, v: number) => number[]} uv @param {{ C: number[], S: number[] }} k
 */
export function quad(bt, q, cell, uv, k) {
  if (!bt.room(4, 6)) return;
  const col = cell.f % cell.tx, row = Math.floor(cell.f / cell.tx), base = bt.n;
  for (const [du, dv] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const u = (col + (du + 1) / 2) / cell.tx, v = (cell.ty - 1 - row + (dv + 1) / 2) / cell.ty;
    bt.vert(q.c.map((x, i) => x + du * q.a[i] + dv * q.b[i]), uv(u, v), k.C, k.S);
  }
  bt.tri(base, base + 1, base + 2); bt.tri(base + 1, base + 3, base + 2);
}

/**
 * A particle's half axes in the world: a billboard (turned by its rotation; mirrored with its root), stretched along its
 * velocity on the screen, or lying in its system's plane. @param {any} p the system's data @param {any} q the particle
 * @param {{ R: Root, M: number[], size: number, sizeY: number }} s @param {{ right: number[], up: number[], view: number[] }} cam
 * @returns {{ c: number[], a: number[], b: number[] }}
 */
export function particleAxes(p, q, s, cam) {
  const R = s.R, c = toWorld(R, [q.x, q.y, q.z]);
  if (p.render.mode === 1) {
    const vw = dirWorld(R, [q.svx || 0, q.svy || 0, q.svz || 0]), d = vw.map((v, i) => v - cam.view[i] * (vw[0] * cam.view[0] + vw[1] * cam.view[1] + vw[2] * cam.view[2]));
    const dir = norm(d);
    if (dir) {
      const len = s.size * (p.render.lengthScale || 1) + Math.hypot(vw[0], vw[1], vw[2]) * (p.render.velScale || 0), side = norm(cross(cam.view, dir)) || cam.up;
      return { c: c.map((v, i) => v - (dir[i] * len) / 2), a: dir.map((v) => (v * len) / 2), b: side.map((v) => (v * s.size) / 2) };
    }
  }
  const co = Math.cos(q.rot), si = Math.sin(q.rot);
  if (p.render.align === 2) {
    const M = s.M, ux = dirWorld(R, rotM(M, [(co * s.size) / 2, (-si * s.size) / 2, 0])), vy = dirWorld(R, rotM(M, [(si * s.sizeY) / 2, (co * s.sizeY) / 2, 0]));
    return { c, a: ux, b: vy };
  }
  const mir = R.ex[0] < 0 ? -1 : 1, th = -q.rot * mir, ct = Math.cos(th), st = Math.sin(th);
  return { c, a: cam.right.map((v, i) => (v * ct + cam.up[i] * st) * (s.size / 2)), b: cam.right.map((v, i) => (-v * st + cam.up[i] * ct) * (s.sizeY / 2)) };
}

/** @param {number[]} M @param {number[]} v */
const rotM = (M, v) => [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2], M[6] * v[0] + M[7] * v[1] + M[8] * v[2]];
