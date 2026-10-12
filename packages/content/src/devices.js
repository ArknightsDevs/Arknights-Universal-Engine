// The official devices (docs/spec/devices.md 装置-3, 装置-4, docs/spec/field.md 地图-3): what each device a level places is
// beyond its record — its side, the statuses it is immune to, what it gives the enemies while on the field — from its
// PRTS page; the numbers come from the record's own talent blackboard where the data has them. A controller is no unit:
// it sets a rule of the level. A level with a device not profiled here is not supported yet (levelAt refuses it).

/** @typedef {import('@aue/sim').DeviceDef} DeviceDef */

const PRTS = 'https://prts.wiki/index.php?title=';

/** @typedef {{ dealt: number, taken: number }} WorksRule the 工事 rule (地图-3) */

/**
 * Per device: what it adds to its record, or the level rule it sets, with the PRTS revision that says so.
 * @type {Readonly<Record<string, { profile?: (d: DeviceDef) => Partial<DeviceDef>, works?: (d: DeviceDef) => WorksRule, source: string }>>}
 */
export const DEVICE_PROFILES = Object.freeze({
  // 城防路障: 阵营=我方；持有禁疗、孤立、晕眩免疫、冻结免疫、寒冷免疫、沉默免疫、沉睡免疫
  trap_097_hstone: { profile: () => ({ immune: ['stun', 'freeze', 'cold', 'silence', 'sleep'] }), source: `${PRTS}%E5%9F%8E%E9%98%B2%E8%B7%AF%E9%9A%9C&oldid=417801` },
  // 山海密语仪: 阵营=敌方；在场时，所有敌方单位的攻击速度+25，移动速度最终提升至115%（可无限叠加）
  trap_096_gflag: {
    profile: (d) => ({ side: 'ENEMY', enemyMods: { aspd: d.talentBb.attack_speed, moveMul: d.talentBb.move_speed } }),
    source: `${PRTS}%E5%B1%B1%E6%B5%B7%E5%AF%86%E8%AF%AD%E4%BB%AA&oldid=337660`,
  },
  // 地形增伤控制: 位于<玉门天灾工事>中的单位对位于普通地块中的非飞行单位，造成伤害提升至130%，受到伤害降低至70%
  trap_103_ymdgct: {
    works: (d) => ({ dealt: d.talentBb['ymdgct_damage_scale[up].damage_scale'], taken: d.talentBb['ymdgct_damage_scale[down].damage_scale'] }),
    source: `${PRTS}%E5%9C%B0%E5%BD%A2%E5%A2%9E%E4%BC%A4%E6%8E%A7%E5%88%B6&oldid=421599`,
  },
});

/**
 * A level's devices with their profiles, the 工事 rule a controller among them sets, and the devices without a profile.
 * @param {Record<string, DeviceDef>} devices @returns {{ devices: Record<string, DeviceDef>, works?: WorksRule, missing: string[] }}
 */
export function profiledDevices(devices) {
  const missing = Object.keys(devices).filter((k) => !Object.hasOwn(DEVICE_PROFILES, k)), known = Object.entries(devices).filter(([k]) => !missing.includes(k));
  const units = known.filter(([k]) => DEVICE_PROFILES[k].profile), rule = known.find(([k]) => DEVICE_PROFILES[k].works);
  return {
    devices: Object.fromEntries(units.map(([k, d]) => [k, { ...d, .../** @type {(d: DeviceDef) => Partial<DeviceDef>} */ (DEVICE_PROFILES[k].profile)(d) }])),
    ...(rule ? { works: /** @type {(d: DeviceDef) => WorksRule} */ (DEVICE_PROFILES[rule[0]].works)(rule[1]) } : {}),
    missing,
  };
}
