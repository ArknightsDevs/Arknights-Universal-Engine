// Unity's auto layout, simplified (docs/spec/ui.md 界面-3): horizontal and vertical layout groups (padding, spacing,
// child alignment, controlling and force-expanding the children's size, reverse order), layout elements (ignored,
// minimum, preferred and flexible sizes) and content size fitters (a rect sized to its preferred size).

/** @typedef {import('./node.js').UiNode} UiNode */
/** @typedef {{ dir: string, pad: number[], spacing: number, align: number, cw: number, ch: number, fw: number, fh: number, rev: number }} Group */

/** The children a group lays out: active, not ignoring layout. @param {UiNode} s */
export const groupKids = (s) => s.kids.filter((k) => k.active && !k.n.comps.le?.ignore);

/** A child's flexible size on an axis (0 when it has none). @param {UiNode} k @param {number} ax */
const flexOf = (k, ax) => { const le = k.n.comps.le; return le?.flex && le.flex[ax] > 0 ? le.flex[ax] : 0; };

/**
 * A node's preferred size on an axis: its layout element's preferred size, a group's from its children, a text's
 * measured size, else its rect's size; at least its minimum.
 * @param {UiNode} s @param {number} ax @returns {number}
 */
export function prefSize(s, ax) {
  const le = s.n.comps.le;
  let v;
  if (le && le.pref[ax] >= 0) v = le.pref[ax];
  else if (s.n.comps.lg) v = groupPref(s, ax);
  else if (s.t) v = s.scr.ctx.measure(s)[ax];
  else v = s.rt.size[ax];
  return le && le.min[ax] >= 0 ? Math.max(v, le.min[ax]) : v;
}

/** A child's size on an axis as its group sees it. @param {Group} g @param {UiNode} k @param {number} ax */
const childSize = (g, k, ax) => ((ax === 0 ? g.cw : g.ch) ? prefSize(k, ax) : k.rt.size[ax]);

/**
 * A group's preferred size on an axis: padding plus its children along the main axis (with spacing), the largest
 * across.
 * @param {UiNode} s @param {number} ax
 */
export function groupPref(s, ax) {
  const g = /** @type {Group} */ (s.n.comps.lg), main = g.dir === 'h' ? 0 : 1, kids = groupKids(s);
  const pad = ax === 0 ? g.pad[0] + g.pad[1] : g.pad[2] + g.pad[3];
  const sz = kids.map((k) => childSize(g, k, ax));
  return pad + (ax === main ? sz.reduce((a, b) => a + b, 0) + g.spacing * Math.max(0, kids.length - 1) : (sz.length ? Math.max(...sz) : 0));
}

/**
 * The sizes of a group's children: their own or preferred sizes; the space left along the main axis shared by their
 * flexible sizes (force-expand counts as 1) when the group controls that size.
 * @param {Group} g @param {UiNode[]} kids @param {number[]} inner @param {number} main
 */
function childSizes(g, kids, inner, main) {
  const sizes = kids.map((k) => [childSize(g, k, 0), childSize(g, k, 1)]);
  let total = sizes.reduce((a, z) => a + z[main], 0) + g.spacing * Math.max(0, kids.length - 1);
  const ctrl = main === 0 ? g.cw : g.ch, force = main === 0 ? g.fw : g.fh;
  if (ctrl && kids.length && total < inner[main]) {
    const wts = kids.map((k) => Math.max(flexOf(k, main), force ? 1 : 0)), sum = wts.reduce((a, b) => a + b, 0);
    if (sum > 0) {
      const extra = inner[main] - total;
      sizes.forEach((z, i) => { z[main] += extra * wts[i] / sum; });
      total = inner[main];
    }
  }
  return { sizes, total };
}

/**
 * Places a group's children in its w × h rect: each child's `lgRect` from the group's top-left corner; children it
 * does not lay out get none.
 * @param {UiNode} s @param {number} w @param {number} h
 */
export function arrange(s, w, h) {
  const g = /** @type {Group} */ (s.n.comps.lg), main = g.dir === 'h' ? 0 : 1, cross = 1 - main;
  const kids = groupKids(s);
  if (g.rev) kids.reverse();
  const inner = [w - g.pad[0] - g.pad[1], h - g.pad[2] - g.pad[3]];
  const { sizes, total } = childSizes(g, kids, inner, main);
  const ax = g.align % 3, ay = Math.floor(g.align / 3);
  const alignMain = (main === 0 ? ax : ay) / 2, alignCross = (cross === 0 ? ax : ay) / 2;
  const ctrlCross = cross === 0 ? g.cw : g.ch, forceCross = cross === 0 ? g.fw : g.fh;
  let cur = (main === 0 ? g.pad[0] : g.pad[2]) + (inner[main] - total) * alignMain;
  kids.forEach((k, i) => {
    const z = sizes[i];
    if (ctrlCross && (forceCross || flexOf(k, cross) > 0)) z[cross] = inner[cross];
    const c0 = (cross === 0 ? g.pad[0] : g.pad[2]) + (inner[cross] - z[cross]) * alignCross;
    k.lgRect = main === 0 ? { x: cur, y: c0, w: z[0], h: z[1] } : { x: c0, y: cur, w: z[0], h: z[1] };
    cur += z[main] + g.spacing;
  });
  for (const k of s.kids) if (!kids.includes(k)) k.lgRect = null;
}
