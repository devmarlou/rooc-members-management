# Auction System — Logic Spec (v3.3)

Companion document to `guild-admin-dashboard-spec.md`. Defines the rules and behavior for the automated auction allocation feature.

---

## 1. Concept

After a guild event (GL/WoE) drops a pool of rewards, the admin opens an auction in the dashboard. The system:

1. Takes the **queue** — auto-generated from ALL members, ordered by round rotation + carry-over priority
2. Takes an **inventory of items** (with per-item quantities) and **per-round caps** (with optional per-member overrides)
3. **Distributes items to members in queue order**, skipping items the member has already maxed out in this round
4. **Assigns each member page numbers + slot ranges** (4 items per page, fixed by game UI)
5. Admin can mark **"Can't Pay"** live → that member is bumped, next-in-line takes the slot
6. When admin clicks **"Done"** on the GL/WoE auction, progress is recorded
7. Admin can then optionally start a **League Prize auction** (sequential, not parallel) for members who didn't complete their haul
8. When ALL members complete their full haul (across both auction types) → the **round ends**, progress resets, queue reshuffles

---

## 2. Auction Types

Two parallel auction types are supported. Both use the same algorithm, same UI, same data tables — they're differentiated by a `type` column.

### GL/WoE Auction (the primary one)
- Default items: **Puppet Card → L&D Feather → T&S Feather**
- Always runs after every GL/WoE event
- Queue: all incomplete members for the round (with carry-overs prioritized)

### League Prize Auction (optional)
- Default items: **Puppet Card → Puppet Fragment → L&D Feather → T&S Feather**
  - Note: Puppet Fragment is unique to League Prize (game item only available here)
  - Order: Puppet first, then Fragment, then Feathers
- Only exists when the game gives out a League Prize (depends on guild meeting requirements)
- Queue: members who **didn't get a full haul from GL/WoE** (overflow / unfilled members)
- **Caps are shared across both auction types** within the same round. If Alice got 1 Puppet in GL/WoE (her cap), she's not eligible for Puppet in League Prize.

### Running sequentially
- Admin starts GL/WoE first → it goes `active`
- Admin marks GL/WoE `done` when in-game auction is complete (round progress updates)
- If a League Prize is available in-game (guild met requirements), admin can then start a League Prize auction
- League Prize draws its queue from members who **didn't complete their haul in GL/WoE**
- Each has its own page numbers (separate game UI windows)
- Round-end check runs when each auction is marked `done` (round completes when all members are `is_complete` and no auction is `active`)

---

## 3. Core Concept: Rounds & The Locked Rotation List

### Rounds

A **round** is a complete cycle where every member receives their full per-round allocation of **gating items** (items with `gates_round_completion=true` in the catalog).

- Each member's **round progress** tracks running totals per item type (e.g. Alice: 1/1 Puppet, 2/3 Fragment, 5/5 L&D, 2/5 T&S).
- Progress is updated by BOTH GL/WoE and League Prize auctions in the same round.
- **Bonus items** (e.g. Puppet Fragment with `gates_round_completion=false`) are still tracked and distributed, but they don't block round completion. A member can be `is_complete=true` while still having Fragment progress like `2/3`.
- A member with `is_complete=true` (hit cap on every GATING item type) is SKIPPED from future auctions in this round — EXCEPT they remain eligible for bonus items they haven't capped yet.

> **Bonus items have a special rule:** an `is_complete` member can still appear in an auction queue IF that auction has bonus inventory the member hasn't capped on. They're not eligible for gating items (already capped) but can pick up remaining bonus items.

- When the **last member completes** (gating items only), the round auto-ends. Progress resets, new round begins with **freshly randomized rotation list**.
- Admin can also manually trigger "Start New Round."

### The Locked Rotation List (source of truth)

At the start of every round, the system creates a **locked rotation list** — a random shuffle of all members. This list is the single source of truth for queue order throughout the entire round.

- **At round start:** `SELECT * FROM members ORDER BY random()` → assign positions 1..N → lock
- **Lock duration:** entire round (cannot be re-shuffled mid-round)
- **Mid-round changes:**
  - Member leaves the guild → removed from the rotation list (and cascades to any in-progress auction)
  - New member joins → appended to the END of the list with the next position number
