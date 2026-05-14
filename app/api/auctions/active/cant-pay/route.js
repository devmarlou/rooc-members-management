import { NextResponse } from "next/server";
import { handleApiError, requireAuth, unauthorized } from "@/lib/api";
import { markCantPay } from "@/lib/auctionEngine";
import { emitDashboardEvent } from "@/lib/dashboardEvents";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request) {
  if (!requireAuth(request)) return unauthorized();

  try {
    const body = await request.json();
    const supabase = getSupabaseAdmin();
    const auctionState = await markCantPay(supabase, body.memberId, body.auctionId);
    const auction = (auctionState.activeAuctions || []).find((entry) => entry.id === body.auctionId) || auctionState.activeAuction;
    await emitDashboardEvent(supabase, `${auction?.type || "auction"}_auction_cant_pay`);
    return NextResponse.json({ auctionState });
  } catch (error) {
    return handleApiError(error);
  }
}
