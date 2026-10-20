// Per-operator facing overrides (docs/spec/render.md 渲染-4): the general rule turns a model toward the target of its
// attack. Where a real-game recording shows an operator that does NOT do that (a summon, a device, a skill whose animation
// keeps its facing), an entry here turns the rule off for it.
//
// Entries are ours, added from real-game recordings — every one carries the recording and the time the behaviour is
// seen, and is registered in docs/registry/. An entry may be scoped to the operator's skill (`when: 'skill'`), which is
// the only state the view can tell apart.
//
//   'char_123_name': { turn: false, when: 'skill', basis: '录像 <文件名> @ <时间点>（链接待补）' }
/**
 * @typedef {{ turn: boolean, when?: 'skill', basis: string }} FaceOverride
 * @type {Record<string, FaceOverride>}
 */
export const FACE_OVERRIDES = {
  // 野鬃 2 技能期间不转身（实机录像「野鬃2技能不转身.mp4」；公开链接待补）
  char_496_wildmn: { turn: false, when: 'skill', basis: '实机录像「野鬃二技能不转身」https://github.com/user-attachments/assets/f60cab20-cfc5-4b5a-84ba-61a1b9903209' },
};

/**
 * Whether an operator's model turns toward its attack target (`render/facing.js`): true unless a recorded override says
 * otherwise for the state it is in (渲染-4).
 * @param {string} key the operator's content key @param {boolean} [skillRunning] whether its skill is running now
 * @returns {boolean}
 */
export function faceTurns(key, skillRunning = false) {
  const row = FACE_OVERRIDES[key];
  if (!row) return true;
  if (row.when === 'skill') return skillRunning ? row.turn !== false : true;
  return row.turn !== false;
}
