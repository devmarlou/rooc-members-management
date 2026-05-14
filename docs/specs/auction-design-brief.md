# Auction Section — Design & Logic Brief

> Single-file brief for designing the Auction section of the Guild Admin Dashboard. Paste this into Claude Design (or any AI design tool) to generate the UI.

---

## Context

Internal admin dashboard for a Ragnarok Origin Classic guild (~50 members, 5 admins). This brief covers ONLY the **Auction section** — a system that automates reward distribution after guild events.

**Theme:** dark game-admin UI with amber accents. Mood: Diablo loot UI meets a modern trading dashboard.

---

## Auction Logic (what the UI must support)

### Core concepts

**Round** = a complete cycle where every member gets their full per-round cap of every **gating item** (e.g. 1 Puppet + 5 L&D + 5 T&S). A round contains MULTIPLE auctions.

**Auction** = one event (one GL/WoE drop, or one optional League Prize). Sequential — only ONE auction can be active at a time.

**Rotation List** = a randomized list of all members, locked at the start of every round. Position 1, 2, 3...N. This is the source of truth for queue order. Mid-round: new members appended to end; departing members removed.

**Round Progress** = each member's running totals per item type for the current round (e.g. Alice: 1/1 Puppet, 5/5 L&D, 2/5 T&S, 1/3 Fragment).

**Cap** = max items a member can receive per round per item type. Defaults from item catalog. Admin can override globally (this round) or per-member (this round only). Caps reset at round end.

**Gating vs. Bonus items:**
- **Gating items** (Puppet Card, L&D Feather, T&S Feather): a member must hit cap on ALL of these to be `is_complete` for the round. The round only ends when every member is complete on gating items.
- **Bonus items** (Puppet Fragment): tracked and distributed, but do NOT block round completion. A member can be "complete" while still missing Fragment.
- The `gates_round_completion` flag (boolean on each item type) controls this. Admin can mark any item as bonus when creating it.

### Auction types

| Type | Items | When |
|---|---|---|
| **GL/WoE** | Puppet Card → L&D Feather → T&S Feather | Every guild event |
| **League Prize** | Puppet Card → Puppet Fragment (bonus) → L&D Feather → T&S Feather | OPTIONAL — only if game gives one |

