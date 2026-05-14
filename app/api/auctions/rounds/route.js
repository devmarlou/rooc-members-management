import { NextResponse } from "next/server";
import { handleApiError, requireAuth, unauthorized } from "@/lib/api";
import { startRound } from "@/lib/auctionEngine";
import { emitDashboardEvent } from "@/lib/dashboardEvents";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request) {
  if (!requireAuth(request)) return unauthorized();

  try {
    const supabase = getSupabaseAdmin();
    const auctionState = await startRound(supabase);
    await emitDashboardEvent(supabase, "auction_round_started");
    return NextResponse.json({ auctionState });
  } catch (error) {
    return handleApiError(error);
  }
}
