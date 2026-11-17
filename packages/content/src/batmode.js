// How a skill's `base_attack_time` changes the attack interval (docs/spec/skills.md 技能-5). The blackboard value is
// one number for three different modifiers, and the description (「攻击间隔缩短」「攻击间隔增大」) does not tell them apart:
// PRTS writes each skill's interval with the template of the modifier it is — `{{+|…}}` 直接加算 (seconds added),
// `{{*|…}}` 直接乘算 (a share of the base interval added), `{{**|…}}` 最终乘算 (the interval × the number). A skill that
// is in neither list below adds seconds (the value, negative to shorten it).

/** Skills whose PRTS text writes `{{*|…}}` (or a percent in the plain text): the value is a share of the base interval added to it. */
const SHARE = new Set([
  'skchr_catap2_1', 'skchr_liskam_2', 'skchr_mm_2', 'skchr_brownb_2', 'skchr_nearl_2', 'skchr_skfire_2', 'skchr_dusk_3', 'skchr_bpipe_3',
  'skchr_f12yin_3', 'skchr_mudrok_3', 'skchr_aosta_2', 'skchr_broca_2', 'skchr_toddi_2', 'skchr_asbest_2', 'skchr_rosmon_2', 'skchr_rosmon_3',
  'skchr_weedy_2', 'skchr_aprot2_1', 'skchr_aurora_2', 'skchr_ashlok_2', 'skchr_whispr_2', 'skchr_ash_2', 'skchr_tachak_2', 'skchr_pasngr_2',
  'skchr_glady_2', 'skchr_inside_2', 'skchr_aprot_1',
]);

/** Skills whose PRTS text writes `{{**|…}}` (or 「(*0.2)」): the interval is multiplied by the value — by 1 + the value when it is negative. */
const TIMES = new Set([
  'skchr_cerber_2', 'skchr_aglina_2', 'skchr_hamoni_1', 'skchr_hamoni_2', 'skchr_iris_1', 'skchr_finlpp_2', 'skchr_ebnhlz_1', 'skchr_delphn_1',
  'skchr_flamtl_3', 'skchr_crow_2', 'skchr_taraxa_1', 'skchr_indigo_1', 'skchr_indigo_2', 'skchr_mberry_2',
]);

/** Skills whose `base_attack_time` is not the interval of their attacks: the shortest wait between two counters (「反击最小间隔为实际攻击间隔的{base_attack_time:0%}」). */
const NOT_THE_INTERVAL = new Set(['skchr_jaksel_2', 'skchr_rmixer_3']);

/**
 * The modifiers of the attack interval a skill's blackboard gives while it runs (技能-5), over the generic ones: none for
 * a skill that adds seconds, `batPct` for a share, `batMul` for a product; the added seconds are taken away for the rest.
 * The key is `base_attack_time` or, in the attack's namespace, `attack@base_attack_time`.
 * @param {string} id the skill's id @param {Readonly<Record<string, number>>} bb @returns {Record<string, number>}
 */
export function batModsOf(id, bb) {
  const key = ['base_attack_time', 'attack@base_attack_time'].find((k) => Number.isFinite(bb[k]));
  if (key === undefined) return {};
  const v = bb[key];
  if (NOT_THE_INTERVAL.has(id)) return { batFlat: 0 };
  if (SHARE.has(id)) return { batFlat: 0, batPct: v };
  // 1 + (−0.8) is 0.19999999999999996 in floats; PRTS writes 0.2
  if (TIMES.has(id)) return { batFlat: 0, batMul: v > 0 ? v : Math.round((1 + v) * 1e6) / 1e6 };
  return {};
}
