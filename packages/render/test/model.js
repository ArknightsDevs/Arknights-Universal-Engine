// A tiny Spine model built as data, for tests: one bone, a 100 × 200 region, and animations Idle (1 s), Move (1 s),
// Attack (0.5 s, OnAttack at 0.25 s), Start (0.4 s) and Die (0.6 s).
import * as THREE from 'three';

/** @param {string} name @param {number} duration @param {number[]} [hits] OnAttack times */
const anim = (name, duration, hits = []) => ({ name, duration, timelines: [], drawOrder: [], events: hits.map((time) => ({ time, event: 0, int: 0, float: 0, string: null })) });

/** @returns {import('../src/spine.js').SpineModel} */
export function tinyModel() {
  const bone = { name: 'root', parent: -1, rotation: 0, x: 0, y: 0, scaleX: 1, scaleY: 1, shearX: 0, shearY: 0, length: 0, transform: 0, skinRequired: false, color: 0 };
  const region = { name: 'r', type: 'region', path: 'r', x: 0, y: 100, rotation: 0, scaleX: 1, scaleY: 1, width: 100, height: 200, color: -1 };
  const skeleton = /** @type {any} */ ({
    hash: '', version: '3.8.99', x: 0, y: 0, width: 0, height: 0, nonessential: null, bones: [bone], slots: [{ name: 's', bone: 0, color: -1, dark: -1, attachment: 'r', blend: 0 }],
    constraints: { ik: [], transform: [], path: [] }, skins: [{ name: 'default', bones: [], ik: [], transform: [], path: [], attachments: [{ slot: 0, key: 'r', attachment: region }] }],
    events: [{ name: 'OnAttack', int: 0, float: 0, string: null, audio: null, volume: 1, balance: 0 }],
    animations: [anim('Idle', 1), anim('Move', 1), anim('Attack', 0.5, [0.25]), anim('Start', 0.4), anim('Die', 0.6)],
  });
  const atlas = { pages: [{ name: 'p.png', width: 128, height: 256 }], regions: [{ name: 'r', page: 0, x: 0, y: 0, width: 100, height: 200, degrees: 0, originalWidth: 100, originalHeight: 200, offsetX: 0, offsetY: 0, index: -1 }] };
  return { skeleton, atlas, textures: [new THREE.Texture()], pma: true };
}

/** The tiny model with its animations in two forms (A_Idle, A_Move, A_Attack 0.5 s, A_Die …, B_Idle …). @returns {import('../src/spine.js').SpineModel} */
export function formsModel() {
  const m = tinyModel(), base = /** @type {any} */ (m.skeleton).animations.filter((/** @type {any} */ a) => a.name !== 'Start');
  /** @type {any} */ (m.skeleton).animations = ['A', 'B'].flatMap((l) => base.map((/** @type {any} */ a) => ({ ...a, name: `${l}_${a.name}` })));
  return m;
}

/**
 * The tiny model of a 傀儡师 (渲染-24): its own clips, its 替身's (Doll_Idle, Doll_Attack 0.5 s, Doll_Die) and the
 * switches (Doll_SwitchIn 0.4 s, Doll_SwitchOut 0.4 s). @returns {import('../src/spine.js').SpineModel}
 */
export function dollModel() {
  const m = tinyModel(), base = /** @type {any} */ (m.skeleton).animations, of = (/** @type {string} */ n) => base.find((/** @type {any} */ a) => a.name === n);
  /** @type {any} */ (m.skeleton).animations = [...base, ...['Idle', 'Attack', 'Die'].map((n) => ({ ...of(n), name: `Doll_${n}` })),
    { ...of('Start'), name: 'Doll_SwitchIn' }, { ...of('Start'), name: 'Doll_SwitchOut' }];
  return m;
}
