import { NextResponse } from "next/server";
import { handleApiError, requireAuth, unauthorized } from "@/lib/api";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const MEMBER_SELECT = "id,char_name,char_class,group_id,party_slot,joined_at,notes,created_at,updated_at";

function isMissingPartySlotError(error) {
  const message = String(error?.message || "");
  return error?.code === "42703" || message.includes("party_slot");
}

export async function PATCH(request, { params }) {
  if (!requireAuth(request)) return unauthorized();

  try {
    const { id: groupId } = await params;
    const payload = await request.json();
    const orderedMemberIds = Array.isArray(payload.orderedMemberIds) ? payload.orderedMemberIds : [];

    if (!groupId) return NextResponse.json({ error: "Group id is required." }, { status: 400 });
    if (!orderedMemberIds.length || orderedMemberIds.length > 5) {
      return NextResponse.json({ error: "Provide 1 to 5 member ids in slot order." }, { status: 400 });
    }

    const uniqueIds = new Set(orderedMemberIds);
    if (uniqueIds.size !== orderedMemberIds.length) {
      return NextResponse.json({ error: "Member ids must be unique." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: members, error: memberError } = await supabase
      .from("members")
      .select(MEMBER_SELECT)
      .eq("group_id", groupId);

    if (memberError) {
      if (isMissingPartySlotError(memberError)) {
        return NextResponse.json({ error: "Run the party_slot Supabase migration before saving party order." }, { status: 400 });
      }
      throw memberError;
    }

    const groupMemberIds = new Set((members || []).map((member) => member.id));
    const invalidIds = orderedMemberIds.filter((memberId) => !groupMemberIds.has(memberId));
    if (invalidIds.length) {
      return NextResponse.json({ error: "Party order includes a member outside this group." }, { status: 400 });
    }

    const remainingMembers = (members || [])
      .filter((member) => !uniqueIds.has(member.id))
      .sort((a, b) => (a.party_slot ?? 99) - (b.party_slot ?? 99) || a.char_name.localeCompare(b.char_name));
    const normalizedMembers = [
      ...orderedMemberIds.map((memberId) => members.find((member) => member.id === memberId)).filter(Boolean),
      ...remainingMembers
    ].slice(0, 5);

    for (const [index, member] of normalizedMembers.entries()) {
      const { error } = await supabase
        .from("members")
        .update({ party_slot: index + 1 })
        .eq("id", member.id);
      if (error) throw error;
    }

    const { data: updatedMembers, error: updatedError } = await supabase
      .from("members")
      .select(MEMBER_SELECT)
      .eq("group_id", groupId)
      .order("party_slot", { ascending: true, nullsFirst: false })
      .order("char_name", { ascending: true });

    if (updatedError) throw updatedError;
    return NextResponse.json({ members: updatedMembers || [] });
  } catch (error) {
    return handleApiError(error);
  }
}
