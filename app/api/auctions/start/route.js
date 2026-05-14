import { NextResponse } from "next/server";
import { handleApiError, requireAuth, unauthorized } from "@/lib/api";
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
    return NextResponse.json({ auctionState });
  } catch (error) {
    return handleApiError(error);
  }
}
