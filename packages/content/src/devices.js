// The official devices (docs/spec/devices.md 装置-3, 装置-4): what each device a level places is beyond its record — its
// side, the statuses it is immune to, what it gives the enemies while on the field — from its PRTS page; the numbers
// come from the record's own talent blackboard where the data has them. A level with a device not profiled here is
// not supported yet (levelAt refuses it).

/** @typedef {import('@aue/sim').DeviceDef} DeviceDef */

const PRTS = 'https://prts.wiki/index.php?title=';

/**
 * Per device: what it adds to its record, with the PRTS revision that says so.
 * @type {Readonly<Record<string, { profile: (d: DeviceDef) => Partial<DeviceDef>, source: string }>>}
 */
export const DEVICE_PROFILES = Object.freeze({
  // 城防路障: 阵营=我方；持有禁疗、孤立、晕眩免疫、冻结免疫、寒冷免疫、沉默免疫、沉睡免疫
  trap_097_hstone: { profile: () => ({ immune: ['stun', 'freeze', 'cold', 'silence', 'sleep'] }), source: `${PRTS}%E5%9F%8E%E9%98%B2%E8%B7%AF%E9%9A%9C&oldid=417801` },
  // 山海密语仪: 阵营=敌方；在场时，所有敌方单位的攻击速度+25，移动速度最终提升至115%（可无限叠加）
  trap_096_gflag: {
    profile: (d) => ({ side: 'ENEMY', enemyMods: { aspd: d.talentBb.attack_speed, moveMul: d.talentBb.move_speed } }),
    source: `${PRTS}%E5%B1%B1%E6%B5%B7%E5%AF%86%E8%AF%AD%E4%BB%AA&oldid=337660`,
  },
});

/**
 * A level's devices with their profiles, and the ones without a profile.
 * @param {Record<string, DeviceDef>} devices @returns {{ devices: Record<string, DeviceDef>, missing: string[] }}
 */
export function profiledDevices(devices) {
  const missing = Object.keys(devices).filter((k) => !Object.hasOwn(DEVICE_PROFILES, k));
  return {
    devices: Object.fromEntries(Object.entries(devices).filter(([k]) => !missing.includes(k)).map(([k, d]) => [k, { ...d, ...DEVICE_PROFILES[k].profile(d) }])),
    missing,
  };
}
