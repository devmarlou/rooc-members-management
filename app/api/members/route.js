import { NextResponse } from "next/server";
import { handleApiError, requireAuth, unauthorized } from "@/lib/api";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

function cleanMemberPayload(payload) {
  return {
    char_name: String(payload.char_name || "").trim(),
    char_class: String(payload.char_class || "").trim(),
    group_id: payload.group_id || null,
    joined_at: payload.joined_at || null,
    notes: payload.notes ? String(payload.notes).trim() : null
  };
}

export async function POST(request) {
  if (!requireAuth(request)) return unauthorized();

  try {
    const body = cleanMemberPayload(await request.json());
    if (!body.char_name || !body.char_class) {
      return NextResponse.json({ error: "Character name and class are required." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("members")
      .insert(body)
      .select("id,char_name,char_class,group_id,joined_at,notes,created_at,updated_at")
      .single();

    if (error) throw error;

    const { data: activeRound, error: roundError } = await supabase
      .from("rounds")
      .select("id")
      .eq("status", "active")
      .maybeSingle();
    if (roundError) throw roundError;

    if (activeRound) {
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
        member_id: data.id,
        position: (lastPosition?.position || 0) + 1
      });
      if (rotationResult.error) throw rotationResult.error;

      const progressResult = await supabase.from("member_round_progress").insert({
        round_id: activeRound.id,
        member_id: data.id,
        received: {}
      });
      if (progressResult.error) throw progressResult.error;
    }

    return NextResponse.json({ member: data }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
