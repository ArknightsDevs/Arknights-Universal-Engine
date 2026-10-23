// 足球类敌人 (docs/spec/football.md 足球-2): talent `physic` gives a ball its friction factor, restitution, default force
// and the damage that kicks it; `aura` with only `block_cnt` is the block a unit of ours needs left to stop it — read
// here, so that `aura` is not 敌能-28's supply car.
/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior */

/** The keys of a ball's `physic` (足球-2). */
export const PHYSIC_KEYS = Object.freeze(['friction_factor', 'restitution_factor', 'value', 'force']);

/** The block a ball's `aura` gives when it has none (足球-2: 「阻挡数不小于3」). */
const BALL_BLOCK = 3;

/** Whether an `aura` blackboard is a ball's (足球-2): `block_cnt` alone. @param {Record<string, unknown>} bb */
export const ballAura = (bb) => {
  const keys = Object.keys(bb);
  return keys.length === 1 && keys[0] === 'block_cnt' && typeof bb.block_cnt === 'number';
};

/**
 * `physic` (足球-2): at its spawn the enemy becomes a ball — `aura`'s `block_cnt` (3 when it has no ball `aura`); a goal
 * of it scores `score` (足球-7: the page's extra for 至纯源石球), else 1.
 * @type {FoeBehavior}
 */
const physic = Object.freeze({
  spawn: (ctx) => {
    const bb = ctx.bb, aura = ctx.talent('aura');
    if (!PHYSIC_KEYS.every((k) => typeof bb[k] === 'number')) return;
    const block = aura && ballAura(aura) ? /** @type {number} */ (aura.block_cnt) : BALL_BLOCK;
    ctx.ball({ friction: bb.friction_factor, restitution: bb.restitution_factor, force: bb.force, need: bb.value, block, points: typeof bb.score === 'number' ? bb.score : 1 });
  },
});

/** The behaviours of this file, by talent name. @type {Readonly<Record<string, FoeBehavior>>} */
export const ballBehaviors = Object.freeze({ physic });
