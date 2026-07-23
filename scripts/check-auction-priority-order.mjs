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
    ["prio-a", { member_id: "prio-a", received: { feather_ld: 9 } }],
    ["prio-b", { member_id: "prio-b", received: { feather_ld: 9 } }],
    ["full", { member_id: "full", received: { feather_ld: 3 } }],
    ["start", { member_id: "start", received: { feather_ld: 0 } }],
    ["next", { member_id: "next", received: { feather_ld: 0 } }]
  ]),
  capResolver: {
    capFor(memberId) {
      return memberId.startsWith("prio-") ? 9 : 3;
    },
    hasMemberCap() {
      return false;
    }
  }
};

const result = buildAllocationRows({
  context,
  inventoryByItemId: new Map([[ld.id, 24]])
});

const namesById = new Map(members.map((member) => [member.id, member.char_name]));
const orderedNames = result.units.map((unit) => namesById.get(unit.member_id));

assert.deepEqual(orderedNames.slice(0, 3), ["fredplays", "fredplays", "fredplays"]);
assert.deepEqual(orderedNames.slice(3, 12), Array(9).fill("BanoobsDR"));
assert.deepEqual(orderedNames.slice(12, 21), Array(9).fill("DocxBR"));
assert.deepEqual(orderedNames.slice(21, 24), Array(3).fill("NextNeed"));
assert.equal(result.units.length, 24);

console.log("auction priority order check passed");
