import { NextResponse } from "next/server";
import { handleApiError, requireAdmin, unauthorized } from "@/lib/api";
import { writeAuditLog } from "@/lib/auditLog";
import { startRound } from "@/lib/auctionEngine";
import { emitDashboardEvent } from "@/lib/dashboardEvents";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

// Creates the permanent rotation list: shuffles the current roster once and
// locks it as positions 1..N (see docs/specs/auction-logic-spec.md, "The
// Permanent Locked Rotation List"). Every other auction action is gated on an
// active round existing, so this is the entry point for the whole flow.
// startRound refuses when a round is already active, which is what keeps the
// list permanent — later roster changes append/remove rather than reshuffle.
export async function POST(request) {
  if (!requireAdmin(request)) return unauthorized();

  try {
    const supabase = getSupabaseAdmin();
    const auctionState = await startRound(supabase);
    await emitDashboardEvent(supabase, "auction_round_started");
    await writeAuditLog(supabase, request, {
      action: "auction.round_started",
      targetType: "round",
      targetId: auctionState.activeRound?.id || null,
      summary: `Created auction lineup #${auctionState.activeRound?.round_number ?? "?"} with ${auctionState.progress?.length ?? 0} members`,
      metadata: { round: auctionState.activeRound || null }
    });
    return NextResponse.json({ auctionState });
  } catch (error) {
    return handleApiError(error);
  }
}
