// Shared shape/validation for a member_stats row — used both by the
// post-approval self-service submission (app/api/member-stats/route.js) and
// the mandatory initial submission collected during Discord registration
// (app/api/auth/discord/register/route.js), so the two never drift apart.

// Re-exported for backward compat — the real implementation now lives in
// lib/urls.js so lib/povLinks.js can share it without importing this
// stats-specific module. Also used directly below by buildStatsRow.
import { ensureAbsoluteUrl } from "@/lib/urls";
export { ensureAbsoluteUrl };

// Member-selected build type — not derivable from class alone (e.g. a "battle"
// Professor build is physical even though the class is usually played as magic).
export const DAMAGE_TYPE_OPTIONS = ["physical", "magic"];

export const STATS_SELECT = `
  id,member_id,class,damage_type,hp,patk_matk,pdef,mdef,
  equipment_pdef,equipment_mdef,equipment_pdef_pct,equipment_mdef_pct,
  effective_pdef,effective_mdef,
  pdmg_mdmg,pdmg_reduction,mdmg_reduction,ignore_pdef,ignore_mdef,
  healing_done,healing_taken,pvp_dmg_bonus,pvp_dmg_reduction,
  crit,crit_dmg,crit_res,crit_dmg_res,
  dmg_vs_small,dmg_reduction_vs_small,dmg_vs_medium,dmg_reduction_vs_medium,
  dmg_vs_large,dmg_reduction_vs_large,dmg_vs_brute,dmg_reduction_vs_brute,
  dmg_vs_demi_human,dmg_reduction_vs_demi_human,
  video_link,submitted_at,created_at
`.replace(/\s+/g, "");

// Required, member-supplied core fields — the two "effective" values are derived
// from equipment_pdef/mdef + their % pair and are never accepted from the client.
export const CORE_NUMERIC_FIELDS = [
  "hp", "patk_matk", "pdef", "mdef",
  "equipment_pdef", "equipment_mdef", "equipment_pdef_pct", "equipment_mdef_pct"
];

// Subset of CORE_NUMERIC_FIELDS that are DB-typed INT (the two _pct fields are
// NUMERIC, so decimals are fine there) — non-integer input for these would
// otherwise reach Postgres as a generic insert error instead of a clear 400.
const INTEGER_CORE_FIELDS = ["hp", "patk_matk", "pdef", "mdef", "equipment_pdef", "equipment_mdef"];

// Optional/nullable fields — independently member-supplied, no cross-validation.
export const OPTIONAL_NUMERIC_FIELDS = [
  "pdmg_mdmg", "pdmg_reduction", "mdmg_reduction", "ignore_pdef", "ignore_mdef",
  "healing_done", "healing_taken", "pvp_dmg_bonus", "pvp_dmg_reduction",
  "crit", "crit_dmg", "crit_res", "crit_dmg_res",
  "dmg_vs_small", "dmg_reduction_vs_small",
  "dmg_vs_medium", "dmg_reduction_vs_medium",
  "dmg_vs_large", "dmg_reduction_vs_large",
  "dmg_vs_brute", "dmg_reduction_vs_brute",
  "dmg_vs_demi_human", "dmg_reduction_vs_demi_human"
];

export function toNumberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

// Sanity ceiling for optional stat fields — not a game-balance figure (no such
// numbers are documented anywhere in the repo), just a floor against garbage/
// fat-finger input (e.g. an extra zero or two) reaching the database.
const MAX_STAT_VALUE = 1_000_000;

// Validates a raw stats payload and returns either { error } or { row } — `row`
// still needs `member_id` and `class` merged in by the caller, since neither
// route trusts the client for those (registration hasn't created the member
// row yet; the self-service route derives it from the caller's own account).
export function buildStatsRow(payload = {}) {
  const videoLink = ensureAbsoluteUrl(payload.video_link);
  if (!videoLink) return { error: "Video link is required." };

  const damageType = String(payload.damage_type || "").trim().toLowerCase();
  if (!DAMAGE_TYPE_OPTIONS.includes(damageType)) {
    return { error: "Damage type must be Physical or Magic." };
  }

  const missingCore = CORE_NUMERIC_FIELDS.filter((field) => toNumberOrNull(payload[field]) === null);
  if (missingCore.length > 0) return { error: `Missing or invalid values: ${missingCore.join(", ")}` };

  const core = Object.fromEntries(CORE_NUMERIC_FIELDS.map((field) => [field, toNumberOrNull(payload[field])]));

  // The base/equipment stat fields are never negative in this game and can't
  // hold a fraction (INT columns) — catch both here with a clear field-listing
  // error instead of a generic Postgres insert failure. The two _pct fields
  // are excluded from the non-negative check (a malus can legitimately push
  // one below 0%) and are NUMERIC, so they're handled separately below.
  const negativeCore = INTEGER_CORE_FIELDS.filter((field) => core[field] < 0);
  if (negativeCore.length > 0) return { error: `Must be zero or greater: ${negativeCore.join(", ")}` };
  const nonIntegerCore = INTEGER_CORE_FIELDS.filter((field) => !Number.isInteger(core[field]));
  if (nonIntegerCore.length > 0) return { error: `Must be a whole number: ${nonIntegerCore.join(", ")}` };

  // A pct of exactly/below -100% makes the effective-def formula below divide
  // by zero or a negative number (Infinity/NaN reaching the insert) — reject
  // before computing rather than after.
  if (core.equipment_pdef_pct <= -100 || core.equipment_mdef_pct <= -100) {
    return { error: "Equipment DEF% must be greater than -100." };
  }

  const optional = Object.fromEntries(OPTIONAL_NUMERIC_FIELDS.map((field) => [field, toNumberOrNull(payload[field])]));
  const invalidOptional = OPTIONAL_NUMERIC_FIELDS.filter((field) => {
    const value = optional[field];
    return value !== null && (value < 0 || value > MAX_STAT_VALUE);
  });
  if (invalidOptional.length > 0) {
    return { error: `Must be between 0 and ${MAX_STAT_VALUE.toLocaleString()}: ${invalidOptional.join(", ")}` };
  }

  // Computed server-side — never taken from the client, regardless of what the body sent.
  const effective_pdef = (core.equipment_pdef * 100) / (100 + core.equipment_pdef_pct);
  const effective_mdef = (core.equipment_mdef * 100) / (100 + core.equipment_mdef_pct);

  return {
    row: {
      damage_type: damageType,
      ...core,
      effective_pdef,
      effective_mdef,
      ...optional,
      video_link: videoLink
    }
  };
}
