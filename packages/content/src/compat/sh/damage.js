// Stands in for Stronghold's server/sim/damage.js (兼容-2): the names its operator kits import — whether a unit has HP
// left, whether a hit is 生命流失 (the engine's `hpLoss`, 伤害-10, or Stronghold's tag), damage after the defences
// (伤害-1…伤害-5); the rest still gaps.
import { damage } from '@aue/sim';
import { gap } from './gap.js';

export const burstLocked = gap('damage.burstLocked');
/** On the field with HP left. @param {{ alive: boolean, hp: number } | null | undefined} u */
export const hasHp = (u) => !!u && u.alive && u.hp > 0;
/** Whether a hit is 生命流失. @param {{ hpLoss?: boolean, tags?: string[] } | null | undefined} dmg */
export const isHpLoss = (dmg) => !!dmg && (dmg.hpLoss === true || (Array.isArray(dmg.tags) && dmg.tags.includes('hpLoss')));
/**
 * Damage after a unit's defences (伤害-1…伤害-5), the penetration given held to its bounds.
 * @param {number} amount @param {import('@aue/sim').damage.Damage['type']} type @param {{ def: number, res: number, epDamageResistance: number }} s
 * @param {Record<string, number>} [pen]
 */
export const mitigate = (amount, type, s, pen = {}) => damage.mitigate(amount, type, s, damage.penetration(null, pen));
export const periodicDamage = gap('damage.periodicDamage');
