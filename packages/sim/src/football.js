// 阵地足球 (docs/spec/football.md): the ball's hook — a hit on a ball deals it nothing and adds to its kick (足球-3) —
// and the abilities' way to make an enemy a ball (足球-2).
import { on } from './bus.js';
import { makeBall, ballHit, FORCE_TO_SPEED } from './ball.js';
import { kickSlide } from './displacement.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Unit} Unit */

/** The owner of the ball's hook (钩子-1). */
const OWNER = 'ball';

/**
 * The ball's hook (足球-2, 足球-3, 钩子-3), once per world while it has a ball — hooks are no state (ADR 0057): a hit on a
 * ball deals it nothing; what it adds may kick the ball at its force.
 * @param {World} w
 */
export function ballHooks(w) {
  if (!w.units.some((u) => u.ball) || w.bus?.hooks.get('hpDamage')?.some((h) => h.owner === OWNER)) return;
  on(w, 'hpDamage', (ctx) => {
    const b = ctx.target;
    if (!b.ball) return;
    const dir = ballHit(b, ctx.source, ctx.amount);
    ctx.amount = 0;
    if (dir) kickSlide(b, dir[0], dir[1], b.ball.force * FORCE_TO_SPEED);
  }, { owner: OWNER });
}

/**
 * The context's ball member (足球-2): makes the enemy a ball, its hook on at once.
 * @param {World} w @param {Unit} e @returns {Pick<import('./foes.js').FoeContext, 'ball'>}
 */
export function ballContext(w, e) {
  return { ball: (p) => { makeBall(e, p); ballHooks(w); } };
}
