// Texts (docs/spec/ui.md 界面-4): Unity rich text as HTML, the font a prefab asks for as one of the page's faces, the
// nine alignments, outlines and shadows.

/**
 * A face of the page: [CSS font family, weight], and `true` third when the prefab's font draws every letter as a capital
 * (the page shows the text in capitals then, 界面-4).
 * @typedef {[string, number] | [string, number, boolean]} Face
 */
/**
 * The page's faces for the fonts the prefabs name. Hosts load the faces and may pass their own table; a name not in it
 * falls back by the text — a Latin-only text to the Latin face, else the CJK face.
 * @type {Readonly<Record<string, Face>>}
 */
export const DEFAULT_FONTS = Object.freeze({
  'NotoSansHans-Regular': ['var(--aue-ui-cjk)', 400], 'NotoSansHans-Medium': ['var(--aue-ui-cjk)', 500], 'NotoSansHans-Bold': ['var(--aue-ui-cjk)', 700],
  'SourceHanSansCN-Medium': ['var(--aue-ui-cjk)', 500], 'SourceHanSansCN-Bold': ['var(--aue-ui-cjk)', 700], 'SourceHanSansCN-Heavy': ['var(--aue-ui-cjk)', 900],
  'Novecentowide-Light': ['var(--aue-ui-latin)', 300, true], 'Novecentowide-Normal': ['var(--aue-ui-latin)', 400, true],
  'Novecentowide-Medium': ['var(--aue-ui-latin)', 500, true], 'Novecentowide-Bold': ['var(--aue-ui-latin)', 700, true],
  'Bender': ['var(--aue-ui-bender)', 400], 'JovannyLemonad-Bender': ['var(--aue-ui-bender)', 400], 'AEwide': ['var(--aue-ui-latin)', 400],
  'Arvo-Bold': ['var(--aue-ui-arvo)', 700],
});

const LATIN = /^[ -~×]*$/;
const TAGS = /<\/?(color|b|i|size)\b/;

/** HTML-escaped text. @param {string} s */
const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Whether a text has Unity rich text tags. @param {string} txt */
export const isRich = (txt) => TAGS.test(txt);

/**
 * Unity rich text (<color>, <b>, <i>, <size>) as HTML; everything else stays text.
 * @param {string} txt
 */
export function richHtml(txt) {
  return escape(txt)
    .replace(/&lt;color=(#[0-9a-fA-F]{6,8}|[a-z]+)&gt;/g, '<span style="color:$1">').replace(/&lt;\/color&gt;/g, '</span>')
    .replace(/&lt;b&gt;/g, '<b>').replace(/&lt;\/b&gt;/g, '</b>').replace(/&lt;i&gt;/g, '<i>').replace(/&lt;\/i&gt;/g, '</i>')
    .replace(/&lt;size=(\d+)&gt;/g, '<span style="font-size:$1px">').replace(/&lt;\/size&gt;/g, '</span>');
}

/**
 * The face of a text: its prefab's font from the table, else by its characters; bold (style bit 1) is at least 700;
 * whether it shows in capitals.
 * @param {Readonly<Record<string, Face>>} fonts @param {string | undefined} name @param {string} txt
 * @param {number} style Unity's font style (1 bold, 2 italic)
 * @returns {[string, number, boolean]}
 */
export function faceOf(fonts, name, txt, style) {
  const bold = (style & 1) !== 0, f = name ? fonts[name] : undefined;
  if (f) return [f[0], bold ? Math.max(700, f[1]) : f[1], f[2] === true];
  const latin = LATIN.test(txt.replace(/<[^>]+>/g, ''));
  return [latin ? 'var(--aue-ui-latin)' : 'var(--aue-ui-cjk)', bold ? 700 : 500, false];
}

/**
 * The flex placement of Unity's text anchor 0–8 (upper / middle / lower × left / centre / right).
 * @param {number} align
 */
export function alignCss(align) {
  const e = ['flex-start', 'center', 'flex-end'];
  return { justifyContent: e[align % 3], alignItems: e[Math.floor(align / 3)], textAlign: ['left', 'center', 'right'][align % 3] };
}

/**
 * An Outline (four copies, one at each corner of the distance) or a Shadow (one copy) as a text shadow; Unity's y is up.
 * @param {{ color: number[], d: number[], kind?: string }} o
 */
export function shadowCss(o) {
  const col = `rgba(${Math.round(o.color[0] * 255)},${Math.round(o.color[1] * 255)},${Math.round(o.color[2] * 255)},${o.color[3]})`;
  const dx = o.d[0], dy = -o.d[1];
  if (o.kind === 'shadow') return `${dx}px ${dy}px 0 ${col}`;
  return [[dx, dy], [-dx, dy], [dx, -dy], [-dx, -dy]].map(([x, y]) => `${x}px ${y}px 0 ${col}`).join(', ');
}

/**
 * Unity's best fit: the largest whole size from `max` down to `min` at which a text measured at size `at` (w × h)
 * fits a rect of W × H; sizes scale the measure in proportion.
 * @param {number[]} measured [w, h] at size `at` @param {number} at @param {number[]} rect [W, H] @param {number[]} range [min, max]
 */
export function bestFit(measured, at, rect, range) {
  const [W, H] = rect, [min, max] = range;
  if (measured[0] <= 0 || measured[1] <= 0) return max;
  const k = Math.min(W / measured[0], H / measured[1]);
  return Math.max(min, Math.min(max, Math.floor(at * k)));
}

/** The outline's width in units for each unit of the material's width (界面-29: measured on the original's recording). */
export const OUTLINE_UNIT = 0.1;

/**
 * An outline material around a text (界面-29): a tenth of its width in units all round in its colour, as sixteen
 * copies of the text on a circle.
 * @param {{ width?: number, color?: number[] }} mat
 */
export function ringCss(mat) {
  const w = (mat.width ?? 1) * OUTLINE_UNIT, c = mat.color ?? [0, 0, 0, 1];
  const col = `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${c[3]})`;
  /** @type {string[]} */
  const out = [];
  for (let i = 0; i < 16; i++) {
    const a = (i * Math.PI) / 8;
    out.push(`${(Math.cos(a) * w).toFixed(2)}px ${(Math.sin(a) * w).toFixed(2)}px 0 ${col}`);
  }
  return out.join(', ');
}

/**
 * Multiline best fit (界面-29): the largest whole size from `max` down to `min` at which `fits(size)` holds, found by
 * halving (a size below one that fits fits too); `min` when none does.
 * @param {(size: number) => boolean} fits @param {number} min @param {number} max
 */
export function fitSize(fits, min, max) {
  if (max <= min || fits(max)) return Math.max(min, max);
  let lo = min, hi = max;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (fits(mid)) lo = mid; else hi = mid;
  }
  return lo;
}
