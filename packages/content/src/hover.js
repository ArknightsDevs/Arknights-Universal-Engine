// 破烂发明家's 装甲 and 山海众掌令使's 山海密语仪 (docs/spec/foes.md 敌能-20, 敌能-21): the first block lifts the one into
// 近地悬浮 for a while, after which its defence drops; the other, unblocked, places a 山海密语仪 on the first deployable
// 玉门天灾工事 it passes. They act only through the context (ADR 0055).

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior */

/**
 * 装甲 (敌能-20): 免疫失衡 throughout; the first time it is blocked its block ends and it hovers (近地悬浮: in the air, no
 * normal attacks) for `attack@fly_duration` seconds; when that ends its block ends again and its 防御力 changes by `def`
 * (直接加算) for good.
 * @type {FoeBehavior}
 */
const Armor = Object.freeze({
  spawn: (ctx) => { ctx.addBuff(ctx.self, { key: 'steady', flags: { noDisplace: true } }); },
  tick: (ctx) => {
    const self = ctx.self, st = ctx.state, phase = st.get('phase');
    if (phase === 0 && ctx.blocked) {
      st.set('phase', 1);
      ctx.release();
      ctx.addBuff(self, { key: 'hover', flags: { hover: true, noAttack: true }, left: ctx.frames(ctx.bb['attack@fly_duration']) });
    } else if (phase === 1 && !self.buffs.some((b) => b.key === 'hover')) {
      st.set('phase', 2);
      ctx.release();
      ctx.addBuff(self, { key: 'armor', mods: { defFlat: ctx.bb.def } });
    }
  },
});

/** The 玉门天灾工事 a device may be placed on (地图-3: the deployable one). */
const WORKS = 'tile_passable_wall';

/**
 * 山海密语仪 (敌能-21): unblocked and able to act, on a deployable 玉门天灾工事 with no operator or device on it, it places a
 * 山海密语仪 there — once.
 * @type {FoeBehavior}
 */
const PlaceFlag = Object.freeze({
  tick: (ctx) => {
    if (ctx.state.get('done') || ctx.blocked || ctx.stats(ctx.self).disabled || ctx.tileKey() !== WORKS) return;
    if (ctx.placeDevice('trap_096_gflag')) ctx.state.set('done', 1);
  },
});

/** The behaviours of this file, by talent name. @type {Readonly<Record<string, FoeBehavior>>} */
export const hoverBehaviors = Object.freeze({ Armor, PlaceFlag });
