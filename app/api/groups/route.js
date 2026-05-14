import { NextResponse } from "next/server";
import { handleApiError, requireAuth, unauthorized } from "@/lib/api";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request) {
  if (!requireAuth(request)) return unauthorized();

  try {
    const payload = await request.json();
    const name = String(payload.name || "").trim();
    if (!name) return NextResponse.json({ error: "Group name is required." }, { status: 400 });

    const supabase = getSupabaseAdmin();
    const { count } = await supabase
      .from("groups")
      .select("id", { count: "exact", head: true });

    const { data, error } = await supabase
      .from("groups")
      .insert({ name, sort_order: (count || 0) * 10 + 10 })
      .select("id,name,sort_order,created_at")
      .single();

    if (error) throw error;
    return NextResponse.json({ group: data }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
