import { NextResponse } from "next/server";
import { handleApiError, requireAuth, unauthorized } from "@/lib/api";
import { fetchBootstrapData } from "@/lib/bootstrapData";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(request) {
  if (!requireAuth(request)) return unauthorized();

  try {
    const supabase = getSupabaseAdmin();
    return NextResponse.json(await fetchBootstrapData(supabase, { includeNotes: true }));
  } catch (error) {
    return handleApiError(error);
  }
}
