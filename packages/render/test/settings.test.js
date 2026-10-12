// The player's picture settings (docs/spec/render.md 渲染-15): the canvas's pixel ratio from the device's and the 清晰度.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pixelRatioOf } from '../src/renderer.js';

test('[渲染-15] the pixel ratio is the device’s times the 清晰度, held to 0.25…2; 1 for an unknown device', () => {
  assert.deepEqual([pixelRatioOf(2, 1), pixelRatioOf(2, 0.5), pixelRatioOf(1.5, 0.75), pixelRatioOf(undefined, 1), pixelRatioOf(0, 0.5)], [2, 1, 1.125, 1, 0.5]);
  assert.deepEqual([pixelRatioOf(2, 0.1), pixelRatioOf(2, 3), pixelRatioOf(2, Number.NaN)], [0.5, 4, 2], 'below, above, not a number');
});
