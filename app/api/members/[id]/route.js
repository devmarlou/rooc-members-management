import { NextResponse } from "next/server";
import { handleApiError, requireAuth, unauthorized } from "@/lib/api";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

function cleanMemberPayload(payload) {
  return {
    char_name: String(payload.char_name || "").trim(),
    char_class: String(payload.char_class || "").trim(),
    group_id: payload.group_id || null,
    joined_at: payload.joined_at || null,
    notes: payload.notes ? String(payload.notes).trim() : null
  };
}

export async function PATCH(request, { params }) {
  if (!requireAuth(request)) return unauthorized();

  try {
    const { id } = await params;
    const body = cleanMemberPayload(await request.json());
    if (!body.char_name || !body.char_class) {
      return NextResponse.json({ error: "Character name and class are required." }, { status: 400 });
    }

    const { data, error } = await getSupabaseAdmin()
      .from("members")
      .update(body)
      .eq("id", id)
      .select("id,char_name,char_class,group_id,joined_at,notes,created_at,updated_at")
      .single();

    if (error) throw error;
    return NextResponse.json({ member: data });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request, { params }) {
  if (!requireAuth(request)) return unauthorized();

  try {
    const { id } = await params;
    const { error } = await getSupabaseAdmin()
      .from("members")
      .delete()
      .eq("id", id);

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
