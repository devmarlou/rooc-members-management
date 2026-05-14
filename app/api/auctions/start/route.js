import { NextResponse } from "next/server";
import { handleApiError, requireAuth, unauthorized } from "@/lib/api";
import { startAuction } from "@/lib/auctionEngine";
import { emitDashboardEvent } from "@/lib/dashboardEvents";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request) {
  if (!requireAuth(request)) return unauthorized();

  try {
    const supabase = getSupabaseAdmin();
    const auctionState = await startAuction(supabase, await request.json());
    await emitDashboardEvent(supabase, "auction_started");
    return NextResponse.json({ auctionState });
  } catch (error) {
    return handleApiError(error);
  }
}
