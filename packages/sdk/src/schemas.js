// The JSON Schemas of a mod's files (docs/spec/mods.md mod-13): pack.json as the manifest reader takes it, and a data
// file's tables as the records' checks and the patch rules accept them — made from the checks themselves, so the two
// cannot disagree. Editors read them through a file's `$schema`.
import { CONTENT_ID, DATA_PATH, MOD_ID, MOD_TABLES, VERSION } from '@aue/schema';
import { tableSchemas } from '@aue/content';

/** Where the schemas are published: the repository's main branch. */
export const SCHEMA_BASE = 'https://raw.githubusercontent.com/ArknightsDevs/Arknights-Universal-Engine/main/packages/sdk/schemas/';
const DRAFT = 'https://json-schema.org/draft/2020-12/schema';

/** @param {number} max @param {string} description */
const text = (max, description) => ({ type: 'string', minLength: 1, maxLength: max, description });
const dataPath = { type: 'string', pattern: DATA_PATH.source, maxLength: 128 };

/** The JSON Schema of pack.json (mod-1). @returns {Record<string, any>} */
export function packSchema() {
  return {
    $schema: DRAFT, $id: `${SCHEMA_BASE}pack.schema.json`, title: 'AUE mod: pack.json', description: '数据 mod 的清单（docs/mods.md）。', type: 'object',
    properties: {
      $schema: { type: 'string' },
      id: { type: 'string', pattern: MOD_ID.source, description: '可以不写：文件夹名就是 mod 的 id。' },
      type: { enum: ['data', 'assets'], description: '现在只加载 data。' },
      version: { type: 'string', pattern: VERSION.source, description: '这个 mod 的版本，语义化版本，如 1.0.0。' },
      app: { type: 'string', maxLength: 128, description: '适用的引擎版本范围，如 ^0.1.3、>=0.1.3 <0.2.0。' },
      name: text(64, '名字。'),
      englishName: text(64, '英文名字。'),
      authors: { type: 'array', items: text(64, '作者。'), maxItems: 16 },
      credits: text(1024, '致谢。'),
      license: text(256, '许可，SPDX 标识或文字。'),
      files: {
        type: 'object', properties: { data: { anyOf: [dataPath, { type: 'array', items: dataPath, minItems: 1, maxItems: 64 }], description: '数据文件，按顺序应用。' } },
        required: ['data'],
      },
      dependencies: { type: 'object', propertyNames: { pattern: MOD_ID.source }, additionalProperties: { type: 'string', maxLength: 128 }, description: '依赖的 mod：id → 版本范围。' },
      priority: { type: 'integer', minimum: -1000, maximum: 1000, description: '彼此无依赖时，小的先加载；后加载的覆盖先加载的。' },
    },
    required: ['type', 'version', 'name', 'files'], additionalProperties: false,
  };
}

/** What each table holds, for an editor's hover. */
const TABLE_TEXT = Object.freeze({
  operators: '干员：已有的 id 写补丁，新干员用「mod id:名字」并写 look。', levels: '关卡：已有的 id 写补丁，新关卡用「mod id:名字」。',
  enemies: '敌人：只能写补丁，改所有关卡里的这个敌人。', tokens: '召唤物：只能写补丁。',
});

/** @typedef {Record<string, any>} Json */

/**
 * A schema with each of its sub-schemas mapped (items, additionalProperties, propertyNames, properties, anyOf).
 * @param {Json} s @param {(x: Json) => Json} f @returns {Json}
 */
function mapChildren(s, f) {
  const o = { ...s };
  for (const k of ['items', 'additionalProperties', 'propertyNames']) if (typeof o[k] === 'object' && o[k] !== null) o[k] = f(o[k]);
  if (o.properties) o.properties = Object.fromEntries(Object.entries(o.properties).map(([n, x]) => [n, f(/** @type {Json} */ (x))]));
  if (o.anyOf) o.anyOf = o.anyOf.map(f);
  return o;
}

/**
 * A schema with every larger sub-schema met more than once moved to `$defs` and referred to (mod-13): the patch
 * schemas repeat the records' parts at every level.
 * @param {Json} root @returns {Json}
 */
function shared(root) {
  /** @type {Map<string, number>} */
  const counts = new Map();
  /** @param {Json} x @returns {Json} */
  const count = (x) => {
    const k = JSON.stringify(x), n = (counts.get(k) ?? 0) + 1;
    counts.set(k, n);
    if (n === 1) mapChildren(x, count);
    return x;
  };
  mapChildren(root, count);
  /** @type {Map<string, string>} */
  const names = new Map();
  /** @type {Record<string, Json>} */
  const defs = {};
  /** @param {Json} x @returns {Json} */
  const out = (x) => {
    const k = JSON.stringify(x);
    if (k.length < 160 || (counts.get(k) ?? 0) < 2) return mapChildren(x, out);
    if (!names.has(k)) {
      const name = `s${names.size}`;
      names.set(k, name);
      defs[name] = mapChildren(x, out);
    }
    return { $ref: `#/$defs/${names.get(k)}` };
  };
  const body = mapChildren(root, out);
  return { ...body, $defs: defs };
}

/** The JSON Schema of a data file (mod-4, mod-5): each table's ids to a patch, or to a whole new record. @returns {Record<string, any>} */
export function dataSchema() {
  const tables = MOD_TABLES.map((t) => [t, {
    type: 'object', description: TABLE_TEXT[/** @type {keyof typeof TABLE_TEXT} */ (t)], propertyNames: { pattern: CONTENT_ID.source, maxLength: 64 },
    additionalProperties: tableSchemas(/** @type {any} */ (t)).patch,
  }]);
  return shared({
    $schema: DRAFT, $id: `${SCHEMA_BASE}data.schema.json`, title: 'AUE mod: data file', description: '数据 mod 的数据文件（docs/mods.md）。', type: 'object',
    properties: { $schema: { type: 'string' }, ...Object.fromEntries(tables) }, additionalProperties: false,
  });
}

/** The schemas' files by name, as committed in packages/sdk/schemas/. @returns {Record<string, string>} */
export const schemaFiles = () => ({ 'pack.schema.json': `${JSON.stringify(packSchema(), null, 2)}\n`, 'data.schema.json': `${JSON.stringify(dataSchema(), null, 2)}\n` });
