import { enforceLatestNRows } from "@/lib/retention";

// Keeps only the latest N (default 2) member_stats rows per member, deleting
// the rest. Called as a JS follow-up right after a stats submission is
// inserted — see lib/retention.js for the shared implementation (also used
// by member_pov_links).
export function enforceMemberStatsRetention(supabase, memberId, keep = 2) {
  return enforceLatestNRows(supabase, { table: "member_stats", memberId, keep });
}
