import { NextResponse } from "next/server";
import { handleApiError, requireAuth, unauthorized } from "@/lib/api";
import { writeAuditLog } from "@/lib/auditLog";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function PATCH(request, { params }) {
  if (!requireAuth(request)) return unauthorized();

  try {
    const { id } = await params;
    const payload = await request.json();
    const name = String(payload.name || "").trim();
    if (!name) return NextResponse.json({ error: "Group name is required." }, { status: 400 });

    const supabase = getSupabaseAdmin();
    const beforeResult = await supabase
      .from("groups")
      .select("id,name,sort_order,created_at")
      .eq("id", id)
      .maybeSingle();
    if (beforeResult.error) throw beforeResult.error;

    const { data, error } = await supabase
      .from("groups")
      .update({ name })
      .eq("id", id)
      .select("id,name,sort_order,created_at")
      .single();

    if (error) throw error;
    await writeAuditLog(supabase, request, {
      action: "group.updated",
      targetType: "group",
      targetId: data.id,
      summary: `Renamed group ${beforeResult.data?.name || id} to ${data.name}`,
      metadata: { before: beforeResult.data || null, after: data }
    });
    return NextResponse.json({ group: data });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request, { params }) {
  if (!requireAuth(request)) return unauthorized();

  try {
    const { id } = await params;
    const supabase = getSupabaseAdmin();
    const beforeResult = await supabase
      .from("groups")
      .select("id,name,sort_order,created_at")
      .eq("id", id)
      .maybeSingle();
    if (beforeResult.error) throw beforeResult.error;

    const { error } = await supabase
      .from("groups")
      .delete()
      .eq("id", id);

    if (error) throw error;
    await writeAuditLog(supabase, request, {
      action: "group.deleted",
      targetType: "group",
      targetId: id,
      summary: `Deleted group ${beforeResult.data?.name || id}`,
      metadata: { before: beforeResult.data || null }
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
