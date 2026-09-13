import { NextResponse } from "next/server";
import { handleApiError, requireAdmin, unauthorized } from "@/lib/api";
import { writeAuditLog } from "@/lib/auditLog";
import { enrollMemberInActiveRound } from "@/lib/memberRoundEnrollment";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { GUILD_MEMBER_LIMIT } from "@/lib/constants";

const MEMBER_SELECT = "id,char_name,char_class,group_id,party_slot,is_officer,auction_priority_override,joined_at,notes,created_at,updated_at";
const MEMBER_SELECT_FALLBACK = "id,char_name,char_class,group_id,joined_at,notes,created_at,updated_at";

function isMissingPartySlotError(error) {
  const message = String(error?.message || "");
  return error?.code === "42703" || message.includes("party_slot") || message.includes("auction_priority_override");
}

function cleanPartySlot(value) {
  if (value === null || value === undefined || value === "") return null;
  const slot = Number(value);
  return Number.isInteger(slot) && slot >= 1 && slot <= 5 ? slot : null;
}

function withoutPartySlot(body) {
  const { party_slot, is_officer, auction_priority_override, ...rest } = body;
  return rest;
}

function withFallbackSlot(member) {
  return member ? { ...member, party_slot: null, is_officer: false, auction_priority_override: false } : member;
}

function cleanMemberPayload(payload) {
  const group_id = payload.group_id || null;
  return {
    char_name: String(payload.char_name || "").trim(),
    char_class: String(payload.char_class || "").trim(),
    group_id,
    party_slot: group_id ? cleanPartySlot(payload.party_slot) : null,
    is_officer: Boolean(payload.is_officer),
    auction_priority_override: Boolean(payload.auction_priority_override),
    joined_at: payload.joined_at || null,
    notes: payload.notes ? String(payload.notes).trim() : null
  };
}

export async function POST(request) {
  if (!requireAdmin(request)) return unauthorized();

  try {
    const body = cleanMemberPayload(await request.json());
    if (!body.char_name || !body.char_class) {
      return NextResponse.json({ error: "Character name and class are required." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    const { count: rosterCount, error: countError } = await supabase
      .from("members")
      .select("id", { count: "exact", head: true });
    if (countError) throw countError;
    if ((rosterCount || 0) >= GUILD_MEMBER_LIMIT) {
      return NextResponse.json(
        { error: `Roster is full at the guild's hard cap (${GUILD_MEMBER_LIMIT}/${GUILD_MEMBER_LIMIT}). Remove a member before adding another.` },
        { status: 409 }
      );
    }

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

    await enrollMemberInActiveRound(supabase, data.id);

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
