import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api";
import { fetchBootstrapData } from "@/lib/bootstrapData";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

function stripPrivateFields(value) {
  if (Array.isArray(value)) return value.map(stripPrivateFields);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "notes")
      .map(([key, nested]) => [key, stripPrivateFields(nested)])
  );
}

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const data = await fetchBootstrapData(supabase);

    return NextResponse.json({
      ...data,
      auctionState: stripPrivateFields(data.auctionState)
    }, {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    return handleApiError(error);
  }
}
