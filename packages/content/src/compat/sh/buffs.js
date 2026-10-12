// Stands in for Stronghold's server/sim/buffs.js (兼容-2): the names its operator kits import.
import { gap } from './gap.js';

/** The statuses a 抵抗 shortens (Stronghold's list). */
export const RESIST_STATUSES = Object.freeze(new Set(['stun', 'freeze', 'cold', 'sleep', 'fear', 'tremble', 'attract', 'levitate',
  'bind', 'silence', 'disarm', 'sluggish', 'slow', 'groundbind']));
export const aggregateMods = gap('buffs.aggregateMods');
