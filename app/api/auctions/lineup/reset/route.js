import { NextResponse } from "next/server";
import { handleApiError, requireAuth, unauthorized } from "@/lib/api";
import { resetAuctionLineupForTesting } from "@/lib/auctionEngine";
import { emitDashboardEvent } from "@/lib/dashboardEvents";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request) {
  if (!requireAuth(request)) return unauthorized();

  try {
    const supabase = getSupabaseAdmin();
    const auctionState = await resetAuctionLineupForTesting(supabase);
    await emitDashboardEvent(supabase, "auction_lineup_reset");
    return NextResponse.json({ auctionState });
  } catch (error) {
    return handleApiError(error);
  }
}
