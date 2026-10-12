// The battle camera (ADR 0026): the community model of the official camera (Arknights-Tile-Pos, MIT) — perspective,
// vertical field of view 40°, tilted 30°, placed at the level's view vector; screens taller than 16:9 pull it back by
// (0, −1.4, −2.8) per unit of the 16:9 → 4:3 shift.
//
// Coordinates. The level's world (as the community model writes it): x east, y north, z down (high ground at
// z = −0.4); a tile (col, row) sits at x = col − (w − 1) / 2, y = row − (h − 1) / 2 (row 0 the nearest). three.js is
// right-handed with y up, so a point (x, y, z) of the level's world is (x, −z, −y) in three.js.

import * as THREE from 'three';

export const FOV = 40, NEAR = 0.3, FAR = 1000;
/** Height of high ground, in tiles, when the map theme gives none (渲染-7). */
export const STEP_HEIGHT = 0.4;
/** The default view vector (cameraView 0), for levels without their own. */
export const DEFAULT_VIEW = Object.freeze([0, -4.81, -7.76]);

const TILT = Math.PI / 6;
const COS = Math.cos(TILT), SIN = Math.sin(TILT);

/** @typedef {[number, number, number]} Vec3 */

/** A point of the level's world in three.js coordinates. @param {Vec3} p @returns {Vec3} */
export const toThree = ([x, y, z]) => [x, -z, -y];

/**
 * The level-world position of a tile's centre at a height level (0 ground, 1 high ground); high ground is the map
 * theme's `highland` height, else STEP_HEIGHT.
 * @param {{ width: number, height: number, highland?: number }} level @param {number} col @param {number} row @param {number} heightLevel
 * @returns {Vec3}
 */
export function tileWorld(level, col, row, heightLevel) {
  return [col - (level.width - 1) / 2, row - (level.height - 1) / 2, -(level.highland ?? STEP_HEIGHT) * heightLevel];
}

/**
 * Where a point of the level's world lands on a canvas of w × h CSS pixels through a camera (渲染-13): x from the left,
 * y from the top.
 * @param {THREE.Camera} camera @param {Vec3} p @param {number} w @param {number} h @returns {[number, number]}
 */
export function screenOf(camera, p, w, h) {
  const v = new THREE.Vector3(...toThree(p)).project(camera);
  return [((1 + v.x) / 2) * w, ((1 - v.y) / 2) * h];
}

/** How far the screen is from 16:9 towards 4:3 (0 at 16:9 or wider). @param {number} aspect width / height */
export function adapt(aspect) {
  const ratio = 1 / aspect, from = 9 / 16, to = 3 / 4;
  return ratio < from - 1e-5 ? 0 : (ratio - from) / (to - from);
}

/**
 * The camera's pose in three.js coordinates for a view vector and a screen aspect.
 * @param {readonly number[]} view the level's view vector [x, y, z] @param {number} aspect width / height
 * @returns {{ position: Vec3, target: Vec3, up: Vec3, fov: number, near: number, far: number }}
 */
export function cameraPose(view, aspect) {
  const t = adapt(aspect);
  const eye = toThree([view[0], view[1] - 1.4 * t, view[2] - 2.8 * t]);
  // forward (0, sin, cos) and up (0, cos, −sin) in the level's world, turned into three.js coordinates
  const forward = toThree([0, SIN, COS]), up = toThree([0, COS, -SIN]);
  return { position: eye, target: [eye[0] + forward[0], eye[1] + forward[1], eye[2] + forward[2]], up, fov: FOV, near: NEAR, far: FAR };
}

/**
 * Puts a three.js PerspectiveCamera in the pose.
 * @param {{ position: { set(x: number, y: number, z: number): void }, up: { set(x: number, y: number, z: number): void }, lookAt(x: number, y: number, z: number): void, fov: number, near: number, far: number, aspect: number, updateProjectionMatrix(): void, updateMatrixWorld(): void }} camera
 * @param {readonly number[]} view @param {number} aspect
 */
export function applyPose(camera, view, aspect) {
  const p = cameraPose(view, aspect);
  camera.fov = p.fov; camera.near = p.near; camera.far = p.far; camera.aspect = aspect;
  camera.position.set(...p.position);
  camera.up.set(...p.up);
  camera.lookAt(...p.target);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
}
