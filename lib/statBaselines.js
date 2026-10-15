import { DEFAULT_COMPARE_KEYS, STAT_BASELINE_KEYS, toNumberOrNull } from "@/lib/memberStats";

// Admin-set per-stat settings in stat_baselines:
// - base_value: minimum value. 0 / missing row = no base, never flagged.
// - compare: whether OLD vs UPDATED shows the up/down comparison for it.
// See .codex/MEMBER_STATS_RUNBOOK.md for the table.

const MAX_BASELINE_VALUE = 1_000_000;

export function isMissingTable(error) {
  return error?.code === "42P01" || error?.code === "PGRST205";
}

export function isMissingCompareColumn(error) {
  return error?.code === "42703" || error?.code === "PGRST204";
}

function toBaselineMap(rows) {
  const baselines = {};
  for (const row of rows || []) {
    const value = Number(row.base_value);
    if (STAT_BASELINE_KEYS.includes(row.stat_key) && Number.isFinite(value) && value > 0) {
      baselines[row.stat_key] = value;
    }
  }
  return baselines;
}

// Returns { baselines: { [stat_key]: base_value > 0 }, compare: [stat_key] }.
// Falls back to no bases / DEFAULT_COMPARE_KEYS while the table or the
// compare column hasn't been created yet, so stats pages keep working.
export async function fetchStatSettings(supabase) {
  const { data, error } = await supabase.from("stat_baselines").select("stat_key,base_value,compare");
  if (!error) {
    return {
      baselines: toBaselineMap(data),
      compare: (data || []).filter((row) => row.compare && STAT_BASELINE_KEYS.includes(row.stat_key)).map((row) => row.stat_key)
    };
  }
  if (isMissingTable(error)) return { baselines: {}, compare: DEFAULT_COMPARE_KEYS };
  if (!isMissingCompareColumn(error)) throw error;

  const fallback = await supabase.from("stat_baselines").select("stat_key,base_value");
  if (fallback.error) throw fallback.error;
  return { baselines: toBaselineMap(fallback.data), compare: DEFAULT_COMPARE_KEYS };
}

// Validates an admin payload ({ [stat_key]: value } plus a list of compare
// keys) and returns either { error } or { rows } ready to upsert, one per
// stat. Blank counts as 0 (no base).
export function buildStatSettingRows(baselines = {}, compare = []) {
  const compareKeys = Array.isArray(compare) ? compare : [];
  const unknown = [...Object.keys(baselines), ...compareKeys].filter((key) => !STAT_BASELINE_KEYS.includes(key));
  if (unknown.length > 0) return { error: `Unknown stats: ${[...new Set(unknown)].join(", ")}` };

  const rows = [];
  const invalid = [];
  const updatedAt = new Date().toISOString();
  for (const key of STAT_BASELINE_KEYS) {
    const raw = baselines[key];
    const value = raw === "" || raw === null || raw === undefined ? 0 : toNumberOrNull(raw);
    if (value === null || value < 0 || value > MAX_BASELINE_VALUE) {
      invalid.push(key);
      continue;
    }
    rows.push({ stat_key: key, base_value: value, compare: compareKeys.includes(key), updated_at: updatedAt });
  }
  if (invalid.length > 0) {
    return { error: `Must be between 0 and ${MAX_BASELINE_VALUE.toLocaleString()}: ${invalid.join(", ")}` };
  }
  return { rows };
}
