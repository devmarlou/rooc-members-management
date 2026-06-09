import { NextResponse } from "next/server";
import { finishEventAuctions } from "@/lib/auctionEngine";
import { handleApiError, requireAuth, unauthorized } from "@/lib/api";
import { writeAuditLog } from "@/lib/auditLog";
import { emitDashboardEvent } from "@/lib/dashboardEvents";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request) {
  if (!requireAuth(request)) return unauthorized();

  try {
    const body = await request.json().catch(() => ({}));
    const supabase = getSupabaseAdmin();
    const auctionState = await finishEventAuctions(supabase, body.auctionIds || []);
    await emitDashboardEvent(supabase, "auction_event_done");
    await writeAuditLog(supabase, request, {
      action: "auction.event_finalized",
      targetType: "auction_event",
      targetId: null,
      summary: "Finalized auction event",
      metadata: { auctionIds: body.auctionIds || [] }
    });
    return NextResponse.json({ auctionState });
  } catch (error) {
    return handleApiError(error);
  }
}
