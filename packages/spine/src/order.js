// The order a pose is updated in (docs/spec/spine.md 骨骼-11): bones before what depends on them, each constraint after
// its target and its bones' parents, the bones under a constraint again after it. Our own implementation of the Spine
// 3.8 semantics; no Spine runtime code.

/** @typedef {import('./skeleton.js').Skeleton} Skeleton */
/** @typedef {{ kind: 'bone' | 'ik' | 'transform' | 'path', index: number }} Step */
/**
 * The update order: its steps; the bones whose applied values are reset to their local values first (a constraint
 * reads them before they are updated); which bones are active (a bone a skin needs is active only with that skin) and
 * which constraints are in use (骨骼-9: the timelines of inactive bones, their slots and unused constraints do nothing).
 * @typedef {{ steps: Step[], reset: number[], active: boolean[], constraints: { ik: boolean[], transform: boolean[], path: boolean[] } }} Order
 */

/** The bones each bone is the parent of, in order. @param {Skeleton} s */
const childrenOf = (s) => {
  /** @type {number[][]} */
  const out = s.bones.map(() => []);
  s.bones.forEach((b, i) => { if (b.parent >= 0) out[b.parent].push(i); });
  return out;
};

/** The bones a path attachment's vertices follow, or null for its slot's bone. @param {Record<string, unknown>} a */
function pathBones(a) {
  if (!a.weighted) return null;
  const list = /** @type {number[]} */ (a.bones), out = [];
  for (let i = 0; i < list.length;) {
    const n = list[i++];
    for (const end = i + n; i < end; i++) out.push(list[i]);
  }
  return out;
}

/**
 * The update order of a skeleton (骨骼-11) with no skin or a named skin in use: constraints by their order — IK, then
 * transform, then path for the same order — then every bone not yet placed.
 * @param {Skeleton} s @param {number | null} [skin] index of the named skin in use
 * @returns {Order}
 */
export function updateOrder(s, skin = null) {
  const named = skin === null ? null : s.skins[skin], children = childrenOf(s);
  const sorted = s.bones.map((b) => b.skinRequired), active = sorted.map((x) => !x);
  if (named) for (const i of named.bones) for (let k = i; k >= 0; k = s.bones[k].parent) { sorted[k] = false; active[k] = true; }
  /** @type {Step[]} */
  const steps = [];
  /** @type {number[]} */
  const reset = [];
  const placed = new Set();
  /** @param {number} i */
  const bone = (i) => {
    if (sorted[i]) return;
    if (s.bones[i].parent >= 0) bone(s.bones[i].parent);
    sorted[i] = true;
    steps.push({ kind: 'bone', index: i });
    placed.add(i);
  };
  /** @param {number[]} list */
  const unsort = (list) => {
    for (const i of list) {
      if (!active[i]) continue;
      if (sorted[i]) unsort(children[i]);
      sorted[i] = false;
    }
  };
  const ctx = { s, named, active, children, steps, reset, placed, bone, unsort, sorted };
  const { ik, transform, path } = s.constraints, total = ik.length + transform.length + path.length;
  for (let order = 0; order < total; order++) {
    const i = ik.findIndex((c) => c.order === order);
    if (i >= 0) { sortIk(ctx, i); continue; }
    const t = transform.findIndex((c) => c.order === order);
    if (t >= 0) { sortTransform(ctx, t); continue; }
    const k = path.findIndex((c) => c.order === order);
    if (k >= 0) sortPath(ctx, k);
  }
  s.bones.forEach((_, i) => bone(i));
  const constraints = {
    ik: ik.map((c, i) => inUse(ctx, c, i, 'ik', c.target)), transform: transform.map((c, i) => inUse(ctx, c, i, 'transform', c.target)),
    path: path.map((c, i) => inUse(ctx, c, i, 'path', s.slots[c.target].bone)),
  };
  return { steps, reset, active, constraints };
}

/**
 * @typedef {{ s: Skeleton, named: import('./skins.js').Skin | null, active: boolean[], children: number[][], steps: Step[],
 *   reset: number[], placed: Set<number>, bone: (i: number) => void, unsort: (list: number[]) => void, sorted: boolean[] }} Ctx
 */

/** Whether a constraint is in use: its target is active and it needs no skin, or the skin in use lists it. @param {Ctx} ctx @param {{ skinRequired: boolean }} c @param {number} index @param {'ik' | 'transform' | 'path'} kind @param {number} target */
const inUse = (ctx, c, index, kind, target) => ctx.active[target] && (!c.skinRequired || (ctx.named !== null && ctx.named[kind].includes(index)));

/** @param {Ctx} ctx @param {number} index */
function sortIk(ctx, index) {
  const c = ctx.s.constraints.ik[index];
  if (!inUse(ctx, c, index, 'ik', c.target)) return;
  ctx.bone(c.target);
  const parent = c.bones[0], last = c.bones[c.bones.length - 1];
  ctx.bone(parent);
  if (c.bones.length > 1 && !ctx.placed.has(last)) ctx.reset.push(last);
  ctx.steps.push({ kind: 'ik', index });
  ctx.unsort(ctx.children[parent]);
  ctx.sorted[last] = true;
}

/** @param {Ctx} ctx @param {number} index */
function sortTransform(ctx, index) {
  const c = ctx.s.constraints.transform[index];
  if (!inUse(ctx, c, index, 'transform', c.target)) return;
  ctx.bone(c.target);
  for (const b of c.bones) {
    if (!c.local) { ctx.bone(b); continue; }
    ctx.bone(ctx.s.bones[b].parent);
    if (!ctx.placed.has(b)) ctx.reset.push(b);
  }
  ctx.steps.push({ kind: 'transform', index });
  for (const b of c.bones) ctx.unsort(ctx.children[b]);
  for (const b of c.bones) ctx.sorted[b] = true;
}

/**
 * A path constraint follows the bones of every path attachment its slot can show: in the skin in use, the default
 * skin, then every skin.
 * @param {Ctx} ctx @param {number} index
 */
function sortPath(ctx, index) {
  const c = ctx.s.constraints.path[index], slotBone = ctx.s.slots[c.target].bone;
  if (!inUse(ctx, c, index, 'path', slotBone)) return;
  const def = ctx.s.skins.find((k) => k.name === 'default') ?? null;
  for (const skin of [ctx.named, def === ctx.named ? null : def, ...ctx.s.skins]) {
    if (skin === null) continue;
    for (const a of skin.attachments) {
      if (a.slot !== c.target || a.attachment.type !== 'path') continue;
      const bones = pathBones(a.attachment);
      if (bones === null) ctx.bone(slotBone);
      else bones.forEach(ctx.bone);
    }
  }
  for (const b of c.bones) ctx.bone(b);
  ctx.steps.push({ kind: 'path', index });
  for (const b of c.bones) ctx.unsort(ctx.children[b]);
  for (const b of c.bones) ctx.sorted[b] = true;
}
