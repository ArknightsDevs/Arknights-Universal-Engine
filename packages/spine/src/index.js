// @aue/spine: Spine 3.8: reading, animation, meshes (no GPU) (docs/spec/spine.md): the binary skeleton reader and the
// animation times the battle needs; the atlas; poses — animations applied, constraints, world vertices and UVs; what a
// pose draws (batches by page and blend mode, clipping).
export { BinaryReader } from './binary.js';
export { readSkeleton, animationTimes, isReadable } from './skeleton.js';
export { ATTACHMENT_TYPES } from './skins.js';
export { CURVE } from './animation.js';
export { readAtlas, regionOf } from './atlas.js';
export { TRANSFORM, newPose, setupPose, updateBone } from './pose.js';
export { applyAnimation, eventsBetween } from './apply.js';
export { updateOrder } from './order.js';
export { updateWorld } from './world.js';
export { findAttachment, worldVertices, regionCorners, regionWorld, regionUVs, meshUVs, vertexCount } from './vertices.js';
export { drawList, colorsOf } from './draw.js';
/** @typedef {import('./skeleton.js').Skeleton} Skeleton @typedef {import('./atlas.js').Atlas} Atlas @typedef {import('./draw.js').Batch} Batch */
