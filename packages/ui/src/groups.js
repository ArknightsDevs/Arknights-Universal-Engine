// Unity's auto layout, simplified (docs/spec/ui.md 界面-3): horizontal and vertical layout groups (padding, spacing,
// child alignment, controlling and force-expanding the children's size, reverse order), grid layout groups (fixed cells
// row by row from the upper left), layout elements (ignored,
// minimum, preferred and flexible sizes) and content size fitters (a rect sized to its preferred size).

/** @typedef {import('./node.js').UiNode} UiNode */
/** @typedef {{ dir: string, pad: number[], spacing: number, align: number, cw: number, ch: number, fw: number, fh: number, rev: number }} Group */

/** The children a group lays out: active, not ignoring layout (nor placed freely by the page). @param {UiNode} s */
export const groupKids = (s) => s.kids.filter((k) => k.active && !k.free && !k.n.comps.le?.ignore);

/** A child's flexible size on an axis (0 when it has none). @param {UiNode} k @param {number} ax */
const flexOf = (k, ax) => { const le = k.n.comps.le; return le?.flex && le.flex[ax] > 0 ? le.flex[ax] : 0; };

/**
 * A node's preferred size on an axis: its layout element's preferred size, a group's from its children, a text's
 * measured size, else its rect's size; at least its minimum.
 * @param {UiNode} s @param {number} ax @returns {number}
 */
export function prefSize(s, ax) {
  const le = s.n.comps.le, over = s.prefOver?.[ax];
  let v;
  if (over != null) v = over;
  else if (le && le.pref[ax] >= 0) v = le.pref[ax];
  else if (s.n.comps.lg) v = groupPref(s, ax);
  else if (s.n.comps.grid) v = gridPref(s, ax);
  else if (s.t) v = s.scr.ctx.measure(s)[ax];
  else v = s.rt.size[ax];
  return le && le.min[ax] >= 0 ? Math.max(v, le.min[ax]) : v;
}

/** A child's size on an axis as its group sees it. @param {Group} g @param {UiNode} k @param {number} ax */
const childSize = (g, k, ax) => ((ax === 0 ? g.cw : g.ch) ? prefSize(k, ax) : k.rt.size[ax]);

/**
 * A node's minimum size on an axis: its layout element's minimum, a group's from its children (padding, spacing, the
 * children's minimums where it controls their size, else their sizes), else none.
 * @param {UiNode} s @param {number} ax @returns {number}
 */
export function minSize(s, ax) {
  const le = s.n.comps.le, g = /** @type {Group | undefined} */ (s.n.comps.lg);
  if (le && le.min[ax] >= 0) return le.min[ax];
  if (!g) return 0;
  const main = g.dir === 'h' ? 0 : 1, kids = groupKids(s), ctrl = ax === 0 ? g.cw : g.ch;
  const pad = ax === 0 ? g.pad[0] + g.pad[1] : g.pad[2] + g.pad[3];
  const sz = kids.map((k) => (ctrl ? minSize(k, ax) : k.rt.size[ax]));
  return pad + (ax === main ? sz.reduce((a, b) => a + b, 0) + g.spacing * Math.max(0, kids.length - 1) : (sz.length ? Math.max(...sz) : 0));
}

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
 * The sizes of a group's children: their own or preferred sizes; when the group controls the size along the main
 * axis, the space left shared by their flexible sizes (force-expand counts as 1), or, short of space, each between its
 * minimum and preferred size by the same share (Unity's LayoutGroup).
 * @param {Group} g @param {UiNode[]} kids @param {number[]} inner @param {number} main
 */
function childSizes(g, kids, inner, main) {
  const sizes = kids.map((k) => [childSize(g, k, 0), childSize(g, k, 1)]);
  const gaps = g.spacing * Math.max(0, kids.length - 1);
  let total = sizes.reduce((a, z) => a + z[main], 0) + gaps;
  const ctrl = main === 0 ? g.cw : g.ch, force = main === 0 ? g.fw : g.fh;
  if (ctrl && kids.length && total > inner[main] + 1e-6) {
    const mins = kids.map((k, i) => Math.min(minSize(k, main), sizes[i][main])), least = mins.reduce((a, b) => a + b, 0) + gaps;
    const t = total > least ? Math.max(0, Math.min(1, (inner[main] - least) / (total - least))) : 0;
    sizes.forEach((z, i) => { z[main] = mins[i] + (z[main] - mins[i]) * t; });
    total = sizes.reduce((a, z) => a + z[main], 0) + gaps;
  } else if (ctrl && kids.length && total < inner[main]) {
    const wts = kids.map((k) => Math.max(flexOf(k, main), force ? 1 : 0)), sum = wts.reduce((a, b) => a + b, 0);
    if (sum > 0) {
      const extra = inner[main] - total;
      sizes.forEach((z, i) => { z[main] += extra * wts[i] / sum; });
      total = inner[main];
    }
  }
  return { sizes, total };
}

/** Unity's Mathf.Clamp: below the minimum the minimum, else above the maximum the maximum. @param {number} v @param {number} lo @param {number} hi */
const between = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

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
    // across, a child it sizes fills the inner size when it expands, else takes it held between its minimum and
    // preferred size (a long wrapping text takes the room there is)
    if (ctrlCross) z[cross] = forceCross || flexOf(k, cross) > 0 ? inner[cross] : between(inner[cross], minSize(k, cross), z[cross]);
    const c0 = (cross === 0 ? g.pad[0] : g.pad[2]) + (inner[cross] - z[cross]) * alignCross;
    k.lgRect = main === 0 ? { x: cur, y: c0, w: z[0], h: z[1] } : { x: c0, y: cur, w: z[0], h: z[1] };
    cur += z[main] + g.spacing;
  });
  for (const k of s.kids) if (!kids.includes(k)) k.lgRect = null;
}

