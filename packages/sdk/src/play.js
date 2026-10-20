// `aue mod test` (docs/mods.md): headless matches with mods' content — each operator a mod adds or changes fought at its
// top training, each level it adds or changes played at both difficulties — by a script that deploys and casts as soon
// as it can; a match passes when it runs to its end, or to the time given, without an error.
import { FPS } from '@aue/math';
import { createWorld, step, deployProblem, deck, KIND, DIR } from '@aue/sim';
import { matchContent } from '@aue/content';

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Content} Content @typedef {import('@aue/content').ContentSource} ContentSource */
/** A match's outcome: what it tests, where, how far it ran, its result (−1 none yet), the error if it failed. @typedef {{ what: string, level: string, difficulty: string, seconds: number, result: number, error: string | null }} Played */

/** Every how many frames the script tries to deploy. */
const DEPLOY_EVERY = 15;
/** The level an operator is fought on when the mods add or change none. */
const DEFAULT_LEVEL = 'act1multi_01';

/** @param {number} dx @param {number} dy */
const facing = (dx, dy) => (Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? DIR.RIGHT : DIR.LEFT) : dy >= 0 ? DIR.UP : DIR.DOWN);

/**
 * The routes' ends, each once, with a start of a route that ends there.
 * @param {Content} c @returns {{ end: { row: number, col: number }, start: { row: number, col: number } }[]}
 */
function endsOf(c) {
  const ends = new Map();
  for (const r of /** @type {any[]} */ (/** @type {any} */ (c.level).routes)) if (r?.start && r?.end && !ends.has(`${r.end.row},${r.end.col}`)) ends.set(`${r.end.row},${r.end.col}`, { end: r.end, start: r.start });
  return [...ends.values()];
}

/**
 * The deploy of a seat's first deck unit it can deploy now, or null: on the deployable tile nearest a route's end,
 * facing that route's start.
 * @param {World} w @param {Content} c @param {number} seat
 */
function deployNow(w, c, seat) {
  const p = w.players[seat], ends = endsOf(c);
  for (const op of c.decks?.[seat] ?? []) {
    if (p.deployed.includes(op) || p.cost < deck.deployCost(c, p, op, w)) continue;
    /** @type {{ d: number, cmd: import('@aue/schema').Command } | null} */
    let best = null;
    for (let row = 0; row < c.level.height; row++) {
      for (let col = 0; col < c.level.width; col++) {
        const g = ends.map((e) => ({ ...e, d: (e.end.row - row) ** 2 + (e.end.col - col) ** 2 })).reduce((a, b) => (b.d < a.d ? b : a), { d: Infinity, end: { row, col }, start: { row, col } });
        const cmd = /** @type {const} */ ({ type: 'deploy', op, row, col, dir: facing(g.start.col - col, g.start.row - row) });
        if ((!best || g.d < best.d) && deployProblem(w, c, seat, cmd) === null) best = { d: g.d, cmd };
      }
    }
    if (best) return best.cmd;
  }
  return null;
}

/** @param {World} w @param {Content} c @param {number} seat @returns {import('@aue/schema').Command[]} a seat's commands this frame */
function commandsOf(w, c, seat) {
  const out = [];
  const cmd = w.frame % DEPLOY_EVERY === 0 ? deployNow(w, c, seat) : null;
  if (cmd) out.push(cmd);
  for (const u of w.units) {
    if (u.kind !== KIND.OPERATOR || u.owner !== seat || u.hp <= 0 || !u.skill) continue;
    if (!u.skill.active && u.skill.sp >= u.skill.cost && c.operators[u.key].skill?.type === 'MANUAL') out.push(/** @type {const} */ ({ type: 'skill', unit: u.id }));
  }
  return out;
}

/**
 * One match run headless, to its end or `seconds`.
 * @param {ContentSource} source @param {{ what: string, level: string, difficulty: 'NORMAL' | 'FOUR_STAR', decks: () => Promise<{ id: string, build: any }[][]> }} m
 * @param {number} seconds
 * @returns {Promise<Played>}
 */
async function playOne(source, m, seconds) {
  const out = { what: m.what, level: m.level, difficulty: m.difficulty, seconds: 0, result: -1, error: /** @type {string | null} */ (null) };
  try {
    const decks = await m.decks();
    const c = await matchContent({ level: m.level, difficulty: m.difficulty, seed: 1, decks }, { source });
    const w = createWorld(c, { seed: 1, players: decks.length });
    while (w.result < 0 && w.frame < seconds * FPS) {
      /** @type {[number, import('@aue/schema').Command][]} */
      const cmds = [];
      for (let seat = 0; seat < decks.length; seat++) for (const cmd of commandsOf(w, c, seat)) cmds.push([seat, cmd]);
      step(w, c, cmds);
    }
    Object.assign(out, { seconds: Math.round(w.frame / FPS), result: w.result });
  } catch (e) {
    out.error = /** @type {Error} */ (e).stack ?? String(e);
  }
  return out;
}

/**
 * An operator's top training: its last elite phase at its top level, its last skill at its top level, no module.
 * @param {import('@aue/content').Training} t
 */
function topBuild(t) {
  const skills = t.skills.filter((s) => s !== null), last = skills.at(-1);
  return { elite: t.phases.length - 1, level: /** @type {any} */ (t.phases.at(-1)).maxLevel, potential: 1, trust: 100, skill: skills.length - 1, skillLevel: last ? last.levels.length : 1 };
}

/**
 * The matches of a source's mods (mod-8): each operator they add or change, on the first level they add or change (or
 * IG-1), at its top training; each level they add or change at both difficulties with nobody deployed.
 * @param {ContentSource} source @param {{ seconds?: number }} [o] how long a match runs at most (default 180 s)
 * @returns {Promise<Played[]>}
 */
export async function playMods(source, { seconds = 180 } = {}) {
  const records = source.reports.filter((r) => r.loaded).flatMap((r) => [...(r.added ?? []), ...(r.changed ?? [])]);
  const ids = (/** @type {string} */ table) => [...new Set(records.filter((x) => x.startsWith(`${table}/`)).map((x) => x.slice(table.length + 1)))];
  const levels = ids('levels'), on = levels[0] ?? DEFAULT_LEVEL;
  const out = [];
  for (const id of ids('operators')) {
    const decks = async () => [[{ id, build: topBuild(await source.training(id)) }], []];
    out.push(await playOne(source, { what: `operators/${id}`, level: on, difficulty: 'NORMAL', decks }, seconds));
  }
  for (const level of levels) {
    for (const difficulty of /** @type {const} */ (['NORMAL', 'FOUR_STAR'])) out.push(await playOne(source, { what: `levels/${level}`, level, difficulty, decks: async () => [[], []] }, seconds));
  }
  return out;
}
