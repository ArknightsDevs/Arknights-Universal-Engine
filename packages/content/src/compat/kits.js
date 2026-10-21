// Stronghold's kits in a battle (docs/spec/compat.md 兼容-4): the content's world setup (钩子-4) makes the battle a kit
// sees (battle.js), a piece for each deck entry that has a kit — as Stronghold's board pieces, before anything is
// deployed, each with its own id for the whole battle — and installs each piece's kit once: its own setup and its
// talents'. Each deployment of an operator binds its piece to the engine's unit as it enters the field (钩子-3 `enter`:
// before its trait, talents and passive skill take hold, so a passive skill's spec runs as Stronghold's does) and gives
// its lasting buffs again.
import { KIND, bus, reserveIds, traits } from '@aue/sim';
import { ShBattle } from './battle.js';
import { ShUnit } from './unit.js';
import { battles, SPEC_BEHAVIOR, KIT_TRAIT_BEHAVIOR, onAttackHit, onAttackDone, onSpecHit, onBoomerangHit } from './specs.js';
import { KIT_BUFF, KIT_BUFF_BEHAVIOR, worldBattles } from './buffhooks.js';
import { withGrid } from './grid.js';

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Content} Content @typedef {import('@aue/sim').Unit} Unit */
/**
 * A kit for an operator key: Stronghold's factory and the def it is built from (records.js defOf), and its summons' defs
 * by summon id (records.js tokenDefOf).
 * @typedef {{ factory: (bb: Record<string, any>, chess: Record<string, any>, def: Record<string, any>) => any, def: Record<string, any>,
 *   tokens?: Record<string, Record<string, any>> }} KitEntry
 */

/** A kit's own trait, built under the level's grid; null when it has none or cannot be built. @param {KitEntry} entry @param {{ width: number, height: number }} level */
function kitTraitOf(entry, level) {
  try {
    return withGrid(level, () => entry.factory(entry.def.skill?.bb ?? {}, entry.def.raw, entry.def))?.trait ?? null;
  } catch {
    return null;
  }
}

/**
 * The trait data of a branch that Stronghold has no profession rule for, so that its kits carry it themselves (兼容-5):
 * a kitted operator of the branch leaves it to its kit — the 塑灵术师's 倍率 against the enemies its summons block (its
 * kit multiplies its hits on them).
 * @type {Readonly<Record<string, Partial<import('@aue/sim').TraitDef>>>}
 */
const KIT_OWNED = Object.freeze({ soulcaster: { summonBlockedScale: 1 } });

/**
 * What a module adds to the trait in battle (职业-17, 职业-18, 职业-20, 职业-21), none: a kit carries its operator's modules
 * itself, their trait additions too (兼容-5). The deck's rules — the first deployment's cost, the 再部署时间, the refund,
 * the places in the deploy limit — stay the engine's: Stronghold has no deploy cost (op-siege.js: SOL-Y's
 * 「首次部署时部署费用-4」 has no effect there).
 * @type {Readonly<Partial<import('@aue/sim').TraitDef>>}
 */
const NO_MODULE_ADDITIONS = Object.freeze({
  vs: [], far: null, crowd: null, packed: null, whiles: [], extraArts: 0, counterArts: 0, epRider: null, burstHit: null, spOn: null, payStack: null, auras: [],
  summonBoost: null, secondLife: null, pushBoost: null, pullBoost: null, pullTrauma: null,
});

/** Whether a trait has some of what modules add (NO_MODULE_ADDITIONS). @param {import('@aue/sim').TraitDef} t */
const moduleAdded = (t) => Object.entries(NO_MODULE_ADDITIONS).some(([k, none]) => {
  const v = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (t))[k];
  return Array.isArray(none) ? Array.isArray(v) && v.length > 0 : !!v && v !== none;
});

/**
 * An operator's record under its kit's trait (兼容-5): where the kit's `trait` takes the place of a part of the
 * profession's profile that the engine keeps as trait data, that data follows it — its `afterHit` replaces the
 * 投掷手's aftershock (Stronghold's one profession afterHit), its `splashRadius` the splash's radius —, the trait data
 * its branch leaves to kits is its kit's (KIT_OWNED), and so are its module's trait additions (NO_MODULE_ADDITIONS). The
 * kit is built for this (under the level's grid); one that cannot be has no trait of its own.
 * @param {import('@aue/sim').OperatorDef} op @param {KitEntry} entry @param {{ width: number, height: number }} level
 * @returns {import('@aue/sim').OperatorDef}
 */
export function withKitTrait(op, entry, level) {
  const kt = kitTraitOf(entry, level), t = traits.traitOfDef(op), added = moduleAdded(t);
  const over = /** @type {Partial<import('@aue/sim').TraitDef>} */ ({ ...(op.branch && Object.hasOwn(KIT_OWNED, op.branch) ? KIT_OWNED[op.branch] : {}), ...(added ? NO_MODULE_ADDITIONS : {}) });
  if (typeof kt?.afterHit === 'function' && t.aftershock > 0) over.aftershock = 0;
  if (Number(kt?.splashRadius) > 0) over.splash = { scale: 1, ground: false, ...t.splash, radius: Number(kt.splashRadius) };
  return Object.keys(over).length ? { ...op, trait: { ...op.trait, ...over } } : op;
}

