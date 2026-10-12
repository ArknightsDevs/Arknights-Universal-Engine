// Enemy abilities of the official content (docs/spec/foes.md 敌能-5…敌能-11): behaviours by talent and skill name. The
// game data holds only the multipliers; FOE_EXTRAS adds, per enemy, the parameters PRTS gives (radii, delays, bolts …)
// to the blackboards the behaviours read. They act only through the context (ADR 0055).

import { moreFoeBehaviors } from './abilities.js';

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior @typedef {import('@aue/sim').EnemyDef} EnemyDef */

const PRTS = 'https://prts.wiki/index.php?title=';
/**
 * Per enemy, what to add to a talent's or skill's blackboard, with the PRTS revision that gives it.
 * @type {Readonly<Record<string, { talents?: Record<string, Record<string, number>>, skills?: Record<string, Record<string, number>>, source: string }>>}
 */
export const FOE_EXTRAS = Object.freeze({
  // 冰爆源石虫: 死亡爆炸（爆炸半径1.65，延迟1秒，爆炸时来源无效 …… 物理溅射伤害 …… 不可对空）
  enemy_1067_snslime: { talents: { boom: { radius: 1.65, delay: 1, arts: 0, air: 0, sourced: 0 } }, source: `${PRTS}%E5%86%B0%E7%88%86%E6%BA%90%E7%9F%B3%E8%99%AB&oldid=435593` },
  // "喷射罐"/"喷爆罐": 对半径1.55范围内的我方单位造成攻击力100%的法术溅射伤害与10s寒冷（可被沉默）
  enemy_1385_winbom: { talents: { Boom: { radius: 1.55, delay: 0, arts: 1, air: 1, sourced: 1 } }, source: `${PRTS}%E2%80%9C%E5%96%B7%E5%B0%84%E7%BD%90%E2%80%9D&oldid=435426` },
  enemy_1385_winbom_2: { talents: { Boom: { radius: 1.55, delay: 0, arts: 1, air: 1, sourced: 1 } }, source: `${PRTS}%E2%80%9C%E5%96%B7%E7%88%86%E7%BD%90%E2%80%9D&oldid=435425` },
  // 帝国前锋精锐: 未被阻挡时可进行远程攻击，远程攻击造成攻击力50%的物理伤害，不会攻击飞行单位
  enemy_1113_empace: { talents: { ranged: { scale: 0.5 } }, source: `${PRTS}%E5%B8%9D%E5%9B%BD%E5%89%8D%E9%94%8B%E7%B2%BE%E9%94%90&oldid=435717` },
  // 匪帮轰击者/匪帮轰击者头目: 未被阻挡时可进行远程攻击，对目标及周围8格内的我方单位造成攻击力50%的物理伤害
  enemy_1359_ekulsr: { talents: { ranged: { scale: 0.5, square: 1 } }, source: `${PRTS}%E5%8C%AA%E5%B8%AE%E8%BD%B0%E5%87%BB%E8%80%85&oldid=435794` },
  enemy_1359_ekulsr_2: { talents: { ranged: { scale: 0.5, square: 1 } }, source: `${PRTS}%E5%8C%AA%E5%B8%AE%E8%BD%B0%E5%87%BB%E8%80%85%E5%A4%B4%E7%9B%AE&oldid=435795` },
  // 速射轻弩手/速射劲弩手: 向目标方向发射3支弩箭，每支弩箭对击中的首个目标造成攻击力100%的物理伤害
  enemy_1403_gunsho: { skills: { CrossAttack: { bolts: 3, arts: 0, charge: 0, hold: 0, hide: 0 } }, source: `${PRTS}%E9%80%9F%E5%B0%84%E8%BD%BB%E5%BC%A9%E6%89%8B&oldid=436612` },
  enemy_1403_gunsho_2: { skills: { CrossAttack: { bolts: 3, arts: 0, charge: 0, hold: 0, hide: 0 } }, source: `${PRTS}%E9%80%9F%E5%B0%84%E5%8A%B2%E5%BC%A9%E6%89%8B&oldid=436611` },
  // 重弩突袭者/重弩猎杀者: 蓄力1.4s后向目标方向发射1支弩箭 …… 法术伤害 …… 技能持续2.5s；隐匿（被阻挡，主动攻击期间均可解除）
  enemy_1404_msnip: { skills: { CrossAttack: { bolts: 1, arts: 1, charge: 1.4, hold: 2.5, hide: 1 } }, source: `${PRTS}%E9%87%8D%E5%BC%A9%E7%AA%81%E8%A2%AD%E8%80%85&oldid=437074` },
  enemy_1404_msnip_2: { skills: { CrossAttack: { bolts: 1, arts: 1, charge: 1.4, hold: 2.5, hide: 1 } }, source: `${PRTS}%E9%87%8D%E5%BC%A9%E7%8C%8E%E6%9D%80%E8%80%85&oldid=437073` },
});

