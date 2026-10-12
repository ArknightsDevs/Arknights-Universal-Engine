// Stands in for Stronghold's server/sim/damage.js (兼容-2): the names its operator kits import — whether a unit has HP
// left and whether a hit is 生命流失 (the engine's `hpLoss`, 伤害-10, or Stronghold's tag); the rest still gaps.
import { gap } from './gap.js';

export const burstLocked = gap('damage.burstLocked');
/** On the field with HP left. @param {{ alive: boolean, hp: number } | null | undefined} u */
export const hasHp = (u) => !!u && u.alive && u.hp > 0;
/** Whether a hit is 生命流失. @param {{ hpLoss?: boolean, tags?: string[] } | null | undefined} dmg */
export const isHpLoss = (dmg) => !!dmg && (dmg.hpLoss === true || (Array.isArray(dmg.tags) && dmg.tags.includes('hpLoss')));
export const mitigate = gap('damage.mitigate');
export const periodicDamage = gap('damage.periodicDamage');
