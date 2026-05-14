import { NextResponse } from "next/server";
import { handleApiError, requireAuth, unauthorized } from "@/lib/api";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function PATCH(request, { params }) {
  if (!requireAuth(request)) return unauthorized();

  try {
    const { id } = await params;
    const payload = await request.json();
    const name = String(payload.name || "").trim();
    if (!name) return NextResponse.json({ error: "Group name is required." }, { status: 400 });

    const { data, error } = await getSupabaseAdmin()
      .from("groups")
      .update({ name })
      .eq("id", id)
      .select("id,name,sort_order,created_at")
      .single();

    if (error) throw error;
    return NextResponse.json({ group: data });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request, { params }) {
  if (!requireAuth(request)) return unauthorized();

  try {
    const { id } = await params;
    const { error } = await getSupabaseAdmin()
      .from("groups")
      .delete()
      .eq("id", id);

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