/**
 * An enemy with its extras (FOE_EXTRAS) merged into its talents' and skills' blackboards.
 * @param {string} key @param {EnemyDef} def @returns {EnemyDef}
 */
export function withFoeExtras(key, def) {
  const x = FOE_EXTRAS[key];
  if (!x) return def;
  const talents = { ...def.talents };
  for (const [t, bb] of Object.entries(x.talents ?? {})) talents[t] = { ...talents[t], ...bb };
  const skills = (def.skills ?? []).map((s) => ({ ...s, bb: { ...s.bb, ...x.skills?.[s.key] } }));
  return { ...def, talents, ...(def.skills ? { skills } : {}) };
}

/** 死亡爆炸 (敌能-5): knocked down and not silenced, it explodes where it fell. @type {FoeBehavior['death']} */
const deathBlast = (ctx) => {
  const s = ctx.stats(ctx.self), bb = ctx.bb;
  if (s.flags.silence) return;
  ctx.blast({
    x: ctx.self.x, y: ctx.self.y, radius: bb.radius, delay: bb.delay, air: bb.air === 1, sourced: bb.sourced === 1,
    type: bb.arts === 1 ? 'arts' : 'phys', amount: s.atk * bb.atk_scale, status: { key: 'cold', seconds: bb.freeze },
  });
};

/** 冰爆源石虫 (敌能-5). @type {FoeBehavior} */
const boom = Object.freeze({ death: deathBlast });

/** "喷射罐" (敌能-5, 敌能-6): the explosion, and its attack a channel of hits over seconds, then a cooldown. @type {FoeBehavior} */
const Boom = Object.freeze({
  death: deathBlast,
  attack: (ctx, mods) => ({ ...mods, type: 'arts', scale: ctx.bb.atk_scale, channel: { hits: ctx.bb['attack@times'], duration: ctx.bb['attack@cooldown'], after: ctx.bb['attack@attack_cd'] } }),
});

/** "投石机" (敌能-7): the first attack reaches its attack radius, as arts with a cross splash; then melee only. @type {FoeBehavior} */
const FirstAttack = Object.freeze({
  targets: (ctx, cands) => (ctx.state.get('thrown') ? cands : [...new Set([...cands, ...ctx.foes(ctx.self.base.rangeRadius + 0.25)])]),
  attack: (ctx, mods) => {
    if (ctx.state.get('thrown')) return mods;
    ctx.state.set('thrown', 1);
    return { ...mods, type: 'arts', scale: ctx.bb['attack@first_atk_scale'], cross: true };
  },
});

/** 帝国前锋精锐 (敌能-8): ATK up while below half its HP. @type {FoeBehavior} */
const atkup = Object.freeze({
  tick: (ctx) => {
    const low = ctx.self.hp < ctx.stats(ctx.self).maxHp * 0.5, has = ctx.self.buffs.some((b) => b.key === 'atkup');
    if (low && !has) ctx.addBuff(ctx.self, { key: 'atkup', mods: { atkPct: ctx.bb.atk } });
    else if (!low && has) ctx.removeBuff(ctx.self, 'atkup');
  },
});

/**
 * 帝国前锋精锐's attack while unblocked (敌能-8): ground units within its attack radius at `scale` of its attack; among
 * the most taunting, neutral units first.
 * @type {FoeBehavior}
 */
const ranged = Object.freeze({
  targets: (ctx, cands) => {
    if (ctx.blocked) return cands;
    const near = ctx.foes(ctx.self.base.rangeRadius + 0.25).filter((u) => !ctx.stats(u).flying);
    const top = Math.max(...near.map((u) => ctx.stats(u).taunt)), tied = near.filter((u) => ctx.stats(u).taunt === top);
    return tied.some((u) => u.base.neutral) ? tied.filter((u) => u.base.neutral) : near;
  },
  attack: (ctx, mods) => (ctx.blocked ? mods : { ...mods, scale: mods.scale * ctx.bb.scale, ...(ctx.bb.square ? { square: true } : {}) }),
});

/** A direction along a row or column from the enemy to a unit in line. @param {{ x: number, y: number }} a @param {{ x: number, y: number }} b */
const toward = (a, b) => (Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? { dx: Math.sign(b.x - a.x), dy: 0 } : { dx: 0, dy: Math.sign(b.y - a.y) });

/**
 * 直击 (敌能-9): unblocked, able to act, not silenced, cooldown over and someone in line — the bolts at once, or after a
 * charge while it stands for the skill's duration; 隐匿 while unblocked and not in the skill when it has the talent.
 * @type {FoeBehavior}
 */
const CrossAttack = Object.freeze({
  tick: (ctx) => {
    const st = ctx.state;
    if (st.get('busy') > 0) st.set('busy', st.get('busy') - 1);
    if (st.get('charge') > 0) {
      st.set('charge', st.get('charge') - 1);
      if (st.get('charge') === 0) crossFire(ctx);
    } else crossStart(ctx);
    if (ctx.bb.hide === 1) crossHide(ctx);
  },
});

