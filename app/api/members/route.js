import { NextResponse } from "next/server";
import { handleApiError, requireAuth, unauthorized } from "@/lib/api";
import { writeAuditLog } from "@/lib/auditLog";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const MEMBER_SELECT = "id,char_name,char_class,group_id,party_slot,joined_at,notes,created_at,updated_at";
const MEMBER_SELECT_FALLBACK = "id,char_name,char_class,group_id,joined_at,notes,created_at,updated_at";

function isMissingPartySlotError(error) {
  const message = String(error?.message || "");
  return error?.code === "42703" || message.includes("party_slot");
}

function cleanPartySlot(value) {
  if (value === null || value === undefined || value === "") return null;
  const slot = Number(value);
  return Number.isInteger(slot) && slot >= 1 && slot <= 5 ? slot : null;
}

function withoutPartySlot(body) {
  const { party_slot, ...rest } = body;
  return rest;
}

function withFallbackSlot(member) {
  return member ? { ...member, party_slot: null } : member;
}

function cleanMemberPayload(payload) {
  const group_id = payload.group_id || null;
  return {
    char_name: String(payload.char_name || "").trim(),
    char_class: String(payload.char_class || "").trim(),
    group_id,
    party_slot: group_id ? cleanPartySlot(payload.party_slot) : null,
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
    let { data, error } = await supabase
      .from("members")
      .insert(body)
      .select(MEMBER_SELECT)
      .single();

    if (isMissingPartySlotError(error)) {
      const fallbackResult = await supabase
        .from("members")
        .insert(withoutPartySlot(body))
        .select(MEMBER_SELECT_FALLBACK)
        .single();
      data = withFallbackSlot(fallbackResult.data);
      error = fallbackResult.error;
    }

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

    await writeAuditLog(supabase, request, {
      action: "member.created",
      targetType: "member",
      targetId: data.id,
      summary: `Created member ${data.char_name}`,
      metadata: { member: data }
    });

    return NextResponse.json({ member: data }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
