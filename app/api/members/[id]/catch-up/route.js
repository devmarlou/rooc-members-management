import { NextResponse } from "next/server";
import { handleApiError, requireAuth, unauthorized } from "@/lib/api";
import { writeAuditLog } from "@/lib/auditLog";
import { getAuctionState } from "@/lib/auctionEngine";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const HELD_TOTALS_KEY = "__held_totals";
const OPEN_AUCTION_STATUSES = ["active", "locked"];
const AUCTION_JOIN_COOLDOWN_MS = 96 * 60 * 60 * 1000;

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

function receivedHeldCount(receivedValue, itemKey) {
  const received = normalizeReceived(receivedValue);
  const held = heldTotalsFromReceived(received);
  return Math.max(Number(held[itemKey] || 0), Number(received[itemKey] || 0));
}

function isMemberInAuctionCooldown(member, nowMs = Date.now()) {
  if (!member?.joined_at) return false;
  const joinedAtMs = new Date(member.joined_at).getTime();
  if (Number.isNaN(joinedAtMs)) return false;
  return joinedAtMs + AUCTION_JOIN_COOLDOWN_MS > nowMs;
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

function isMemberComplete(progress, items, capResolver) {
  const received = normalizeReceived(progress?.received);
  return items
    .filter((item) => item.gates_round_completion)
    .every((item) => (received[item.item_key] || 0) >= capResolver.capFor(progress.member_id, item));
}

function completedItemCyclesExcludingMember({ item, progressRows, membersById, capResolver, excludedMemberId }) {
  const eligibleRows = progressRows
    .filter((progress) => progress.member_id !== excludedMemberId)
    .filter((progress) => capResolver.capFor(progress.member_id, item) > 0)
    .filter((progress) => {
      const member = membersById.get(progress.member_id);
      return !member || !isMemberInAuctionCooldown(member);
    });
  if (!eligibleRows.length) return 0;

  return Math.min(...eligibleRows.map((progress) => {
    const cap = capResolver.capFor(progress.member_id, item);
    return Math.floor(receivedHeldCount(progress.received, item.item_key) / cap);
  }));
}

function catchUpReceived({ memberId, received, items, progressRows, membersById, capResolver }) {
  const nextReceived = { ...normalizeReceived(received) };
  const heldTotals = { ...heldTotalsFromReceived(nextReceived) };
  const changes = [];

  for (const item of items.filter((entry) => entry.gates_round_completion)) {
    const cap = capResolver.capFor(memberId, item);
    if (cap <= 0) continue;

    const targetCycles = completedItemCyclesExcludingMember({
      item,
      progressRows,
      membersById,
      capResolver,
      excludedMemberId: memberId
    });
    const targetHeld = targetCycles * cap;
    const beforeHeld = receivedHeldCount(nextReceived, item.item_key);
    const afterHeld = targetHeld;
    if (afterHeld === beforeHeld) continue;

    heldTotals[item.item_key] = afterHeld;
    nextReceived[item.item_key] = Math.min(Math.max(afterHeld - targetHeld, 0), cap);
    changes.push({
      item_key: item.item_key,
      short_name: item.short_name,
      beforeHeld,
      afterHeld,
      targetCycles
    });
  }

  if (Object.keys(heldTotals).length) nextReceived[HELD_TOTALS_KEY] = heldTotals;
  return { received: nextReceived, changes };
}

export async function POST(request, { params }) {
  if (!requireAuth(request)) return unauthorized();

  try {
    const { id } = await params;
    const supabase = getSupabaseAdmin();

    const openAuction = await supabase
      .from("auctions")
      .select("id")
      .in("status", OPEN_AUCTION_STATUSES)
      .limit(1)
      .maybeSingle();
    if (openAuction.error) throw openAuction.error;
    if (openAuction.data) {
      return NextResponse.json({ error: "Finish or cancel the open auction before catching up member cycles." }, { status: 400 });
    }

    const activeRoundResult = await supabase
      .from("rounds")
      .select("id,round_number,status,started_at,completed_at")
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (activeRoundResult.error) throw activeRoundResult.error;
    if (!activeRoundResult.data) {
      return NextResponse.json({ error: "Create an auction lineup before catching up member cycles." }, { status: 400 });
    }

    const round = activeRoundResult.data;
    const [
      memberResult,
      membersResult,
      itemsResult,
      progressResult,
      memberCapsResult,
      roundCapsResult
    ] = await Promise.all([
      supabase.from("members").select("id,char_name,joined_at").eq("id", id).maybeSingle(),
      supabase.from("members").select("id,joined_at"),
      supabase.from("auction_items").select("id,item_key,short_name,default_per_round_cap,gates_round_completion"),
      supabase.from("member_round_progress").select("id,round_id,member_id,received,is_complete,completed_at").eq("round_id", round.id),
      supabase.from("member_cap_overrides").select("member_id,item_id,cap").eq("round_id", round.id),
      supabase.from("round_item_cap_overrides").select("item_id,cap").eq("round_id", round.id)
    ]);

    if (memberResult.error) throw memberResult.error;
    if (membersResult.error) throw membersResult.error;
    if (itemsResult.error) throw itemsResult.error;
    if (progressResult.error) throw progressResult.error;
    if (memberCapsResult.error) throw memberCapsResult.error;
    if (roundCapsResult.error) throw roundCapsResult.error;
    if (!memberResult.data) return NextResponse.json({ error: "Member not found." }, { status: 404 });

    const progressRows = progressResult.data || [];
    const progress = progressRows.find((row) => row.member_id === id);
    if (!progress) return NextResponse.json({ error: "Member has no progress row in the active auction lineup." }, { status: 404 });

    const items = itemsResult.data || [];
    const membersById = new Map((membersResult.data || []).map((member) => [member.id, member]));
    const capResolver = createCapResolver(items, roundCapsResult.data || [], memberCapsResult.data || []);
    const before = normalizeReceived(progress.received);
    const { received, changes } = catchUpReceived({
      memberId: id,
      received: before,
      items,
      progressRows,
      membersById,
      capResolver
    });
    if (!changes.length) {
      return NextResponse.json({
        ok: true,
        changes,
        auctionState: await getAuctionState(supabase)
      });
    }

    const isComplete = isMemberComplete({ ...progress, received }, items, capResolver);

    const updateResult = await supabase
      .from("member_round_progress")
      .update({
        received,
        is_complete: isComplete,
        completed_at: isComplete ? (progress.completed_at || new Date().toISOString()) : null
      })
      .eq("id", progress.id);
    if (updateResult.error) throw updateResult.error;

    await writeAuditLog(supabase, request, {
      action: "member.auction_cycles_caught_up",
      targetType: "member",
      targetId: id,
      summary: `Caught up auction cycles for ${memberResult.data.char_name}`,
      metadata: {
        roundId: round.id,
        roundNumber: round.round_number,
        before,
        after: received,
        changes
      }
    });

    return NextResponse.json({
      ok: true,
      changes,
      auctionState: await getAuctionState(supabase)
    });
  } catch (error) {
    return handleApiError(error);
  }
}
