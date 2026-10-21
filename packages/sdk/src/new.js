// `aue mod new` (docs/mods.md): a new mod's folder from the template — a pack.json for this engine, a data file that
// changes one skill's number, a readme — that `aue mod check` passes as it is.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ENGINE_VERSION, MOD_ID, OFFICIAL } from '@aue/schema';
import { SCHEMA_BASE } from './schemas.js';

/** @param {unknown} v */
const json = (v) => `${JSON.stringify(v, null, 2)}\n`;

/** @param {string} id @param {string} name */
const readme = (id, name) => `# ${name}

一个明日方舟通用引擎（AUE）的数据 mod。

- \`pack.json\`：清单：名字、版本、适用的引擎版本、数据文件。
- \`data.json\`：数据：这里把陈的二技能「赤霄·拔刀」10 级的攻击倍率从 500% 改成 600%。

## 检查和试跑

\`\`\`sh
npx aue mod check ${id}
npx aue mod test ${id}
npx aue mod pack ${id}
\`\`\`

写法见引擎仓库的 [docs/mods.md](https://github.com/ArknightsDevs/Arknights-Universal-Engine/blob/main/docs/mods.md)。

发布前请在 \`pack.json\` 里写上作者（\`authors\`）和许可（\`license\`）。
`;

/**
 * A new mod's folder `<root>/<id>` from the template (mod-12). Throws for an id that is not a mod id, or a folder that
 * is there already.
 * @param {string} root @param {string} id @param {{ name?: string }} [o] @returns {string} the folder
 */
export function newMod(root, id, { name = id } = {}) {
  if (!MOD_ID.test(id) || id === OFFICIAL) throw new Error(`"${id}" is not a mod id: 1–32 of a–z 0–9 _ -, not "official"`);
  const dir = join(root, id);
  if (existsSync(dir)) throw new Error(`${dir} is there already`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'pack.json'), json({
    $schema: `${SCHEMA_BASE}pack.schema.json`, type: 'data', version: '0.1.0', app: `^${ENGINE_VERSION}`, name, authors: [], files: { data: 'data.json' },
  }));
  writeFileSync(join(dir, 'data.json'), json({
    $schema: `${SCHEMA_BASE}data.schema.json`,
    operators: { char_010_chen: { skills: { skchr_chen_2: { levels: { 9: { blackboard: { atk_scale: 6 } } } } } } },
  }));
  writeFileSync(join(dir, 'README.md'), readme(id, name));
  return dir;
}
