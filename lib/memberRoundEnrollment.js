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

function hasAuctionPriority(member) {
  return Boolean(member?.auction_priority_override || member?.auction_priority_card);
}

// Rewrites the active round's rotation so `orderedMemberIds` holds, reusing the
// round's existing position numbers (gaps stay where they were). Positions are
// unique per round, so rows that move park on a temporary negative position
// first and then take their final slot. Returns the number of rows moved.
export async function reorderRotation(supabase, roundId, orderedMemberIds) {
  const { data: rows, error } = await supabase
    .from("rotation_list")
    .select("id,member_id,position")
    .eq("round_id", roundId)
    .order("position", { ascending: true });
  if (error) throw error;

  const rowByMemberId = new Map(rows.map((row) => [row.member_id, row]));
  const unique = new Set(orderedMemberIds);
  if (unique.size !== orderedMemberIds.length || unique.size !== rows.length || orderedMemberIds.some((id) => !rowByMemberId.has(id))) {
    throw new Error("Rotation order must contain every member of the round exactly once.");
  }

  const changes = orderedMemberIds
    .map((memberId, index) => ({ row: rowByMemberId.get(memberId), position: rows[index].position }))
    .filter((change) => change.row.position !== change.position);

  for (const [index, change] of changes.entries()) {
    const { error: parkError } = await supabase.from("rotation_list").update({ position: -(index + 1) }).eq("id", change.row.id);
    if (parkError) throw parkError;
  }
  for (const change of changes) {
    const { error: placeError } = await supabase.from("rotation_list").update({ position: change.position }).eq("id", change.row.id);
    if (placeError) throw placeError;
  }
  return changes.length;
}

// Moves a member who was just given auction priority up the active round's
// rotation, right after the members who already hold priority. The move is
// permanent: removing the priority later leaves them in that slot, where they
// simply wait for the next item cycle like anyone else.
export async function moveMemberIntoPriorityBlock(supabase, memberId) {
  const { data: activeRound, error: roundError } = await supabase
    .from("rounds")
    .select("id")
    .eq("status", "active")
    .maybeSingle();
  if (roundError) throw roundError;
  if (!activeRound) return 0;

  const [rotationResult, membersResult] = await Promise.all([
    supabase.from("rotation_list").select("member_id,position").eq("round_id", activeRound.id).order("position", { ascending: true }),
    supabase.from("members").select("id,auction_priority_override,auction_priority_card")
  ]);
  if (rotationResult.error) throw rotationResult.error;
  if (membersResult.error) throw membersResult.error;

  const membersById = new Map(membersResult.data.map((member) => [member.id, member]));
  const order = rotationResult.data.map((row) => row.member_id);
  const index = order.indexOf(memberId);
  if (index < 0) return 0;

  const priorityCount = order.filter((id) => id !== memberId && hasAuctionPriority(membersById.get(id))).length;
  if (index <= priorityCount) return 0;

  order.splice(index, 1);
  order.splice(priorityCount, 0, memberId);
  return reorderRotation(supabase, activeRound.id, order);
}
