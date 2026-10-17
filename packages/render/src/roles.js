// Which animation a figure plays (docs/spec/render.md 渲染-3, 渲染-4): the animations of a model by role — idle, move,
// attack, die, start — found by their names; what a unit is doing picks the role; its facing picks the model's side
// and whether it is mirrored.
import { ANIM, DIR } from '@aue/schema';

/** @typedef {{ idle: string, move: string, attack: string, die: string | null, start: string | null }} Roles */

/** A name ending in _Begin, _Start or _End. @param {string} n */
const isEdge = (n) => /_(begin|start|end)$/i.test(n);

/**
 * The animations of a model by role (渲染-3): exact names first (any case), then the first name in order that looks
 * like the role (an attack is not a die); a role with nothing of its own plays idle (die and start may have none).
 * @param {string[]} names @returns {Roles}
 */
export function animationRoles(names) {
  const find = (/** @type {string} */ n) => names.find((x) => x.toLowerCase() === n.toLowerCase()) ?? null;
  const like = (/** @type {RegExp} */ re, /** @type {(n: string) => boolean} */ ok = () => true) => names.find((n) => re.test(n) && ok(n)) ?? null;
  const plain = (/** @type {string} */ n) => !isEdge(n) && !/down|skill/i.test(n);
  const idle = find('Idle') ?? like(/(^|_)idle/i, plain) ?? find('Default') ?? names[0] ?? '';
  return {
    idle,
    move: find('Move_Loop') ?? find('Move') ?? like(/^move/i, plain) ?? idle,
    attack: find('Attack') ?? find('Attack_Loop') ?? find('Combat') ?? like(/^attack/i, (n) => plain(n) && !/die/i.test(n)) ?? idle,
    die: dieOf(find, like),
    start: find('Start'),
  };
}

/**
 * The animations of a model by role for each of its forms (渲染-3): a model whose animations come in sets named by a
 * letter (A_Idle, A_Attack …, B_Idle …) has one form a letter, in letter order, each found among its own set as above;
 * any other model has one form.
 * @param {string[]} names @returns {Roles[]}
 */
export function formRoles(names) {
  const letters = [...new Set(names.map((n) => /^([A-Z])_/.exec(n)?.[1] ?? ''))].sort();
  if (letters.length < 2 || letters.includes('')) return [animationRoles(names)];
  return letters.map((l) => {
    const r = animationRoles(names.filter((n) => n.startsWith(`${l}_`)).map((n) => n.slice(2)));
    const own = (/** @type {string | null} */ n) => (n ? `${l}_${n}` : n);
    return { idle: own(r.idle) ?? '', move: own(r.move) ?? '', attack: own(r.attack) ?? '', die: own(r.die), start: own(r.start) };
  });
}

/**
 * The die animation: Die, else the first ending in Die that is not an attack, else the first with die in its name.
 * @param {(n: string) => string | null} find @param {(re: RegExp, ok?: (n: string) => boolean) => string | null} like
 */
const dieOf = (find, like) => find('Die') ?? like(/(^|_)die$/i, (n) => !/^attack/i.test(n)) ?? like(/die/i);

/** The role of what a unit is doing (渲染-3). @param {number} anim @returns {'idle' | 'move' | 'attack' | 'die'} */
export const roleOf = (anim) => (anim === ANIM.MOVE ? 'move' : anim === ANIM.ATTACK ? 'attack' : anim === ANIM.DIE ? 'die' : 'idle');

/**
 * The side of the model and the mirroring for an operator's facing (渲染-4): the back when facing up (when the model
 * has one, and not to die when the back has no die), mirrored when facing left.
 * @param {number} dir @param {{ back: boolean, backDies: boolean, dying: boolean }} m @returns {{ side: 'front' | 'back', flip: boolean }}
 */
export const operatorFacing = (dir, m) => ({ side: dir === DIR.UP && m.back && (m.backDies || !m.dying) ? 'back' : 'front', flip: dir === DIR.LEFT });

/**
 * An enemy's mirroring (渲染-4): facing left after moving left, right after moving right, unchanged otherwise.
 * @param {boolean} left the facing so far @param {number} dx the move since the last frame
 */
export const enemyFacing = (left, dx) => (dx < -1e-9 ? true : dx > 1e-9 ? false : left);
