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

assert.deepEqual(orderedNames, [
  ...Array(5).fill("fredplays"),
  ...Array(8).fill("BanoobsDR"),
  ...Array(8).fill("DocxBR"),
  ...Array(5).fill("NextNeed")
]);
assert.equal(result.units.length, 26);
assert.equal(result.units.filter((unit) => unit.member_id === "prio-a").length, 8);
assert.equal(result.units.filter((unit) => unit.member_id === "prio-b").length, 8);

console.log("auction priority order check passed");

// Card priority: a member deep in the rotation with `auction_priority_card`
// is slotted right after the cursor start for Puppet Card, gets exactly one
// card, and leftover inventory never loops into a second card for anyone.
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
assert.deepEqual(cardResult.units.map((unit) => unit.member_id), ["c-start", "c-prio", "c-next"]);

const cardOverflow = buildAllocationRows({ context: cardContext, inventoryByItemId: new Map([[card.id, 9]]) });
assert.deepEqual(cardOverflow.units.map((unit) => unit.member_id), ["c-start", "c-prio", "c-next", "c-feather", "c-last"]);
assert.equal(cardOverflow.units.filter((unit) => unit.member_id === "c-prio").length, 1);

console.log("card priority order check passed");
