// The deploy cards (docs/spec/ui.md 界面-10): one card a deck operator not on the field, in the deck's order along the
// bottom of the screen — its avatar, profession, rarity, elite phase and deploy cost; greyed while it cannot be
// deployed; the 再部署 countdown over it while it waits; raised while selected.
import { refNode } from '../node.js';

/** @typedef {import('../node.js').UiNode} UiNode */
/** @typedef {import('../screen.js').Screen} Screen */
/**
 * A deck operator's card as the page gives it: its avatar (a URL; none: the card has none), profession (the data's
 * name: WARRIOR, SNIPER, …), rarity 1–6, elite phase 0–2, 再部署时间 in seconds.
 * @typedef {{ id: string, avatar: string | null, profession: string, rarity: number, phase: number, respawn: number }} DeckCard
 */
/** What a card shows now. @typedef {{ id: string, cost: number, waiting: boolean, wait: number, ratio: number, usable: boolean }} CardView */
/**
 * The deck's state: the frame and frames a second, the cost the player has, each card's cost now and the frame it may
 * be deployed again from, the operators on the field, how many more the player may deploy.
 * @typedef {{ frame: number, fps: number, cost: number, cards: Record<string, { cost: number, ready: number }>, deployed: string[], slots: number }} DeckState
 */

/**
 * The cards shown (界面-10): the deck's operators not on the field, in the deck's order; each waits while the frame is
 * before its ready frame (the seconds left, and their share of its 再部署时间); usable when not waiting, its cost is paid
 * and a deploy slot is left.
 * @param {DeckCard[]} deck @param {DeckState} s @returns {CardView[]}
 */
export function cardViews(deck, s) {
  return deck.filter((d) => !s.deployed.includes(d.id)).map((d) => {
    const c = s.cards[d.id] ?? { cost: 0, ready: 0 }, waiting = s.frame < c.ready, wait = waiting ? (c.ready - s.frame) / s.fps : 0;
    const ratio = waiting && d.respawn > 0 ? Math.min(1, wait / d.respawn) : 0;
    return { id: d.id, cost: c.cost, waiting, wait, ratio, usable: !waiting && c.cost <= s.cost && s.slots > 0 };
  });
}

/** A card's width for n cards on a canvas w wide: the canvas shared, within the pack's range. @param {number} n @param {number} w @param {number[]} range */
export const cardWidth = (n, w, range) => Math.max(range[0], Math.min(range[1], n > 0 ? w / n : range[1]));

/** The countdown's text: the seconds left to one decimal. @param {number} wait */
export const waitText = (wait) => wait.toFixed(1);

/**
 * The cards on a screen: instantiated into the list from the card template once, filled with what does not change;
 * `update` shows the deck's state.
 * @param {Screen} scr @param {Record<string, any>} hud the pack's hud section @param {DeckCard[]} deck
 */
export function createCards(scr, hud, deck) {
  const c = hud.card, list = refNode(scr.root, hud.list.container);
  if (!list) throw new Error('the battle UI pack has no card list');
  const cards = new Map(deck.map((d) => [d.id, makeCard(scr, c, list, d)]));
  return {
    cards,
    /** @param {CardView[]} views @param {string | null} selected @param {number} canvasW */
    update(views, selected, canvasW) {
      const shown = new Set(views.map((v) => v.id)), width = cardWidth(views.length, canvasW, hud.list.widths);
      for (const [id, k] of cards) k.root.active = shown.has(id);
      for (const v of views) showCard(scr, c, /** @type {Card} */ (cards.get(v.id)), v, { selected: v.id === selected, width });
    },
  };
}

/** @typedef {{ root: UiNode, node: (key: string) => UiNode | null, tints: [UiNode, number[]][], top: number }} Card */

/** A card from the template with its fixed parts. @param {Screen} scr @param {Record<string, any>} c @param {UiNode} list @param {DeckCard} d @returns {Card} */
function makeCard(scr, c, list, d) {
  const root = scr.instantiate(list, 'card');
  const node = (/** @type {string} */ key) => refNode(root, c.nodes[key]);
  for (const ref of c.extras) { const n = refNode(root, ref); if (n) n.active = false; }
  for (const key of ['assist', 'remainBack', 'remainCount']) { const n = node(key); if (n) n.active = false; }
  fillCard(c, node, d);
  /** @type {[UiNode, number[]][]} */
  const tints = [];
  for (const ref of c.tint) { const n = refNode(root, ref); if (n?.color) tints.push([n, [...n.color]]); }
  const content = node('content');
  return { root, node, tints, top: content ? content.rt.pos[1] : 0 };
}

/**
 * A card's avatar, profession icon and mark colour, rarity and elite phase (界面-10).
 * @param {Record<string, any>} c @param {(key: string) => UiNode | null} node @param {DeckCard} d
 */
function fillCard(c, node, d) {
  const avatar = node('avatar'), prof = c.professions[d.profession], elite = c.elite[d.phase] ?? null;
  if (avatar && d.avatar) setPictureOf(avatar, d.avatar);
  else if (avatar) avatar.active = false;
  setSprite(node('profession'), prof?.sprite ?? null);
  const mark = node('mark');
  if (mark && prof) mark.color = [...prof.color];
  setSprite(node('rarity'), c.rarity[Math.max(0, Math.min(5, d.rarity - 1))] ?? null);
  const el = node('elite');
  if (el) { el.active = elite !== null; setSprite(el, elite); }
}

/** @param {UiNode} s @param {string} url */
function setPictureOf(s, url) {
  s.picture = url; s.paintKey = '';
  if (s.color && s.color[3] < 0.05) s.color[3] = 1;
}

/** @param {UiNode | null} s @param {string | null} key */
function setSprite(s, key) { if (s) { s.sprite = key; s.paintKey = ''; } }

/**
 * A card's state: its cost, its countdown, its tint, raised when selected, its width.
 * @param {Screen} scr @param {Record<string, any>} c @param {Card} k @param {CardView} v @param {{ selected: boolean, width: number }} o
 */
function showCard(scr, c, k, v, o) {
  k.root.rt.size[0] = o.width;
  scr.text('', String(v.cost), /** @type {UiNode} */ (k.node('cost')));
  const respawn = k.node('respawn'), label = k.node('respawnText');
  if (respawn) { respawn.active = v.waiting; if (v.waiting) scr.slider('', v.ratio, respawn); }
  if (label) { label.active = v.waiting; if (v.waiting) scr.text('', waitText(v.wait), label); }
  const tint = v.usable ? c.normal : c.disabled;
  for (const [n, base] of k.tints) n.color = [base[0] * tint[0], base[1] * tint[1], base[2] * tint[2], base[3] * tint[3]];
  const content = k.node('content');
  if (content) content.rt.pos[1] = k.top + (o.selected ? c.raise : 0);
}
