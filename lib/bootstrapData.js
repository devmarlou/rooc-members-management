import { getAuctionState } from "@/lib/auctionEngine";

const MEMBER_SELECT = "id,char_name,char_class,group_id,party_slot,is_officer,auction_priority_override,joined_at,created_at,updated_at";
const MEMBER_SELECT_WITH_NOTES = "id,char_name,char_class,group_id,party_slot,is_officer,auction_priority_override,joined_at,notes,created_at,updated_at";
const MEMBER_SELECT_FALLBACK = "id,char_name,char_class,group_id,joined_at,created_at,updated_at";
const MEMBER_SELECT_FALLBACK_WITH_NOTES = "id,char_name,char_class,group_id,joined_at,notes,created_at,updated_at";
const AUCTION_ITEM_SELECT = "id,item_key,name,short_name,sort_order,default_per_round_cap,applies_to_auction_types,gates_round_completion";

function isMissingMemberColumnError(error) {
  const message = String(error?.message || "");
  return error?.code === "42703" || message.includes("party_slot") || message.includes("auction_priority_override");
}

function withMemberColumnDefaults(member) {
  return member
    ? { ...member, party_slot: null, is_officer: false, auction_priority_override: false }
    : member;
}

async function fetchMembers(supabase, { includeNotes = false } = {}) {
  const result = await supabase
    .from("members")
    .select(includeNotes ? MEMBER_SELECT_WITH_NOTES : MEMBER_SELECT)
    .order("char_name", { ascending: true });

  if (!isMissingMemberColumnError(result.error)) return result;

  const fallback = await supabase
    .from("members")
    .select(includeNotes ? MEMBER_SELECT_FALLBACK_WITH_NOTES : MEMBER_SELECT_FALLBACK)
    .order("char_name", { ascending: true });

  return {
    ...fallback,
    data: fallback.data?.map(withMemberColumnDefaults)
  };
}

export async function fetchBootstrapData(supabase, options = {}) {
  // One loader keeps admin/public bootstrap responses in sync while each route controls privacy.
  const [membersResult, groupsResult, itemsResult, auctionState] = await Promise.all([
    fetchMembers(supabase, options),
    supabase
      .from("groups")
      .select("id,name,sort_order,created_at")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("auction_items")
      .select(AUCTION_ITEM_SELECT)
      .order("sort_order", { ascending: true }),
    getAuctionState(supabase)
  ]);

  if (membersResult.error) throw membersResult.error;
  if (groupsResult.error) throw groupsResult.error;
  if (itemsResult.error) throw itemsResult.error;

  return {
    members: membersResult.data || [],
    groups: groupsResult.data || [],
    auctionItems: itemsResult.data || [],
    auctionState
  };
}
