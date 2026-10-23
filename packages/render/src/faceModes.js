// Per-operator facing overrides (docs/spec/render.md 渲染-4): the general rule turns a model toward the target of its
// attack. Where a real-game recording shows an operator that does NOT do that (a summon, a device, a skill whose animation
// keeps its facing), an entry here turns the rule off for it.
//
// Entries are ours, added from real-game recordings — every one carries the recording and the time the behaviour is
// seen, and is registered in docs/registry/. An entry may be scoped to the operator's skill (`when: 'skill'`), which is
// the only state the view can tell apart. Without `keepCurrent`, an operator that does not turn returns to its deploy
// facing (野鬃 2 技能); with it, the model keeps whatever facing it had (扩散术士).
//
//   'char_123_name': { turn: false, when: 'skill', basis: '录像 <链接> 第 <帧号> 帧' }
/**
 * @typedef {{ turn: boolean, when?: 'skill', keepCurrent?: boolean, basis: string }} FaceOverride
 * @type {Record<string, FaceOverride>}
 */
export const FACE_OVERRIDES = {
  // 野鬃 2 技能期间不转身：实机录像第 498 帧（渲染-4）
  char_496_wildmn: { turn: false, when: 'skill', basis: '实机录像「野鬃二技能不转身」https://github.com/user-attachments/assets/f60cab20-cfc5-4b5a-84ba-61a1b9903209 第 498 帧' },
  // 扩散术士分支实机测试（2026-10-23）：这 7 人不转向，且保持当前朝向（与野鬃的“回部署”不同）。同分支的
  // 玛露西尔、寒檀、炎狱炎熔、格雷伊实测会转向，所以不能按 branch 一刀切，只能逐个登记。短视频已裁剪、无时间戳；
  // 12F 的录像待补。
  char_009_12fce: { turn: false, keepCurrent: true, basis: '实机测试（2026-10-23）：12F 不转向，保持当前朝向；录像待补' },
  char_109_fmout: { turn: false, keepCurrent: true, basis: '实机测试（2026-10-23，短视频已裁剪、无时间戳）：远山不转向，保持当前朝向；https://github.com/user-attachments/assets/2830cd32-8047-45fc-a4af-45ebb5909c46' },
  char_121_lava: { turn: false, keepCurrent: true, basis: '实机测试（2026-10-23，短视频已裁剪、无时间戳）：炎熔不转向，保持当前朝向；https://github.com/user-attachments/assets/12a183d2-2508-4825-af85-424d461a21a1' },
  char_166_skfire: { turn: false, keepCurrent: true, basis: '实机测试（2026-10-23，短视频已裁剪、无时间戳）：天火不转向，保持当前朝向；https://github.com/user-attachments/assets/2830cd32-8047-45fc-a4af-45ebb5909c46' },
  char_2015_dusk: { turn: false, keepCurrent: true, basis: '实机测试（2026-10-23，短视频已裁剪、无时间戳）：夕不转向，保持当前朝向；https://github.com/user-attachments/assets/6dc3b0a8-7cac-4a17-be47-c33c0ea7be42' },
  char_213_mostma: { turn: false, keepCurrent: true, basis: '实机测试（2026-10-23，短视频已裁剪、无时间戳）：莫斯提马不转向，保持当前朝向；https://github.com/user-attachments/assets/66bcca17-f5c8-4c6c-be8a-fcccbbd58ba6' },
  char_373_lionhd: { turn: false, keepCurrent: true, basis: '实机测试（2026-10-23，短视频已裁剪、无时间戳）：莱恩哈特不转向，保持当前朝向；https://github.com/user-attachments/assets/5b220c9b-e4df-4c60-b4dc-49a7f70de3e2' },
};

/**
 * How an operator's model faces (渲染-4): whether it turns toward its attack target, and when it does not, whether it
 * keeps the facing it has (`keepCurrent`, the 扩散术士) or returns to its deploy facing (野鬃 2 技能).
 * @param {string} key the operator's content key @param {boolean} [skillRunning] whether its skill is running now
 * @returns {{ turn: boolean, keepCurrent: boolean }}
 */
export function faceMode(key, skillRunning = false) {
  const row = FACE_OVERRIDES[key];
  if (!row || (row.when === 'skill' && !skillRunning)) return { turn: true, keepCurrent: false };
  return { turn: row.turn !== false, keepCurrent: !!row.keepCurrent };
}

/**
 * Whether an operator's model turns toward its attack target (`render/facing.js`): true unless a recorded override says
 * otherwise for the state it is in (渲染-4).
 * @param {string} key the operator's content key @param {boolean} [skillRunning] whether its skill is running now
 * @returns {boolean}
 */
export function faceTurns(key, skillRunning = false) {
  return faceMode(key, skillRunning).turn;
}
