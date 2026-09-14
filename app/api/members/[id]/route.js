import { NextResponse } from "next/server";
import { handleApiError, requireAdmin, unauthorized } from "@/lib/api";
import { writeAuditLog } from "@/lib/auditLog";
import { updateMemberCapOverrides } from "@/lib/auctionEngine";
import { validateCharClass, validateCharName } from "@/lib/validation";
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
  if (!requireAdmin(request)) return unauthorized();

  try {
    const { id } = await params;
    const payload = await request.json();
    const body = cleanMemberPayload(payload);
    const { error: charNameError } = validateCharName(body.char_name);
    if (charNameError) return NextResponse.json({ error: charNameError }, { status: 400 });
    const { error: charClassError } = validateCharClass(body.char_class);
    if (charClassError) return NextResponse.json({ error: charClassError }, { status: 400 });

    const supabase = getSupabaseAdmin();
    // beforeResult (used only for the audit-log snapshot below) and the update
    // don't depend on each other — both only need `id`/`body`, already known —
    // so they run concurrently instead of as two sequential round trips.
    const [beforeResult, updateResult] = await Promise.all([
      supabase.from("members").select(MEMBER_SELECT).eq("id", id).maybeSingle(),
      supabase.from("members").update(body).eq("id", id).select(MEMBER_SELECT).single()
    ]);
    if (beforeResult.error && !isMissingPartySlotError(beforeResult.error)) throw beforeResult.error;

    let { data, error } = updateResult;

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

    const auctionState = Object.prototype.hasOwnProperty.call(payload || {}, "memberCapOverrides")
      ? await updateMemberCapOverrides(supabase, id, payload.memberCapOverrides)
      : null;

    await writeAuditLog(supabase, request, {
      action: "member.updated",
      targetType: "member",
      targetId: data.id,
      summary: `Updated member ${data.char_name}`,
      metadata: { before: beforeResult.data || null, after: data, memberCapOverrides: payload.memberCapOverrides || null }
    });
    return NextResponse.json({ member: data, auctionState });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request, { params }) {
  if (!requireAdmin(request)) return unauthorized();

  try {
    const { id } = await params;
    const supabase = getSupabaseAdmin();
    // account_id isn't part of the shared MEMBER_SELECT (PATCH's response shape
    // stays unchanged) — pulled in here only so we know whether to cascade the
    // account delete below. Neither this nor the open-auction guard check depend
    // on the other's result, so they run concurrently.
    const [beforeResult, openAuctionResult] = await Promise.all([
      supabase.from("members").select(`${MEMBER_SELECT},account_id`).eq("id", id).maybeSingle(),
      supabase.from("auctions").select("id,name,status").in("status", ["active", "locked"]).limit(1).maybeSingle()
    ]);
    if (beforeResult.error && !isMissingPartySlotError(beforeResult.error)) throw beforeResult.error;
    if (openAuctionResult.error) throw openAuctionResult.error;

    if (openAuctionResult.data) {
      return NextResponse.json({
        error: `Cannot delete members while ${openAuctionResult.data.name || "an auction"} is ${openAuctionResult.data.status}. Finish or cancel the auction first.`
      }, { status: 409 });
    }

    const { error } = await supabase
      .from("members")
      .delete()
      .eq("id", id);

    if (error) throw error;

    // A deleted member has left the guild, so their login shouldn't survive them —
    // cascade-delete the linked app_users row too, mirroring the same
    // members-then-app_users delete order already used when a pending
    // registration is rejected (app/api/members/pending/[id]/route.js).
    const accountId = beforeResult.data?.account_id || null;
    let accountDeleted = false;
    if (accountId) {
      const { error: deleteAccountError } = await supabase.from("app_users").delete().eq("id", accountId);
      if (deleteAccountError) throw deleteAccountError;
      accountDeleted = true;
    }

    await writeAuditLog(supabase, request, {
      action: "member.deleted",
      targetType: "member",
      targetId: id,
      summary: accountDeleted
        ? `Deleted member ${beforeResult.data?.char_name || id} and their linked account`
        : `Deleted member ${beforeResult.data?.char_name || id}`,
      metadata: { before: beforeResult.data || null, accountDeleted }
    });
    return NextResponse.json({ ok: true, accountDeleted });
  } catch (error) {
    return handleApiError(error);
  }
}
