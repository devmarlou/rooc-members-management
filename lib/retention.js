// Keeps only the latest N rows per member in a given table, deleting the
// rest — shared by member_stats (lib/memberStatsRetention.js) and
// member_pov_links, the two tables that intentionally keep no archive.
// Called as a JS follow-up right after an insert, same non-atomic,
// best-effort pattern as enrollMemberInActiveRound
// (lib/memberRoundEnrollment.js): no DB trigger, just an extra step in the
// route.
export async function enforceLatestNRows(supabase, { table, memberId, keep = 2, orderColumn = "submitted_at" }) {
  const { data: rows, error } = await supabase
    .from(table)
    .select("id")
    .eq("member_id", memberId)
    .order(orderColumn, { ascending: false });
  if (error) throw error;

  const staleIds = (rows || []).slice(keep).map((row) => row.id);
  if (staleIds.length === 0) return;

  const { error: deleteError } = await supabase
    .from(table)
    .delete()
    .in("id", staleIds);
  if (deleteError) throw deleteError;
}
