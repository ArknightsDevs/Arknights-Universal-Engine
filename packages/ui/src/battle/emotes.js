// The battle emotes (docs/spec/ui.md 界面-38): the co-op plugin's emote button by the top bar; a tap opens the emote
// panel under it — one theme a page with its emotes, the pager's dots below —; a swipe or a dot turns the page; an
// emote's tap sends it and closes the panel; the button rests faded for the sending cool-down. A seat's emote shows as
// the pop by its side of the pops' place (this seat's and the mate's offsets) for its clip. The pack's `hud.coopEmotes`
// names the parts, the cool-down, the offsets and the faded alpha.
import { refNode, nodeAt } from '../node.js';

/** @typedef {import('../node.js').UiNode} UiNode */
/** @typedef {import('../screen.js').Screen} Screen */
/**
 * What the emotes show: the themes in order, the battle's emotes, an emote's picture, what a tap sends.
 * @typedef {{ themes: readonly string[], emotes: readonly string[], picture: (theme: string, id: string) => string | null, send: (theme: string, id: string) => void }} EmoteOptions
 */
/** The pop's clip, the panel's, a dot's; how far a swipe turns a page (reference pixels). */
const POP_CLIP = 'actv3multi_battle_emoji_send', PANEL_CLIP = 'actv3multi_battle_emoticon_panel_switch', DOT_CLIP = 'emoji_chat_panel_dot', SWIPE = 40;
/** How long a pop stays when the pack has no clip for it, in seconds. */
const POP_TIME = 2.2;

/**
 * The panel's pages and dots: the page shown, the others hidden; the dots' clip at its end for the page shown.
 * @param {Screen} scr @param {UiNode} panel @param {{ pages: UiNode[], dots: UiNode[] }} P @param {number} page
 */
function showPage(scr, panel, P, page) {
  P.pages.forEach((p, i) => { p.active = i === page; });
  P.dots.forEach((d, i) => { void scr.play('', DOT_CLIP, { from: i === page ? 1 : 0, rate: 0 }, d); });
}

/**
 * The panel opened in its container: a page a theme with its emotes' items, a dot a page, the close area; swipes turn
 * pages. @param {Screen} scr @param {UiNode} where @param {EmoteOptions} o @param {{ close: () => void, sent: () => void }} on
 */
function openPanel(scr, where, o, on) {
  const panel = scr.instantiate(where, 'coop.emotePanel'), content = /** @type {UiNode} */ (refNode(panel, '@panel_rect/pos_handler/scroll_pager/viewport/content'));
  const dotsAt = refNode(panel, '@panel_rect/pos_handler/scroll_pager/dot_content'), P = { pages: /** @type {UiNode[]} */ ([]), dots: /** @type {UiNode[]} */ ([]) };
  let page = 0;
  for (const theme of o.themes) {
    const p = scr.instantiate(content, 'coop.emoteTheme');
    for (const id of o.emotes) {
      const item = scr.instantiate(p, 'coop.emoteItem'), icon = refNode(item, '@emoji_icon');
      if (icon) scr.picture('', o.picture(theme, id), icon);
      const hot = refNode(item, '@hotspot');
      if (hot) scr.tap('', () => { o.send(theme, id); on.sent(); }, hot);
    }
    P.pages.push(p);
    if (dotsAt) P.dots.push(scr.instantiate(dotsAt, 'coop.emoteDot'));
  }
  P.dots.forEach((d, i) => scr.tap('', () => { page = i; showPage(scr, panel, P, page); }, d));
  let from = -1;
  scr.on('', 'pointerdown', (e) => { from = /** @type {PointerEvent} */ (e).clientX; }, content);
  scr.on('', 'pointerup', (e) => {
    const dx = (/** @type {PointerEvent} */ (e).clientX - from) / (scr.ctx.k ?? 1);
    if (from >= 0 && Math.abs(dx) > SWIPE) { page = Math.max(0, Math.min(P.pages.length - 1, page + (dx < 0 ? 1 : -1))); showPage(scr, panel, P, page); }
    from = -1;
  }, content);
  const close = refNode(panel, '@non_draw_close_area');
  if (close) scr.tap('', on.close, close);
  showPage(scr, panel, P, page);
  void scr.play('', PANEL_CLIP, {}, panel);
  return panel;
}

/**
 * The battle emotes on a UI: the plugin's button and its panel; `cooldown` rests the button; `show` pops a seat's emote.
 * @param {ReturnType<typeof import('../ui.js').createUi>} ui @param {EmoteOptions} o
 */
export function createBattleEmotes(ui, o) {
  const h = /** @type {Record<string, any>} */ (ui.ctx.pack).hud?.coopEmotes ?? {}, scr = ui.open('coop.plugin'), root = scr.root;
  scr.show('states', false);
  const at = (/** @type {string | undefined} */ r, /** @type {string} */ name) => /** @type {UiNode} */ ((r ? refNode(root, r) : null) ?? scr.one(name));
  const button = at(h.button, 'btn_normal'), where = at(h.panel, 'panel_anchor'), pops = at(h.pop, 'pop_emoticon_item_self');
  /** @type {UiNode | null} */
  let panel = null;
  let resting = false;
  const close = () => { if (panel) scr.remove(panel); panel = null; };
  scr.tap('', () => {
    if (resting) return;
    if (panel) { close(); return; }
    panel = openPanel(scr, where, o, { close, sent: close });
  }, at(h.hotspot, 'hotspot'));
  return {
    screen: scr,
    /** The sending cool-down (s, from the pack: 5) and whether the button rests now (faded, its taps doing nothing). @param {boolean} on */
    rest(on) {
      const was = resting, show = h.show?.animationName ? refNode(root, h.show.animationWrapper) : null;
      resting = on;
      if (on) close();
      button.alpha = on ? h.inactive ?? 0.4 : h.active ?? 1;
      // back from the cool-down the button comes in with its clip (界面-40)
      if (was && !on && show) void scr.anim.play(show, h.show.animationName);
    },
    /** The sending cool-down in seconds (the pack's, else 5). */
    cooldown: Number(h.cd ?? 5),
    /** A seat's emote pops by its side: this seat's (mine) or the mate's. @param {boolean} mine @param {string} theme @param {string} id */
    show(mine, theme, id) {
      const pop = scr.instantiate(pops, 'coop.emotePop'), off = (mine ? h.selfOffset : h.mateOffset) ?? [mine ? -365 : 380, 0];
      pop.rt = { ...pop.rt, pos: [off[0], off[1]] };
      const side = /** @type {UiNode} */ (refNode(pop, mine ? '@emoji_send_me' : '@emoji_send_mate'));
      scr.show(mine ? 'emoji_send_mate' : 'emoji_send_me', false, pop);
      side.active = true;
      const img = nodeAt(side, 'img_emoji');
      if (img) scr.picture('', o.picture(theme, id), img);
      const has = Object.hasOwn(scr.ctx.pack.clips, POP_CLIP);
      const done = () => { if (!pop.gone) scr.remove(pop); };
      if (has) void scr.play('', POP_CLIP, {}, side).then(done);
      else setTimeout(done, POP_TIME * 1000);
    },
    /** Whether the panel is open. */
    get open() { return panel !== null; },
  };
}
