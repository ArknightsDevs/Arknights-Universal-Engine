// A Spine texture atlas (docs/spec/spine.md 骨骼-10): its pages and each region's place on its page — position, size,
// how far it is turned, and the original size and offset of a region packed with its blank border cut away.

/**
 * @typedef {object} AtlasRegion
 * @property {string} name @property {number} page index into the pages
 * @property {number} x @property {number} y its top left corner on the page
 * @property {number} width @property {number} height its size before it was turned onto the page
 * @property {number} degrees how far it was turned onto the page: 0, 90, 180 or 270
 * @property {number} originalWidth @property {number} originalHeight @property {number} offsetX @property {number} offsetY
 * @property {number} index −1 unless the region is one of a numbered sequence
 */
/** @typedef {{ name: string, width: number, height: number }} AtlasPage */
/** @typedef {{ pages: AtlasPage[], regions: AtlasRegion[] }} Atlas */

/** A "key: a, b" line's values. @param {string} line */
const values = (line) => line.slice(line.indexOf(':') + 1).split(',').map((v) => v.trim());

/** A region's "key: values" lines, by key. @type {Record<string, (r: AtlasRegion, v: string[]) => void>} */
const REGION_KEYS = {
  rotate: (r, v) => { r.degrees = v[0] === 'true' ? 90 : v[0] === 'false' ? 0 : Number(v[0]); },
  xy: (r, v) => { r.x = Number(v[0]); r.y = Number(v[1]); },
  size: (r, v) => { r.width = Number(v[0]); r.height = Number(v[1]); },
  orig: (r, v) => { r.originalWidth = Number(v[0]); r.originalHeight = Number(v[1]); },
  offset: (r, v) => { r.offsetX = Number(v[0]); r.offsetY = Number(v[1]); },
  index: (r, v) => { r.index = Number(v[0]); },
};

/**
 * Reads an atlas (骨骼-10). A blank line ends a page's regions; a page starts with its image's name and its "size"
 * line; a region starts with its name, then indented "key: values" lines.
 * @param {string} text @returns {Atlas}
 */
export function readAtlas(text) {
  /** @type {Atlas} */
  const atlas = { pages: [], regions: [] };
  const lines = text.split(/\r?\n/);
  let page = -1, region = /** @type {AtlasRegion | null} */ (null), expectPage = true;
  for (const raw of lines) {
    const line = raw.trim();
    if (line === '') { expectPage = true; region = null; continue; }
    if (expectPage) { atlas.pages.push({ name: line, width: 0, height: 0 }); page = atlas.pages.length - 1; expectPage = false; continue; }
    if (!line.includes(':')) {
      region = { name: line, page, x: 0, y: 0, width: 0, height: 0, degrees: 0, originalWidth: 0, originalHeight: 0, offsetX: 0, offsetY: 0, index: -1 };
      atlas.regions.push(region);
      continue;
    }
    const key = line.slice(0, line.indexOf(':')).trim(), v = values(line);
    if (!region) { if (key === 'size') Object.assign(atlas.pages[page], { width: Number(v[0]), height: Number(v[1]) }); continue; }
    if (Object.hasOwn(REGION_KEYS, key)) REGION_KEYS[key](region, v);
  }
  for (const r of atlas.regions) {
    if (r.originalWidth === 0) r.originalWidth = r.width;
    if (r.originalHeight === 0) r.originalHeight = r.height;
  }
  return atlas;
}

/** The region of an attachment's path in an atlas, or null. @param {Atlas} atlas @param {string} path */
export const regionOf = (atlas, path) => atlas.regions.find((r) => r.name === path) ?? null;
