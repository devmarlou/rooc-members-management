import { NextResponse } from "next/server";
import { handleApiError, requireAuth, unauthorized } from "@/lib/api";
import { getAuctionState } from "@/lib/auctionEngine";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const MEMBER_SELECT = "id,char_name,char_class,group_id,party_slot,is_officer,joined_at,notes,created_at,updated_at";
const MEMBER_SELECT_FALLBACK = "id,char_name,char_class,group_id,joined_at,notes,created_at,updated_at";

function isMissingPartySlotError(error) {
  const message = String(error?.message || "");
  return error?.code === "42703" || message.includes("party_slot");
}

async function fetchMembers(supabase) {
  const result = await supabase
    .from("members")
    .select(MEMBER_SELECT)
    .order("char_name", { ascending: true });

  if (!isMissingPartySlotError(result.error)) return result;

  const fallback = await supabase
    .from("members")
    .select(MEMBER_SELECT_FALLBACK)
    .order("char_name", { ascending: true });

  return {
    ...fallback,
    data: fallback.data?.map((member) => ({ ...member, party_slot: null, is_officer: false }))
  };
}

export async function GET(request) {
  if (!requireAuth(request)) return unauthorized();

  try {
    const supabase = getSupabaseAdmin();
    const [membersResult, groupsResult, itemsResult, auctionState] = await Promise.all([
      fetchMembers(supabase),
      supabase
        .from("groups")
        .select("id,name,sort_order,created_at")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
      supabase
        .from("auction_items")
        .select("id,item_key,name,short_name,sort_order,default_per_round_cap,applies_to_auction_types,gates_round_completion")
        .order("sort_order", { ascending: true }),
      getAuctionState(supabase)
    ]);

    if (membersResult.error) throw membersResult.error;
    if (groupsResult.error) throw groupsResult.error;
    if (itemsResult.error) throw itemsResult.error;

    return NextResponse.json({
      members: membersResult.data,
      groups: groupsResult.data,
      auctionItems: itemsResult.data,
      auctionState
    });
  } catch (error) {
    return handleApiError(error);
  }
}
