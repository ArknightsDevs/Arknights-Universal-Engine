// The co-op start panel (docs/spec/ui.md 界面-21): the stage's code and name over the battle while it has not begun —
// its start clip, then its waiting loop (waiting for the mate to finish loading) —, its end clip once it begins.
import { refNode, setText } from '../node.js';

/** @typedef {import('../node.js').UiNode} UiNode */
/** The stage shown: its code and name (the level's, 关卡-4). @typedef {{ code: string, name: string }} StageInfo */

/** The start panel's stacking order: above the battle screen, which may open after it (界面-21). */
export const START_Z = 10;

/**
 * The start panel on a UI, shown at once with the stage's code and name, above the battle screen (a page may open it
 * first, as its loading screen); null without the pack's panel. `begin` ends it (its end clip, then it is gone);
 * before that its start clip plays, then its waiting loop.
 * @param {ReturnType<typeof import('../ui.js').createUi>} ui @param {StageInfo} stage
 */
export function createStart(ui, stage) {
  const parts = /** @type {Record<string, any>} */ (ui.ctx.pack).hud?.coopStart;
  if (!parts || !ui.ctx.pack.screens['coop.start']) return null;
  const scr = ui.open('coop.start', { z: START_Z }), root = scr.root, at = (/** @type {string} */ ref) => refNode(root, ref);
  for (const [ref, text] of [[parts.code, stage.code], [parts.name, stage.name]]) { const n = at(ref); if (n) setText(n, text); }
  root.active = true;
  let phase = 'start';
  scr.play('', parts.start).then(() => { if (phase === 'start') { phase = 'wait'; scr.play('', parts.loop, { loop: true }); } });
  return {
    screen: scr,
    /** The phase: 'start', 'wait' (for the mate), 'end' or 'gone'. */
    phase: () => phase,
    /** The battle has begun: the end clip plays and the panel goes. */
    begin() {
      if (phase === 'end' || phase === 'gone') return;
      phase = 'end';
      scr.play('', parts.end).then(() => { phase = 'gone'; root.active = false; });
    },
  };
}
