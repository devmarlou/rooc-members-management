// Drives the real auction engine through many auctions in memory (no database)
// and checks the allocation rules hold while priority flags, cap overrides,
// rotation moves, joins and removals change between auctions.
//
//   node scripts/simulate-auction-seasons.mjs            # 300 random seasons
//   node scripts/simulate-auction-seasons.mjs 50 --verbose
import assert from "node:assert/strict";
import { applyAllocationsToContextProgress, buildAllocationRows, createCapResolver } from "../lib/auctionEngine.js";

const SEASONS = Number(process.argv[2]) || 300;
const VERBOSE = process.argv.includes("--verbose");
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const STATS = { auctions: 0, units: 0, cycleResets: 0, promotions: 0, demotions: 0, joins: 0, leaves: 0, leftoverFeathers: 0, demotedServedLater: 0 };

const ITEMS = [
  { id: "card", item_key: "puppet_card", name: "Puppet Card", short_name: "Puppet", sort_order: 1, default_per_round_cap: 1, applies_to_auction_types: ["gl_woe", "league_prize"], gates_round_completion: true },
  { id: "frag", item_key: "puppet_fragment", name: "Puppet Fragment", short_name: "Fragment", sort_order: 2, default_per_round_cap: 0, applies_to_auction_types: ["gl_woe", "league_prize"], gates_round_completion: false },
  { id: "ld", item_key: "feather_ld", name: "Light & Dark", short_name: "L&D", sort_order: 3, default_per_round_cap: 3, applies_to_auction_types: ["gl_woe", "league_prize"], gates_round_completion: true },
  { id: "ts", item_key: "feather_ts", name: "Time & Space", short_name: "T&S", sort_order: 4, default_per_round_cap: 6, applies_to_auction_types: ["gl_woe", "league_prize"], gates_round_completion: true }
];
const ITEM_BY_KEY = new Map(ITEMS.map((item) => [item.item_key, item]));
const ROUND_CAPS = [{ item_id: "card", cap: 1 }, { item_id: "frag", cap: 0 }, { item_id: "ld", cap: 3 }, { item_id: "ts", cap: 6 }];
const PRIORITY_FEATHER_CAPS = { ld: 9, ts: 10 };
// Real inventories from past auctions, cycled through.
const INVENTORIES = [
  { puppet_card: 15, puppet_fragment: 0, feather_ld: 120, feather_ts: 150 },
  { puppet_card: 36, puppet_fragment: 15, feather_ld: 148, feather_ts: 179 },
  { puppet_card: 40, puppet_fragment: 20, feather_ld: 168, feather_ts: 210 },
  { puppet_card: 42, puppet_fragment: 21, feather_ld: 174, feather_ts: 210 },
  { puppet_card: 5, puppet_fragment: 0, feather_ld: 30, feather_ts: 40 },
  { puppet_card: 120, puppet_fragment: 0, feather_ld: 400, feather_ts: 700 }
];

function rng(seed) {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13; state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5; state >>>= 0;
    return state / 0x100000000;
  };
}
const pick = (random, list) => list[Math.floor(random() * list.length)];

function makeWorld(random, startMs) {
  const memberCount = 60 + Math.floor(random() * 30);
  const members = [];
  for (let index = 0; index < memberCount; index += 1) {
    members.push({ id: `m${index + 1}`, char_name: `M${index + 1}`, joined_at: new Date(startMs - 30 * DAY).toISOString(), auction_priority_override: false, auction_priority_card: false });
  }
  const world = {
    members,
    memberCapOverrides: [],
    rotation: members.map((member, index) => ({ member_id: member.id, position: index + 1 })),
    progress: members.map((member) => ({ member_id: member.id, received: {}, is_complete: false })),
    nowMs: startMs,
    nextId: memberCount + 1,
    // Per-member counters used by the fairness checks.
    totals: new Map(members.map((member) => [member.id, { puppet_card: 0, feather_ld: 0, feather_ts: 0 }])),
    log: []
  };
  const feather = new Set(); const card = new Set();
  for (let count = 0; count < 5 + Math.floor(random() * 4); count += 1) feather.add(pick(random, members).id);
  for (let count = 0; count < Math.floor(random() * 3); count += 1) card.add(pick(random, members).id);
  for (const id of feather) setFeatherPriority(world, id, true, true);
  for (const id of card) setCardPriority(world, id, true);
  return world;
}

function memberById(world, id) { return world.members.find((member) => member.id === id); }
function hasPriority(member) { return Boolean(member.auction_priority_override || member.auction_priority_card); }

