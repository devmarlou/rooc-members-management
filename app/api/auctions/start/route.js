import { NextResponse } from "next/server";
import { handleApiError, requireAuth, unauthorized } from "@/lib/api";
import { writeAuditLog } from "@/lib/auditLog";
import { startAuction } from "@/lib/auctionEngine";
import { emitDashboardEvent } from "@/lib/dashboardEvents";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request) {
  if (!requireAuth(request)) return unauthorized();

  try {
    const supabase = getSupabaseAdmin();
    const payload = await request.json();
    const auctionState = await startAuction(supabase, payload);
    await emitDashboardEvent(supabase, `${payload.type || "auction"}_auction_started`);
    const activeAuction = (auctionState.activeAuctions || []).find((auction) => auction.type === payload.type) || auctionState.activeAuction;
    await writeAuditLog(supabase, request, {
      action: "auction.started",
      targetType: "auction",
      targetId: activeAuction?.id || null,
      summary: `Started ${payload.type || "auction"} auction`,
      metadata: { payload, auction: activeAuction || null }
    });
    return NextResponse.json({ auctionState });
  } catch (error) {
    return handleApiError(error);
  }
}
