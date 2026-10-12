// The camera against the community model it comes from (Arknights-Tile-Pos, python/main.py at 523290f, MIT): the same
// tiles land on the same screen pixels, for several levels' view vectors and screen shapes. The reference projection
// is rewritten here from its matrices, independently of camera.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { applyPose, toThree, tileWorld, adapt, screenOf, DEFAULT_VIEW } from '../src/camera.js';

/** Tile-Pos: world_to_screen_pos for the normal (not side) view. @param {readonly number[]} view @param {number} w @param {number} h @param {readonly number[]} p */
function reference(view, w, h, p) {
  const ratio = h / w, t20 = Math.tan(Math.PI / 9), c = Math.cos(Math.PI / 6), s = Math.sin(Math.PI / 6);
  const t = ratio < 9 / 16 - 1e-5 ? 0 : (ratio - 9 / 16) / (3 / 4 - 9 / 16);
  const x = p[0] - view[0], y = p[1] - (view[1] - 1.4 * t), z = p[2] - (view[2] - 2.8 * t);
  const xc = x, yc = c * y - s * z, zc = -s * y - c * z;
  const nx = ((ratio / t20) * xc) / -zc, ny = ((1 / t20) * yc) / -zc;
  return [((1 + nx) / 2) * w, (1 - (1 + ny) / 2) * h];
}

/** Our camera: three.js projection of the same point. @param {readonly number[]} view @param {number} w @param {number} h @param {readonly number[]} p */
function ours(view, w, h, p) {
  const cam = new THREE.PerspectiveCamera();
  applyPose(cam, view, w / h);
  const v = new THREE.Vector3(...toThree(/** @type {[number, number, number]} */ (p))).project(cam);
  return [((1 + v.x) / 2) * w, ((1 - v.y) / 2) * h];
}

const VIEWS = [DEFAULT_VIEW, [0, -6.1, -9.76], [0, -6.6, -10.63], [-5, -9.1, -9.76]];
const SCREENS = [[1920, 1080], [1280, 720], [2400, 1080], [1600, 1200], [1440, 1080]];

test('camera: every tile of a 12 × 9 map lands on the reference pixel (±0.001 px)', () => {
  const level = { width: 12, height: 9 }, tiles = /** @type {number[][]} */ ([]);
  for (let row = 0; row < 9; row++) for (let col = 0; col < 12; col++) tiles.push([col, row, 0], [col, row, 1]);
  const cases = VIEWS.flatMap((view) => SCREENS.flatMap(([w, h]) => tiles.map(([col, row, hl]) => ({ view, w, h, col, row, hl }))));
  assert.equal(cases.length, 4 * 5 * 216);
  for (const { view, w, h, col, row, hl } of cases) {
    const p = tileWorld(level, col, row, hl), a = reference(view, w, h, p), b = ours(view, w, h, p);
    assert.ok(Math.abs(a[0] - b[0]) < 1e-3 && Math.abs(a[1] - b[1]) < 1e-3, `view ${view} ${w}×${h} tile ${col},${row},${hl}: ${a} vs ${b}`);
  }
});

test('camera: rows go up the screen, high ground stands above the ground, the centre is in view', () => {
  const level = { width: 12, height: 9 }, view = [0, -6.1, -9.76];
  const near = ours(view, 1920, 1080, tileWorld(level, 5, 0, 0)), far = ours(view, 1920, 1080, tileWorld(level, 5, 8, 0));
  assert.ok(far[1] < near[1], 'the far row is higher on the screen');
  const low = ours(view, 1920, 1080, tileWorld(level, 5, 4, 0)), high = ours(view, 1920, 1080, tileWorld(level, 5, 4, 1));
  assert.ok(high[1] < low[1], 'high ground is drawn above the same tile on the ground');
  const centre = ours(view, 1920, 1080, tileWorld(level, 5.5, 4, 0));
  assert.ok(centre[0] > 900 && centre[0] < 1020 && centre[1] > 0 && centre[1] < 1080, `${centre}`);
});

test('camera: the 16:9 → 4:3 adaptation', () => {
  assert.equal(adapt(16 / 9), 0);
  assert.equal(adapt(21 / 9), 0);
  assert.ok(Math.abs(adapt(4 / 3) - 1) < 1e-12);
  assert.ok(Math.abs(adapt(1920 / 1200) - 1 / 3) < 1e-12);
  assert.ok(Math.abs(adapt(32 / 21) - 0.5) < 1e-12);
});

test('[渲染-13] a point of the field on the canvas: the camera\'s projection in CSS pixels', () => {
  const level = { width: 12, height: 9 }, view = [0, -6.1, -9.76], cam = new THREE.PerspectiveCamera();
  applyPose(cam, view, 1600 / 900);
  for (const p of [tileWorld(level, 0, 0, 0), tileWorld(level, 11, 8, 1), tileWorld(level, 5.5, 3.25, 0)]) {
    const [x, y] = screenOf(cam, p, 1600, 900), [rx, ry] = reference(view, 1600, 900, p);
    assert.ok(Math.abs(x - rx) < 1e-3 && Math.abs(y - ry) < 1e-3, `${x},${y} vs ${rx},${ry}`);
  }
});
