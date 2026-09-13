// Keeps only the latest N (default 2) member_stats rows per member, deleting the
// rest. Called as a JS follow-up right after a stats submission is inserted —
// same non-atomic, best-effort follow-up pattern as enrollMemberInActiveRound
// (lib/memberRoundEnrollment.js): no DB trigger, just an extra step in the route.
export async function enforceMemberStatsRetention(supabase, memberId, keep = 2) {
  const { data: rows, error } = await supabase
    .from("member_stats")
    .select("id")
    .eq("member_id", memberId)
    .order("submitted_at", { ascending: false });
  if (error) throw error;

  const staleIds = (rows || []).slice(keep).map((row) => row.id);
  if (staleIds.length === 0) return;

  const { error: deleteError } = await supabase
    .from("member_stats")
    .delete()
    .in("id", staleIds);
  if (deleteError) throw deleteError;
}