// Mirrors moveMemberIntoPriorityBlock: a newly prioritized member moves right
// after the members who already hold priority, and never moves back.
function moveIntoPriorityBlock(world, memberId) {
  const order = [...world.rotation].sort((a, b) => a.position - b.position);
  const positions = order.map((row) => row.position);
  const index = order.findIndex((row) => row.member_id === memberId);
  const priorityCount = order.filter((row) => row.member_id !== memberId && hasPriority(memberById(world, row.member_id))).length;
  if (index < 0 || index <= priorityCount) return;
  const [row] = order.splice(index, 1);
  order.splice(priorityCount, 0, row);
  order.forEach((entry, idx) => { entry.position = positions[idx]; });
}

function setFeatherPriority(world, memberId, on, withCaps) {
  const member = memberById(world, memberId);
  const gained = !hasPriority(member) && on;
  member.auction_priority_override = on;
  world.memberCapOverrides = world.memberCapOverrides.filter((row) => row.member_id !== memberId);
  if (on && withCaps) {
    world.memberCapOverrides.push({ member_id: memberId, item_id: "ld", cap: PRIORITY_FEATHER_CAPS.ld }, { member_id: memberId, item_id: "ts", cap: PRIORITY_FEATHER_CAPS.ts });
  }
  if (gained) moveIntoPriorityBlock(world, memberId);
  if (on) STATS.promotions += 1; else STATS.demotions += 1;
}
function setCardPriority(world, memberId, on) {
  const member = memberById(world, memberId);
  const gained = !hasPriority(member) && on;
  member.auction_priority_card = on;
  if (gained) moveIntoPriorityBlock(world, memberId);
}
function addMember(world) {
  const id = `m${world.nextId++}`;
  world.members.push({ id, char_name: `M${id.slice(1)}`, joined_at: new Date(world.nowMs).toISOString(), auction_priority_override: false, auction_priority_card: false });
  world.rotation.push({ member_id: id, position: Math.max(...world.rotation.map((row) => row.position)) + 1 });
  world.progress.push({ member_id: id, received: {}, is_complete: false });
  world.totals.set(id, { puppet_card: 0, feather_ld: 0, feather_ts: 0 });
  STATS.joins += 1;
  return id;
}
function removeMember(world, memberId) {
  world.members = world.members.filter((member) => member.id !== memberId);
  world.rotation = world.rotation.filter((row) => row.member_id !== memberId);
  world.progress = world.progress.filter((row) => row.member_id !== memberId);
  world.memberCapOverrides = world.memberCapOverrides.filter((row) => row.member_id !== memberId);
  world.totals.delete(memberId);
  STATS.leaves += 1;
}

function buildContext(world) {
  const membersById = new Map(world.members.map((member) => [member.id, member]));
  return {
    round: { id: "round" },
    members: world.members,
    membersById,
    allItems: ITEMS,
    items: ITEMS,
    rotation: [...world.rotation].sort((a, b) => a.position - b.position),
    progress: world.progress,
    progressByMemberId: new Map(world.progress.map((row) => [row.member_id, row])),
    capResolver: createCapResolver(ITEMS, ROUND_CAPS, world.memberCapOverrides)
  };
}

function inCooldown(member, nowMs) { return new Date(member.joined_at).getTime() + 96 * HOUR > nowMs; }
function usesPriority(member, item) {
  if (item.item_key === "puppet_card") return Boolean(member.auction_priority_card);
  if (item.item_key === "feather_ld" || item.item_key === "feather_ts") return Boolean(member.auction_priority_override);
  return false;
}

