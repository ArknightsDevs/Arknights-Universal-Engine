// @aue/ui: the battle UI from the original Unity UI prefabs (ADR 0021, docs/spec/ui.md) — exported node trees drawn as
// positioned elements on a canvas scaled to the page: RectTransform layout, auto layout, images, texts, masks, clips,
// sliders, taps and templates.
export { createUi, UI_CSS } from './ui.js';
export { Screen, setSlider } from './screen.js';
export { Animator, loops } from './anim.js';
export { UiNode, build, nodeAt, refNode, setText, setPicture, stencilScan } from './node.js';
export { layout } from './layout.js';
export { arrange, groupPref, prefSize, groupKids, gridArrange, gridPref, gridColumns } from './groups.js';
export { canvasSize, rectBox, transformCss, originCss, copyRect, DEF_RT, FULL_RT } from './rect.js';
export { evalKeys, applyCurve, spriteAt } from './curves.js';
export { richHtml, isRich, faceOf, alignCss, shadowCss, bestFit, DEFAULT_FONTS } from './text.js';
export { fillCss, gradientCss, sliceOf, isSliced, drawable, blendOf, uvSpeed, rgba, ringAlpha, ringMask } from './paint.js';
export { drawNine } from './raster.js';
export { createBattleHud, costView, costFlash, flashColor, speedSprite } from './battle/hud.js';
export { createCards, cardViews, cardWidth, waitText, placeSummons } from './battle/cards.js';
export { createCoopTop, coopSpeedSprite, reviveText } from './battle/coop.js';
export { createFieldMenus, dragFacing, ARROW_DIRS } from './battle/menus.js';
export { homography, matrix3d, mapPoint, groundTransform } from './persp.js';
/** @typedef {import('./node.js').UiPack} UiPack */
/** @typedef {import('./battle/hud.js').HudState} HudState */
/** @typedef {import('./battle/cards.js').DeckCard} DeckCard */
/** @typedef {import('./battle/menus.js').MenuSkill} MenuSkill */
/** @typedef {import('./battle/coop.js').CoopState} CoopState */
export { createCostAsk, costAsk, ANSWER_SHOWN } from './battle/coopcost.js';
export { OBJECTIVES, TIMER_WARN, clockText } from './battle/coop.js';
/** @typedef {import('./battle/coopcost.js').CostAsk} CostAsk */
/** @typedef {import('./battle/coopcost.js').CostAskInput} CostAskInput */
/** @typedef {import('./battle/coop.js').Task} Task */
export { createStates } from './battle/states.js';
export { createUnitBars } from './battle/unitbars.js';
export { createStart } from './battle/start.js';
export { createBanner, bannerTitle } from './battle/banner.js';
/** @typedef {import('./battle/banner.js').StageStart} StageStart */
/** @typedef {import('./battle/start.js').StageInfo} StageInfo */
/** @typedef {import('./battle/unitbars.js').UnitBar} UnitBar */
/** @typedef {import('./battle/states.js').BattleStates} BattleStates */