- **Round end:** old list is discarded, new round generates a fresh shuffle

> The queue for every auction in the round is derived from this locked list. There is no other ordering logic — the rotation list IS the rotation. Carry-overs and skips operate within the framework of this list, not by replacing it.

### Leftover Inventory Behavior

If an auction has more inventory than the queue can absorb (everyone hits their cap before items run out), the leftover items go **unallocated**. The cap is a hard ceiling — no member can exceed their per-round cap, even with leftover available. Admin handles these items outside the dashboard (e.g. mail them, save for next round).

This is intentional: it keeps the algorithm simple and predictable. The locked list ensures fairness; the cap protects it.

---

## 4. Data Model (Supabase)

### Table: `auction_items` (item-type catalog)

Master list of item types. Order defines page-fill priority.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` (PK) | |
| `name` | `text` (not null, unique) | "Puppet Card", "Puppet Fragment", "Feather of L&D", "Feather of T&S" |
| `sort_order` | `int` (not null, unique) | Lower = filled first |
| `default_per_round_cap` | `int` (not null) | How many a member receives per ROUND (Puppet=1, Fragment=3, Feathers=5) |
| `applies_to_auction_types` | `text[]` | Which auction types this item can appear in: `['gl_woe']`, `['league_prize']`, or both |
| `gates_round_completion` | `bool` (default true) | If `true`, member must hit cap on this item to be `is_complete`. If `false`, item is a BONUS — tracked but doesn't block round end. |
| `created_at` | `timestamptz` | |

**Seed data:**
```
Puppet Card     | sort_order=1 | cap=1 | applies_to=[gl_woe, league_prize] | gates=true
Puppet Fragment | sort_order=2 | cap=3 | applies_to=[league_prize]          | gates=false ← bonus item
Feather of L&D  | sort_order=3 | cap=5 | applies_to=[gl_woe, league_prize] | gates=true
Feather of T&S  | sort_order=4 | cap=5 | applies_to=[gl_woe, league_prize] | gates=true
```

> Admin can add new item types via the UI (covered in §9). New items auto-slot into the algorithm by `sort_order`. The `gates_round_completion` flag lets admin mark any future items as bonus (e.g. if the game adds another optional reward later).

---

### Table: `rounds`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` (PK) | |
| `round_number` | `int` | 1, 2, 3... |
| `status` | `text` enum | `active` / `completed` |
| `started_at` | `timestamptz` | |
| `completed_at` | `timestamptz` (nullable) | |

Exactly one round has `status='active'` at any time.

---

### Table: `rotation_list` (NEW — the locked source of truth)

The randomized member order for the current round. Locked once the round starts.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` (PK) | |
| `round_id` | `uuid` (FK → `rounds.id`) | |
| `member_id` | `uuid` (FK → `members.id`) | |
| `position` | `int` (not null) | 1, 2, 3... assigned at round start (or N+1 for late-joiners) |
| `created_at` | `timestamptz` | |

Unique constraints: `(round_id, member_id)` and `(round_id, position)`.

> This is the locked rotation. It's created in one transaction at round start: SELECT all members, ORDER BY random(), assign positions. Mid-round new members get appended with `position = MAX(position) + 1`. If a member leaves, their row is deleted (positions become non-contiguous, which is fine — order is what matters, not gap-free numbering).

---

### Table: `member_round_progress`

Tracks each member's progress within the current round.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` (PK) | |
| `round_id` | `uuid` (FK) | |
| `member_id` | `uuid` (FK) | |
| `received` | `jsonb` | Per-item counts: `{ "puppet_card": 1, "puppet_fragment": 0, "feather_ld": 5, "feather_ts": 2 }` |
| `is_complete` | `bool` (default false) | All caps reached → skipped from auctions |
| `completed_at` | `timestamptz` (nullable) | |

Unique constraint: `(round_id, member_id)`.

> Note: `rotation_position` is NO LONGER on this table — it lives in `rotation_list`. This table only tracks what items each member has received this round.

---

### Table: `member_cap_overrides`

