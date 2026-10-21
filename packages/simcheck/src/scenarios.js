// The matches of the cross-engine check (docs/spec/lockstep.md 同步-12): three levels, two seats of elite-2 six-stars
// with a play style each, commands worked out from the battle itself by a script that uses no chance and no inexact
// math, and the state hash (同步-1) every 30 frames. The decks' operators that have an enabled kit fight with it, as in
// a real match (兼容-6). This module runs the same in Node and in a browser: it uses no Node built-ins, only the
// engine's packages; where the kits come from is the environment's.
import { matchContent, loadKits } from '@aue/content';
import { createWorld, step, stateHash, deployProblem, deck, KIND, DIR } from '@aue/sim';

/** Every how many frames a hash is taken, and how many frames a match runs at most (同步-12). */
export const HASH_EVERY = 30, FRAMES = 3600;
/** Every how many frames the script deploys, and the frame seat 0 retreats its earliest operator still on the field. */
const DEPLOY_EVERY = 15, RETREAT_AT = 1800;

/** @typedef {import('@aue/schema').Match} Match @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Content} Content */
/** @typedef {{ name: string, match: Match }} Scenario */
/** A match's run: its state hashes, the frame it ended at, its result, the kits it ran with. @typedef {{ name: string, hashes: number[], frame: number, result: number, kits: string[] }} Run */
/** The kit factories by character id, as loadKits gives them. @typedef {Awaited<ReturnType<typeof loadKits>>['kits']} Kits */

const BUILD = Object.freeze({ elite: 2, level: 90, potential: 1, trust: 100, skill: 2, skillLevel: 10 });
/** @param {string[]} ids */
const deckOf = (ids) => ids.map((id) => ({ id, build: { ...BUILD } }));
/** Each seat's eight: one of each profession, summoners among them. */
const DECKS = Object.freeze([
  deckOf(['char_112_siege', 'char_017_huang', 'char_136_hsguma', 'char_1013_chen2', 'char_134_ifrit', 'char_003_kalts', 'char_2023_ling', 'char_1033_swire2']),
  deckOf(['char_222_bpipe', 'char_2024_chyue', 'char_2014_nian', 'char_1035_wisdel', 'char_2015_dusk', 'char_147_shining', 'char_1012_skadi2', 'char_225_haak']),
]);

/** @param {string} key @param {[string, number | string][]} board @param {number} [professions] */
const rune = (key, board, professions = 639) => ({ key, professions, board });
/** A carried unit's card. @param {string} key */
const card = (key) => rune('insert_token_card', [['token_key', key], ['level', 1], ['skill', 0], ['count', 1], ['skill_level', 1]], 384);
/** The play styles' runes as the activity table gives them (MULTIPLAY_V3/act1multi squadEffectList). */
const STYLES = Object.freeze({
  基础: [rune('char_attribute_mul', [['atk', 1.1]]), card('trap_201_muulco')],
  驻场: [rune('char_respawntime_mul', [['scale', 1.15]]), card('trap_197_muulwr'),
    rune('env_gbuff_new', [['key', 'attr_up_on_trigger[atk][max_hp]'], ['atk', 0.03], ['max_hp', 0.03], ['max_stack_cnt', 20], ['interval', 5]])],
  游走: [rune('char_respawntime_mul', [['scale', 0.8]]), rune('env_gbuff_new', [['key', 'modify_sp[born]'], ['sp', 10]]), card('trap_198_muulas'),
    rune('env_gbuff_new', [['key', 'sp_recovery_reduction'], ['sp_recovery_per_sec', 1]]), rune('global_deck_placeable_char_num_add', [['value', -1]])],
  攻坚: [card('trap_199_muulrg'), rune('char_attribute_mul', [['attack_speed', 1.2]]), rune('char_blockcnt_add', [['value', 0]]),
    rune('env_gbuff_new', [['key', 'attack_prob_get[sp][char]'], ['prob', 0.1], ['sp', 1]]), rune('env_gbuff_new', [['key', 'damage_scale[input][char]'], ['damage_scale', 1.2]])],
  支援: [card('trap_200_muulcl'), rune('char_dynamic_ability_new', [['key', 'dyn_attr_get_in_attack_range[modify_sp]'], ['sp', 1], ['interval', 1]]),
    rune('env_gbuff_new', [['key', 'damage_scale[out]'], ['damage_scale', 0.9]]), rune('env_gbuff_new', [['key', 'heal_scale[advanced][out]'], ['heal_scale', 1.4]])],
});

/** @param {string} level @param {number} seed @param {[keyof typeof STYLES, keyof typeof STYLES]} styles @returns {Match} */
const matchOf = (level, seed, styles) => ({ level, difficulty: 'NORMAL', seed, decks: DECKS.map((d) => d.map((x) => ({ ...x }))), runes: styles.map((s) => STYLES[s]) });

/** The matches (同步-12): the three levels, all five styles among them. @type {readonly Scenario[]} */
export const SCENARIOS = Object.freeze([
  { name: 'IG-1', match: matchOf('act1multi_01', 1209492319, ['基础', '支援']) },
  { name: 'IG-10', match: matchOf('act1multi_06', 20261016, ['游走', '攻坚']) },
  { name: 'IG-S-2', match: matchOf('act1multi_hard-02', 7, ['驻场', '基础']) },
]);

