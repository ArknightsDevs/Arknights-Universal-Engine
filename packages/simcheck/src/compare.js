// Comparing the cross-engine check's runs (docs/spec/lockstep.md 同步-12): an engine's runs against Node's, match by
// match and hash by hash, after the kits each ran with; the first difference names the match and the frame (-1: not a
// frame — a match or its kits).

/** @typedef {import('./scenarios.js').Run} Run */
/** @typedef {{ match: string, frame: number, want: number | string, got: number | string } | null} Difference */

/**
 * How one match's run differs from the reference's, or null: its kits, then each hash, then its end and result.
 * @param {Run} w @param {Run} g @param {number} every @returns {Difference}
 */
function matchDifference(w, g, every) {
  const wk = w.kits.join(','), gk = g.kits.join(',');
  if (wk !== gk) return { match: w.name, frame: -1, want: `kits ${wk}`, got: `kits ${gk}` };
  const n = Math.max(w.hashes.length, g.hashes.length);
  for (let k = 0; k < n; k++) {
    if (w.hashes[k] !== g.hashes[k]) return { match: w.name, frame: k === w.hashes.length - 1 ? w.frame : k * every, want: w.hashes[k] ?? 'none', got: g.hashes[k] ?? 'none' };
  }
  if (w.frame !== g.frame || w.result !== g.result) return { match: w.name, frame: w.frame, want: `end ${w.frame}, result ${w.result}`, got: `end ${g.frame}, result ${g.result}` };
  return null;
}

/**
 * The first difference of an engine's runs from the reference's (同步-12), or null when the kits, every hash, the last
 * frame and the result agree. `every` is how many frames apart the hashes are; the last hash is the end's.
 * @param {readonly Run[]} want @param {readonly Run[]} got @param {number} every @returns {Difference}
 */
export function firstDifference(want, got, every) {
  for (const [i, w] of want.entries()) {
    const g = got[i];
    if (!g || g.name !== w.name) return { match: w.name, frame: -1, want: w.name, got: g?.name ?? 'none' };
    const d = matchDifference(w, g, every);
    if (d) return d;
  }
  return got.length > want.length ? { match: got[want.length].name, frame: -1, want: 'none', got: got[want.length].name } : null;
}