Per-member, per-round, per-item cap overrides. Resets when the round ends.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` (PK) | |
| `round_id` | `uuid` (FK → `rounds.id`) | Override is scoped to this round only |
| `member_id` | `uuid` (FK) | |
| `item_id` | `uuid` (FK → `auction_items.id`) | |
| `cap` | `int` (not null) | The override value (e.g. 2 instead of default 1) |

Unique constraint: `(round_id, member_id, item_id)`.

> When the round ends and a new round starts, this table is cleared for the old round (or just becomes orphaned, since new round = new `round_id`). Per-member overrides do not persist across rounds.

---

### Table: `auctions`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` (PK) | |
| `round_id` | `uuid` (FK → `rounds.id`) | |
| `type` | `text` enum | `gl_woe` / `league_prize` |
| `name` | `text` | Optional, e.g. "WoE — May 14" |
| `status` | `text` enum | `active` / `done` |
| `started_at` | `timestamptz` | |
| `done_at` | `timestamptz` (nullable) | |

> A round can have multiple auctions (multiple GL/WoE events, plus optional League Prize companions). Each auction is one row.

---

### Table: `auction_inventory`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` (PK) | |
| `auction_id` | `uuid` (FK) | |
| `item_id` | `uuid` (FK) | |
| `quantity` | `int` | |

Unique constraint: `(auction_id, item_id)`.

> When admin opens a new auction, only items where the item's `applies_to_auction_types` includes the auction type are shown in the inventory editor.

---

### Table: `auction_queue`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` (PK) | |
| `auction_id` | `uuid` (FK) | |
| `member_id` | `uuid` (FK) | |
| `position` | `int` | 1, 2, 3... |
| `is_carry_over` | `bool` (default false) | Display badge (priority from previous auction) |
| `status` | `text` enum | `assigned` / `cant_pay` |
| `removed_at` | `timestamptz` (nullable) | |

Unique constraints: `(auction_id, member_id)` and `(auction_id, position)`.

---

### Table: `auction_allocations`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` (PK) | |
| `auction_id` | `uuid` (FK) | |
| `member_id` | `uuid` (FK) | |
| `item_id` | `uuid` (FK) | |
| `quantity` | `int` | |
| `page_assignments` | `jsonb` | `[{ "page": 18, "slots": [3,4] }, ...]` |
| `fulfilled` | `bool` (default true) | False if cant-pay → rolls over |

---

## 5. Queue Generation (Auto)

The queue for any auction is derived from the **locked rotation list** for the current round.

### Core rules:

1. Walk the rotation list in `position` order (1, 2, 3, ...).
2. Skip members who are `is_complete=true` AND have already hit their cap on ALL items in this auction's inventory (including bonus items).
   - In other words: if a member is `is_complete` but the auction has bonus items they haven't capped on, INCLUDE them in the queue.
3. **Carry-over priority** (cant-pay or unfilled members from previous auction): they keep their original rotation position, but among members at adjacent positions, carry-overs come FIRST. Carry-overs don't jump above someone they were originally behind.

### For GL/WoE auction:
```
STEP 1 — Fetch rotation_list for current round, ordered by position.
STEP 2 — For each member, check eligibility:
         - Has need > 0 for ANY item in this auction's inventory?
           (need = cap - received, where cap respects per-member overrides)
         - If yes: include in queue.
         - If no: skip.
STEP 3 — Apply carry-over priority (keep rotation order, but mark carry-overs).
STEP 4 — Insert into auction_queue with sequential positions 1..N.
```

### For League Prize auction (starts after GL/WoE is `done`):
```
Same as GL/WoE. The eligibility check naturally includes:
- Members not yet complete on gating items (Puppet, L&D, T&S)
- Members who ARE complete on gating items but still need Fragment (bonus item)
```

> **Example:** Alice has `is_complete=true` (1/1 Puppet, 5/5 L&D, 5/5 T&S) and has 0/3 Fragment. League Prize starts with 30 Fragments in inventory. Alice IS in the queue because she has `need = 3` for Fragment. She'll get up to 3 Fragments. After the auction, she's still `is_complete=true` (gating items unchanged), but her Fragment count is now 3/3.

### Carry-over priority — examples

(Same as before — completed members are filtered out, so carry-overs naturally rise to the top of the visible queue.)