/** @typedef {{ pad: number[], cell: number[], spacing: number[], corner: number, axis: number, align: number, constraint: number, count: number }} Grid */

/**
 * A grid's columns for its children (界面-3): a fixed column count, columns enough for a fixed row count, or as many
 * cells as fit across its width (at least one).
 * @param {Grid} g @param {number} n children @param {number} w its width
 */
export function gridColumns(g, n, w) {
  if (g.constraint === 1) return Math.max(1, g.count);
  if (g.constraint === 2) return Math.max(1, Math.ceil(n / Math.max(1, g.count)));
  return Math.max(1, Math.floor((w - g.pad[0] - g.pad[1] + g.spacing[0] + 0.001) / (g.cell[0] + g.spacing[0])));
}

/**
 * A grid's preferred size on an axis: across, its preferred columns (fixed, or the square root of its children
 * rounded up when flexible); down, the rows its children take at its width; padding included.
 * @param {UiNode} s @param {number} ax
 */
export function gridPref(s, ax) {
  const g = /** @type {Grid} */ (s.n.comps.grid), n = groupKids(s).length;
  if (ax === 0) {
    const cols = g.constraint === 0 ? Math.ceil(Math.sqrt(n)) : gridColumns(g, n, 0);
    return g.pad[0] + g.pad[1] + cols * g.cell[0] + Math.max(0, cols - 1) * g.spacing[0];
  }
  const rows = Math.ceil(n / gridColumns(g, n, s.w || s.rt.size[0]));
  return g.pad[2] + g.pad[3] + rows * g.cell[1] + Math.max(0, rows - 1) * g.spacing[1];
}

/**
 * A grid's columns and rows for n children at its w × h, and the cell of the i-th (界面-3), as Unity counts them: filling
 * across first (start axis 0) a row holds its columns (gridColumns); filling down first (start axis 1) a column holds
 * the fixed row count, the children over the fixed column count, or as many cells as fit down its height. The start
 * corner flips the columns (1 upper right, 3 lower right) and the rows (2 lower left, 3 lower right).
 * @param {Grid} g @param {number} n @param {number} w @param {number} h
 * @returns {{ cols: number, rows: number, at: (i: number) => [number, number] }}
 */
export function gridCells(g, n, w, h) {
  const down = g.axis === 1, per = down ? gridRows(g, n, h) : gridColumns(g, n, w);
  const cols = down ? Math.ceil(n / per) : per, rows = down ? Math.min(per, n) : Math.ceil(n / per);
  /** @param {number} i @returns {[number, number]} */
  const at = (i) => {
    const c = down ? Math.floor(i / per) : i % per, r = down ? i % per : Math.floor(i / per);
    return [g.corner % 2 === 1 ? cols - 1 - c : c, g.corner >= 2 ? rows - 1 - r : r];
  };
  return { cols, rows, at };
}

/** A down-first grid's rows a column (gridCells): fixed, over a fixed column count, or as many as fit down its height. @param {Grid} g @param {number} n @param {number} h */
function gridRows(g, n, h) {
  if (g.constraint === 2) return Math.max(1, g.count);
  if (g.constraint === 1) return Math.max(1, Math.ceil(n / Math.max(1, g.count)));
  return Math.max(1, Math.floor((h - g.pad[2] - g.pad[3] + g.spacing[1] + 0.001) / (g.cell[1] + g.spacing[1])));
}

/**
 * Places a grid's children in cells of its cell size (gridCells), the block aligned in its w × h rect by its child
 * alignment.
 * @param {UiNode} s @param {number} w @param {number} h
 */
export function gridArrange(s, w, h) {
  const g = /** @type {Grid} */ (s.n.comps.grid), kids = groupKids(s), { cols, rows, at } = gridCells(g, kids.length, w, h);
  const bw = cols * g.cell[0] + Math.max(0, cols - 1) * g.spacing[0], bh = rows * g.cell[1] + Math.max(0, rows - 1) * g.spacing[1];
  const x0 = g.pad[0] + (w - g.pad[0] - g.pad[1] - bw) * (g.align % 3) / 2, y0 = g.pad[2] + (h - g.pad[2] - g.pad[3] - bh) * Math.floor(g.align / 3) / 2;
  kids.forEach((k, i) => {
    const [c, r] = at(i);
    k.lgRect = { x: x0 + c * (g.cell[0] + g.spacing[0]), y: y0 + r * (g.cell[1] + g.spacing[1]), w: g.cell[0], h: g.cell[1] };
  });
  for (const k of s.kids) if (!kids.includes(k)) k.lgRect = null;
}
