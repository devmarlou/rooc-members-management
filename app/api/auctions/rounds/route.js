import { NextResponse } from "next/server";
import { handleApiError, requireAuth, unauthorized } from "@/lib/api";
import { writeAuditLog } from "@/lib/auditLog";
import { startRound } from "@/lib/auctionEngine";
import { emitDashboardEvent } from "@/lib/dashboardEvents";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request) {
  if (!requireAuth(request)) return unauthorized();

  try {
    const supabase = getSupabaseAdmin();
    const auctionState = await startRound(supabase);
    await emitDashboardEvent(supabase, "auction_round_started");
    await writeAuditLog(supabase, request, {
      action: "auction.round_started",
      targetType: "auction_round",
      targetId: auctionState.activeRound?.id || null,
      summary: `Started auction round ${auctionState.activeRound?.round_number || ""}`.trim(),
      metadata: { activeRound: auctionState.activeRound || null }
    });
    return NextResponse.json({ auctionState });
  } catch (error) {
    return handleApiError(error);
  }
}
