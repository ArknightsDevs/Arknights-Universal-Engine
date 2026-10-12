// @aue/render: the three.js battle renderer (ADR 0025–0028): the official camera, textured terrain, units as Spine
// figures (or cards where no model is loaded).
export { createBattleRenderer, loadTextures, loadSpineModels } from './renderer.js';
export { createFigure, figureArrays, blendFactors, spineModel, SKELETON_SCALE } from './spine.js';
export { animationRoles, roleOf, operatorFacing, enemyFacing } from './roles.js';
export { barsOf, BAR } from './overlays.js';
export { cameraPose, applyPose, toThree, tileWorld, adapt, DEFAULT_VIEW, FOV, STEP_HEIGHT } from './camera.js';
export { tileKeys } from './terrain.js';
export { unitTextureKey } from './units.js';
export { SHADOW } from './shadows.js';