**Rotation list (locked):** Alice(1), Bob(2), Carol(3), Dave(4), Erin(5)

**Scenario A — no carry-overs:**
- Queue order: Alice, Bob, Carol, Dave, Erin

**Scenario B — Alice is complete (gating done) but still needs Fragment:**
- League Prize with 30 Fragments → Alice IS eligible (needs Fragment)
- Queue order: Alice, Bob, Carol, Dave, Erin
- Alice gets her 3 Fragments first, then Bob, etc.

**Scenario C — Alice fully done (gating + bonus all capped):**
- No items left she's eligible for → filtered out
- Queue order: Bob, Carol, Dave, Erin

---

## 6. The Page Math

**Game rule:** Each page = 4 slots. Items fill pages in `sort_order`.

**GL/WoE example:** 20 Puppet + 50 L&D + 50 T&S → 30 pages
- Pages 1–5: Puppet
- Pages 6–17: L&D (page 18 mixed with T&S)
- Pages 18–30: T&S

**League Prize example:** 10 Puppet + 30 Fragment + 30 L&D + 30 T&S → 25 pages
- Pages 1–2 + slots 1-2 of page 3: 10 Puppet
- Pages 3 slots 3-4 onwards: 30 Fragment
- Then L&D, then T&S (with mixed boundary pages)

Each auction has its own page numbering (separate in-game windows).

---

## 7. Allocation Algorithm

Triggered when admin clicks **"Start Auction"** (or "Start League Prize Auction"). Runs server-side in a transaction.

```
INPUT:
  - queue: ordered eligible members
  - inventory: item → quantity
  - caps: for each (member, item), compute:
      cap = member_cap_overrides[member][item] OR item.default_per_round_cap
  - round_progress: each member's current received counts

STEP 1 — Greedy fill per item type (in sort_order):
  For each item in sort_order:
    remaining = inventory[item]
    For each member in queue order:
      if remaining <= 0: break
      member_cap = caps[member][item]
      received_so_far = round_progress[member].received[item] or 0
      need = member_cap - received_so_far
      if need <= 0: continue   ← member already maxed out in this round
      give = min(remaining, need)
      assign(member, item, give)
      remaining -= give

STEP 2 — Compute page numbers + slot ranges:
  Flatten all assignments in sort_order. Walk page-by-page, slot-by-slot.
  Group consecutive slots per (member, item) into page_assignments JSON.

STEP 3 — Mark unfilled:
  For each (member, item) where need > 0 but inventory ran out,
  flag for carry-over priority next auction.
```

### Walkthrough: Sequential GL/WoE → League Prize

**Setup:** Round 1, 50 guild members, all at 0 progress.
- **GL/WoE inventory:** 20 Puppet, 50 L&D, 50 T&S

**Auction 1 — GL/WoE:**
- Puppet: first 20 members get 1 each (20 exhausted)
- L&D: first 10 get 5 each (50 exhausted)
- T&S: first 10 get 5 each (50 exhausted)
- **Result:** Members 1–10 fully completed (1/1, 5/5, 5/5); members 11–20 have Puppet only; members 21–50 got nothing.

**Admin marks GL/WoE as `done`.** Round progress updates:
- Members 1–10 → `is_complete=true`
- Members 11–20 → still need L&D + T&S
- Members 21–50 → still need everything

**Admin starts League Prize auction (because the game gave one out).**
- **League Prize inventory:** 10 Puppet, 30 Fragment, 30 L&D, 30 T&S

Queue auto-built from incomplete members (11–50, ordered by rotation_position).

Allocation:
- Puppet: 10 available, cap=1. Members 11–20 already at 1/1 (skipped automatically). Members 21–30 get 1 each. Members 31–50 still need Puppet → flagged carry-over.
- Fragment: 30 available, cap=3, so 10 members get 3 each. Queue starts at member 11, so members 11–20 get full Fragment.
- L&D: 30 available, cap=5, so 6 members get 5 each. Members 11–16 get full L&D. Members 17–20 still need L&D → carry-over.
- T&S: same — members 11–16 get full T&S; 17–20 still need T&S → carry-over.

