// The battle's states over the HUD (docs/spec/ui.md 界面-18): the end — in a match of two the co-op match finished
// banner whatever the result, alone the battle failed panel when it is lost —; this seat down (it cannot deploy); this
// page waiting to rejoin the match after losing its connection.

import { copyRect, FULL_RT } from '../rect.js';

/** @typedef {import('../node.js').UiNode} UiNode */
/** @typedef {import('../screen.js').Screen} Screen */
/**
 * The states shown: the battle's result (−1 going on, 0 lost, 1 won), whether this seat is down, whether the page is
 * waiting to rejoin.
 * @typedef {{ result: number, down: boolean, offline: boolean }} BattleStates
 */

/**
 * The state panels on a UI: the battle screen's failed panel and, in a match of two, the co-op ones when the pack has
 * them (the match finished banner, the down and rejoining panels). Each turns on once when its state starts and
 * plays its clip.
 * @param {ReturnType<typeof import('../ui.js').createUi>} ui @param {Screen} battle the battle screen @param {boolean} coop
 */
export function createStates(ui, battle, coop) {
  const has = (/** @type {string} */ name) => !!ui.ctx.pack.screens[name];
  const done = coop && has('coop.done') ? ui.open('coop.done') : null;
  const unstable = coop && has('coop.unstable') ? ui.open('coop.unstable') : null;
  const failed = battle.one('panel_battlefailed');
  if (failed) for (const n of ['panel_tips', 'panel_practice_hint', 'page_ap_protect', 'page_ps_not_enough', 'text_continue']) battle.show(n, false, failed);
  const down = unstable?.one('act_multi_v3_battle_state_alldead') ?? null, rejoin = unstable?.one('act_multi_v3_battle_state_loading') ?? null;
  if (down) unstable?.show('container_tips', false, down);
  /** @type {BattleStates} */
  let was = { result: -1, down: false, offline: false };
  return {
    done, unstable,
    /** @param {BattleStates} s */
    update(s) {
      if (s.result >= 0 && was.result < 0) {
        if (done) finished(done);
        else if (s.result === 0 && failed) failed.active = true;
      }
      if (down && s.down !== was.down) { down.active = s.down; if (s.down) unstable?.play('container', 'act3vmulti_battle_state_alldead_in', {}, down); }
      if (rejoin && s.offline !== was.offline) { rejoin.active = s.offline; if (s.offline) unstable?.play('container', 'act3vmulti_battle_state_loading_in', {}, rejoin); }
      was = { ...s };
    },
  };
}

/**
 * The co-op match finished banner: laid over the whole canvas (the prefab is placed by its holder), gone when its clip
 * has played.
 * @param {Screen} done
 */
function finished(done) {
  done.root.rt = copyRect(FULL_RT);
  done.root.active = true;
  done.play('', 'anim_act3vmulti_mission_accomplished').then(() => { done.root.active = false; });
}
