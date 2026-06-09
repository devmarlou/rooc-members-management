import { NextResponse } from "next/server";
import { handleApiError, requireAuth, unauthorized } from "@/lib/api";
import { writeAuditLog } from "@/lib/auditLog";
import { lockAuctionList } from "@/lib/auctionEngine";
import { emitDashboardEvent } from "@/lib/dashboardEvents";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request) {
  if (!requireAuth(request)) return unauthorized();

  try {
    const body = await request.json();
    const supabase = getSupabaseAdmin();
    const auctionState = await lockAuctionList(supabase, body.auctionId);
    await emitDashboardEvent(supabase, "auction_locked");
    await writeAuditLog(supabase, request, {
      action: "auction.locked",
      targetType: "auction",
      targetId: body.auctionId || auctionState.activeAuction?.id || null,
      summary: "Locked auction list",
      metadata: { body }
    });
    return NextResponse.json({ auctionState });
  } catch (error) {
    return handleApiError(error);
  }
}