/** 直击's bolts (敌能-9): `bolts` of them in the chosen direction. @param {import('@aue/sim').FoeContext} ctx */
function crossFire(ctx) {
  const bb = ctx.bb, st = ctx.state, atk = ctx.stats(ctx.self).atk;
  for (let i = 0; i < bb.bolts; i++) {
    ctx.bolt({ dx: st.get('dx'), dy: st.get('dy'), type: bb.arts === 1 ? 'arts' : 'phys', amount: atk * (bb.atk_scale ?? 1), ...(bb.stun ? { status: { key: 'stun', seconds: bb.stun } } : {}) });
  }
}

/** 直击 starting (敌能-9): ready, unblocked, able to act, not silenced, someone in line. @param {import('@aue/sim').FoeContext} ctx */
function crossStart(ctx) {
  const bb = ctx.bb, s = ctx.stats(ctx.self), [t] = ctx.inLine();
  if (!ctx.ready || ctx.blocked || s.disabled || s.flags.silence || !t) return;
  const d = toward(ctx.self, t);
  ctx.state.set('dx', d.dx); ctx.state.set('dy', d.dy);
  ctx.use();
  ctx.state.set('busy', ctx.frames(bb.hold));
  if (bb.hold > 0) ctx.applyStatus(ctx.self, 'root', { seconds: bb.hold });
  if (bb.charge > 0) ctx.state.set('charge', ctx.frames(bb.charge));
  else crossFire(ctx);
}

/** 隐匿 (敌能-9): hidden while unblocked and not in the skill. @param {import('@aue/sim').FoeContext} ctx */
function crossHide(ctx) {
  const hidden = ctx.self.buffs.some((b) => b.key === 'hide'), hide = !ctx.blocked && ctx.state.get('busy') === 0;
  if (hide && !hidden) ctx.addBuff(ctx.self, { key: 'hide', flags: { stealth: true } });
  else if (!hide && hidden) ctx.removeBuff(ctx.self, 'hide');
}

/** 掷弹 (敌能-10): once, hurt while unblocked and not silenced — four bomb bolts, then faster and lighter. @type {FoeBehavior} */
const Bomb = Object.freeze({
  tick: (ctx) => {
    const s = ctx.stats(ctx.self);
    if (ctx.state.get('done') || !ctx.hurt || ctx.blocked || s.flags.silence) return;
    ctx.state.set('done', 1);
    for (const [dx, dy] of [[0, 1], [0, -1], [-1, 0], [1, 0]]) ctx.bolt({ dx, dy, type: 'phys', amount: s.atk * ctx.bb.atk_scale, blast: ctx.bb.projectile_range });
    const light = ctx.talent('Light') ?? {};
    ctx.addBuff(ctx.self, { key: 'light', mods: { moveFlat: light.move_speed ?? 0, massFlat: light.mass_level ?? 0 } });
  },
});

/** 强击 (敌能-11): a mark when it appears and whenever its block ends; the next attack with the mark is stronger. @type {FoeBehavior} */
const PowerHit = Object.freeze({
  spawn: (ctx) => { ctx.state.set('mark', 1); },
  tick: (ctx) => { if (ctx.unblocked) ctx.state.set('mark', 1); },
  attack: (ctx, mods) => {
    if (!ctx.state.get('mark')) return mods;
    ctx.state.set('mark', 0);
    return { ...mods, atkPct: (mods.atkPct ?? 0) + ctx.bb.atk };
  },
});

/** Behaviours by talent or skill name. @type {Readonly<Record<string, FoeBehavior>>} */
export const foeBehaviors = Object.freeze({ boom, Boom, FirstAttack, atkup, ranged, CrossAttack, Bomb, PowerHit, ...moreFoeBehaviors });

/**
 * Talents with no behaviour of their own that are still covered (关卡-2): `dead` is the data's 生命 loss of a neutral
 * unit (合作-9), `Light` is read by `Bomb`, `DmgUp` acts only on devices the engine does not have (敌能-11).
 */
export const FOE_COVERED = Object.freeze(['dead', 'Light', 'DmgUp']);

/**
 * The abilities (talents and skills) of the given enemies that have no behaviour and are not covered otherwise
 * (关卡-2), in order of first appearance.
 * @param {Iterable<EnemyDef>} enemies @returns {string[]}
 */
export function uncoveredAbilities(enemies) {
  const out = new Set();
  for (const e of enemies) {
    for (const k of [...Object.keys(e.talents ?? {}), ...(e.skills ?? []).map((s) => s.key)]) if (!Object.hasOwn(foeBehaviors, k) && !FOE_COVERED.includes(k)) out.add(k);
  }
  return [...out];
}
