// Stronghold's skill runtime over the engine's skill state (docs/spec/compat.md 兼容-4): what a kit reads and changes of
// an operator's skill — whether it has one, runs, runs for a time; its SP, gained by Stronghold's rules (none while a
// timed skill runs or under 阻回, except SP that ignores 阻回: Stronghold's 'init' and the exceptions a kit names, 技能-2).
// The skill's own effects stay the engine's (技能-1…技能-9); a kit's skill specs are not run yet.
import { attrs, skills, sp } from '@aue/sim';

/** @typedef {import('./unit.js').ShUnit} ShUnit @typedef {import('@aue/sim').Unit} Unit */
/** @typedef {import('@aue/sim').SkillState} SkillState @typedef {import('@aue/sim').SkillDef} SkillDef */

/** Kinds that run for a time and hold SP back while they do (Stronghold's `isTimed`). */
const TIMED = new Set(['duration', 'ammo', 'toggle']);

export class ShSkill {
  /** @param {ShUnit} unit @param {Record<string, any> | null} spec the kit's spec of the selected skill */
  constructor(unit, spec) { this.unit = unit; this.spec = spec; }

  /** The engine's state of the skill, null without one or off the field. @returns {SkillState | null} */
  get st() { return this.unit.u?.skill ?? null; }
  /** The skill the engine runs for the operator (the content's). @returns {SkillDef | null} */
  get def() { return this.unit.b.c.operators[this.unit.defId]?.skill ?? null; }
  get noSkill() { return !this.def; }
  /** The kit's kind of the skill, else the engine's (技能-1). */
  get kind() { return this.spec?.kind ?? (this.def ? skills.kindOf(this.def) : null); }
  get isTimed() { return TIMED.has(this.kind); }
  get active() { return !!this.st?.active; }
  get sp() { return this.st?.sp ?? 0; }
  get spCost() { return this.st?.cost ?? 0; }
  get ready() { const st = this.st; return !!st && !this.noSkill && st.sp >= st.cost; }

  /**
   * Adds SP up to the bar's cap; returns what was gained. `reason` 'init' or `o.ignoreLock`: SP that ignores 阻回.
   * @param {number} amount @param {string} [reason] @param {boolean} [_silent] @param {{ ignoreLock?: boolean }} [o]
   */
  gainSp(amount, reason = 'time', _silent, o = {}) {
    const st = this.st;
    if (!st || this.noSkill || !(st.cost > 0)) return 0;
    if (reason === 'init' || o.ignoreLock) return sp.forceSp(st, amount);
    if ((st.active && this.isTimed) || attrs.statsOf(/** @type {Unit} */ (this.unit.u)).flags.noSp) return 0;
    return sp.forceSp(st, amount);
  }
}
