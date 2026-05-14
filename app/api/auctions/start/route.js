import { NextResponse } from "next/server";
import { handleApiError, requireAuth, unauthorized } from "@/lib/api";
import { startAuction } from "@/lib/auctionEngine";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request) {
  if (!requireAuth(request)) return unauthorized();

  try {
    const auctionState = await startAuction(getSupabaseAdmin(), await request.json());
    return NextResponse.json({ auctionState });
  } catch (error) {
    return handleApiError(error);
  }
}