function runAuction(world, inventory, label) {
  const context = buildContext(world);
  const nowMs = world.nowMs;
  const positionByMemberId = new Map(world.rotation.map((row) => [row.member_id, row.position]));
  const inventoryByItemId = new Map(ITEMS.map((item) => [item.id, inventory[item.item_key] || 0]));
  const snapshot = new Map(world.progress.map((row) => [row.member_id, structuredClone(row.received)]));

  const { units, allocationRows } = buildAllocationRows({ context, inventoryByItemId, cooldownReferenceMs: nowMs });
  const fail = (message, extra = {}) => {
    const error = new Error(`${label}: ${message}`);
    error.extra = extra;
    throw error;
  };

  for (const item of ITEMS.filter((entry) => entry.gates_round_completion)) {
    const itemUnits = units.filter((unit) => unit.item_key === item.item_key);
    const perMember = new Map();
    for (const unit of itemUnits) perMember.set(unit.member_id, (perMember.get(unit.member_id) || 0) + 1);

    // Rule: per-auction hard caps. Cards: one per member. Feathers: the member's cap.
    for (const [memberId, count] of perMember) {
      const cap = item.item_key === "puppet_card" ? 1 : context.capResolver.capFor(memberId, item);
      if (count > cap) fail(`${memberId} got ${count} ${item.short_name} in one auction (cap ${cap})`);
      const member = context.membersById.get(memberId);
      if (inCooldown(member, nowMs)) fail(`${memberId} is in cooldown but got ${item.short_name}`);
    }

    // Rule: priority members come strictly first, in rotation order, and get their full entitlement.
    const priorityIds = context.rotation
      .map((row) => row.member_id)
      .filter((id) => usesPriority(context.membersById.get(id), item) && !inCooldown(context.membersById.get(id), nowMs));
    const firstNonPriorityIndex = itemUnits.findIndex((unit) => !usesPriority(context.membersById.get(unit.member_id), item));
    const priorityUnits = firstNonPriorityIndex < 0 ? itemUnits : itemUnits.slice(0, firstNonPriorityIndex);
    if (itemUnits.slice(priorityUnits.length).some((unit) => usesPriority(context.membersById.get(unit.member_id), item))) {
      fail(`a priority member was served after non-priority members for ${item.short_name}`);
    }
    let remaining = inventory[item.item_key] || 0;
    for (const id of priorityIds) {
      const entitlement = Math.min(item.item_key === "puppet_card" ? 1 : context.capResolver.capFor(id, item), remaining);
      if ((perMember.get(id) || 0) !== entitlement) fail(`priority ${id} got ${perMember.get(id) || 0} ${item.short_name}, expected ${entitlement}`);
      remaining -= entitlement;
    }
    const priorityOrder = priorityUnits.map((unit) => positionByMemberId.get(unit.member_id));
    for (let index = 1; index < priorityOrder.length; index += 1) {
      if (priorityOrder[index] < priorityOrder[index - 1]) fail(`priority members out of rotation order for ${item.short_name}`);
    }

    // Rule: non-priority members follow the list. Within one cycle segment the
    // positions rise, wrapping at most once (the walk starts at the cursor).
    const normalUnits = itemUnits.slice(priorityUnits.length);
    const segments = new Map();
    for (const unit of normalUnits) {
      if (!segments.has(unit.item_cycle)) segments.set(unit.item_cycle, []);
      segments.get(unit.item_cycle).push(unit);
    }
    for (const [cycle, segment] of segments) {
      const seen = new Set();
      let drops = 0;
      for (let index = 0; index < segment.length; index += 1) {
        const unit = segment[index];
        const position = positionByMemberId.get(unit.member_id);
        if (index > 0) {
          const previous = positionByMemberId.get(segment[index - 1].member_id);
          if (position < previous) drops += 1;
          if (position !== previous && seen.has(unit.member_id)) fail(`${unit.member_id} was revisited within cycle ${cycle} for ${item.short_name}`);
        }
        seen.add(unit.member_id);
      }
      if (drops > 1) fail(`non-priority walk is not in list order for ${item.short_name} (cycle ${cycle})`);
    }

    // Rule: inventory is only left over when nobody can take more this auction.
    const allocated = itemUnits.length;
    const leftover = (inventory[item.item_key] || 0) - allocated;
    if (leftover > 0) {
      const anyoneWithRoom = context.rotation.some((row) => {
        const member = context.membersById.get(row.member_id);
        if (inCooldown(member, nowMs)) return false;
        const cap = item.item_key === "puppet_card" ? 1 : context.capResolver.capFor(row.member_id, item);
        return cap > 0 && (perMember.get(row.member_id) || 0) < cap;
      });
      if (anyoneWithRoom) fail(`${leftover} ${item.short_name} left unallocated while members still had room this auction`);
    }
  }

  // Finish the auction: replay allocations onto stored progress like finishAuction does.
  applyAllocationsToContextProgress(context, allocationRows, nowMs);

  for (const unit of units) {
    if (!unit.member_id || !world.totals.has(unit.member_id)) continue;
    const totals = world.totals.get(unit.member_id);
    if (unit.item_key in totals) totals[unit.item_key] += 1;
  }

  // Rule: stored progress never shows more than the member's cap, except for a
  // member whose cap was lowered after they received (they wait for the reset).
  for (const row of world.progress) {
    for (const item of ITEMS.filter((entry) => entry.gates_round_completion)) {
      const cap = context.capResolver.capFor(row.member_id, item);
      const current = Number(row.received?.[item.item_key] || 0);
      if (current > cap && !world.everPriority.has(row.member_id)) fail(`${row.member_id} shows ${current}/${cap} ${item.short_name} after finish`);
    }
  }

  // Rule: plain list fairness for cards. Among members who were eligible the
  // whole season and never prioritized, nobody is ever two cards ahead.
  const steady = world.members.filter((member) => !world.everPriority.has(member.id) && !world.lateJoiners.has(member.id));
  const cardTotals = steady.map((member) => world.totals.get(member.id).puppet_card);
  if (cardTotals.length && Math.max(...cardTotals) - Math.min(...cardTotals) > 1) {
    fail(`card totals drifted apart among steady members: ${Math.min(...cardTotals)}..${Math.max(...cardTotals)}`);
  }
  for (const key of ["feather_ld", "feather_ts"]) {
    const cap = ITEM_BY_KEY.get(key === "feather_ld" ? "feather_ld" : "feather_ts").default_per_round_cap;
    const totals = steady.map((member) => world.totals.get(member.id)[key]);
    if (totals.length && Math.max(...totals) - Math.min(...totals) > cap) {
      fail(`${key} totals drifted apart among steady members: ${Math.min(...totals)}..${Math.max(...totals)}`);
    }
  }

  STATS.auctions += 1;
  STATS.units += units.length;
  STATS.cycleResets += new Set(units.filter((unit) => unit.item_cycle > 0).map((unit) => unit.item_key)).size;
  for (const key of ["feather_ld", "feather_ts"]) {
    if ((inventory[key] || 0) > units.filter((unit) => unit.item_key === key).length) STATS.leftoverFeathers += 1;
  }
  for (const unit of units) {
    const member = context.membersById.get(unit.member_id);
    if (member && world.everPriority.has(member.id) && !hasPriority(member) && unit.item_key !== "puppet_card") STATS.demotedServedLater += 1;
  }
  world.log.push({ label, units: units.length, cards: units.filter((unit) => unit.item_key === "puppet_card").length });
  return { units, snapshot };
}

