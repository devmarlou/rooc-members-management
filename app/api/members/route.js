import { NextResponse } from "next/server";
import { handleApiError, requireAuth, unauthorized } from "@/lib/api";
import { writeAuditLog } from "@/lib/auditLog";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const MEMBER_SELECT = "id,char_name,char_class,group_id,party_slot,is_officer,joined_at,notes,created_at,updated_at";
const MEMBER_SELECT_FALLBACK = "id,char_name,char_class,group_id,joined_at,notes,created_at,updated_at";
const AUCTION_JOIN_COOLDOWN_MS = 96 * 60 * 60 * 1000;
const HELD_TOTALS_KEY = "__held_totals";

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
  const { party_slot, is_officer, ...rest } = body;
  return rest;
}

function withFallbackSlot(member) {
  return member ? { ...member, party_slot: null, is_officer: false } : member;
}

function normalizeReceived(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function heldTotalsFromReceived(value) {
  const received = normalizeReceived(value);
  const storedHeld = normalizeReceived(received[HELD_TOTALS_KEY]);
  if (Object.keys(storedHeld).length) return storedHeld;

  return Object.fromEntries(
    Object.entries(received)
      .filter(([key, count]) => !key.startsWith("__") && Number.isFinite(Number(count)))
      .map(([key, count]) => [key, Number(count)])
  );
}

function itemHeldCount(progress, itemKey) {
  const received = normalizeReceived(progress?.received);
  const held = heldTotalsFromReceived(received);
  return Math.max(Number(held[itemKey] || 0), Number(received[itemKey] || 0));
}

function isMemberInAuctionCooldown(member, nowMs = Date.now()) {
  if (!member?.joined_at) return false;
  const joinedAtMs = new Date(member.joined_at).getTime();
  if (Number.isNaN(joinedAtMs)) return false;
  return joinedAtMs + AUCTION_JOIN_COOLDOWN_MS > nowMs;
}

function isMemberLateForRound(member, round) {
  if (!member?.joined_at || !round?.started_at) return false;
  const joinedAtMs = new Date(member.joined_at).getTime();
  const roundStartedAtMs = new Date(round.started_at).getTime();
  if (Number.isNaN(joinedAtMs) || Number.isNaN(roundStartedAtMs)) return false;
  return joinedAtMs > roundStartedAtMs;
}

function cleanMemberPayload(payload) {
  const group_id = payload.group_id || null;
  return {
    char_name: String(payload.char_name || "").trim(),
    char_class: String(payload.char_class || "").trim(),
    group_id,
    party_slot: group_id ? cleanPartySlot(payload.party_slot) : null,
    is_officer: Boolean(payload.is_officer),
    joined_at: payload.joined_at || null,
    notes: payload.notes ? String(payload.notes).trim() : null
  };
}

function createCapResolver(items, roundCapOverrides = [], memberCapOverrides = []) {
  const roundCaps = new Map(roundCapOverrides.map((row) => [row.item_id, row.cap]));
  const memberCaps = new Map(memberCapOverrides.map((row) => [`${row.member_id}:${row.item_id}`, row.cap]));

  return {
    capFor(memberId, item) {
      const memberCap = memberCaps.get(`${memberId}:${item.id}`);
      if (memberCap !== undefined) return memberCap;
      const roundCap = roundCaps.get(item.id);
      if (roundCap !== undefined) return roundCap;
      return item.default_per_round_cap || 0;
    }
  };
}

async function buildInitialRoundProgress(supabase, roundId, member) {
  const roundResult = await supabase
    .from("rounds")
    .select("id,started_at")
    .eq("id", roundId)
    .maybeSingle();
  if (roundResult.error) throw roundResult.error;
  const round = roundResult.data;
  if (!isMemberInAuctionCooldown(member) && !isMemberLateForRound(member, round)) return {};

  const [itemsResult, progressResult, membersResult, memberCapsResult, roundCapsResult] = await Promise.all([
    supabase.from("auction_items").select("id,item_key,default_per_round_cap,gates_round_completion"),
    supabase.from("member_round_progress").select("member_id,received").eq("round_id", roundId),
    supabase.from("members").select("id,joined_at"),
    supabase.from("member_cap_overrides").select("member_id,item_id,cap").eq("round_id", roundId),
    supabase.from("round_item_cap_overrides").select("item_id,cap").eq("round_id", roundId)
  ]);

  if (itemsResult.error) throw itemsResult.error;
  if (progressResult.error) throw progressResult.error;
  if (membersResult.error) throw membersResult.error;
  if (memberCapsResult.error) throw memberCapsResult.error;
  if (roundCapsResult.error) throw roundCapsResult.error;

  const items = itemsResult.data || [];
  const membersById = new Map((membersResult.data || []).map((row) => [row.id, row]));
  const capResolver = createCapResolver(items, roundCapsResult.data || [], memberCapsResult.data || []);
  const heldTotals = {};

  for (const item of items) {
    if (!item.gates_round_completion) continue;
    const memberCap = capResolver.capFor(member.id, item);
    if (memberCap <= 0) continue;

    const eligibleRows = (progressResult.data || [])
      .filter((progress) => capResolver.capFor(progress.member_id, item) > 0)
      .filter((progress) => {
        const existingMember = membersById.get(progress.member_id);
        return !existingMember || (!isMemberInAuctionCooldown(existingMember) && !isMemberLateForRound(existingMember, round));
      });
    if (!eligibleRows.length) continue;

    const completedCycles = Math.min(...eligibleRows.map((progress) => {
      const cap = capResolver.capFor(progress.member_id, item);
      return Math.floor(itemHeldCount(progress, item.item_key) / cap);
    }));
    if (completedCycles > 0) heldTotals[item.item_key] = completedCycles * memberCap;
  }

  return Object.keys(heldTotals).length ? { [HELD_TOTALS_KEY]: heldTotals } : {};
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
        received: await buildInitialRoundProgress(supabase, activeRound.id, data)
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
