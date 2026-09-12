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