/** The routes' ends and each one's start. @param {Content} c */
function goalsOf(c) {
  const routes = /** @type {{ start: { row: number, col: number }, end: { row: number, col: number } }[]} */ (/** @type {any} */ (c.level).routes);
  return routes.filter((r) => r && r.end && r.start).map((r) => ({ end: r.end, start: r.start }));
}

/** The facing from a tile towards a point, by integer comparisons. @param {number} dx @param {number} dy */
const facing = (dx, dy) => (Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? DIR.RIGHT : DIR.LEFT) : dy >= 0 ? DIR.UP : DIR.DOWN);

/**
 * The deploy of a unit the script would make (同步-12), or null: the deployable tile nearest a route's end by squared
 * distance — then the lower row, then the lower column — facing that route's start.
 * @param {World} w @param {Content} c @param {number} seat @param {string} op @param {ReturnType<typeof goalsOf>} goals
 */
function tileFor(w, c, seat, op, goals) {
  /** @type {{ d: number, cmd: import('@aue/schema').Command } | null} */
  let best = null;
  for (let row = 0; row < c.level.height; row++) {
    for (let col = 0; col < c.level.width; col++) {
      for (const g of goals) {
        const dr = g.end.row - row, dc = g.end.col - col, d = dr * dr + dc * dc;
        if (best && d >= best.d) continue;
        const cmd = /** @type {const} */ ({ type: 'deploy', op, row, col, dir: facing(g.start.col - col, g.start.row - row) });
        if (deployProblem(w, c, seat, cmd) === null) best = { d, cmd };
      }
    }
  }
  return best?.cmd ?? null;
}

/**
 * The first unit of a seat's deck the script can deploy now, as its deploy, or null: not on the field, its cost paid
 * for, a tile for it. @param {World} w @param {Content} c @param {number} seat
 */
function firstDeploy(w, c, seat) {
  const p = w.players[seat], goals = goalsOf(c);
  for (const op of c.decks?.[seat] ?? []) {
    if (p.deployed.includes(op) || p.cost < deck.deployCost(c, p, op, w)) continue;
    const cmd = tileFor(w, c, seat, op, goals);
    if (cmd) return cmd;
  }
  return null;
}

/**
 * A seat's commands this frame (同步-12): every 15 frames, the first unit of its deck it can deploy; each of its ready
 * manual skills; at frame 1800, seat 0's earliest operator still on the field retreats.
 * @param {World} w @param {Content} c @param {number} seat @returns {import('@aue/schema').Command[]}
 */
export function scriptOf(w, c, seat) {
  /** @type {import('@aue/schema').Command[]} */
  const out = [];
  if (w.frame % DEPLOY_EVERY === 0) {
    const cmd = firstDeploy(w, c, seat);
    if (cmd) out.push(cmd);
  }
  const mine = w.units.filter((u) => u.kind === KIND.OPERATOR && u.owner === seat && u.hp > 0);
  for (const u of mine) if (u.skill && !u.skill.active && u.skill.sp >= u.skill.cost && c.operators[u.key].skill?.type === 'MANUAL') out.push({ type: 'skill', unit: u.id });
  if (w.frame === RETREAT_AT && seat === 0 && mine.length > 0) out.push({ type: 'retreat', unit: mine.reduce((a, b) => (b.id < a.id ? b : a)).id });
  return out;
}

/**
 * One match run to its end or FRAMES: the state hash at every HASH_EVERY-th frame from frame 0. With kits, the deck's
 * operators that have one fight with it (兼容-6).
 * @param {Scenario} s @param {number} [frames] @param {Kits} [kits] @returns {Promise<Run>}
 */
export async function runScenario(s, frames = FRAMES, kits = {}) {
  const c = await matchContent(/** @type {any} */ (s.match), { kits });
  const seats = s.match.decks.length, w = createWorld(c, { seed: s.match.seed, players: seats });
  /** @type {number[]} */
  const hashes = [];
  while (w.frame < frames && w.result < 0) {
    if (w.frame % HASH_EVERY === 0) hashes.push(stateHash(w));
    /** @type {[number, import('@aue/schema').Command][]} */
    const cmds = [];
    for (let seat = 0; seat < seats; seat++) for (const cmd of scriptOf(w, c, seat)) cmds.push([seat, cmd]);
    step(w, c, cmds);
  }
  hashes.push(stateHash(w));
  const used = /** @type {{ kits?: { used: string[] } }} */ (/** @type {unknown} */ (c)).kits?.used ?? [];
  return { name: s.name, hashes, frame: w.frame, result: w.result, kits: [...used] };
}

/**
 * The enabled kits of the decks' operators from the pinned commit at `base` (a URL ending in "/"); every one must
 * load, or the check would compare the engine's own fighting with the kits'. @param {string} base @returns {Promise<Kits>}
 */
export async function kitsAt(base) {
  const { kits, failed } = await loadKits(base, SCENARIOS.flatMap((s) => s.match.decks.flat().map((x) => x.id)));
  if (failed.length > 0) throw new Error(`kits that did not load: ${failed.join(', ')}`);
  return kits;
}

/**
 * Every match of the check, one after another; with `kitBase`, the kits of that commit (kitsAt).
 * @param {number} [frames] @param {string | null} [kitBase] @returns {Promise<Run[]>}
 */
export async function runAll(frames = FRAMES, kitBase = null) {
  const kits = kitBase ? await kitsAt(kitBase) : {};
  /** @type {Run[]} */
  const out = [];
  for (const s of SCENARIOS) out.push(await runScenario(s, frames, kits));
  return out;
}