/** Runs before every other handler of the same event. */
const FIRST = 1e9;

/**
 * The world setup that brings kits into a battle (兼容-4); `seen` gets each battle made (for tests and tools).
 * @param {Record<string, KitEntry>} kits by operator key @param {(b: ShBattle) => void} [seen]
 * @returns {(w: World, c: Content) => void}
 */
export function kitsWorld(kits, seen) {
  return (w, c) => {
    const b = new ShBattle(w, c);
    worldBattles.set(w, b);
    bus.on(w, 'battleStart', () => { b.started = true; }, { priority: FIRST });
    bus.on(w, 'enter', (k) => bind(b, k.unit), { priority: FIRST });
    bus.on(w, 'skillStart', (k) => { const s = b.pieces.get(`${k.unit.owner}|${k.unit.key}`)?.skill; if (s && !s.counted) s.activations++; if (s) s.counted = false; }, { priority: FIRST });
    bus.on(w, 'attackHit', onAttackHit);
    bus.on(w, 'attack', onAttackDone, { priority: FIRST });
    bus.on(w, 'hit', onSpecHit, { priority: FIRST });
    bus.on(w, 'boomerangHit', onBoomerangHit);
    bus.on(w, 'tick', (k) => b.projectiles.update(k.frames / 30), { priority: FIRST });
    const decks = c.decks ?? w.players.map(() => Object.keys(c.operators));
    decks.forEach((deck, seat) => {
      for (const key of deck) if (Object.hasOwn(kits, key)) install(b, seat, key, kits[key]);
    });
    seen?.(b);
  };
}

/** An operator's piece and its kit, installed once. @param {ShBattle} b @param {number} seat @param {string} key @param {KitEntry} entry */
function install(b, seat, key, entry) {
  const def = entry.def, piece = new ShUnit(b, { kind: 'op', key, ownerId: seat, def, pieceId: reserveIds(b.w, 1) });
  piece.tokenDefs = entry.tokens ?? {};
  b.pieces.set(`${seat}|${key}`, piece);
  const kit = b.safe(() => entry.factory(def.skill?.bb ?? {}, def.raw, def), 'kit', piece);
  if (!kit) return;
  piece.kit = kit;
  if (piece.skill) piece.skill.spec = kit.skills?.[def.skill?.id] ?? null;
  b.safe(() => kit.trait?.install?.(b, piece), 'profile.install', piece);
  for (const t of kit.talents ?? []) b.safe(() => t.install?.(b, piece), 'talent', piece);
  b.safe(() => kit.install?.(b, piece), 'install', piece);
}

/**
 * A deployment binds the operator's piece to its engine unit and gives its lasting buffs again; a summon becomes its
 * token, with the kit it was spawned with.
 * @param {ShBattle} b @param {Unit} u
 */
function bind(b, u) {
  if (u.kind !== KIND.OPERATOR) return;
  if (u.summoner !== undefined) {
    b.unitOf(u);
    battles.set(u, b);
    return;
  }
  const piece = b.pieces.get(`${u.owner}|${u.key}`);
  if (!piece) return;
  piece.u = u;
  piece.deploySeq++;
  battles.set(u, b);
  for (const spec of piece.persist) b.giveBuff(piece, spec);
}

/**
 * What content needs to bring kits into its battles (兼容-4, 兼容-5): the world setup, the skill behaviour of every
 * skill a kit describes, by skill id, the behaviour of a kit's buffs with callbacks, and the trait behaviour of every
 * branch a kitted operator has (职业-6).
 * @param {Record<string, KitEntry>} kits by operator key @param {(b: ShBattle) => void} [seen]
 * @returns {{ world: (w: World, c: Content) => void, skills: Record<string, import('@aue/sim').SkillBehavior>, buffs: Record<string, import('@aue/sim').buffs.Behavior>,
 *   traits: Record<string, import('@aue/sim').TraitBehavior> }}
 */
export function kitsBehaviors(kits, seen) {
  const ids = Object.values(kits).flatMap((e) => [e.def.skill?.id, ...Object.values(e.tokens ?? {}).map((d) => d.skill?.id)]).filter((id) => typeof id === 'string');
  const branches = [...new Set(Object.values(kits).map((e) => e.def.subProf).filter((x) => typeof x === 'string'))];
  return { world: kitsWorld(kits, seen), skills: Object.fromEntries(ids.map((id) => [id, SPEC_BEHAVIOR])), buffs: { [KIT_BUFF]: KIT_BUFF_BEHAVIOR },
    traits: Object.fromEntries(branches.map((x) => [x, KIT_TRAIT_BEHAVIOR])) };
}
