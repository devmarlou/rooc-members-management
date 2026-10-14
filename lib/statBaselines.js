import { STAT_BASELINE_KEYS, toNumberOrNull } from "@/lib/memberStats";

// Admin-set minimum ("base") value per stat. 0 / missing row = no base for
// that stat, so it's never flagged. See .codex/MEMBER_STATS_RUNBOOK.md for the
// stat_baselines table.

const MAX_BASELINE_VALUE = 1_000_000;

// Returns { [stat_key]: base_value } for every key with a base above 0.
// Treats a not-yet-created table as "no baselines" so the stats pages keep
// working before the runbook block has been run.
export async function fetchStatBaselines(supabase) {
  const { data, error } = await supabase.from("stat_baselines").select("stat_key,base_value");
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return {};
    throw error;
  }
  const baselines = {};
  for (const row of data || []) {
    const value = Number(row.base_value);
    if (STAT_BASELINE_KEYS.includes(row.stat_key) && Number.isFinite(value) && value > 0) {
      baselines[row.stat_key] = value;
    }
  }
  return baselines;
}

// Validates an admin payload of { [stat_key]: value } and returns either
// { error } or { rows } ready to upsert. Blank counts as 0 (no base).
export function buildBaselineRows(payload = {}) {
  const unknown = Object.keys(payload).filter((key) => !STAT_BASELINE_KEYS.includes(key));
  if (unknown.length > 0) return { error: `Unknown stats: ${unknown.join(", ")}` };

  const rows = [];
  const invalid = [];
  for (const [key, raw] of Object.entries(payload)) {
    const value = raw === "" || raw === null || raw === undefined ? 0 : toNumberOrNull(raw);
    if (value === null || value < 0 || value > MAX_BASELINE_VALUE) {
      invalid.push(key);
      continue;
    }
    rows.push({ stat_key: key, base_value: value, updated_at: new Date().toISOString() });
  }
  if (invalid.length > 0) {
    return { error: `Must be between 0 and ${MAX_BASELINE_VALUE.toLocaleString()}: ${invalid.join(", ")}` };
  }
  return { rows };
}
