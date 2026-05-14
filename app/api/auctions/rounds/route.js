import { NextResponse } from "next/server";
import { handleApiError, requireAuth, unauthorized } from "@/lib/api";
import { startRound } from "@/lib/auctionEngine";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request) {
  if (!requireAuth(request)) return unauthorized();

  try {
    const auctionState = await startRound(getSupabaseAdmin());
    return NextResponse.json({ auctionState });
  } catch (error) {
    return handleApiError(error);
  }
}
