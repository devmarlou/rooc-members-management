import { NextResponse } from "next/server";
import { cancelOpenAuction } from "@/lib/auctionEngine";
import { handleApiError, requireAuth, unauthorized } from "@/lib/api";
import { emitDashboardEvent } from "@/lib/dashboardEvents";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request) {
  if (!requireAuth(request)) return unauthorized();

  try {
    const body = await request.json().catch(() => ({}));
    const supabase = getSupabaseAdmin();
    let auctionType = "auction";
    if (body.auctionId) {
      const typeResult = await supabase
        .from("auctions")
        .select("type")
        .eq("id", body.auctionId)
        .maybeSingle();
      if (!typeResult.error && typeResult.data?.type) auctionType = typeResult.data.type;
    }
    const auctionState = await cancelOpenAuction(supabase, body.auctionId);
    await emitDashboardEvent(supabase, `${auctionType}_auction_cancelled`);
    return NextResponse.json({ auctionState });
  } catch (error) {
    return handleApiError(error);
  }
}
