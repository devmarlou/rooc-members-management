import { NextResponse } from "next/server";
import { finishActiveAuction } from "@/lib/auctionEngine";
import { handleApiError, requireAuth, unauthorized } from "@/lib/api";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request) {
  if (!requireAuth(request)) return unauthorized();

  try {
    const auctionState = await finishActiveAuction(getSupabaseAdmin());
    return NextResponse.json({ auctionState });
  } catch (error) {
    return handleApiError(error);
  }
}
