import assert from "node:assert/strict";
import { auctionPageNavigation } from "../lib/auctionPageSearch.js";

const slot = (name) => ({ member: name ? { char_name: name } : null });
const pages = [
  { page: 2, slots: [slot("Lou"), slot("Lou"), slot("Other"), slot(null)] },
  { page: 3, slots: [slot("Other")] },
  { page: 12, slots: [slot("Lou")] },
  { page: 28, slots: [slot("Louis")] }
];
const first = auctionPageNavigation(pages, 1, " LOU ");
assert.deepEqual(first.matchingPages.map((page) => page.page), [2, 12, 28]);
assert.equal(first.currentPage, pages[0]);
assert.equal(first.currentPage.slots.length, 4);
assert.equal(first.previousPage, null);
assert.equal(first.nextPage, 12);
const middle = auctionPageNavigation(pages, 12, "lou");
assert.equal(middle.previousPage, 2);
assert.equal(middle.nextPage, 28);
assert.equal(auctionPageNavigation(pages, 28, "lou").nextPage, null);
assert.equal(auctionPageNavigation(pages, 12, "missing").currentPage, null);
assert.deepEqual(auctionPageNavigation([], 1, "lou").matchingPages, []);
const cleared = auctionPageNavigation(pages, 2, " ");
assert.equal(cleared.searching, false);
assert.equal(cleared.nextPage, 3);
assert.equal(cleared.matchingPages.length, 4);
console.log("Auction page search checks passed");
