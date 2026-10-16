// The perspective canvas on the field (docs/spec/ui.md 界面-13): a canvas lying on the ground at a point of the field —
// x east, y north, one reference pixel `k` tiles — drawn on the page through the camera: its corners land where the
// page's projection puts them, and the plane between follows the projective map through those four points.

/**
 * The projective map (3 × 3, row-major, the last entry 1) taking four points to four others.
 * @param {number[][]} src four [x, y] @param {number[][]} dst four [x, y] @returns {number[]}
 */
export function homography(src, dst) {
  /** @type {number[][]} */
  const rows = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = dst[i];
    rows.push([x, y, 1, 0, 0, 0, -x * u, -y * u, u], [0, 0, 0, x, y, 1, -x * v, -y * v, v]);
  }
  return [...solve(rows), 1];
}

/** Gaussian elimination with partial pivoting of an n × (n + 1) augmented matrix. @param {number[][]} m @returns {number[]} */
function solve(m) {
  const n = m.length;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r;
    [m[c], m[p]] = [m[p], m[c]];
    for (let r = 0; r < n; r++) {
      if (r === c || m[c][c] === 0) continue;
      const f = m[r][c] / m[c][c];
      for (let k = c; k <= n; k++) m[r][k] -= f * m[c][k];
    }
  }
  return m.map((row, i) => row[n] / row[i]);
}

/** A 2D projective map as a CSS matrix3d (with the transform origin at 0 0). @param {number[]} H */
export function matrix3d(H) {
  const [a, b, c, d, e, f, g, h, i] = H;
  // scaled by a positive number only: the sign of w is where the plane is in front (a map whose origin is behind the
  // camera has i < 0), so it is kept
  const k = Math.abs(i) > 1e-9 ? Math.abs(i) : Math.max(...H.map(Math.abs)) || 1;
  return `matrix3d(${[a / k, d / k, 0, g / k, b / k, e / k, 0, h / k, 0, 0, 1, 0, c / k, f / k, 0, i / k].map((v) => +v.toPrecision(9)).join(',')})`;
}

/**
 * Where a projective map takes a point. @param {number[]} H @param {number[]} p @returns {number[]}
 */
export function mapPoint(H, p) {
  const w = H[6] * p[0] + H[7] * p[1] + H[8];
  return [(H[0] * p[0] + H[1] * p[1] + H[2]) / w, (H[3] * p[0] + H[4] * p[1] + H[5]) / w];
}

/**
 * The page transform of a perspective canvas of W × H reference pixels whose centre lies at a point of the field: its
 * corners as ground offsets (tiles east, north of the point) through the page's projection.
 * @param {number[]} frame [W, H] @param {number} k tiles a reference pixel
 * @param {(east: number, north: number) => number[]} toPage a ground offset from the point to page pixels
 */
export function groundTransform(frame, k, toPage) {
  const [W, H] = frame, src = [[0, 0], [W, 0], [W, H], [0, H]];
  const dst = src.map(([x, y]) => toPage((x - W / 2) * k, (H / 2 - y) * k));
  return matrix3d(homography(src, dst));
}