**Admin marks League Prize as `done`.** Round progress after both auctions:
- Members 1–10: complete ✓ (gating: 1/1 Puppet, 5/5 L&D, 5/5 T&S — Fragment status doesn't matter)
- Members 11–16: complete ✓ (gating: 1/1 Puppet, 5/5 L&D, 5/5 T&S; bonus: 3/3 Fragment)
- Members 17–20: 1/1 Puppet, 3/3 Fragment, 0/5 L&D, 0/5 T&S → NOT complete (need L&D + T&S)
- Members 21–30: 1/1 Puppet, 0/3 Fragment, 0/5 L&D, 0/5 T&S → NOT complete
- Members 31–50: 0/1 Puppet, 0/3 Fragment, 0/5 L&D, 0/5 T&S → NOT complete

Round is not complete (members 17–50 still need gating items). Fragment status is irrelevant to round completion. Carries forward to next GL/WoE event.

---

## 8. Live Auction Flow

States: **active** / **done**. No drafts, no pauses.

### Starting an auction (GL/WoE or League Prize)
1. Admin clicks "+ New Auction" → picks type (GL/WoE or League Prize)
2. Inventory editor shows item types valid for that auction type
3. Admin sets quantities → clicks "Start Auction"
4. Queue + allocations auto-compute
5. Live auction view opens

### Live auction view

**Header:** Auction type badge (GL/WoE or League Prize), inventory summary, total pages

**Toggle: Member View ⇄ Page View** (same as v2)

**Member View** — table with member, items, pages, [Can't Pay] button per row.
**Page View** — grouped by page with slot detail, copy-to-Discord button.

### Can't Pay action (live)
Same as before: removes that one member, recomputes allocation from that position down, next-in-line slots up.

### Future improvement: Bought out / not received action
If an in-game item assigned to a listed member is bought out by someone else, admin should be able to mark that specific allocation as **Bought out / not received**. This must be tracked per item and per allocation slot, not only per member, because a member can receive some assigned items while missing another item in the same auction.

Expected behavior:
- The affected allocation is treated as unfulfilled and does not advance that member's held total or current item cycle.
- The member remains owed that exact item cycle for that item type.
- A later correction auction prioritizes the owed member according to normal rotation/carry-over rules.
- Other items assigned to the same member remain fulfilled if they were actually received.
- Auction history preserves the original assignment plus the not-received reason for auditability.

### Running auctions sequentially
- Only ONE auction can be `active` at a time (enforced at the application layer).
- Admin must mark GL/WoE `done` before starting League Prize.
- The dashboard shows the active auction prominently; finished auctions in the current round are listed below.

### Done action
- Marks `status='done'`.
- Updates `member_round_progress` (adds received counts).
- Checks for `is_complete` per member (across all item types).
- **Round-end check:** If no other auction is `active` AND all members are `is_complete` → finalize round, start new round with shuffled `rotation_list`.
- **Leftover inventory:** If the auction ended with unallocated items (everyone was capped before inventory ran out), those items simply remain unallocated. The dashboard shows a summary toast like "Auction done. 12 L&D and 8 T&S left undistributed (no eligible members)." Admin handles those items outside the dashboard.

---

## 9. Admin UI — New Sections

### 9.1 Auction Section (main dashboard)

```
┌────────────────────────────────────────────────────────────┐
│ AUCTIONS                                                   │
│                                                            │
│  Round 3 — started May 10                                  │
│  Progress: 18/50 members complete                          │
│  [View Rotation List]  [Start New Round]  [Adjust Limits]  │
│                                                            │
│  ACTIVE AUCTION:                                           │
│  ┌─────────────────────────────────────────┐               │
│  │ GL/WoE  ●ACTIVE                         │               │
│  │ Pages: 30                               │               │
│  │ Queue: 38 members                       │               │
│  │ [Open Auction]                          │               │
│  └─────────────────────────────────────────┘               │
│                                                            │
│  ROUND 3 HISTORY:                                          │
│  • GL/WoE (May 12) — done — 10 members completed           │
│  • League Prize (May 12) — done — 6 members completed      │
│                                                            │
│  [+ New GL/WoE Auction]  [+ New League Prize Auction]      │
│                                                            │
│  Note: Only one auction can be active at a time.           │
└────────────────────────────────────────────────────────────┘
```

> "+ New League Prize Auction" is only enabled if:
> 1. There's no currently `active` auction
> 2. There are members in the current round who are not yet `is_complete`
>
> "+ New GL/WoE Auction" is only enabled if no auction is currently `active`.

### 9.2 Rotation List view (NEW)

Triggered by the "[View Rotation List]" button. Read-only view of the locked rotation for the current round.

```
┌─────────────────────────────────────────────────────────┐
│ ROUND 3 — ROTATION LIST                          [Close]│
│                                                         │
│ Locked at: May 10, 14:30                                │
│ Members: 50                                             │
│                                                         │
│ #   Member            Class       Round Progress        │
│ ─────────────────────────────────────────────────────── │
│  1  Alice    [icon]   Lord K.     1/1, 5/5, 5/5  ✓     │
│  2  Bob      [icon]   Paladin     1/1, 5/5, 5/5  ✓     │
│  3  Carol    [icon]   Sniper      1/1, 0/5, 0/5  🔄    │
│  4  Dave     [icon]   High Wiz.   1/1, 5/5, 3/5        │
│  ...                                                    │
│ 50  Zack     [icon]   Stalker     0/1, 0/5, 0/5        │
│ ─────────────────────────────────────────────────────── │
│ 51  *Yara*   [icon]   Paladin     0/1, 0/5, 0/5 (new)  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

- ✓ = `is_complete` for the round
- 🔄 = was a carry-over in the most recent auction
- **(new)** = joined mid-round, appended to the list
- This view is read-only — the list cannot be reordered. It is the source of truth.

### 9.3 Adjust Limits modal (NEW)

Triggered by "[Adjust Limits]" button. Two tabs:

**Tab 1: Global caps** (applies to all members for current round)
```
Item              Default   Current Round Cap
─────────────────────────────────────────────
Puppet Card       1         [  1  ]
Puppet Fragment   3         [  3  ]
Feather of L&D    5         [  5  ]
Feather of T&S    5         [  5  ]
```
Each cap has an inline input. Editing it updates `auction_items.default_per_round_cap` for next round, OR overrides the active round (admin's choice via a toggle: "Apply to current round" vs "Save as new default").

**Tab 2: Per-member overrides** (current round only)
```
Member          Puppet  Fragment  L&D    T&S    [Reset to default]
──────────────────────────────────────────────────────────────────
Alice (VIP)     [ 2 ]   [ 3 ]    [ 5 ]  [ 5 ]
Bob             [ 1 ]   [ 3 ]    [ 5 ]  [ 5 ]
Carol           [ 1 ]   [ 3 ]    [ 5 ]  [ 5 ]
...
```
Edits write to `member_cap_overrides` for the current round. Auto-clears when round ends.

### 9.4 Manage Items modal (NEW)

Triggered from the Adjust Limits modal or a separate "Manage Item Types" button. Lets admin add/remove/reorder item types:

```
Item              Sort   Default Cap   Auctions          Actions
───────────────────────────────────────────────────────────────────
Puppet Card       1      1             GL/WoE, League    [Edit] [↑↓]
Puppet Fragment   2      3             League Prize      [Edit] [↑↓]
Feather of L&D    3      5             GL/WoE, League    [Edit] [↑↓]
Feather of T&S    4      5             GL/WoE, League    [Edit] [↑↓]

[+ Add Item Type]
```

Add form: name, sort_order (auto-suggested as last+1), default_cap, applies_to_auction_types (checkboxes).

> Warning shown when reordering or removing items while an auction is active: changes apply to NEXT auction.

---

## 10. Member Profile Integration

Each member card on the main dashboard shows current-round progress (now with Fragment):

```
┌──────────────────────────────────┐
│ [class icon]   Alice             │
│                Lord Knight       │
│                Alpha 1           │
│                                  │
│  Round 3 progress:               │
│  Puppet:   1/1 ✓                 │
│  Fragment: 2/3                   │
│  L&D:      5/5 ✓                 │
│  T&S:      3/5                   │
│                                  │
│         [Edit] [Delete]          │
└──────────────────────────────────┘
```

> Reads from `member_round_progress.received` and current caps (with per-member override if any).

---

## 11. Edge Cases

### Handled in v1
- ✅ Locked rotation list per round — randomized at start, immutable except for adds/removes
- ✅ Leftover inventory after everyone caps out → stays unallocated
- ✅ Mid-round member joins → appended to end of rotation list
- ✅ Mid-round member leaves → removed from rotation list
- ✅ Caps shared across GL/WoE and League Prize (single round progress)
- ✅ **Gating vs. bonus items:** items can be marked `gates_round_completion=false` (e.g. Fragment) — tracked but don't block round end
- ✅ Members who are `is_complete` on gating items can still receive bonus items if eligible
- ✅ League Prize queue auto-built from incomplete members + members who still need bonus items
- ✅ Auctions are sequential — only one active at a time
- ✅ GL/WoE must be `done` before League Prize can start
- ✅ Per-member cap overrides (round-scoped, auto-reset)
- ✅ Per-round global cap overrides
- ✅ New item types can be added via UI (with `gates_round_completion` toggle)
- ✅ Carry-over priority — carry-overs keep their rotation position
- ✅ Round end fires when all members `is_complete` (gating items only, ignoring bonus)
- ✅ Admin can view the rotation list as read-only

### Not in v1
- ❌ Auction history view (game has this already)
- ❌ Class restrictions on rewards
- ❌ Coin/zeny tracking
- ❌ Manual queue editing or rotation reordering
- ❌ Parallel auctions (must be sequential)
- ❌ Per-member overrides persisting across rounds
- ❌ Leftover items auto-distribution (cap is a hard ceiling)

### Edge cases worth deciding
- **What if admin marks GL/WoE done with no allocations (empty inventory)?** Allowed — just doesn't update any progress. League Prize can still start as normal.
- **What if admin opens League Prize but the game didn't give one out?** Admin just doesn't click the button. No League Prize gets created.
- **What if all members complete after GL/WoE and no League Prize is needed?** Round ends automatically when GL/WoE is marked `done`.

---

## 12. Implementation Notes

- **Rotation list creation:** When a new round starts, run `INSERT INTO rotation_list (round_id, member_id, position) SELECT new_round.id, id, row_number() OVER (ORDER BY random()) FROM members` in a single transaction.
- **Mid-round member changes:**
  - **Add:** `INSERT INTO rotation_list (round_id, member_id, position) VALUES (current_round, new_member_id, (SELECT MAX(position)+1 FROM rotation_list WHERE round_id=current_round))`
  - **Remove:** `DELETE FROM rotation_list WHERE round_id=current_round AND member_id=leaving_member_id`. Don't backfill positions — gaps are fine.
- **Sequential auction enforcement:** Server-side check on "Start Auction" — reject if any auction in the current round has `status='active'`.
- **Cap resolution function** (server-side):
  ```sql
  function get_member_cap(member_id, item_id, round_id) returns int:
    SELECT cap FROM member_cap_overrides
    WHERE round_id = ? AND member_id = ? AND item_id = ?
    -- if not found, fall back to:
    SELECT default_per_round_cap FROM auction_items WHERE id = ?
  ```
- **Allocation algorithm** reads `rotation_list` joined with `member_round_progress`, filters incomplete members, walks in position order, applies caps. Runs in a Supabase RPC or Next.js Server Action with row-level locking on `auction_queue` + `auction_allocations` to prevent concurrent modifications during the cant-pay recompute.
- **Round-end detection** runs after every "Done" action:
  - Are there any other `active` auctions for this `round_id`? Shouldn't happen (sequential), but check anyway.
  - Are all `member_round_progress.is_complete = true`? → end round, create new round with fresh `rotation_list`, orphan `member_cap_overrides`.
- **`is_complete` calculation:** For each member, iterate all `auction_items` where `gates_round_completion=true`. Check if `received[item] >= effective_cap(member, item)`. If true for all gating items, set `is_complete=true`. Bonus items (Fragment) do NOT affect this flag.
- **Adding new item types mid-round:** Item appears in next auction. Existing `received` jsonb won't have the key → treated as 0.
- **Leftover inventory reporting:** After "Done", compute `sum(quantity in auction_inventory) - sum(quantity in auction_allocations)` per item. Display in summary toast.
