import { NextResponse } from "next/server";
import { handleApiError, requireAuth, unauthorized } from "@/lib/api";
import { writeAuditLog } from "@/lib/auditLog";
import { updateRoundLimits } from "@/lib/auctionEngine";
import { emitDashboardEvent } from "@/lib/dashboardEvents";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function PATCH(request) {
  if (!requireAuth(request)) return unauthorized();

  try {
    const supabase = getSupabaseAdmin();
    const payload = await request.json();
    const auctionState = await updateRoundLimits(supabase, payload);
    await emitDashboardEvent(supabase, "auction_limits_updated");
    await writeAuditLog(supabase, request, {
      action: "auction.limits_updated",
      targetType: "auction_round",
      targetId: auctionState.activeRound?.id || null,
      summary: "Updated auction limits",
      metadata: { payload }
    });
    return NextResponse.json({ auctionState });
  } catch (error) {
    return handleApiError(error);
  }
}
