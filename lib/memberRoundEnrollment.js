// Appends a newly created member to the currently active round, if one exists,
// so they immediately join the auction rotation instead of waiting for the next round.
export async function enrollMemberInActiveRound(supabase, memberId) {
  const { data: activeRound, error: roundError } = await supabase
    .from("rounds")
    .select("id")
    .eq("status", "active")
    .maybeSingle();
  if (roundError) throw roundError;
  if (!activeRound) return null;

  const { data: lastPosition, error: positionError } = await supabase
    .from("rotation_list")
    .select("position")
    .eq("round_id", activeRound.id)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (positionError) throw positionError;

  const rotationResult = await supabase.from("rotation_list").insert({
    round_id: activeRound.id,
    member_id: memberId,
    position: (lastPosition?.position || 0) + 1
  });
  if (rotationResult.error) throw rotationResult.error;

  const progressResult = await supabase.from("member_round_progress").insert({
    round_id: activeRound.id,
    member_id: memberId,
    received: {}
  });
  if (progressResult.error) throw progressResult.error;

  return activeRound.id;
}
