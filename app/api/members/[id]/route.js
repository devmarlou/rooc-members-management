import { NextResponse } from "next/server";
import { handleApiError, requireAuth, unauthorized } from "@/lib/api";
import { writeAuditLog } from "@/lib/auditLog";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

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

export async function PATCH(request, { params }) {
  if (!requireAuth(request)) return unauthorized();

  try {
    const { id } = await params;
    const body = cleanMemberPayload(await request.json());
    if (!body.char_name || !body.char_class) {
      return NextResponse.json({ error: "Character name and class are required." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const beforeResult = await supabase
      .from("members")
      .select(MEMBER_SELECT)
      .eq("id", id)
      .maybeSingle();
    if (beforeResult.error && !isMissingPartySlotError(beforeResult.error)) throw beforeResult.error;

    let { data, error } = await supabase
      .from("members")
      .update(body)
      .eq("id", id)
      .select(MEMBER_SELECT)
      .single();

    if (isMissingPartySlotError(error)) {
      const fallbackResult = await supabase
        .from("members")
        .update(withoutPartySlot(body))
        .eq("id", id)
        .select(MEMBER_SELECT_FALLBACK)
        .single();
      data = withFallbackSlot(fallbackResult.data);
      error = fallbackResult.error;
    }

    if (error) throw error;
    await writeAuditLog(supabase, request, {
      action: "member.updated",
      targetType: "member",
      targetId: data.id,
      summary: `Updated member ${data.char_name}`,
      metadata: { before: beforeResult.data || null, after: data }
    });
    return NextResponse.json({ member: data });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request, { params }) {
  if (!requireAuth(request)) return unauthorized();

  try {
    const { id } = await params;
    const supabase = getSupabaseAdmin();
    const beforeResult = await supabase
      .from("members")
      .select(MEMBER_SELECT)
      .eq("id", id)
      .maybeSingle();
    if (beforeResult.error && !isMissingPartySlotError(beforeResult.error)) throw beforeResult.error;

    const { error } = await supabase
      .from("members")
      .delete()
      .eq("id", id);

    if (error) throw error;
    await writeAuditLog(supabase, request, {
      action: "member.deleted",
      targetType: "member",
      targetId: id,
      summary: `Deleted member ${beforeResult.data?.char_name || id}`,
      metadata: { before: beforeResult.data || null }
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