function runSeason(seed) {
  const random = rng(seed);
  const startMs = Date.UTC(2026, 0, 1);
  const world = makeWorld(random, startMs);
  world.everPriority = new Set(world.members.filter(hasPriority).map((member) => member.id));
  world.lateJoiners = new Set();
  const auctions = 10 + Math.floor(random() * 8);
  const removeCapsOnDemote = random() < 0.5;

  for (let number = 1; number <= auctions; number += 1) {
    // Admin churn between auctions: flags flip, caps change, members join or leave.
    const churn = Math.floor(random() * 4);
    for (let count = 0; count < churn; count += 1) {
      // Half the time act on a current priority member so demotions are common.
      const priorityMembers = world.members.filter(hasPriority);
      const member = priorityMembers.length && random() < 0.5 ? pick(random, priorityMembers) : pick(random, world.members);
      const roll = random();
      if (roll < 0.3) {
        setFeatherPriority(world, member.id, !member.auction_priority_override, true);
        if (member.auction_priority_override) world.everPriority.add(member.id);
        if (!member.auction_priority_override && !removeCapsOnDemote) {
          world.memberCapOverrides.push({ member_id: member.id, item_id: "ld", cap: PRIORITY_FEATHER_CAPS.ld }, { member_id: member.id, item_id: "ts", cap: PRIORITY_FEATHER_CAPS.ts });
        }
      } else if (roll < 0.55) {
        setCardPriority(world, member.id, !member.auction_priority_card);
        if (member.auction_priority_card) world.everPriority.add(member.id);
      } else if (roll < 0.75) {
        world.lateJoiners.add(addMember(world));
      } else if (roll < 0.85 && world.members.length > 20) {
        removeMember(world, member.id);
      }
    }
    world.nowMs += (2 + Math.floor(random() * 5)) * DAY;
    const inventory = pick(random, INVENTORIES);
    runAuction(world, inventory, `season ${seed} auction ${number} (${JSON.stringify(inventory)})`);
  }
  return world;
}

let failures = 0;
for (let seed = 1; seed <= SEASONS; seed += 1) {
  try {
    const world = runSeason(seed);
    if (VERBOSE) console.log(`season ${seed}: ${world.log.length} auctions ok, ${world.members.length} members`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${error.message}`);
    if (failures >= 5) break;
  }
}
if (failures) {
  console.error(`${failures} season(s) failed.`);
  process.exit(1);
}
console.log(`${SEASONS} simulated seasons passed with no rule violations.`);
console.log(`exercised: ${JSON.stringify(STATS)}`);
