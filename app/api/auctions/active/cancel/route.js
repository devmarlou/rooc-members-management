import { NextResponse } from "next/server";
import { cancelOpenAuction, cancelOpenAuctions } from "@/lib/auctionEngine";
import { handleApiError, requireAuth, unauthorized } from "@/lib/api";
import { emitDashboardEvent } from "@/lib/dashboardEvents";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request) {
  if (!requireAuth(request)) return unauthorized();

  try {
    const body = await request.json().catch(() => ({}));
    const supabase = getSupabaseAdmin();
    const auctionIds = Array.isArray(body.auctionIds) ? body.auctionIds.filter(Boolean) : [];
    let auctionType = auctionIds.length > 1 ? "event" : "auction";
    if (body.auctionId || auctionIds.length === 1) {
      const typeResult = await supabase
        .from("auctions")
        .select("type")
        .eq("id", body.auctionId || auctionIds[0])
        .maybeSingle();
      if (!typeResult.error && typeResult.data?.type) auctionType = typeResult.data.type;
    }
    const auctionState = auctionIds.length
      ? await cancelOpenAuctions(supabase, auctionIds)
      : await cancelOpenAuction(supabase, body.auctionId);
    await emitDashboardEvent(supabase, `${auctionType}_auction_cancelled`);
    return NextResponse.json({ auctionState });
  } catch (error) {
    return handleApiError(error);
  }
}
