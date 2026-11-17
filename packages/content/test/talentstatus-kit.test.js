// A talent that gives a status is given once (docs/spec/compat.md 兼容-6): an operator that fights by its Stronghold kit has the
// kit apply 抵抗 and 脆弱 itself, so its record carries none of the talent fields that hold them (rangeTalents, fieldTalents,
// timedTalents, deployTalents, talentTrait) — TALENT_FIELDS is the one place that strips them.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { oracleDir } from '@aue/testkit';
import { matchContent, loadKits, loadTraining } from '../src/index.js';
import { TALENT_FIELDS } from '../src/operators.js';

before(() => {
  const compat = new URL('../src/compat/', import.meta.url).href;
  register(new URL('hook.js', compat), { data: { root: pathToFileURL(`${oracleDir()}/`).href, compat } });
});

/**
 * The operators of this change that have a kit by their character id, with the module to equip (or none): 煌 (抵抗 after her seconds),
 * 艾雅法拉 (a team talent for the deck, 携带时), 棘刺 (a regen when she has not attacked).
 */
const GIVERS = /** @type {[string, number | undefined][]} */ ([['char_017_huang', undefined], ['char_180_amgoat', 0], ['char_293_thorns', undefined]]);

test('[兼容-6] an operator whose talent gives a status fights by its kit without the talent fields; the plain record of it has them', async () => {
  const root = pathToFileURL(`${oracleDir()}/`).href;
  let withKit = 0;
  for (const [id, module] of GIVERS) {
    const t = await loadTraining(id);
    const build = { elite: 2, level: t.phases[2].maxLevel, potential: 6, trust: 0, skill: 0, skillLevel: 7, ...(module === undefined ? {} : { module, moduleLevel: 3 }) };
    const { kits } = await loadKits(root, [id]);
    const match = { level: 'act1multi_01', difficulty: /** @type {const} */ ('NORMAL'), seed: 7, decks: [[{ id, build }]] };
    const plain = /** @type {any} */ ((await matchContent(match)).operators[`${id}#0`]);
    assert.ok(TALENT_FIELDS.some((f) => f in plain), `${id}: the plain record has talent fields`);
    if (!Object.hasOwn(kits, id)) continue;
    withKit++;
    const kitted = /** @type {any} */ ((await matchContent(match, { kits })).operators[`${id}#0`]);
    assert.deepEqual(TALENT_FIELDS.filter((f) => f in kitted), [], `${id}: no talent field with its kit`);
    assert.equal(JSON.stringify(kitted).includes('"buffres"'), false, `${id}: no status of a talent`);
  }
  assert.equal(withKit, 3, 'all three have a kit');
});
