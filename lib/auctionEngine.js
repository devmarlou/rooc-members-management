import { randomInt } from "crypto";

const MEMBER_SELECT = "id,char_name,char_class,group_id,joined_at,notes,created_at,updated_at";
const ITEM_SELECT = "id,item_key,name,short_name,sort_order,default_per_round_cap,applies_to_auction_types,gates_round_completion";
const OPEN_AUCTION_STATUSES = ["active", "locked"];
const AUCTION_JOIN_COOLDOWN_MS = 96 * 60 * 60 * 1000;
const HELD_TOTALS_KEY = "__held_totals";
const TEST_BASELINE_LINEUP = [
  "Rome",
  "SweetAngel",
  "WeeChrlygBR",
  "WeePriestBR",
  "WeeHuBeshy",
  "WeeSonixBR",
  "XWeeHuRye",
  "WeeMigBR",
  "Tofukidd",
  "Oxie",
  "StepBro",
  "Gradux",
  "Ryjj",
  "A1110",
  "WeeFrztttBR",
  "kimi",
  "Java",
  "Darthas",
  "TaichouBee",
  "Kreyja",
  "SADISTA",
  "Puts",
  "Senyoraaa",
  "Shammyre",
  "Sh1nboo",
  "Nyaruko",
  "Ynori",
  "Messt",
  "Doidoi",
  "BOLTSTAR",
  "Hibernate",
  "RSPKT",
  "AndromedA",
  "Autumn",
  "BanoobsDR",
  "Calixx",
  "Ordz",
  "ASTRiD",
  "YanagnapAD",
  "Tobichan",
  "SNOW",
  "DEVOURED",
  "Mamark",
  "Sanguine",
  "Akyra",
  "Akiii",
  "Miyuyua",
  "Jyliana",
  "MT999",
  "Lalaa",
  "Herius",
  "AfyGPDS",
  "WeeJOSHBR",
  "Helxine",
  "WeeYomiBR",
  "WeeJunBR",
  "Yamato",
  "Shan",
  "WeeGetziiBR",
  "Nasmi",
  "DocxBR",
  "R0dd",
  "BanoobsBR",
  "Kushinero",
  "fredplays",
  "WeeDevaBR",
  "WeeYagsBR",
  "WeeHuBR",
  "WeeSunxBR",
  "KrisJulio",
  "NakedGarfield0",
  "NakedGarfield1",
  "NakedGarfiel2",
  "Osnub",
  "Alcyone",
  "PritongPusit",
  "Supreme",
  "BELL"
];
const TEST_BASELINE_FULL_ITEMS = new Set([
  "Rome",
  "SweetAngel",
  "WeeChrlygBR",
  "WeePriestBR",
  "WeeHuBeshy",
  "WeeSonixBR",
  "XWeeHuRye",
  "WeeMigBR",
  "Tofukidd",
  "Oxie",
  "StepBro",
  "Gradux",
  "Ryjj",
  "A1110",
  "WeeFrztttBR",
  "kimi",
  "Java",
  "Darthas",
  "TaichouBee",
  "Kreyja",
  "SADISTA",
  "Puts",
  "Senyoraaa",
  "Shammyre",
  "Sh1nboo",
  "Nyaruko",
  "Ynori",
  "Messt",
  "Doidoi",
  "BOLTSTAR",
  "Hibernate",
  "RSPKT",
  "AndromedA",
  "Autumn",
  "BanoobsDR",
  "Calixx",
  "Ordz",
  "ASTRiD",
  "YanagnapAD"
]);
const TEST_BASELINE_PUPPET_TS = new Set([
  "Tobichan",
  "SNOW",
  "DEVOURED",
  "Mamark",
  "Sanguine",
  "Akyra",
  "Akiii",
  "Miyuyua",
  "Jyliana",
  "Helxine",
  "WeeYomiBR"
]);
const TEST_BASELINE_PUPPET_ONLY = new Set(["MT999", "Lalaa", "Herius", "AfyGPDS", "WeeJOSHBR"]);

function missingOptionalTable(error) {
  return error && (error.code === "42P01" || error.code === "PGRST205" || String(error.message || "").includes("round_item_cap_overrides"));
}

function normalizeName(value) {
  return String(value || "").trim().toLowerCase();
}

function testBaselineReceived(memberName) {
  if (memberName === "WeeHuBeshy") {
    return { puppet_card: 2, feather_ld: 8, feather_ts: 8 };
  }
  if (TEST_BASELINE_FULL_ITEMS.has(memberName)) {
    return { puppet_card: 1, feather_ld: 8, feather_ts: 8 };
  }
  if (TEST_BASELINE_PUPPET_TS.has(memberName)) {
    return { puppet_card: 1, feather_ld: 0, feather_ts: 8 };
  }
  if (TEST_BASELINE_PUPPET_ONLY.has(memberName)) {
    return { puppet_card: 1, feather_ld: 0, feather_ts: 0 };
  }
  return { puppet_card: 0, feather_ld: 0, feather_ts: 0 };
}

function withHeldTotals(received, held = received) {
  return {
    ...received,
    [HELD_TOTALS_KEY]: { ...held }
  };
}

function shuffle(items) {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
}

