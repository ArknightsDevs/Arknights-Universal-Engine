// Clip curves and playback (docs/spec/ui.md 界面-5).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evalKeys, applyCurve, spriteAt, copyRect, DEF_RT } from '../src/index.js';

/** A node's animated state. */
const state = () => ({ rt: copyRect(DEF_RT), lp: null, alpha: 1, color: [1, 1, 1, 1], active: true, gEnabled: true, fill: 1, sprite: /** @type {string | null} */ ('a') });

test('[界面-5] Hermite keys: ends held, the midpoint of a flat-tangent segment halfway, a step holds', () => {
  /** @type {[number, number, number, number][]} */
  const k = [[0, 0, 0, 0], [1, 10, 0, 0]];
  assert.equal(evalKeys(k, -1), 0);
  assert.equal(evalKeys(k, 2), 10);
  assert.equal(evalKeys(k, 0.5), 5);
  assert.ok(Math.abs(/** @type {number} */ (evalKeys(k, 0.25)) - 1.5625) < 1e-12);
  /** @type {[number, number, number, number][]} */
  const step = [[0, 0, 0, 1e30], [1, 10, 0, 0]];
  assert.equal(evalKeys(step, 0.9), 0);
  /** @type {[number, number, number, number][]} */
  const lin = [[0, 0, 10, 10], [1, 10, 10, 10], [2, 0, 0, 0]];
  assert.ok(Math.abs(/** @type {number} */ (evalKeys(lin, 0.5)) - 5) < 1e-12);
  assert.equal(evalKeys([], 0), null);
  /** @type {[number, number[], number[], number[]][]} */
  const v = [[0, [0, 2, 4], [0, 0, 0], [0, 0, 0]], [2, [2, 2, 0], [0, 0, 0], [0, 0, 0]]];
  assert.deepEqual(evalKeys(v, 1), [1, 2, 2]);
});

test('[界面-5] the properties a curve sets', () => {
  const s = state();
  /** @param {string} attr @param {number} v */
  const f = (attr, v) => applyCurve(s, { kind: 'float', path: '', attr, keys: [[0, v, 0, 0]] }, 0);
  f('m_AnchoredPosition.x', 3); f('m_SizeDelta.y', 4); f('m_AnchorMin.x', 0.1); f('m_AnchorMax.y', 0.9); f('m_Pivot.x', 0); f('m_LocalScale.y', 2);
  f('m_LocalScale.z', 7); f('localEulerAnglesRaw.z', 45); f('localEulerAnglesRaw.x', 9); f('m_LocalPosition.x', 11); f('m_LocalPosition.z', 5);
  assert.deepEqual(s.rt, { amin: [0.1, 0.5], amax: [0.5, 0.9], pos: [3, 0], size: [100, 4], pivot: [0, 0.5], scale: [1, 2], rotz: 45 });
  assert.deepEqual(s.lp, [11, null]);
  f('m_Alpha', 0.25); f('m_Color.g', 0.5); f('m_Color.a', 0.75); f('m_IsActive', 0); f('m_Enabled', 0); f('m_FillAmount', 0.3); f('m_Unknown', 1);
  assert.deepEqual([s.alpha, s.color, s.active, s.gEnabled, s.fill], [0.25, [1, 0.5, 1, 0.75], false, false, 0.3]);
  applyCurve(s, { kind: 'position', path: '', keys: [[0, [7, 8, 0], [0, 0, 0], [0, 0, 0]]] }, 0);
  applyCurve(s, { kind: 'scale', path: '', keys: [[0, [3, 4, 1], [0, 0, 0], [0, 0, 0]]] }, 0);
  applyCurve(s, { kind: 'euler', path: '', keys: [[0, [0, 0, 30], [0, 0, 0], [0, 0, 0]]] }, 0);
  assert.deepEqual([s.lp, s.rt.scale, s.rt.rotz], [[7, 8], [3, 4], 30]);
  applyCurve(s, { kind: 'sprite', path: '', attr: 'm_Sprite', keys: [[0, 'x'], [0.5, 'y'], [1, null]] }, 0.7);
  assert.equal(s.sprite, 'y');
  applyCurve(s, { kind: 'float', path: '', attr: 'm_Alpha', keys: [] }, 0);
  assert.equal(s.alpha, 0.25);
  assert.equal(spriteAt([], 1), null);
});
