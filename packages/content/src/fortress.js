// 堡垒守御's cards (docs/spec/fortress.md 守御-4): the builders of a 堡垒守御 level as cards of every seat's deck — their
// records from the level's device records, standing on melee and ranged tiles, free and never attacking; the counts
// are the simulation's (FortressState.pools).

/** @typedef {import('@aue/sim').OperatorDef} OperatorDef @typedef {import('@aue/sim').DeviceDef} DeviceDef */

/**
 * A builder's card record (守御-4) from its device record: its cost, attributes and builder profile; on melee and
 * ranged tiles, free and never attacking, back at once (no 再部署时间).
 * @param {string} key @param {DeviceDef} d @returns {OperatorDef}
 */
const builderDef = (key, d) => ({
  name: d.name, position: 'ALL', cost: d.cost ?? 0, blockCnt: 0, baseAttackTime: d.baseAttackTime, maxHp: d.maxHp, atk: d.atk, def: d.def, res: d.res, aspd: d.aspd,
  tauntLevel: d.tauntLevel, massLevel: d.massLevel, range: [], profession: 'TRAP', trait: { free: true, noAttack: true }, respawnTime: 0, char: key,
  builder: /** @type {NonNullable<DeviceDef['builder']>} */ (d.builder),
});

/**
 * Every seat's builder cards in a 堡垒守御 level (守御-4): for each of the level's token cards whose device is a builder,
 * a record keyed "id#seat" added to the operators and the seat's deck; nothing in another level.
 * @param {import('@aue/sim').Content['level']} level @param {Record<string, DeviceDef>} devices
 * @param {Record<string, OperatorDef>} operators changed in place @param {string[][]} decks changed in place
 */
export function withBuilders(level, devices, operators, decks) {
  if (!level.fortress) return;
  const keys = (level.cards?.tokens ?? []).map((t) => t.key).filter((k) => devices[k]?.builder);
  decks.forEach((deck, seat) => {
    for (const k of keys) {
      operators[`${k}#${seat}`] = builderDef(k, devices[k]);
      deck.push(`${k}#${seat}`);
    }
  });
}
