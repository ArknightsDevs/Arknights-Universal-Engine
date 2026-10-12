// Stronghold's names → the engine's where they differ (docs/spec/compat.md 兼容-4): buff flags (属性-2, 状态-5) and
// status keys (状态-5), both ways. Modifier keys are the same in both (the engine took Stronghold's names, ADR 0012); one
// the engine does not know stays on the buff and changes nothing.

/** Stronghold's flags → the engine's. @type {Readonly<Record<string, string>>} */
const FLAG = Object.freeze({ invulnerable: 'invincible', bind: 'root', noHeal: 'noAllyHeal' });

/** Stronghold's status names → the engine's. @type {Readonly<Record<string, string>>} */
const STATUS_KEY = Object.freeze({ bind: 'root', resist: 'buffres' });

/** The engine's status keys → Stronghold's names. @type {Readonly<Record<string, string>>} */
export const STATUS_NAME = Object.freeze(/** @type {Record<string, string>} */ ({ root: 'bind', buffres: 'resist', enemyCold: 'cold', enemyFreeze: 'freeze' }));

/** A status as the engine names it. @param {string} key */
export const statusKeyOf = (key) => STATUS_KEY[key] ?? key;

/** A buff's modifiers as the engine reads them: numbers only. @param {Record<string, unknown> | null | undefined} m @returns {Record<string, number>} */
export function modsOf(m) {
  /** @type {Record<string, number>} */
  const out = {};
  for (const [k, v] of Object.entries(m ?? {})) if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
  return out;
}

/** A buff's flags as the engine names them. @param {Record<string, unknown> | null | undefined} f @returns {Record<string, boolean>} */
export function flagsOf(f) {
  /** @type {Record<string, boolean>} */
  const out = {};
  for (const [k, v] of Object.entries(f ?? {})) if (v) out[FLAG[k] ?? k] = true;
  return out;
}