- Puppet Fragment is unique to League Prize and is a **bonus item** (doesn't gate round completion)
- Gating items (Puppet, L&D, T&S) caps are SHARED across both auction types (if Alice gets her 1 Puppet in GL/WoE, she can't bid Puppet in League Prize)
- League Prize starts ONLY after GL/WoE is marked Done
- Members who are `is_complete` on gating items can still bid on bonus items they haven't capped on

### Page math (game UI constraint)

Each in-game page = 4 item slots. Items fill pages in order (Puppet first, then Fragment, then Feathers).

Example: 20 Puppet + 50 L&D + 50 T&S = 30 pages
- Pages 1-5: Puppet (4 each)
- Pages 6-17: L&D
- Page 18: MIXED (2 L&D + 2 T&S at boundary)
- Pages 19-30: T&S

### Allocation algorithm (auto-runs on "Start Auction")

```
Queue = rotation_list filtered to incomplete members (in position order)

For each item type (Puppet → Fragment → L&D → T&S):
  remaining = inventory[item]
  For each member in queue order:
    need = member_cap[item] - received[item]
    if need <= 0: skip (already capped on this item)
    give = min(remaining, need)
    assign(member, item, give)
    remaining -= give
    if remaining == 0: break

Compute page numbers + slot ranges for each allocation
Members who didn't get their full need → flagged as carry-over priority for next auction
```

### Round lifecycle

- **Start:** Random shuffle of all members → locked rotation list
- **During:** Multiple auctions execute. After each "Done", round progress updates. Members hitting all **gating item** caps → `is_complete=true` (skipped from future GATING-item allocations, but still eligible for bonus items).
- **End (auto):** When ALL members are `is_complete` (gating items only) → round auto-ends, fresh rotation generated, all progress resets (including bonus item counts), new round number.
- **End (manual):** Admin can click "Start New Round" to force-end (e.g. if some members went inactive).

### Live auction interactions

- Admin only acts manually on TWO things:
  1. **Can't Pay** (single click on a member who can't pay in-game) → that member is removed from this auction, allocation recomputes from their position, next eligible member slots up
  2. **Done** (single click when auction is finished in-game) → progress updates automatically based on allocations
- Payment is assumed by default — no per-member "paid" checkboxes
- Leftover inventory (if everyone caps out) stays unallocated — admin handles outside dashboard

---

## Visual Design

### Colors (Tailwind)

| Role | Token | Hex |
|---|---|---|
| Page bg | `zinc-950` | `#09090b` |
| Card surface | `zinc-900` | `#18181b` |
| Elevated | `zinc-800` | `#27272a` |
| Border | `zinc-800` / `zinc-700` | |
| **Primary accent** | `amber-500` | `#f59e0b` |
| Primary hover | `amber-400` | `#fbbf24` |
| Text | `zinc-50` | `#fafafa` |
| Muted text | `zinc-400` | `#a1a1aa` |
| Danger / Cant-pay | `red-500` | `#ef4444` |
| Success / Complete | `emerald-500` | `#10b981` |
| Carry-over badge | `blue-400` | `#60a5fa` |
| Active pulse | `amber-500` | `#f59e0b` |

### Typography

- **Section header:** `Cinzel` (serif, game-flavored), `text-2xl font-bold`, amber tint
- **Card titles:** `Inter`, `text-lg font-medium`, white
- **Body:** `Inter`, `text-sm`
- **Stat labels:** `text-xs uppercase tracking-wider text-zinc-400`
- **Numbers/counters:** `tabular-nums` for column alignment

### Component style

- **Cards:** `bg-zinc-900 border border-zinc-800 rounded-lg`
- **Active state cards:** add `border-amber-500/40 shadow-amber-500/10` glow
- **Primary buttons:** `bg-amber-500 hover:bg-amber-400 text-zinc-950 font-medium`
- **Ghost buttons:** `border border-zinc-700 hover:bg-zinc-800 text-zinc-200`
- **Destructive buttons:** `bg-red-500/10 hover:bg-red-500/20 text-red-400 border-red-500/30`
- **Badges:** rounded full pills, subtle tinted bg (`bg-amber-500/10 text-amber-400 border border-amber-500/20`)
- **Tables:** zebra striping, hover row highlight
- **Modals:** backdrop blur, centered card, ESC closes

### Iconography

- Use **lucide-react** icons throughout (Plus, X, Check, ChevronDown, Eye, Settings, etc.)
- **Class icons:** colorful rounded-rhombus PNGs at `/public/icons/{class-name}.png` — already designed
- **Active auction indicator:** small pulsing amber dot (1.5s ease)

---

## Layout & Sections

The auction feature lives in ONE section on the main dashboard SPA. Structure:

```
┌────────────────────────────────────────────────────────────────┐
│ AUCTIONS                                                      │
│                                                               │
│ 1. Round Header                                               │
│ 2. Active Auction Card (if any)                               │
│ 3. Round History                                              │
│ 4. New Auction Buttons                                        │
└────────────────────────────────────────────────────────────────┘
```

### 1. Round Header

```
┌──────────────────────────────────────────────────────────────┐
│ Round 3 — started May 10                                     │
│ ▓▓▓▓▓▓▓▓░░░░░░░░░░░  18/50 members complete                  │
│                                                              │
│ [👁 View Rotation List]  [⚙ Adjust Limits]  [🔄 New Round]   │
└──────────────────────────────────────────────────────────────┘
```

- Round number + start date in large text
- Slim horizontal progress bar (amber fill on dark track), animated transition
- "X/Y members complete" counter
- Three action buttons (icons + labels): View Rotation List, Adjust Limits, Start New Round

### 2. Active Auction Card (if one is active)

```
┌──────────────────────────────────────────────────────────┐
│ ● ACTIVE        GL/WoE Auction               │
│                                                          │
│ Started: May 13, 20:15                                   │
│ Pages: 30  •  Queue: 38 members  •  Inventory: 120 items │
│                                                          │
│                                       [Open Auction →]   │
└──────────────────────────────────────────────────────────┘
```

- Subtle amber border glow + pulsing dot
- Auction type badge (GL/WoE or League Prize) in upper-right
- Primary CTA button on right side: "Open Auction"

### 3. Round History

Below the active auction:

```
ROUND 3 HISTORY

  ✓ GL/WoE — May 12, 20:15 — 10 members completed     [details ▾]
  ✓ League Prize — May 12, 22:00 — 6 members completed [details ▾]
  ✓ GL/WoE — May 11, 19:00 — 2 members completed       [details ▾]
```

- Each row collapsible — expand to show item summary + member names
- Status icon (green check) at start
- Muted timestamp, white member count

### 4. New Auction Buttons

```
[+ New GL/WoE Auction]    [+ New League Prize Auction]
```

- Primary style for GL/WoE
- Secondary/ghost for League Prize
- League Prize is **disabled** if: (a) any auction is active, OR (b) no incomplete members remain
- Show tooltip on hover when disabled explaining why

---

## Modals & Dialogs

### A. New Auction Modal (Start Auction flow)

```
┌──────────────────────────────────────────┐
│ New GL/WoE Auction                  [×] │
│                                          │
│ Auction Name (optional)                  │
│ [ WoE — May 14___________________ ]      │
│                                          │
│ ── Inventory ──                          │
│ Puppet Card      [  20  ]                │
│ Feather of L&D   [  50  ]                │
│ Feather of T&S   [  50  ]                │
│                                          │
│ ── Preview ──                            │
│ Total pages: 30                          │
│ Eligible queue: 38 members               │
│ Estimated full hauls: 10                 │
│                                          │
│               [Cancel]  [Start Auction] │
└──────────────────────────────────────────┘
```

- Items shown match auction type (League Prize includes Fragment row)
- Live calculations as quantities change
- "Start Auction" disabled if all quantities are 0

### B. Active Auction View (full-screen takeover)

This is the live working view during an auction.

#### Header bar
```
┌────────────────────────────────────────────────────────────┐
│ ● GL/WoE Auction — Round 3              [← Close]  [Done] │
│ Started 20:15  •  Pages: 30  •  Queue: 38                 │
│                                                            │
│  [Member View | Page View]            [📋 Copy for Discord]│
└────────────────────────────────────────────────────────────┘
```

- "Done" button is large primary amber on right
- Toggle between Member View and Page View
- "Copy for Discord" outputs plain text version

#### Member View (default)

Big table:
```
┌───┬───────────────┬───────────────────────┬───────────────────────┬─────┐
│ # │ Member        │ Items                 │ Pages                 │     │
├───┼───────────────┼───────────────────────┼───────────────────────┼─────┤
│ 1 │ [🛡] Alice 🔄 │ 1 Puppet, 5 L&D, 5 T&S│ P1 s1, P6 s1-4,       │ [✗] │
│   │     Lord K.   │                       │ P7 s1, P18 s3-4,      │     │
│   │               │                       │ P19 s1-3              │     │
├───┼───────────────┼───────────────────────┼───────────────────────┼─────┤
│ 2 │ [🛡] Bob      │ 1 Puppet, 5 L&D, 5 T&S│ P1 s2, P7 s2-4,       │ [✗] │
│   │     Paladin   │                       │ P8 s1, P19 s4-5...    │     │
├───┼───────────────┼───────────────────────┼───────────────────────┼─────┤
│...│               │                       │                       │     │
├───┼───────────────┼───────────────────────┼───────────────────────┼─────┤
│11 │ [🏹] Kelly    │ — (no items)          │ —                     │ [—] │
│   │     Sniper    │ inventory exhausted   │                       │     │
└───┴───────────────┴───────────────────────┴───────────────────────┴─────┘
```

- Class icon (24px) at start of each row, hover shows class name
- `🔄` badge next to name = carry-over from previous auction (blue tint)
- Pages column shows compact page-slot notation (e.g. `P18 s3-4` = page 18 slots 3-4)
- **Bonus items** (like Fragment) shown with a subtle "(bonus)" tag in the items column, e.g. `1 Puppet, 3 Fragment (bonus), 5 L&D, 5 T&S`
- `[✗]` button = Can't Pay (red ghost) — confirmation tooltip on hover
- `[—]` = disabled (no allocation, inventory exhausted) — gray
- Row hover: amber tint on background

**Special row state — "bonus only" member:** If a member is `is_complete` on gating items but still eligible for bonus items, their row shows a small ✓ next to their name and the items column reads "Bonus only: 3 Fragment".

**Can't Pay interaction:**
1. Click `[✗]` → small inline confirmation: "Mark Kelly as can't pay? Items will be reassigned." with [Confirm] [Cancel]
2. On confirm → row fades out, items shift to next eligible member, table re-renders with new allocations
3. Kelly is flagged for carry-over priority in next auction
4. Brief toast: "Kelly removed. Items reassigned to Lily."

#### Page View (toggle)

Grouped by page, scrollable:
```
── Page 1 — Puppet (4 slots) ─────────────────────────────────
   Slot 1:  [🛡] Alice
   Slot 2:  [🛡] Bob
   Slot 3:  [🏹] Carol
   Slot 4:  [📕] Dave

── Page 6 — L&D Feather (4 slots) ────────────────────────────
   Slots 1-4:  [🛡] Alice  (4 of her 5 L&D)

── Page 7 — L&D Feather (4 slots) ────────────────────────────
   Slot 1:  [🛡] Alice  (final L&D)
   Slots 2-4:  [🛡] Bob

── Page 18 — MIXED: 2 L&D + 2 T&S ────────────────────────────
   Slots 1-2:  [⚔] Jack  (final L&D)
   Slots 3-4:  [🛡] Alice  (first T&S)

... (scroll for more pages)
```

- Page headers have item-type label + slot count
- Mixed pages highlighted with subtle amber accent
- Each member entry shows their class icon
- Compact, dense layout — designed to read fast and copy easily

**Copy for Discord** button outputs:
```
P1: Alice, Bob, Carol, Dave (Puppet)
P2: Erin, Frank, Grace, Henry (Puppet)
...
P18 [MIXED]: Jack (L&D s1-2), Alice (T&S s3-4)
...
```

#### Footer
Sticky bottom bar with `[ Done ]` button (large primary). Confirmation modal: "Mark this auction as done? This will update round progress and cannot be undone."

### C. Adjust Limits Modal

Two tabs.

**Tab 1: Global Caps (per round)**
```
┌──────────────────────────────────────────────────────────┐
│ Adjust Limits                                       [×]  │
│                                                          │
│ [Global Caps] [Per-Member Overrides]                     │
│                                                          │
│ Item            Default   This Round    Gates Round?     │
│ ──────────────────────────────────────────────────────── │
│ Puppet Card     1         [ 1 ]         ✓ Yes            │
│ Puppet Fragment 3         [ 3 ]         ✗ No (bonus)     │
│ L&D Feather     5         [ 5 ]         ✓ Yes            │
│ T&S Feather     5         [ 5 ]         ✓ Yes            │
│                                                          │
│ ○ Apply to current round only                            │
│ ● Save as new default                                    │
│                                                          │
│                          [Cancel]  [Save Changes]        │
└──────────────────────────────────────────────────────────┘
```

- "Gates Round?" column is read-only here — informational. Bonus items shown in muted/italic text
- To toggle gating, admin uses the **Manage Item Types** modal (separate)

**Tab 2: Per-Member Overrides (current round only)**
```
┌──────────────────────────────────────────────────────┐
│ [Global Caps] [Per-Member Overrides]                 │
│                                                      │
│ [🔍 Search member...]                                │
│                                                      │
│ Member          Puppet  Fragment  L&D    T&S   Reset│
│ ─────────────────────────────────────────────────── │
│ [🛡] Alice (VIP) [ 2 ]  [ 3 ]    [ 5 ]  [ 5 ] [×]   │
│ [🛡] Bob        [ 1 ]  [ 3 ]    [ 5 ]  [ 5 ] [×]   │
│ [🏹] Carol      [ 1 ]  [ 3 ]    [ 5 ]  [ 5 ] [×]   │
│ ...                                                  │
│                                                      │
│ Note: overrides reset when round ends                │
│                                                      │
│                          [Cancel]  [Save Changes]    │
└──────────────────────────────────────────────────────┘
```

- Inline number inputs (with `tabular-nums`)
- `[×]` reset clears that row back to default
- Highlight rows with non-default values in amber

### D. Rotation List View

```
┌──────────────────────────────────────────────────────────┐
│ Round 3 — Rotation List                            [×]   │
│ Locked May 10, 14:30  •  50 members                     │
│                                                          │
│ #   Member       Class      Gating          Bonus       │
│ ──────────────────────────────────────────────────────── │
│ 1   [🛡] Alice   Lord K.    1/1 5/5 5/5 ✓   2/3 Frag    │
│ 2   [🛡] Bob     Paladin    1/1 5/5 5/5 ✓   3/3 Frag ✓  │
│ 3   [🏹] Carol   Sniper     1/1 0/5 0/5 🔄  0/3 Frag    │
│ 4   [📕] Dave    High Wiz   1/1 5/5 3/5     0/3 Frag    │
│ ...                                                      │
│ 50  [⚔] Zack    Stalker    0/1 0/5 0/5     0/3 Frag    │
│ ──────────────────────────────────────────────────────── │
│ 51  [🛡] Yara    Paladin    0/1 0/5 0/5  (new)          │
│                                                          │
│                                            [Close]       │
└──────────────────────────────────────────────────────────┘
```

- Read-only — no editing
- **Two progress columns:** "Gating" (Puppet/L&D/T&S) and "Bonus" (Fragment)
- ✓ next to gating = `is_complete` for round (green tint)
- ✓ next to bonus = bonus item capped (subtle indicator, no special meaning for round end)
- 🔄 = carry-over from last auction (blue tint)
- (new) = joined mid-round
- Progress compactly shown: `Puppet/Cap L&D/Cap T&S/Cap`
- Scrollable, search/filter at top optional

### E. Start New Round confirmation

When admin clicks "🔄 New Round":
```
┌──────────────────────────────────────────────┐
│ Start New Round?                             │
│                                              │
│ Round 3 progress: 18/50 complete             │
│ This will:                                   │
│  • Reset all member progress to 0            │
│  • Generate a new randomized rotation        │
│  • Clear per-member cap overrides            │
│                                              │
│ This cannot be undone.                       │
│                                              │
│           [Cancel]    [Start New Round]      │
└──────────────────────────────────────────────┘
```

Destructive style (red accent on the confirm button).

---

## Microinteractions & Animations

- **Active auction pulsing dot:** 1.5s ease infinite, opacity 1.0 ↔ 0.5
- **Progress bar:** 300ms ease-out width transition
- **Card hover:** subtle amber border glow + 2px lift (shadow)
- **Button hover:** brightness shift (amber-500 → amber-400)
- **Can't Pay action:** row fades out (250ms), remaining rows slide up
- **Page View toggle:** crossfade between member view and page view (200ms)
- **Toast notifications:** slide in from bottom-right, auto-dismiss 4s
- **Round complete:** confetti toast — "🎉 Round 3 complete! Starting Round 4..."

---

## Responsive

- **Desktop (≥1024px):** Full layout, side-by-side modals
- **Tablet (768-1023px):** Stack modal content vertically, compact table columns
- **Mobile (<768px):** Tables become stacked cards (each row = one card), modals become full-screen sheets, button labels shrink to icons

---

## Empty States

- **No active auction:** "No auction running. Start one when your guild event is ready." + prominent "New GL/WoE Auction" button
- **No round started:** "Round 1 will start automatically when you add your first member" (assuming members exist; otherwise prompt to add members)
- **Round history empty:** "Auctions you complete this round will appear here."

---

## What to Generate

Generate the **Auction section** as:
1. A React component tree (Next.js App Router compatible)
2. Use shadcn/ui components throughout
3. Tailwind styling with the color palette above
4. Mock data: 1 active round (Round 3), ~50 members with varied progress, 1 active GL/WoE auction with ~38 members in queue, 2-3 finished auctions in history
5. All modals/dialogs interactive (open, close, tab switching, hover states)
6. Local state — no API integration needed

**Component breakdown to generate:**
- `<AuctionSection />` — top-level wrapper
- `<RoundHeader />` — round info, progress bar, action buttons
- `<ActiveAuctionCard />` — the prominent active auction display
- `<RoundHistory />` — collapsible list
- `<NewAuctionDialog />` — Start Auction modal
- `<ActiveAuctionView />` — full-screen auction working view
- `<MemberViewTable />` — table inside Active Auction
- `<PageView />` — page-grouped view inside Active Auction
- `<AdjustLimitsDialog />` — caps + overrides modal
- `<RotationListDialog />` — read-only rotation view
- `<StartNewRoundConfirmation />` — destructive confirmation

Class icons live at `/public/icons/{class-name}.png`. Filenames:
`lord-knight`, `paladin`, `high-wizard`, `professor`, `high-priest`, `champion`, `sniper`, `bard-dancer`, `gypsy`, `stalker`, `assassin-cross`, `whitesmith`, `biochemist`, `doram`.

---

## End of brief
