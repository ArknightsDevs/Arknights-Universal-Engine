// Stronghold's kits in a battle (docs/spec/compat.md 兼容-4): the content's world setup (钩子-4) makes the battle a kit
// sees (battle.js), a piece for each deck entry that has a kit — as Stronghold's board pieces, before anything is
// deployed — and installs each piece's kit once: its own setup and its talents'. Each deployment of an operator binds
// its piece to the engine's unit (before any kit's handler of that deployment runs) and gives its lasting buffs again.
import { KIND, bus } from '@aue/sim';
import { ShBattle } from './battle.js';
import { ShUnit } from './unit.js';

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Content} Content @typedef {import('@aue/sim').Unit} Unit */
/**
 * A kit for an operator key: Stronghold's factory and the def it is built from (records.js defOf).
 * @typedef {{ factory: (bb: Record<string, any>, chess: Record<string, any>, def: Record<string, any>) => any, def: Record<string, any> }} KitEntry
 */

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
    bus.on(w, 'battleStart', () => { b.started = true; }, { priority: FIRST });
    bus.on(w, 'deploy', (k) => bind(b, k.unit), { priority: FIRST });
    const decks = c.decks ?? w.players.map(() => Object.keys(c.operators));
    decks.forEach((deck, seat) => {
      for (const key of deck) if (Object.hasOwn(kits, key)) install(b, seat, key, kits[key]);
    });
    seen?.(b);
  };
}

/** An operator's piece and its kit, installed once. @param {ShBattle} b @param {number} seat @param {string} key @param {KitEntry} entry */
function install(b, seat, key, entry) {
  const def = entry.def, piece = new ShUnit(b, { kind: 'op', key, ownerId: seat, def });
  b.pieces.set(`${seat}|${key}`, piece);
  const kit = b.safe(() => entry.factory(def.skill?.bb ?? {}, def.raw, def), 'kit', piece);
  if (!kit) return;
  piece.kit = kit;
  if (piece.skill) piece.skill.spec = kit.skills?.[def.skill?.id] ?? null;
  b.safe(() => kit.install?.(b, piece), 'install', piece);
  for (const t of kit.talents ?? []) b.safe(() => t.install?.(b, piece), 'talent', piece);
}

/** A deployment binds the operator's piece to its engine unit and gives its lasting buffs again. @param {ShBattle} b @param {Unit} u */
function bind(b, u) {
  if (u.kind !== KIND.OPERATOR) return;
  const piece = b.pieces.get(`${u.owner}|${u.key}`);
  if (!piece) return;
  piece.u = u;
  piece.deploySeq++;
  for (const spec of piece.persist) b.giveBuff(piece, spec);
}
