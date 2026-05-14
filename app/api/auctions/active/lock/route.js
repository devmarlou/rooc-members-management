import { NextResponse } from "next/server";
import { handleApiError, requireAuth, unauthorized } from "@/lib/api";
import { lockAuctionList } from "@/lib/auctionEngine";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request) {
  if (!requireAuth(request)) return unauthorized();

  try {
    const body = await request.json();
    const auctionState = await lockAuctionList(getSupabaseAdmin(), body.auctionId);
    return NextResponse.json({ auctionState });
  } catch (error) {
    return handleApiError(error);
  }
}