function normalizeReceived(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function heldTotalsFromReceived(value) {
  const received = normalizeReceived(value);
  const storedHeld = normalizeReceived(received[HELD_TOTALS_KEY]);
  if (Object.keys(storedHeld).length) return storedHeld;

  return Object.fromEntries(
    Object.entries(received)
      .filter(([key, count]) => !key.startsWith("__") && Number.isFinite(Number(count)))
      .map(([key, count]) => [key, Number(count)])
  );
}

function addHeldItem(received, itemKey, quantity = 1) {
  const nextReceived = normalizeReceived(received);
  const held = heldTotalsFromReceived(nextReceived);
  held[itemKey] = (held[itemKey] || 0) + quantity;
  return {
    ...nextReceived,
    [HELD_TOTALS_KEY]: held
  };
}

function itemHeldCount(progress, itemKey) {
  const received = normalizeReceived(progress?.received);
  const held = heldTotalsFromReceived(received);
  return Math.max(Number(held[itemKey] || 0), Number(received[itemKey] || 0));
}

function appliesTo(item, auctionType) {
  return Array.isArray(item.applies_to_auction_types) && item.applies_to_auction_types.includes(auctionType);
}

function isMemberInAuctionCooldown(member, nowMs = Date.now()) {
  if (!member?.joined_at) return false;
  const joinedAtMs = new Date(member.joined_at).getTime();
  if (Number.isNaN(joinedAtMs)) return false;
  return joinedAtMs + AUCTION_JOIN_COOLDOWN_MS > nowMs;
}

function positiveInteger(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function zeroOrPositiveInteger(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

async function selectMaybeSingle(query) {
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data || null;
}

async function fetchRoundItemCapOverrides(supabase, roundId) {
  const { data, error } = await supabase
    .from("round_item_cap_overrides")
    .select("id,round_id,item_id,cap")
    .eq("round_id", roundId);

  if (error) {
    if (missingOptionalTable(error)) return [];
    throw error;
  }

  return data || [];
}

async function upsertRoundItemCapOverrides(supabase, rows) {
  const { data, error } = await supabase
    .from("round_item_cap_overrides")
    .upsert(rows, { onConflict: "round_id,item_id" })
    .select("id,round_id,item_id,cap");

  if (error) {
    if (missingOptionalTable(error)) {
      throw new Error("Auction limit storage is missing. Run the updated supabase/schema.sql in Supabase, then try again.");
    }
    throw error;
  }

  return data || [];
}

function createCapResolver(items, roundCapOverrides = [], memberCapOverrides = []) {
  const roundCaps = new Map(roundCapOverrides.map((row) => [row.item_id, row.cap]));
  const memberCaps = new Map(memberCapOverrides.map((row) => [`${row.member_id}:${row.item_id}`, row.cap]));

  return {
    roundCaps,
    memberCaps,
    capFor(memberId, item) {
      const memberCap = memberCaps.get(`${memberId}:${item.id}`);
      if (memberCap !== undefined) return memberCap;
      const roundCap = roundCaps.get(item.id);
      if (roundCap !== undefined) return roundCap;
      return item.default_per_round_cap || 0;
    },
    roundCapFor(item) {
      const roundCap = roundCaps.get(item.id);
      return roundCap !== undefined ? roundCap : item.default_per_round_cap || 0;
    }
  };
}

function isMemberComplete(progress, items, capResolver) {
  const received = normalizeReceived(progress?.received);
  return items
    .filter((item) => item.gates_round_completion)
    .every((item) => (received[item.item_key] || 0) >= capResolver.capFor(progress.member_id, item));
}

function completedItemCycles(progressRows, item, capResolver, membersById = new Map()) {
  if (!capResolver) return 0;
  const eligibleRows = progressRows
    .filter((progress) => capResolver.capFor(progress.member_id, item) > 0)
    .filter((progress) => {
      const member = membersById.get(progress.member_id);
      return !member || !isMemberInAuctionCooldown(member);
    });
  if (!eligibleRows.length) return 0;

  return Math.min(
    ...eligibleRows.map((progress) => {
      const cap = capResolver.capFor(progress.member_id, item);
      return Math.floor(itemHeldCount(progress, item.item_key) / cap);
    })
  );
}

function resetItemProgress(progressRows, item, capResolver = null, membersById = new Map(), targetCompletedCycles = null) {
  const completedCycles = targetCompletedCycles ?? completedItemCycles(progressRows, item, capResolver, membersById);
  for (const progress of progressRows) {
    const received = normalizeReceived(progress.received);
    const cap = capResolver ? capResolver.capFor(progress.member_id, item) : 0;
    let heldCount = itemHeldCount(progress, item.item_key);
    let nextReceived = received;
    const member = membersById.get(progress.member_id);
    if (cap > 0 && member && isMemberInAuctionCooldown(member)) {
      const minimumHeldForCycle = completedCycles * cap;
      if (heldCount < minimumHeldForCycle) {
        nextReceived = addHeldItem(received, item.item_key, minimumHeldForCycle - heldCount);
        heldCount = minimumHeldForCycle;
      }
    }
    const currentCount = cap > 0
      ? Math.min(Math.max(heldCount - completedCycles * cap, 0), cap)
      : 0;
    progress.received = { ...nextReceived, [item.item_key]: currentCount };
  }
}

function cappedGatingItems(progressRows, items, capResolver, membersById = new Map()) {
  return items.filter((item) => {
    if (!item.gates_round_completion) return false;
    const eligibleRows = progressRows
      .filter((progress) => capResolver.capFor(progress.member_id, item) > 0)
      .filter((progress) => {
        const member = membersById.get(progress.member_id);
        return !member || !isMemberInAuctionCooldown(member);
      });
    if (!eligibleRows.length) return false;
    return eligibleRows.every((progress) => {
      const received = normalizeReceived(progress.received);
      return (received[item.item_key] || 0) >= capResolver.capFor(progress.member_id, item);
    });
  });
}

function buildProgressRows({ rotation, membersById, progressByMemberId, items, capResolver }) {
  return rotation.filter((entry) => membersById.has(entry.member_id)).map((entry, index) => {
    const progress = progressByMemberId.get(entry.member_id) || {
      member_id: entry.member_id,
      received: {},
      is_complete: false,
      completed_at: null
    };
    const received = normalizeReceived(progress.received);
    const caps = Object.fromEntries(items.map((item) => [item.item_key, capResolver.capFor(entry.member_id, item)]));
    return {
      position: index + 1,
      source_position: entry.position,
      member: membersById.get(entry.member_id) || null,
      received,
      caps,
      is_complete: Boolean(progress.is_complete),
      completed_at: progress.completed_at
    };
  });
}

function rotatedMemberIdsFromCursor(context, excludedMemberIds = new Set()) {
  const eligible = context.rotation
    .filter((entry) => context.membersById.has(entry.member_id))
    .filter((entry) => !isMemberInAuctionCooldown(context.membersById.get(entry.member_id)))
    .filter((entry) => !excludedMemberIds.has(entry.member_id));

  if (!eligible.length) return [];

  const cursorIndex = eligible.findIndex((entry) => {
    const progress = context.progressByMemberId.get(entry.member_id);
    return !isMemberComplete(progress, context.allItems, context.capResolver);
  });
  const startIndex = cursorIndex >= 0 ? cursorIndex : 0;

  return [
    ...eligible.slice(startIndex),
    ...eligible.slice(0, startIndex)
  ].map((entry) => entry.member_id);
}

function applyAllocationsToContextProgress(context, allocations = []) {
  const itemsById = new Map(context.allItems.map((item) => [item.id, item]));
  const progressRows = [...context.progressByMemberId.values()];
  const allocationUnits = [];
  for (const allocation of allocations) {
    const item = itemsById.get(allocation.item_id);
    if (!item) continue;
    for (const assignment of allocation.page_assignments || []) {
      allocationUnits.push({
        ...assignment,
        member_id: allocation.member_id,
        item_id: allocation.item_id,
        item_key: item.item_key,
        item_cycle: zeroOrPositiveInteger(assignment.item_cycle)
      });
    }
  }
  allocationUnits.sort((a, b) => (a.page || 0) - (b.page || 0) || (a.slot || 0) - (b.slot || 0));

  const activeItemCycles = new Map(context.allItems.map((item) => [item.item_key, 0]));
  const legacyResetItems = new Set();
  for (const unit of allocationUnits) {
    const item = itemsById.get(unit.item_id);
    if (!item) continue;
    if (item.gates_round_completion && unit.item_cycle > (activeItemCycles.get(item.item_key) || 0)) {
      resetItemProgress(progressRows, item, context.capResolver, context.membersById, Math.max(unit.item_cycle - 1, 0));
      activeItemCycles.set(item.item_key, unit.item_cycle);
    } else if (item.gates_round_completion && unit.cycle_reset && !unit.item_cycle && !legacyResetItems.has(item.item_key)) {
      resetItemProgress(progressRows, item, context.capResolver, context.membersById);
      legacyResetItems.add(item.item_key);
    }

    const progress = context.progressByMemberId.get(unit.member_id);
    if (!progress) continue;
    const received = { ...normalizeReceived(progress.received) };
    const nextReceived = (received[item.item_key] || 0) + 1;
    const next = addHeldItem(received, item.item_key, 1);
    next[item.item_key] = item.gates_round_completion
      ? Math.min(nextReceived, context.capResolver.capFor(unit.member_id, item))
      : nextReceived;
    progress.received = next;
    context.progressByMemberId.set(unit.member_id, progress);
  }

  for (const item of cappedGatingItems(progressRows, context.allItems, context.capResolver, context.membersById)) {
    resetItemProgress(progressRows, item, context.capResolver, context.membersById);
  }
}

async function fetchAuctionContext(supabase, round, auctionType = null) {
  const [
    membersResult,
    itemsResult,
    rotationResult,
    progressResult,
    memberCapsResult,
    roundCaps
  ] = await Promise.all([
    supabase.from("members").select(MEMBER_SELECT).order("char_name", { ascending: true }),
    supabase.from("auction_items").select(ITEM_SELECT).order("sort_order", { ascending: true }),
    supabase.from("rotation_list").select("id,round_id,member_id,position,created_at").eq("round_id", round.id).order("position", { ascending: true }),
    supabase.from("member_round_progress").select("id,round_id,member_id,received,is_complete,completed_at").eq("round_id", round.id),
    supabase.from("member_cap_overrides").select("id,round_id,member_id,item_id,cap").eq("round_id", round.id),
    fetchRoundItemCapOverrides(supabase, round.id)
  ]);

  if (membersResult.error) throw membersResult.error;
  if (itemsResult.error) throw itemsResult.error;
  if (rotationResult.error) throw rotationResult.error;
  if (progressResult.error) throw progressResult.error;
  if (memberCapsResult.error) throw memberCapsResult.error;

  const membersById = new Map((membersResult.data || []).map((member) => [member.id, member]));
  const progressByMemberId = new Map((progressResult.data || []).map((progress) => [progress.member_id, progress]));
  const items = auctionType
    ? (itemsResult.data || []).filter((item) => appliesTo(item, auctionType))
    : (itemsResult.data || []);
  const allItems = itemsResult.data || [];
  const capResolver = createCapResolver(allItems, roundCaps, memberCapsResult.data || []);

  return {
    round,
    members: membersResult.data || [],
    membersById,
    allItems,
    items,
    rotation: rotationResult.data || [],
    progress: progressResult.data || [],
    progressByMemberId,
    capResolver
  };
}

function buildAllocationRows({
  context,
  inventoryByItemId,
  inGameCapByItemId = new Map(),
  excludedMemberIds = new Set(),
  queueMemberIds = null,
  orderedMemberIds = null
}) {
  const orderIndex = new Map((orderedMemberIds || []).map((memberId, index) => [memberId, index]));
  let candidates = context.rotation
    .filter((entry) => context.membersById.has(entry.member_id))
    .filter((entry) => !isMemberInAuctionCooldown(context.membersById.get(entry.member_id)))
    .filter((entry) => !excludedMemberIds.has(entry.member_id))
    .filter((entry) => !queueMemberIds || queueMemberIds.has(entry.member_id))
    .map((entry) => {
      const progress = context.progressByMemberId.get(entry.member_id);
      const received = { ...normalizeReceived(progress?.received) };
      return { ...entry, received };
    })
    .sort((a, b) => {
      if (orderedMemberIds) return orderIndex.get(a.member_id) - orderIndex.get(b.member_id);
      return a.position - b.position;
    });

  const assigned = new Map();
  const units = [];
  const remainingByItemId = new Map(context.items.map((item) => [item.id, positiveInteger(inventoryByItemId.get(item.id))]));

  for (const item of context.items) {
    if (!item.gates_round_completion) {
      const quantity = remainingByItemId.get(item.id) || 0;
      for (let count = 0; count < quantity; count += 1) {
        const pageIndex = units.length;
        units.push({
          member_id: null,
          item_id: item.id,
          item_key: item.item_key,
          item_name: item.name,
          short_name: item.short_name,
          page: Math.floor(pageIndex / 4) + 1,
          slot: (pageIndex % 4) + 1,
          cycle_reset: false,
          cycle_reset_item_key: null,
          free_for_all: true
        });
      }
      remainingByItemId.set(item.id, 0);
      continue;
    }

    let resetCycleTarget = 0;
    let resetCount = 0;
    const completedCyclesBeforeAuction = completedItemCycles(
      [...context.progressByMemberId.values()],
      item,
      context.capResolver,
      context.membersById
    );
    while ((remainingByItemId.get(item.id) || 0) > 0 && candidates.length) {
      let gaveItemThisPass = false;

      for (const entry of candidates) {
        const remaining = remainingByItemId.get(item.id) || 0;
        if (remaining <= 0) break;

        const currentReceived = entry.received[item.item_key] || 0;
        const key = `${entry.member_id}:${item.id}`;
        const alreadyAssigned = assigned.get(key) || 0;
        const inGameCap = positiveInteger(inGameCapByItemId.get(item.id));
        const capacity = item.gates_round_completion
          ? context.capResolver.capFor(entry.member_id, item) - currentReceived
          : 1;
        const inGameCapacity = inGameCap > 0 ? inGameCap - alreadyAssigned : Number.POSITIVE_INFINITY;
        const quantityForMember = Math.min(remaining, capacity, inGameCapacity);
        if (quantityForMember <= 0) continue;

        for (let count = 0; count < quantityForMember; count += 1) {
          const pageIndex = units.length;
          const unit = {
            member_id: entry.member_id,
            item_id: item.id,
            item_key: item.item_key,
            item_name: item.name,
            short_name: item.short_name,
            page: Math.floor(pageIndex / 4) + 1,
            slot: (pageIndex % 4) + 1,
            cycle_reset: Boolean(item.gates_round_completion && resetCycleTarget > 0),
            cycle_reset_item_key: item.gates_round_completion && resetCycleTarget > 0 ? item.item_key : null,
            item_cycle: resetCycleTarget,
            in_game_cap: inGameCap || null
          };
          units.push(unit);
        }

        assigned.set(key, alreadyAssigned + quantityForMember);
        entry.received = addHeldItem(entry.received, item.item_key, quantityForMember);
        entry.received[item.item_key] = currentReceived + quantityForMember;
        remainingByItemId.set(item.id, remaining - quantityForMember);
        gaveItemThisPass = true;
      }

      if (!gaveItemThisPass) {
        if (!item.gates_round_completion) break;
        const inGameCap = positiveInteger(inGameCapByItemId.get(item.id));
        if (inGameCap > 0) {
          const hasInGameCapRoom = candidates.some((entry) => (assigned.get(`${entry.member_id}:${item.id}`) || 0) < inGameCap);
          if (!hasInGameCapRoom) break;
        }
        const hasPositiveCap = candidates.some((entry) => context.capResolver.capFor(entry.member_id, item) > 0);
        if (!hasPositiveCap) break;
        resetCount += 1;
        resetCycleTarget = completedCyclesBeforeAuction + resetCount;
        const completedCyclesBeforeTarget = Math.max(resetCycleTarget - 1, 0);
        for (const entry of candidates) {
          const cap = context.capResolver.capFor(entry.member_id, item);
          const heldCount = itemHeldCount(entry, item.item_key);
          entry.received[item.item_key] = cap > 0
            ? Math.min(Math.max(heldCount - completedCyclesBeforeTarget * cap, 0), cap)
            : 0;
        }
        candidates = [...candidates].sort((a, b) => a.position - b.position);
      }
    }
  }

  const allocationMap = new Map();
  for (const unit of units) {
    if (!unit.member_id) continue;
    const key = `${unit.member_id}:${unit.item_id}`;
    if (!allocationMap.has(key)) {
      allocationMap.set(key, {
        member_id: unit.member_id,
        item_id: unit.item_id,
        quantity: 0,
        page_assignments: []
      });
    }
    const row = allocationMap.get(key);
    row.quantity += 1;
    row.page_assignments.push({
      page: unit.page,
      slot: unit.slot,
      item_key: unit.item_key,
      item_name: unit.item_name,
      short_name: unit.short_name,
      cycle_reset: unit.cycle_reset,
      cycle_reset_item_key: unit.cycle_reset_item_key,
      item_cycle: unit.item_cycle || 0,
      in_game_cap: unit.in_game_cap || null
    });
  }

  return {
    queue: candidates,
    allocationRows: [...allocationMap.values()],
    units
  };
}

function markReassignedAllocations(allocationRows, previousAllocations = []) {
  const previousByMemberItem = new Map();
  const hadReassignedAssignment = (assignments = []) => assignments.some((assignment) => assignment.reassigned);
  for (const allocation of previousAllocations || []) {
    previousByMemberItem.set(`${allocation.member_id}:${allocation.item_id}`, {
      quantity: zeroOrPositiveInteger(allocation.quantity),
      reassigned: hadReassignedAssignment(allocation.page_assignments)
    });
  }

  return allocationRows.map((row) => {
    const previous = previousByMemberItem.get(`${row.member_id}:${row.item_id}`);
    const wasAlreadyMarked = Boolean(previous?.reassigned);
    const gainedAllocation = zeroOrPositiveInteger(row.quantity) > (previous?.quantity || 0);
    if (!wasAlreadyMarked && !gainedAllocation) return row;
    return { ...row, page_assignments: row.page_assignments.map((assignment) => ({ ...assignment, reassigned: true })) };
  });
}

async function fetchPreviousCantPayMembers(supabase, roundId) {
  const latestDoneAuction = await selectMaybeSingle(
    supabase
      .from("auctions")
      .select("id")
      .eq("round_id", roundId)
      .eq("status", "done")
      .order("done_at", { ascending: false })
      .limit(1)
  );
  if (!latestDoneAuction) return new Set();

  const { data, error } = await supabase
    .from("auction_queue")
    .select("member_id,status")
    .eq("auction_id", latestDoneAuction.id)
    .eq("status", "cant_pay");

  if (error) throw error;
  const memberIds = new Set();
  for (const queueRow of data || []) {
    memberIds.add(queueRow.member_id);
  }
  return memberIds;
}

async function insertAuctionRows(supabase, auctionId, inventoryRows, queueRows, allocationRows) {
  if (inventoryRows.length) {
    const { error } = await supabase.from("auction_inventory").insert(inventoryRows.map((row) => ({ ...row, auction_id: auctionId })));
    if (error) throw error;
  }

  if (queueRows.length) {
    const { error } = await supabase.from("auction_queue").insert(queueRows.map((row) => ({ ...row, auction_id: auctionId })));
    if (error) throw error;
  }

  if (allocationRows.length) {
    const { error } = await supabase.from("auction_allocations").insert(allocationRows.map((row) => ({ ...row, auction_id: auctionId })));
    if (error) throw error;
  }
}

async function selectOpenAuction(supabase, auctionId = null) {
  let query = supabase
    .from("auctions")
    .select("id,round_id,type,name,status,started_at,done_at")
    .in("status", OPEN_AUCTION_STATUSES)
    .order("started_at", { ascending: true })
    .limit(1);

  if (auctionId) query = query.eq("id", auctionId);

  return selectMaybeSingle(query);
}

async function hydrateAuctionState(supabase, context, auction) {
  const [inventoryResult, queueResult, allocationsResult] = await Promise.all([
    supabase.from("auction_inventory").select("id,auction_id,item_id,quantity").eq("auction_id", auction.id),
    supabase.from("auction_queue").select("id,auction_id,member_id,position,is_carry_over,status,removed_at").eq("auction_id", auction.id).order("position", { ascending: true }),
    supabase.from("auction_allocations").select("id,auction_id,member_id,item_id,quantity,page_assignments,fulfilled").eq("auction_id", auction.id)
  ]);
  if (inventoryResult.error) throw inventoryResult.error;
  if (queueResult.error) throw queueResult.error;
  if (allocationsResult.error) throw allocationsResult.error;

  const units = [];
  for (const allocation of allocationsResult.data || []) {
    const item = context.allItems.find((entry) => entry.id === allocation.item_id);
    const member = context.membersById.get(allocation.member_id);
    for (const pageAssignment of allocation.page_assignments || []) {
      units.push({
        ...pageAssignment,
        member_id: allocation.member_id,
        member,
        item_id: allocation.item_id,
        item_key: item?.item_key || pageAssignment.item_key,
        item_name: item?.name || pageAssignment.item_name,
        short_name: item?.short_name || pageAssignment.short_name
      });
    }
  }
  units.sort((a, b) => a.page - b.page || a.slot - b.slot || a.member?.char_name?.localeCompare(b.member?.char_name || "") || 0);
  const rotationByMemberId = new Map(context.rotation.map((entry) => [entry.member_id, entry.position]));
  const inventorySlotCount = (inventoryResult.data || []).reduce((sum, row) => sum + (row.quantity || 0), 0);
  const assignmentPageCount = units.reduce((max, unit) => Math.max(max, unit.page || 0), 0);

  return {
    ...auction,
    inventory: inventoryResult.data || [],
    queue: (queueResult.data || []).map((row) => ({
      ...row,
      source_position: rotationByMemberId.get(row.member_id) || row.position,
      member: context.membersById.get(row.member_id) || null
    })),
    allocations: allocationsResult.data || [],
    units,
    pageCount: Math.max(assignmentPageCount, Math.ceil(inventorySlotCount / 4))
  };
}

export async function getAuctionState(supabase) {
  const activeRound = await selectMaybeSingle(
    supabase
      .from("rounds")
      .select("id,round_number,status,started_at,completed_at")
      .eq("status", "active")
      .order("started_at", { ascending: false })
      .limit(1)
  );

  const itemsResult = await supabase
    .from("auction_items")
    .select(ITEM_SELECT)
    .order("sort_order", { ascending: true });
  if (itemsResult.error) throw itemsResult.error;

  if (!activeRound) {
    const recentRoundsResult = await supabase
      .from("rounds")
      .select("id,round_number,status,started_at,completed_at")
      .order("round_number", { ascending: false })
      .limit(3);
    if (recentRoundsResult.error) throw recentRoundsResult.error;

    return {
      activeRound: null,
      progress: [],
      activeAuction: null,
      activeAuctions: [],
      history: [],
      recentRounds: recentRoundsResult.data || [],
      itemCaps: Object.fromEntries((itemsResult.data || []).map((item) => [item.item_key, item.default_per_round_cap || 0]))
    };
  }

  const context = await fetchAuctionContext(supabase, activeRound);
  const progress = buildProgressRows(context);
  const completedCount = progress.filter((row) => row.is_complete).length;

  const openAuctionsResult = await supabase
    .from("auctions")
    .select("id,round_id,type,name,status,started_at,done_at")
    .eq("round_id", activeRound.id)
    .in("status", OPEN_AUCTION_STATUSES)
    .order("type", { ascending: true })
    .order("started_at", { ascending: true });
  if (openAuctionsResult.error) throw openAuctionsResult.error;

  const historyResult = await supabase
    .from("auctions")
    .select("id,round_id,type,name,status,started_at,done_at,auction_inventory(quantity,item_id),auction_allocations(quantity,page_assignments,member_id,item_id)")
    .eq("round_id", activeRound.id)
    .eq("status", "done")
    .order("done_at", { ascending: false });
  if (historyResult.error) throw historyResult.error;

  const activeAuctions = [];
  for (const auction of openAuctionsResult.data || []) {
    activeAuctions.push(await hydrateAuctionState(supabase, context, auction));
  }

  const itemCaps = Object.fromEntries(context.allItems.map((item) => [item.item_key, context.capResolver.roundCapFor(item)]));
  const itemKeyById = new Map(context.allItems.map((item) => [item.id, item.item_key]));
  const heldTotalsByMember = new Map();
  for (const auction of historyResult.data || []) {
    for (const allocation of auction.auction_allocations || []) {
      const itemKey = itemKeyById.get(allocation.item_id);
      if (!itemKey) continue;
      const memberTotals = heldTotalsByMember.get(allocation.member_id) || {};
      memberTotals[itemKey] = (memberTotals[itemKey] || 0) + (allocation.quantity || 0);
      heldTotalsByMember.set(allocation.member_id, memberTotals);
    }
  }
  const progressWithHeldTotals = progress.map((row) => ({
    ...row,
    held: Object.keys(heldTotalsFromReceived(row.received)).length
      ? heldTotalsFromReceived(row.received)
      : (heldTotalsByMember.get(row.member.id) || {})
  }));
  const history = (historyResult.data || []).map((auction) => {
    const pageCount = (auction.auction_allocations || []).reduce((max, allocation) => {
      const allocationMax = (allocation.page_assignments || []).reduce((pageMax, page) => Math.max(pageMax, page.page || 0), 0);
      return Math.max(max, allocationMax);
    }, 0);
    const inventoryPageCount = Math.ceil((auction.auction_inventory || []).reduce((sum, row) => sum + (row.quantity || 0), 0) / 4);
    const allocatedCount = (auction.auction_allocations || []).reduce((sum, allocation) => sum + (allocation.quantity || 0), 0);
    return { ...auction, pageCount: Math.max(pageCount, inventoryPageCount), allocatedCount };
  });

  return {
    activeRound: {
      ...activeRound,
      completedCount,
      memberCount: progress.length
    },
    progress: progressWithHeldTotals,
    activeAuction: activeAuctions[0] || null,
    activeAuctions,
    history,
    recentRounds: [],
    itemCaps
  };
}

export async function startRound(supabase) {
  const activeRound = await selectMaybeSingle(
    supabase.from("rounds").select("id").eq("status", "active").limit(1)
  );
  if (activeRound) throw new Error("There is already an active auction lineup.");

  const membersResult = await supabase.from("members").select(MEMBER_SELECT).order("char_name", { ascending: true });
  if (membersResult.error) throw membersResult.error;
  if (!membersResult.data?.length) throw new Error("Add members before creating an auction lineup.");

  const latestRound = await selectMaybeSingle(
    supabase.from("rounds").select("round_number").order("round_number", { ascending: false }).limit(1)
  );
  const roundNumber = (latestRound?.round_number || 0) + 1;

  const roundResult = await supabase
    .from("rounds")
    .insert({ round_number: roundNumber, status: "active" })
    .select("id,round_number,status,started_at,completed_at")
    .single();
  if (roundResult.error) throw roundResult.error;

  const randomized = shuffle(membersResult.data);
  const rotationRows = randomized.map((member, index) => ({
    round_id: roundResult.data.id,
    member_id: member.id,
    position: index + 1
  }));
  const progressRows = randomized.map((member) => ({
    round_id: roundResult.data.id,
    member_id: member.id,
    received: {}
  }));

  const rotationResult = await supabase.from("rotation_list").insert(rotationRows);
  if (rotationResult.error) throw rotationResult.error;
  const progressResult = await supabase.from("member_round_progress").insert(progressRows);
  if (progressResult.error) throw progressResult.error;

  return getAuctionState(supabase);
}

export async function resetAuctionLineupForTesting(supabase) {
  const activeRound = await selectMaybeSingle(
    supabase.from("rounds").select("id,round_number,status,started_at,completed_at").eq("status", "active").limit(1)
  );
  if (!activeRound) throw new Error("Create an auction lineup before resetting test progress.");

  const membersResult = await supabase.from("members").select(MEMBER_SELECT);
  if (membersResult.error) throw membersResult.error;
  if (!membersResult.data?.length) throw new Error("Add members before resetting the auction lineup.");
  const membersByName = new Map((membersResult.data || []).map((member) => [normalizeName(member.char_name), member]));
  const baselineMembers = TEST_BASELINE_LINEUP.map((memberName) => membersByName.get(normalizeName(memberName)));
  const missingMembers = TEST_BASELINE_LINEUP.filter((memberName, index) => !baselineMembers[index]);
  if (missingMembers.length) {
    throw new Error(`Cannot restore the test baseline. Missing members: ${missingMembers.join(", ")}.`);
  }

  const auctionsDelete = await supabase.from("auctions").delete().eq("round_id", activeRound.id);
  if (auctionsDelete.error) throw auctionsDelete.error;
  const progressDelete = await supabase.from("member_round_progress").delete().eq("round_id", activeRound.id);
  if (progressDelete.error) throw progressDelete.error;
  const rotationDelete = await supabase.from("rotation_list").delete().eq("round_id", activeRound.id);
  if (rotationDelete.error) throw rotationDelete.error;

  const context = await fetchAuctionContext(supabase, activeRound);

  const rotationRows = baselineMembers.map((member, index) => ({
    round_id: activeRound.id,
    member_id: member.id,
    position: index + 1
  }));
  const progressRows = baselineMembers.map((member) => {
    const received = withHeldTotals(testBaselineReceived(member.char_name));
    const progress = {
      round_id: activeRound.id,
      member_id: member.id,
      received
    };
    const complete = isMemberComplete(progress, context.allItems, context.capResolver);
    return {
      ...progress,
      is_complete: complete,
      completed_at: complete ? new Date().toISOString() : null
    };
  });

  const rotationResult = await supabase.from("rotation_list").insert(rotationRows);
  if (rotationResult.error) throw rotationResult.error;
  const progressResult = await supabase.from("member_round_progress").insert(progressRows);
  if (progressResult.error) throw progressResult.error;

  return getAuctionState(supabase);
}

export async function startAuction(supabase, payload) {
  const type = payload?.type === "league_prize" ? "league_prize" : "gl_woe";
  const openAuctionQuery = supabase.from("auctions").select("id,type").in("status", OPEN_AUCTION_STATUSES).limit(1);
  const activeAuction = await selectMaybeSingle(type === "gl_woe" ? openAuctionQuery : openAuctionQuery.eq("type", type));
  if (activeAuction) {
    throw new Error(type === "gl_woe"
      ? "Finish the open auction pair before starting another GL/WoE auction."
      : "Finish the open League Prize auction before starting another one.");
  }

  const activeRound = await selectMaybeSingle(
    supabase.from("rounds").select("id,round_number,status,started_at,completed_at").eq("status", "active").limit(1)
  );
  if (!activeRound) throw new Error("Create an auction lineup before starting an auction.");

  const context = await fetchAuctionContext(supabase, activeRound, type);
  const inventoryByItemId = new Map();
  const inGameCapByItemId = new Map();
  for (const item of context.items) {
    inventoryByItemId.set(item.id, zeroOrPositiveInteger(payload?.inventory?.[item.item_key]));
    inGameCapByItemId.set(item.id, positiveInteger(payload?.inGameCaps?.[item.item_key]));
  }

  const previousCantPay = await fetchPreviousCantPayMembers(supabase, activeRound.id);
  let queueMemberIds = null;
  let orderedMemberIds = null;

  if (type === "league_prize") {
    const sourceGlAuction = await selectMaybeSingle(
      supabase
        .from("auctions")
        .select("id,status,started_at,done_at")
        .eq("round_id", activeRound.id)
        .eq("type", "gl_woe")
        .in("status", ["locked", "done"])
        .order("started_at", { ascending: false })
        .limit(1)
    );
    if (!sourceGlAuction) throw new Error("Create and lock a GL/WoE auction before starting League Prize.");

    const latestLeagueAuction = await selectMaybeSingle(
      supabase
        .from("auctions")
        .select("id,started_at,done_at")
        .eq("round_id", activeRound.id)
        .eq("type", "league_prize")
        .in("status", ["active", "locked", "done"])
        .order("started_at", { ascending: false })
        .limit(1)
    );
    if (latestLeagueAuction?.started_at && new Date(latestLeagueAuction.started_at) > new Date(sourceGlAuction.started_at)) {
      throw new Error("League Prize already exists for the latest GL/WoE auction.");
    }

    const [sourceQueueResult, sourceAllocationsResult] = await Promise.all([
      supabase
        .from("auction_queue")
        .select("member_id,position,status")
        .eq("auction_id", sourceGlAuction.id)
        .order("position", { ascending: true }),
      supabase
        .from("auction_allocations")
        .select("member_id,item_id,quantity,page_assignments")
        .eq("auction_id", sourceGlAuction.id)
    ]);
    if (sourceQueueResult.error) throw sourceQueueResult.error;
    if (sourceAllocationsResult.error) throw sourceAllocationsResult.error;

    const cantPayMemberIds = new Set((sourceQueueResult.data || [])
      .filter((row) => row.status === "cant_pay")
      .map((row) => row.member_id));

    if (sourceGlAuction.status === "locked") {
      applyAllocationsToContextProgress(context, sourceAllocationsResult.data || []);
    }

    orderedMemberIds = rotatedMemberIdsFromCursor(context, cantPayMemberIds);
    queueMemberIds = new Set(orderedMemberIds);
  }

  const allocationResult = buildAllocationRows({ context, inventoryByItemId, inGameCapByItemId, queueMemberIds, orderedMemberIds });
  const auctionName = String(payload?.name || "").trim() || (type === "league_prize" ? "League Prize" : "GL/WoE Auction");

  const auctionResult = await supabase
    .from("auctions")
    .insert({ round_id: activeRound.id, type, name: auctionName, status: "active" })
    .select("id")
    .single();
  if (auctionResult.error) throw auctionResult.error;

  try {
    const queueRows = allocationResult.queue.map((entry, index) => ({
      member_id: entry.member_id,
      position: index + 1,
      is_carry_over: previousCantPay.has(entry.member_id),
      status: "assigned"
    }));
    const inventoryRows = context.items.map((item) => ({
      item_id: item.id,
      quantity: inventoryByItemId.get(item.id) || 0
    }));

    await insertAuctionRows(supabase, auctionResult.data.id, inventoryRows, queueRows, allocationResult.allocationRows);
  } catch (error) {
    await supabase.from("auctions").delete().eq("id", auctionResult.data.id);
    throw error;
  }

  return getAuctionState(supabase);
}

export async function lockAuctionList(supabase, auctionId) {
  const activeAuction = await selectOpenAuction(supabase, auctionId);
  if (!activeAuction) throw new Error("There is no active auction.");
  if (activeAuction.type !== "gl_woe") throw new Error("Only GL/WoE auctions can be locked for League Prize.");
  if (activeAuction.status === "locked") return getAuctionState(supabase);

  const updateResult = await supabase
    .from("auctions")
    .update({ status: "locked" })
    .eq("id", activeAuction.id);
  if (updateResult.error) throw updateResult.error;

  return getAuctionState(supabase);
}

export async function cancelOpenAuction(supabase, auctionId = null) {
  const activeAuction = await selectOpenAuction(supabase, auctionId);
  if (!activeAuction) throw new Error("There is no active auction to cancel.");

  const deleteResult = await supabase
    .from("auctions")
    .delete()
    .eq("id", activeAuction.id)
    .in("status", OPEN_AUCTION_STATUSES);
  if (deleteResult.error) throw deleteResult.error;

  return getAuctionState(supabase);
}

export async function markCantPay(supabase, memberId, auctionId = null) {
  const activeAuction = await selectOpenAuction(supabase, auctionId);
  if (!activeAuction) throw new Error("There is no active auction.");
  if (activeAuction.status === "locked") throw new Error("This auction list is locked.");
  if (!memberId) throw new Error("Member is required.");

  const queueResult = await supabase
    .from("auction_queue")
    .select("id,member_id,position,status")
    .eq("auction_id", activeAuction.id)
    .order("position", { ascending: true });
  if (queueResult.error) throw queueResult.error;
  if (!queueResult.data?.some((row) => row.member_id === memberId)) throw new Error("That member is not in the active auction queue.");

  const updateResult = await supabase
    .from("auction_queue")
    .update({ status: "cant_pay", removed_at: new Date().toISOString() })
    .eq("auction_id", activeAuction.id)
    .eq("member_id", memberId);
  if (updateResult.error) throw updateResult.error;

  const inventoryResult = await supabase
    .from("auction_inventory")
    .select("item_id,quantity")
    .eq("auction_id", activeAuction.id);
  if (inventoryResult.error) throw inventoryResult.error;

  const previousAllocationsResult = await supabase
    .from("auction_allocations")
    .select("member_id,item_id,quantity,page_assignments")
    .eq("auction_id", activeAuction.id);
  if (previousAllocationsResult.error) throw previousAllocationsResult.error;

  const round = await selectMaybeSingle(
    supabase.from("rounds").select("id,round_number,status,started_at,completed_at").eq("id", activeAuction.round_id).limit(1)
  );
  const context = await fetchAuctionContext(supabase, round, activeAuction.type);
  const excluded = new Set(queueResult.data.filter((row) => row.status === "cant_pay").map((row) => row.member_id));
  excluded.add(memberId);
  const queueMemberIds = new Set(queueResult.data.map((row) => row.member_id));
  const orderedMemberIds = queueResult.data.map((row) => row.member_id);
  const inventoryByItemId = new Map((inventoryResult.data || []).map((row) => [row.item_id, row.quantity]));
  const allocationResult = buildAllocationRows({ context, inventoryByItemId, excludedMemberIds: excluded, queueMemberIds, orderedMemberIds });
  const allocationRows = markReassignedAllocations(allocationResult.allocationRows, previousAllocationsResult.data || []);

  const deleteResult = await supabase.from("auction_allocations").delete().eq("auction_id", activeAuction.id);
  if (deleteResult.error) throw deleteResult.error;
  if (allocationRows.length) {
    const insertResult = await supabase
      .from("auction_allocations")
      .insert(allocationRows.map((row) => ({ ...row, auction_id: activeAuction.id })));
    if (insertResult.error) throw insertResult.error;
  }

  return getAuctionState(supabase);
}

async function finishAuctionMutation(supabase, auctionId = null) {
  const activeAuction = await selectOpenAuction(supabase, auctionId);
  if (!activeAuction) throw new Error("There is no active auction.");

  const [allocationsResult, roundResult] = await Promise.all([
    supabase.from("auction_allocations").select("member_id,item_id,quantity,page_assignments").eq("auction_id", activeAuction.id),
    supabase.from("rounds").select("id,round_number,status,started_at,completed_at").eq("id", activeAuction.round_id).single()
  ]);
  if (allocationsResult.error) throw allocationsResult.error;
  if (roundResult.error) throw roundResult.error;

  const context = await fetchAuctionContext(supabase, roundResult.data);
  const itemsById = new Map(context.allItems.map((item) => [item.id, item]));
  const progressByMemberId = new Map(context.progress.map((progress) => [progress.member_id, progress]));
  const progressRows = [...progressByMemberId.values()];

  const allocationUnits = [];
  for (const allocation of allocationsResult.data || []) {
    const item = itemsById.get(allocation.item_id);
    if (!item) continue;
    for (const assignment of allocation.page_assignments || []) {
      allocationUnits.push({
        ...assignment,
        member_id: allocation.member_id,
        item_id: allocation.item_id,
        item_key: item.item_key,
        item_cycle: zeroOrPositiveInteger(assignment.item_cycle)
      });
    }
  }
  allocationUnits.sort((a, b) => (a.page || 0) - (b.page || 0) || (a.slot || 0) - (b.slot || 0));

  const activeItemCycles = new Map(context.allItems.map((item) => [item.item_key, 0]));
  const legacyResetItems = new Set();
  for (const unit of allocationUnits) {
    const item = itemsById.get(unit.item_id);
    if (!item) continue;
    if (item.gates_round_completion && unit.item_cycle > (activeItemCycles.get(item.item_key) || 0)) {
      resetItemProgress(progressRows, item, context.capResolver, context.membersById, Math.max(unit.item_cycle - 1, 0));
      activeItemCycles.set(item.item_key, unit.item_cycle);
    } else if (item.gates_round_completion && unit.cycle_reset && !unit.item_cycle && !legacyResetItems.has(item.item_key)) {
      resetItemProgress(progressRows, item, context.capResolver, context.membersById);
      legacyResetItems.add(item.item_key);
    }

    const progress = progressByMemberId.get(unit.member_id);
    if (!progress) continue;
    const received = { ...normalizeReceived(progress.received) };
    const nextReceived = (received[item.item_key] || 0) + 1;
    const next = addHeldItem(received, item.item_key, 1);
    next[item.item_key] = item.gates_round_completion
      ? Math.min(nextReceived, context.capResolver.capFor(unit.member_id, item))
      : nextReceived;
    progress.received = next;
  }

  for (const item of cappedGatingItems(progressRows, context.allItems, context.capResolver, context.membersById)) {
    resetItemProgress(progressRows, item, context.capResolver, context.membersById);
  }

  const updates = [];
  for (const progress of progressByMemberId.values()) {
    const complete = isMemberComplete(progress, context.allItems, context.capResolver);
    updates.push({
      id: progress.id,
      round_id: progress.round_id,
      member_id: progress.member_id,
      received: progress.received,
      is_complete: complete,
      completed_at: complete ? (progress.completed_at || new Date().toISOString()) : null
    });
  }

  if (updates.length) {
    const { error } = await supabase
      .from("member_round_progress")
      .upsert(updates, { onConflict: "id" });
    if (error) throw error;
  }

  const auctionUpdate = await supabase
    .from("auctions")
    .update({ status: "done", done_at: new Date().toISOString() })
    .eq("id", activeAuction.id);
  if (auctionUpdate.error) throw auctionUpdate.error;

  return activeAuction;
}

export async function finishActiveAuction(supabase, auctionId = null) {
  await finishAuctionMutation(supabase, auctionId);
  return getAuctionState(supabase);
}

export async function finishEventAuctions(supabase, auctionIds = []) {
  const uniqueAuctionIds = [...new Set((auctionIds || []).filter(Boolean))];
  if (!uniqueAuctionIds.length) throw new Error("Select at least one auction to finish.");

  for (const auctionId of uniqueAuctionIds) {
    await finishAuctionMutation(supabase, auctionId);
  }

  return getAuctionState(supabase);
}

export async function updateRoundLimits(supabase, payload) {
  const activeRound = await selectMaybeSingle(
    supabase.from("rounds").select("id,round_number,status,started_at,completed_at").eq("status", "active").limit(1)
  );
  if (!activeRound) throw new Error("Create an auction lineup before adjusting auction limits.");

  const itemsResult = await supabase
    .from("auction_items")
    .select(ITEM_SELECT)
    .order("sort_order", { ascending: true });
  if (itemsResult.error) throw itemsResult.error;

  const caps = payload?.caps || {};
  const rows = (itemsResult.data || []).map((item) => ({
    round_id: activeRound.id,
    item_id: item.id,
    cap: zeroOrPositiveInteger(caps[item.item_key])
  }));

  await upsertRoundItemCapOverrides(supabase, rows);

  const context = await fetchAuctionContext(supabase, activeRound);
  for (const progress of context.progress) {
    const complete = isMemberComplete(progress, context.allItems, context.capResolver);
    const { error } = await supabase
      .from("member_round_progress")
      .update({
        is_complete: complete,
        completed_at: complete ? (progress.completed_at || new Date().toISOString()) : null
      })
      .eq("id", progress.id);
    if (error) throw error;
  }

  return getAuctionState(supabase);
}
