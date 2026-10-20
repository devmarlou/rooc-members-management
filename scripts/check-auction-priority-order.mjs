import assert from "node:assert/strict";
import { buildAllocationRows } from "../lib/auctionEngine.js";

const ld = {
  id: "ld",
  item_key: "feather_ld",
  name: "Light & Dark",
  short_name: "L&D",
  gates_round_completion: true
};

const members = [
  { id: "prio-a", char_name: "BanoobsDR", auction_priority_override: true },
  { id: "prio-b", char_name: "DocxBR", auction_priority_override: true },
  { id: "full", char_name: "AlreadyFull", auction_priority_override: false },
  { id: "start", char_name: "fredplays", auction_priority_override: false },
  { id: "next", char_name: "NextNeed", auction_priority_override: false }
];

const context = {
  items: [ld],
  allItems: [ld],
  membersById: new Map(members.map((member) => [member.id, member])),
  rotation: members.map((member, index) => ({
    member_id: member.id,
    position: index + 1
  })),
  progressByMemberId: new Map([
    ["prio-a", { member_id: "prio-a", received: { feather_ld: 8 } }],
    ["prio-b", { member_id: "prio-b", received: { feather_ld: 8 } }],
    ["full", { member_id: "full", received: { feather_ld: 5 } }],
    ["start", { member_id: "start", received: { feather_ld: 0 } }],
    ["next", { member_id: "next", received: { feather_ld: 0 } }]
  ]),
  capResolver: {
    capFor(memberId) {
      return memberId.startsWith("prio-") ? 8 : 5;
    },
    hasMemberCap() {
      return false;
    }
  }
};

const result = buildAllocationRows({
  context,
  inventoryByItemId: new Map([[ld.id, 26]])
});

const namesById = new Map(members.map((member) => [member.id, member.char_name]));
const orderedNames = result.units.map((unit) => namesById.get(unit.member_id));

// Feather priority members are served strictly first, in rotation order,
// then the walk resumes from the first non-priority member with room.
assert.deepEqual(orderedNames, [
  ...Array(8).fill("BanoobsDR"),
  ...Array(8).fill("DocxBR"),
  ...Array(5).fill("fredplays"),
  ...Array(5).fill("NextNeed")
]);
assert.equal(result.units.length, 26);
assert.equal(result.units.filter((unit) => unit.member_id === "prio-a").length, 8);
assert.equal(result.units.filter((unit) => unit.member_id === "prio-b").length, 8);

console.log("auction priority order check passed");

// Card priority: a member deep in the rotation with `auction_priority_card`
// is served strictly first for Puppet Card, gets exactly one card, and
// leftover inventory never loops into a second card for anyone.
const card = {
  id: "card",
  item_key: "puppet_card",
  name: "Puppet Card",
  short_name: "Card",
  gates_round_completion: true
};
const cardMembers = [
  { id: "c-start", char_name: "Start", auction_priority_override: false, auction_priority_card: false },
  { id: "c-next", char_name: "Next", auction_priority_override: false, auction_priority_card: false },
  { id: "c-feather", char_name: "FeatherOnly", auction_priority_override: true, auction_priority_card: false },
  { id: "c-prio", char_name: "CardPrio", auction_priority_override: true, auction_priority_card: true },
  { id: "c-last", char_name: "Last", auction_priority_override: false, auction_priority_card: false }
];
const cardContext = {
  items: [card],
  allItems: [card],
  membersById: new Map(cardMembers.map((member) => [member.id, member])),
  rotation: cardMembers.map((member, index) => ({ member_id: member.id, position: index + 1 })),
  progressByMemberId: new Map(cardMembers.map((member) => [
    member.id,
    { member_id: member.id, received: { puppet_card: member.id === "c-prio" ? 1 : 0 } }
  ])),
  capResolver: { capFor() { return 1; }, hasMemberCap() { return false; } }
};
const cardResult = buildAllocationRows({ context: cardContext, inventoryByItemId: new Map([[card.id, 3]]) });
assert.deepEqual(cardResult.units.map((unit) => unit.member_id), ["c-prio", "c-start", "c-next"]);

const cardOverflow = buildAllocationRows({ context: cardContext, inventoryByItemId: new Map([[card.id, 9]]) });
assert.deepEqual(cardOverflow.units.map((unit) => unit.member_id), ["c-prio", "c-start", "c-next", "c-feather", "c-last"]);
assert.equal(cardOverflow.units.filter((unit) => unit.member_id === "c-prio").length, 1);

console.log("card priority order check passed");

// Card cycle reset: when every member already has their card for the cycle,
// the card-priority member still gets one first, then the cycle resets to zero
// and the walk continues from the cursor, skipping the priority member. Held
// totals never change the order.
const fullContext = {
  ...cardContext,
  progressByMemberId: new Map(cardMembers.map((member) => [
    member.id,
    { member_id: member.id, received: { puppet_card: 1, __held_totals: { puppet_card: member.id === "c-prio" ? 7 : 2 } } }
  ]))
};
const fullResult = buildAllocationRows({ context: fullContext, inventoryByItemId: new Map([[card.id, 3]]) });
assert.deepEqual(fullResult.units.map((unit) => unit.member_id), ["c-prio", "c-start", "c-next"]);
assert.deepEqual(fullResult.units.map((unit) => unit.item_cycle), [0, 1, 1]);
assert.equal(fullResult.units.filter((unit) => unit.member_id === "c-prio").length, 1);

console.log("card cycle reset check passed");

// Feather cycle walk: positions 1-10 are priority (cap 9), 11-70 are already
// full for the cycle, 71-80 still need theirs. Priority gets its share first,
// 71-80 close the cycle, and the leftover starts the next cycle at the first
// non-priority member (11), never at the priority members again.
const walkMembers = Array.from({ length: 80 }, (_, index) => ({
  id: `w${index + 1}`,
  char_name: `W${index + 1}`,
  auction_priority_override: index < 10,
  auction_priority_card: false
}));
const walkContext = {
  items: [ld],
  allItems: [ld],
  membersById: new Map(walkMembers.map((member) => [member.id, member])),
  rotation: walkMembers.map((member, index) => ({ member_id: member.id, position: index + 1 })),
  progressByMemberId: new Map(walkMembers.map((member, index) => [
    member.id,
    { member_id: member.id, received: { feather_ld: index >= 10 && index < 70 ? 3 : 0 } }
  ])),
  capResolver: {
    capFor(memberId) { return Number(memberId.slice(1)) <= 10 ? 9 : 3; },
    hasMemberCap() { return false; }
  }
};
const walk = buildAllocationRows({ context: walkContext, inventoryByItemId: new Map([[ld.id, 10 * 9 + 10 * 3 + 12]]) });
const walkOrder = [];
for (const unit of walk.units) if (walkOrder.at(-1) !== unit.member_id) walkOrder.push(unit.member_id);
assert.deepEqual(walkOrder, [
  ...Array.from({ length: 10 }, (_, index) => `w${index + 1}`),
  ...Array.from({ length: 10 }, (_, index) => `w${index + 71}`),
  "w11", "w12", "w13", "w14"
]);
assert.equal(walk.units.length, 132);
for (let index = 1; index <= 10; index += 1) assert.equal(walk.units.filter((unit) => unit.member_id === `w${index}`).length, 9);
assert.deepEqual([...new Set(walk.units.filter((unit) => unit.member_id === "w11").map((unit) => unit.item_cycle))], [1]);

console.log("feather cycle walk check passed");
