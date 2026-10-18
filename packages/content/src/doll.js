// A 傀儡师's 替身 (docs/spec/traits.md 职业-16, docs/spec/operators.md 干员-15): its own range — the range id of the
// trait or talent candidate whose blackboard has `talent_override_rangeid_flag` —, whether it can select flying units,
// whether it attacks, and the aura of a 替身 talent, added to the trait's `doll` (职业-15).
import rangeTable from '../data/ranges.json' with { type: 'json' };
import { unlockedAt, talentsAt, dollPart } from './talents.js';

/** @typedef {import('./operators.js').Training} Training @typedef {import('./operators.js').Build} Build */
/** @typedef {import('./operators.js').ModuleLevel} ModuleLevel @typedef {import('./talents.js').Talent} Talent */

/** The blackboard key that gives the 替身 its candidate's range (职业-16). */
const FLAG = 'talent_override_rangeid_flag';

/** Whether a module part counts at every training (干员-7): not a token's, valid in every mode and map. @param {import('./operators.js').ModulePart} p */
const general = (p) => !p.token && !p.gameTag && !p.mapTag;

/**
 * Each talent at a training with its module's candidates for it merged in order (干员-15): the talent's own candidate,
 * then each unlocked candidate of the level's talent parts for that talent — its upgrade text and range id, where it
 * has them, in place of the ones before, its blackboard over theirs. Null for a talent with none.
 * @param {Training} t @param {Build} b @param {ModuleLevel | null} mod
 * @returns {((Talent & { rangeId: string | null }) | null)[]}
 */
export function mergedTalentsAt(t, b, mod) {
  /** @type {((Talent & { rangeId: string | null }) | null)[]} */
  const out = talentsAt(t, b).map((c) => (c ? { description: c.description, rangeId: c.rangeId, bb: { ...c.bb }, hidden: c.hidden } : null));
  const parts = (mod?.parts ?? []).filter((p) => p.target.startsWith('TALENT') && general(p));
  for (const c of parts.flatMap((p) => p.talents)) if (c.index >= 0 && unlockedAt(c, b)) out[c.index] = mergeTalent(out[c.index], c);
  return out;
}

/**
 * A talent's candidate with a module's candidate for it over it (干员-15): the upgrade text and range id where it has
 * them, its blackboard over the one before.
 * @param {(Talent & { rangeId: string | null }) | null | undefined} was
 * @param {import('./operators.js').ModulePart['talents'][number]} c @returns {Talent & { rangeId: string | null }}
 */
const mergeTalent = (was, c) => ({ description: c.upgrade ?? was?.description ?? null, rangeId: c.rangeId ?? was?.rangeId ?? null, bb: { ...was?.bb, ...c.bb }, hidden: c.hidden });

/**
 * The range id of a 替身's own range (职业-16), or null: when the trait's blackboard (with its module's, 干员-7) has the
 * flag, the last unlocked range id of the module's trait parts, else of the trait candidate it takes (干员-3); otherwise
 * the range id of a talent whose candidate's blackboard has it.
 * @param {Training} t @param {Build} b @param {ModuleLevel | null} mod @param {Readonly<Record<string, number>>} traitBb
 */
export function dollRangeId(t, b, mod, traitBb) {
  const parts = (mod?.parts ?? []).filter((p) => p.target.startsWith('TRAIT') && general(p));
  const ids = [t.traits.filter((c) => unlockedAt(c, b)).at(-1)?.rangeId, ...parts.flatMap((p) => p.trait).filter((c) => unlockedAt(c, b)).map((c) => c.rangeId)];
  const fromTrait = traitBb[FLAG] ? ids.filter((x) => x).at(-1) : undefined;
  return fromTrait ?? mergedTalentsAt(t, b, mod).find((c) => c && c.bb[FLAG] && c.rangeId)?.rangeId ?? null;
}

/**
 * What a 傀儡师's 替身 adds to its trait's `doll` (职业-16): its own range (the range table's cells, 干员-8) or null, and
 * whether it can select flying units — it can when it has one —; from its talents' 替身 parts (干员-15), whether it
 * attacks, its aura, whether its attacks deal arts damage and the share of physical and arts damage it takes.
 * @param {Training} t @param {Build} b @param {ModuleLevel | null} mod @param {Readonly<Record<string, number>>} traitBb
 * @returns {{ range: { row: number, col: number }[] | null, antiAir: boolean, attack: boolean, aura: { moveMul: number, scale: number } | null, arts?: true, taken?: number }}
 */
export function dollOf(t, b, mod, traitBb) {
  const id = dollRangeId(t, b, mod, traitBb), cells = id ? /** @type {Record<string, { row: number, col: number }[]>} */ (rangeTable.ranges)[id] : undefined;
  const parts = mergedTalentsAt(t, b, mod).map((c) => (c ? dollPart(c) : null)).filter((x) => x !== null), taken = parts.find((x) => x.taken)?.taken;
  return {
    range: cells ? cells.map((x) => ({ row: x.row, col: x.col })) : null, antiAir: !!cells, attack: !parts.some((x) => x.attack === false), aura: parts.find((x) => x.aura)?.aura ?? null,
    ...(parts.some((x) => x.arts) ? { arts: /** @type {const} */ (true) } : {}), ...(taken !== undefined ? { taken } : {}),
  };
}
