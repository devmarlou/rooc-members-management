import { NextResponse } from "next/server";
import { handleApiError, requireAuth, unauthorized } from "@/lib/api";
import { writeAuditLog } from "@/lib/auditLog";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const MEMBER_SELECT = "id,char_name,char_class,group_id,party_slot,is_officer,auction_priority_override,joined_at,notes,created_at,updated_at";

function isMissingPartySlotError(error) {
  const message = String(error?.message || "");
  return error?.code === "42703" || message.includes("party_slot") || message.includes("auction_priority_override");
}

function cleanSlot(value) {
  const slot = Number(value);
  return Number.isInteger(slot) && slot >= 1 && slot <= 5 ? slot : null;
}

export async function PATCH(request) {
  if (!requireAuth(request)) return unauthorized();

  try {
    const payload = await request.json();
    const groups = Array.isArray(payload.groups) ? payload.groups : [];
    const unassignedMemberIds = Array.isArray(payload.unassignedMemberIds) ? payload.unassignedMemberIds : [];

    if (!groups.length && !unassignedMemberIds.length) {
      return NextResponse.json({ error: "Provide party layout changes to save." }, { status: 400 });
    }

    const memberTargets = new Map();
    const touchedGroupIds = new Set();
    const touchedMemberIds = new Set(unassignedMemberIds);

    for (const group of groups) {
      const groupId = String(group.group_id || "").trim();
      const entries = Array.isArray(group.members) ? group.members : [];
      if (!groupId) return NextResponse.json({ error: "Group id is required for every layout group." }, { status: 400 });
      if (entries.length > 5) return NextResponse.json({ error: "A party can only have 5 members." }, { status: 400 });

      const usedSlots = new Set();
      touchedGroupIds.add(groupId);
      for (const entry of entries) {
        const memberId = String(entry.member_id || "").trim();
        const slot = cleanSlot(entry.party_slot);
        if (!memberId || !slot) {
          return NextResponse.json({ error: "Each layout member needs a member id and slot 1-5." }, { status: 400 });
        }
        if (usedSlots.has(slot)) {
          return NextResponse.json({ error: "Each party slot can only be used once." }, { status: 400 });
        }
        if (memberTargets.has(memberId)) {
          return NextResponse.json({ error: "A member can only appear once in the layout." }, { status: 400 });
        }
        usedSlots.add(slot);
        touchedMemberIds.add(memberId);
        memberTargets.set(memberId, { member_id: memberId, group_id: groupId, party_slot: slot });
      }
    }

    for (const memberId of unassignedMemberIds) {
      if (memberTargets.has(memberId)) {
        return NextResponse.json({ error: "A member cannot be assigned and unassigned in the same layout." }, { status: 400 });
      }
      memberTargets.set(memberId, { member_id: memberId, group_id: null, party_slot: null });
    }

    if (!touchedMemberIds.size) {
      return NextResponse.json({ error: "Provide at least one member to update." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: currentMembers, error: memberError } = await supabase
      .from("members")
      .select(MEMBER_SELECT)
      .in("id", [...touchedMemberIds]);

    if (memberError) {
      if (isMissingPartySlotError(memberError)) {
        return NextResponse.json({ error: "Run the latest Supabase member migration before saving party layouts." }, { status: 400 });
      }
      throw memberError;
    }

    if ((currentMembers || []).length !== touchedMemberIds.size) {
      return NextResponse.json({ error: "Layout references a missing member." }, { status: 400 });
    }

    for (const member of currentMembers || []) {
      if (member.group_id) touchedGroupIds.add(member.group_id);
    }

    const { data: groupMembers, error: groupMemberError } = touchedGroupIds.size
      ? await supabase
        .from("members")
        .select(MEMBER_SELECT)
        .in("group_id", [...touchedGroupIds])
      : { data: [], error: null };

    if (groupMemberError) throw groupMemberError;

    const finalByGroup = new Map();
    for (const member of groupMembers || []) {
      const target = memberTargets.get(member.id);
      const groupId = target ? target.group_id : member.group_id;
      const slot = target ? target.party_slot : member.party_slot;
      if (!groupId) continue;
      if (!finalByGroup.has(groupId)) finalByGroup.set(groupId, []);
      finalByGroup.get(groupId).push({ member_id: member.id, party_slot: slot });
    }

    for (const target of memberTargets.values()) {
      if (!target.group_id) continue;
      const existing = finalByGroup.get(target.group_id) || [];
      if (!existing.some((entry) => entry.member_id === target.member_id)) {
        existing.push({ member_id: target.member_id, party_slot: target.party_slot });
        finalByGroup.set(target.group_id, existing);
      }
    }

    for (const [groupId, entries] of finalByGroup.entries()) {
      if (entries.length > 5) {
        return NextResponse.json({ error: "That group already has 5 members." }, { status: 400 });
      }
      const slots = new Set();
      for (const entry of entries) {
        if (!entry.party_slot) continue;
        if (slots.has(entry.party_slot)) {
          return NextResponse.json({ error: "A party cannot have two members in the same slot." }, { status: 400 });
        }
        slots.add(entry.party_slot);
      }
    }

    for (const [memberId, target] of memberTargets.entries()) {
      const { member_id, ...updateBody } = target;
      const { error } = await supabase
        .from("members")
        .update(updateBody)
        .eq("id", memberId);
      if (error) throw error;
    }

    const { data: updatedMembers, error: updatedError } = await supabase
      .from("members")
      .select(MEMBER_SELECT)
      .in("id", [...touchedMemberIds]);

    if (updatedError) throw updatedError;

    await writeAuditLog(supabase, request, {
      action: "parties.layout_updated",
      targetType: "party_layout",
      summary: "Updated party layout",
      metadata: {
        groups,
        unassignedMemberIds,
        before: currentMembers || [],
        after: updatedMembers || []
      }
    });

    return NextResponse.json({ members: updatedMembers || [] });
  } catch (error) {
    return handleApiError(error);
  }
}
