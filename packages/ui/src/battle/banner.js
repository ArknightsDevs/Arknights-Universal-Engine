// The co-op stage start banner (docs/spec/ui.md 界面-22): when a stage begins, the banner shows its task — the title,
// the stage number, the basic task and, when it has one, the advanced task — and plays its clip once.
import { refNode, setText } from '../node.js';

/** @typedef {import('../node.js').UiNode} UiNode */
/** A stage that has begun: its number (1-based) and its task's title and texts (关卡-5). @typedef {{ stage: number, title: string, basic: string, advanced?: string }} StageStart */

/** The banner's title for a task's title (界面-22). @param {string} title */
export const bannerTitle = (title) => `目标·${title}`;

/**
 * The stage start banner on a UI; null without the pack's. `update` with a stage that has begun shows it once per stage.
 * @param {ReturnType<typeof import('../ui.js').createUi>} ui
 */
export function createBanner(ui) {
  const parts = /** @type {Record<string, any>} */ (ui.ctx.pack).hud?.coopStage;
  if (!parts || !ui.ctx.pack.screens['coop.stage']) return null;
  const scr = ui.open('coop.stage'), root = scr.root, at = (/** @type {string} */ ref) => refNode(root, ref);
  const panel = at(parts.panel), field = at(parts.advancedField);
  if (!panel) return null;
  root.active = true;
  panel.active = false;
  let shown = 0;
  return {
    screen: scr, panel,
    /** The stage last shown (0 for none). */
    shown: () => shown,
    /** @param {StageStart | null} s */
    update(s) {
      if (!s || s.stage === shown) return;
      shown = s.stage;
      for (const [ref, text] of [[parts.title, bannerTitle(s.title)], [parts.stage, String(s.stage)], [parts.basic, s.basic], [parts.advanced, s.advanced ?? '']]) {
        const n = at(ref);
        if (n) setText(n, text);
      }
      if (field) field.active = s.advanced !== undefined;
      panel.active = true;
      const stage = s.stage;
      scr.anim.play(panel, parts.clip).then(() => { if (shown === stage) panel.active = false; });
    },
  };
}
