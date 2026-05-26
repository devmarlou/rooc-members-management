import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const HELD_TOTALS_KEY = "__held_totals";
const AUCTION_JOIN_COOLDOWN_MS = 96 * 60 * 60 * 1000;
const ITEM_COLUMNS = [
  {
    key: "puppet_card",
    names: ["puppet", "puppet card", "puppet_card", "card", "cards"]
  },
  {
    key: "feather_ld",
    names: ["l&d", "ld", "light & dark", "light and dark", "light_dark", "feather_ld"]
  },
  {
    key: "feather_ts",
    names: ["t&s", "ts", "time & space", "time and space", "time_space", "feather_ts"]
  }
];

const CLASS_ALIASES = new Map([
  ["highpriest", "High Priest"],
  ["minstrel", "Bard"],
  ["gypsy", "Dancer"],
  ["mastersmith", "Whitesmith"],
  ["summoner", "Doram"]
]);

const MEMBER_NAME_ALIASES = new Map([
  ["frzttt", "weefrztttbr"],
  ["weefrztttbr", "frzttt"],
  ["boldstar", "boltstar"],
  ["boltstar", "boldstar"],
  ["weehurye", "xweehurye"],
  ["akii", "akiii"],
  ["sh1nboo", "sh1nboo"],
  ["aerisbr", "banoobsdr"],
  ["alycone", "alcyone"],
  ["nakedgarfieldwiz", "nakedgarfield0"],
  ["nakedgarfieldpal", "nakedgarfield1"],
  ["nakedgarfieldpally2", "nakedgarfiel2"]
]);

const MEMBER_CLASS_HINTS = new Map([
  ["weehubr2", "Assassin Cross"],
  ["weefrztttbr", "Whitesmith"],
  ["boltstar", "Professor"],
  ["alcyone", "Sniper"],
  ["alycone", "Sniper"],
  ["banoobsbr", "Whitesmith"],
  ["banoobsdr", "Paladin"],
  ["nakedgarfield0", "Biochemist"],
  ["nakedgarfield1", "Paladin"],
  ["nakedgarfiel2", "High Priest"],
  ["nakedgarfieldwiz", "Biochemist"],
  ["nakedgarfieldpal", "Paladin"],
  ["nakedgarfieldpally2", "High Priest"],
  ["godzillu", "High Priest"],
  ["janking", "Bard"],
  ["keshmeister", "High Wizard"],
  ["zykennn", "Assassin Cross"],
  ["nakedmoon", "High Priest"],
  ["nakedgian", "Champion"],
  ["itlognibatman", "Sniper"],
  ["imbalance", "Assassin Cross"]
]);

const UNKNOWN_CLASS = "Unknown";

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const eq = trimmed.indexOf("=");
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] ||= value;
  }
}

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && quoted && next === '"') {
      cur += '"';
      i++;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      out.push(cur);
      cur = "";
    } else {
      cur += char;
    }
  }
  out.push(cur);
  return out.map((value) => value.trim());
}

function normalizeHeader(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeName(value) {
  return String(value || "").trim().toLowerCase();
}

function nameCandidates(value) {
  const normalizedName = normalizeName(value);
  const candidates = new Set([normalizedName]);
  const alias = MEMBER_NAME_ALIASES.get(normalizedName);
  if (alias) candidates.add(alias);
  for (const [from, to] of MEMBER_NAME_ALIASES.entries()) {
    if (to === normalizedName) candidates.add(from);
  }
  return [...candidates].filter(Boolean);
}

function findColumn(headers, names) {
  const normalized = names.map(normalizeHeader);
  return headers.findIndex((header) => normalized.includes(header));
}

function parseCount(value) {
  const raw = String(value || "").trim();
  if (!raw) return 0;
  const match = raw.match(/-?\d+/);
  return Math.max(0, Number.parseInt(match?.[0] || "0", 10) || 0);
}

function parseJoinedAt(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
  const hasZone = /(?:z|[+-]\d\d:?\d\d)$/i.test(normalized);
  const withOffset = hasZone
    ? normalized
    : /^\d{4}-\d{2}-\d{2}$/.test(normalized)
      ? `${normalized}T00:00:00+08:00`
      : /^\d{4}-\d{2}-\d{2}T\d{1,2}:\d{2}$/.test(normalized)
        ? `${normalized}:00+08:00`
        : `${normalized}+08:00`;
  const date = new Date(withOffset);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeClass(value) {
  const raw = String(value || "").trim();
  return CLASS_ALIASES.get(raw.toLowerCase()) || raw;
}

function lookupClass(classLookup, memberName) {
  for (const candidate of nameCandidates(memberName)) {
    const className = classLookup.get(candidate) || MEMBER_CLASS_HINTS.get(candidate);
    if (className) return className;
  }
  return "";
}

function itemKeyFromHeader(value) {
  const header = normalizeHeader(value).replace(/[^a-z0-9&]/g, "");
  if (!header) return null;
  if (header.includes("puppet") && !header.includes("fragment")) return "puppet_card";
  if (header.includes("l&d") || header.includes("lnd") || header.includes("lightdark") || header.includes("lightanddark")) return "feather_ld";
  if (header.includes("t&s") || header.includes("timespace") || header.includes("timeandspace")) return "feather_ts";
  return null;
}

function countFromItemHeader(value) {
  const raw = String(value || "");
  const parenMatch = raw.match(/\((\d+)\)/);
  if (parenMatch) return parseCount(parenMatch[1]);
  return parseCount(raw) || 1;
}

function isTruthyCell(value) {
  const normalized = normalizeHeader(value);
  return normalized === "true" || normalized === "yes" || normalized === "y" || normalized === "1" || normalized === "done";
}

function readCsvRows(csvPath) {
  const text = fs.readFileSync(csvPath, "utf8").replace(/^\uFEFF/, "");
  return text.split(/\r?\n/).filter((line) => line.trim()).map(parseCsvLine);
}

function parseClassLookup(csvPath) {
  if (!csvPath) return new Map();
  const rows = readCsvRows(csvPath);
  if (!rows.length) return new Map();
  const headers = rows.shift().map(normalizeHeader);
  const nameIndex = findColumn(headers, ["ign", "char_name", "character", "member", "name"]);
  const classIndex = findColumn(headers, ["job", "class", "char_class"]);
  if (nameIndex === -1 || classIndex === -1) {
    throw new Error("Class source CSV must include IGN/Name and Job/Class columns.");
  }

  const lookup = new Map();
  for (const row of rows) {
    const name = row[nameIndex]?.trim();
    const className = normalizeClass(row[classIndex]);
    if (name && className) {
      const normalizedName = normalizeName(name);
      lookup.set(normalizedName, className);
      if (normalizedName.startsWith("x") && normalizedName.length > 1) {
        lookup.set(normalizedName.slice(1), className);
      }
    }
  }
  return lookup;
}

function parseRosterSource(csvPath) {
  if (!csvPath) return [];
  const rows = readCsvRows(csvPath);
  if (!rows.length) return [];

  const firstRow = rows[0].map(normalizeHeader);
  const nameIndex = findColumn(firstRow, ["ign", "char_name", "character", "member", "name"]);
  const sourceRows = nameIndex === -1 ? rows : rows.slice(1);
  const seen = new Set();
  return sourceRows.map((row) => {
    const name = (nameIndex === -1 ? row[0] : row[nameIndex])?.trim();
    if (!name) return null;
    const normalizedName = normalizeName(name);
    if (seen.has(normalizedName)) return null;
    seen.add(normalizedName);
    return name;
  }).filter(Boolean);
}

function parseJoinedAtOverrides(args) {
  const overrides = new Map();
  for (let index = 0; index < args.length; index++) {
    if (args[index] !== "--joined-at") continue;
    const value = args[index + 1];
    if (!value || value.startsWith("--") || !value.includes("=")) {
      throw new Error('--joined-at must use "Member Name=YYYY-MM-DD HH:mm", e.g. --joined-at "Osnub=2026-05-14 23:00".');
    }
    const eq = value.indexOf("=");
    const memberName = value.slice(0, eq).trim();
    const joinedAt = parseJoinedAt(value.slice(eq + 1).trim());
    if (!memberName || !joinedAt) {
      throw new Error(`Invalid joined-at override: ${value}`);
    }
    overrides.set(normalizeName(memberName), joinedAt);
    index++;
  }
  return overrides;
}

function parseAuctionLogRows(csvRows, classLookup) {
  const cycleHeaderIndex = csvRows.findIndex((row) => row.some((cell) => normalizeHeader(cell).startsWith("cycle")));
  const itemHeaderIndex = cycleHeaderIndex === -1 ? -1 : cycleHeaderIndex + 1;
  if (cycleHeaderIndex === -1 || !csvRows[itemHeaderIndex]) return null;

  const memberIndex = csvRows[cycleHeaderIndex].findIndex((cell) => ["member ign", "member", "ign"].includes(normalizeHeader(cell)));
  if (memberIndex === -1) return null;

  const itemColumns = csvRows[itemHeaderIndex].map((cell, index) => ({
    index,
    key: itemKeyFromHeader(cell),
    amount: countFromItemHeader(cell)
  })).filter((column) => column.key && column.index > memberIndex);

  if (!itemColumns.length) return null;

  const seen = new Set();
  return csvRows.slice(itemHeaderIndex + 1).map((row, index) => {
    const charName = row[memberIndex]?.trim();
    if (!charName) return null;
    const dedupeKey = normalizeName(charName);
    if (seen.has(dedupeKey)) return null;
    seen.add(dedupeKey);

    const received = { puppet_card: 0, feather_ld: 0, feather_ts: 0 };
    for (const column of itemColumns) {
      if (isTruthyCell(row[column.index])) {
        received[column.key] += column.amount;
      }
    }

    return {
      char_name: charName,
      char_class: lookupClass(classLookup, charName),
      joined_at: null,
      position: parseCount(row[0]) || index + 1,
      received
    };
  }).filter(Boolean).sort((a, b) => a.position - b.position);
}

function parseFlatRows(csvRows, classLookup) {
  if (!csvRows.length) throw new Error("CSV is empty.");

  const headers = csvRows.shift().map(normalizeHeader);
  const nameIndex = findColumn(headers, ["ign", "char_name", "character", "member", "name"]);
  const classIndex = findColumn(headers, ["job", "class", "char_class"]);
  const lineIndex = findColumn(headers, ["line", "position", "queue", "#", "no"]);
  const joinedIndex = findColumn(headers, ["joined_at", "joined", "joined date", "joined date/time", "join date"]);

  if (nameIndex === -1) {
    throw new Error("CSV must include an IGN, char_name, member, character, or name column.");
  }

  const itemIndexes = ITEM_COLUMNS.map((item) => ({
    key: item.key,
    index: findColumn(headers, item.names)
  }));

  const seen = new Set();
  return csvRows.map((cols, index) => {
    const charName = cols[nameIndex]?.trim();
    if (!charName) return null;
    const dedupeKey = normalizeName(charName);
    if (seen.has(dedupeKey)) return null;
    seen.add(dedupeKey);

    const received = {};
    for (const item of itemIndexes) {
      received[item.key] = item.index === -1 ? 0 : parseCount(cols[item.index]);
    }

    return {
      char_name: charName,
      char_class: (classIndex === -1 ? "" : normalizeClass(cols[classIndex])) || lookupClass(classLookup, charName),
      joined_at: joinedIndex === -1 ? null : parseJoinedAt(cols[joinedIndex]),
      position: lineIndex === -1 ? index + 1 : parseCount(cols[lineIndex]) || index + 1,
      received
    };
  }).filter(Boolean).sort((a, b) => a.position - b.position);
}

function parseRows(csvPath, classLookup) {
  const csvRows = readCsvRows(csvPath);
  if (!csvRows.length) throw new Error("CSV is empty.");
  return parseAuctionLogRows(csvRows, classLookup) || parseFlatRows(csvRows, classLookup);
}

function applyRosterSource(rows, rosterNames, classLookup) {
  if (!rosterNames.length) return rows;
  const byName = new Map(rows.map((row) => [normalizeName(row.char_name), row]));
  return rosterNames.map((charName, index) => {
    const existing = nameCandidates(charName).map((candidate) => byName.get(candidate)).find(Boolean);
    return {
      char_name: charName,
      char_class: existing?.char_class || lookupClass(classLookup, charName),
      joined_at: existing?.joined_at || null,
      position: index + 1,
      received: existing?.received || { puppet_card: 0, feather_ld: 0, feather_ts: 0 }
    };
  });
}

async function selectMaybeSingle(query) {
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data;
}

async function getOrCreateActiveRound(supabase) {
  const activeRound = await selectMaybeSingle(
    supabase.from("rounds").select("id,round_number,status").eq("status", "active").limit(1)
  );
  if (activeRound) return activeRound;

  const latestRound = await selectMaybeSingle(
    supabase.from("rounds").select("round_number").order("round_number", { ascending: false }).limit(1)
  );
  const { data, error } = await supabase
    .from("rounds")
    .insert({ round_number: (latestRound?.round_number || 0) + 1, status: "active" })
    .select("id,round_number,status")
    .single();
  if (error) throw error;
  return data;
}

function isComplete(received, items, caps) {
  return items
    .filter((item) => item.gates_round_completion)
    .every((item) => (received[item.item_key] || 0) >= (caps.get(item.id) ?? item.default_per_round_cap ?? 0));
}

function isMemberInAuctionCooldown(member, nowMs = Date.now()) {
  if (!member?.joined_at) return false;
  const joinedAtMs = new Date(member.joined_at).getTime();
  if (Number.isNaN(joinedAtMs)) return false;
  return joinedAtMs + AUCTION_JOIN_COOLDOWN_MS > nowMs;
}

function completedItemCycles(rows, membersByName, item, caps) {
  const cap = caps.get(item.id) ?? item.default_per_round_cap ?? 0;
  if (cap <= 0) return 0;
  const eligibleRows = rows.filter((row) => {
    const member = membersByName.get(normalizeName(row.char_name));
    return member && !isMemberInAuctionCooldown(member);
  });
  if (!eligibleRows.length) return 0;
  return Math.min(...eligibleRows.map((row) => Math.floor((row.received[item.item_key] || 0) / cap)));
}

function currentCycleReceived(row, items, caps, completedCyclesByItemKey) {
  const heldTotals = { ...row.received };
  const received = {
    ...row.received,
    [HELD_TOTALS_KEY]: heldTotals
  };

  for (const item of items) {
    if (!item.gates_round_completion) continue;
    const cap = caps.get(item.id) ?? item.default_per_round_cap ?? 0;
    if (cap <= 0) {
      received[item.item_key] = 0;
      continue;
    }
    const completedCycles = completedCyclesByItemKey.get(item.item_key) || 0;
    received[item.item_key] = Math.min(Math.max((heldTotals[item.item_key] || 0) - completedCycles * cap, 0), cap);
  }

  return received;
}

function usage() {
  return [
    "Usage:",
    "  npm run import:auction-state -- /path/to/auction-log.csv --class-source /path/to/masterfile.csv --replace-active [--clear-auctions]",
    "",
    "Auction Log format:",
    "  Member IGN rows plus cycle item columns like PUPPET(1), LnD (8), TimeSpace (10) with TRUE/FALSE values.",
    "",
    "Flat CSV format:",
    "  IGN/char_name plus optional Line, Job/Class, Joined At, Puppet, L&D, T&S columns.",
    "",
    "Class source format:",
    "  Masterfile CSV with IGN/Name and Job/Class columns. Existing app members are used as fallback.",
    "",
    "Joined At is treated as PH time when no timezone is included, e.g. 2026-05-14 23:00.",
    "",
    "Options:",
    "  --replace-active   Required. Rebuilds the active lineup/progress from the CSV.",
    "  --roster-source    Optional. Current member list/order; item progress is copied by matching names from the auction log.",
    "  --clear-auctions   Also clears existing auctions for the active lineup.",
    '  --joined-at        Optional. Set PH joined time for a member, e.g. --joined-at "Osnub=2026-05-14 23:00".',
    "  --dry-run          Parses and validates only; does not connect to Supabase."
  ].join("\n");
}

loadEnv(path.resolve(process.cwd(), ".env.local"));

const args = process.argv.slice(2);
const csvPath = args.find((arg) => !arg.startsWith("--"));
const classSourceIndex = args.findIndex((arg) => arg === "--class-source" || arg === "--classes" || arg === "--masterfile");
const classSourcePath = classSourceIndex === -1 ? null : args[classSourceIndex + 1];
const rosterSourceIndex = args.findIndex((arg) => arg === "--roster-source" || arg === "--roster");
const rosterSourcePath = rosterSourceIndex === -1 ? null : args[rosterSourceIndex + 1];
const replaceActive = args.includes("--replace-active");
const clearAuctions = args.includes("--clear-auctions");
const dryRun = args.includes("--dry-run");
const joinedAtOverrides = parseJoinedAtOverrides(args);

if (!csvPath || !replaceActive) {
  throw new Error(`${usage()}\n\n--replace-active is required so accidental imports do not overwrite the lineup.`);
}

const classLookup = parseClassLookup(classSourcePath ? path.resolve(classSourcePath) : null);
let rows = parseRows(path.resolve(csvPath), classLookup);
rows = applyRosterSource(rows, parseRosterSource(rosterSourcePath ? path.resolve(rosterSourcePath) : null), classLookup);
if (!rows.length) throw new Error("No member rows found in CSV.");
for (const row of rows) {
  row.joined_at = joinedAtOverrides.get(normalizeName(row.char_name)) || row.joined_at;
}

if (dryRun) {
  const unknownClasses = rows.filter((row) => !row.char_class).map((row) => row.char_name);
  const cooldownRows = rows.filter((row) => row.joined_at);
  console.log(`Parsed ${rows.length} lineup rows.`);
  console.log(`Class source matches: ${rows.filter((row) => row.char_class).length}`);
  if (cooldownRows.length) {
    console.log("Joined-at cooldown rows:");
    for (const row of cooldownRows) console.log(`- ${row.char_name}: ${row.joined_at}`);
  }
  if (unknownClasses.length) {
    console.log(`Unknown class fallback (${UNKNOWN_CLASS}):`);
    for (const name of unknownClasses) console.log(`- ${name}`);
  }
  const totals = rows.reduce((acc, row) => {
    acc.puppet_card += row.received.puppet_card || 0;
    acc.feather_ld += row.received.feather_ld || 0;
    acc.feather_ts += row.received.feather_ts || 0;
    return acc;
  }, { puppet_card: 0, feather_ld: 0, feather_ts: 0 });
  console.log(`Totals from CSV: Puppet ${totals.puppet_card}, L&D ${totals.feather_ld}, T&S ${totals.feather_ts}`);
  process.exit(0);
}

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey || serviceRoleKey.includes("PASTE_")) {
  throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

const existingMembersResult = await supabase.from("members").select("id,char_name,char_class,joined_at");
if (existingMembersResult.error) throw existingMembersResult.error;
const existingByName = new Map((existingMembersResult.data || []).map((member) => [normalizeName(member.char_name), member]));

const memberPayload = rows.map((row) => {
  const existing = existingByName.get(normalizeName(row.char_name));
  const charClass = row.char_class || existing?.char_class || UNKNOWN_CLASS;
  return {
    char_name: row.char_name,
    char_class: charClass,
    ...(row.joined_at ? { joined_at: row.joined_at } : {})
  };
});

const upsertMembersResult = await supabase
  .from("members")
  .upsert(memberPayload, { onConflict: "char_name" })
  .select("id,char_name,char_class,joined_at");
if (upsertMembersResult.error) throw upsertMembersResult.error;

const membersByName = new Map((upsertMembersResult.data || []).map((member) => [normalizeName(member.char_name), member]));
const activeRound = await getOrCreateActiveRound(supabase);

if (clearAuctions) {
  const auctionDelete = await supabase.from("auctions").delete().eq("round_id", activeRound.id);
  if (auctionDelete.error) throw auctionDelete.error;
}

const progressDelete = await supabase.from("member_round_progress").delete().eq("round_id", activeRound.id);
if (progressDelete.error) throw progressDelete.error;
const rotationDelete = await supabase.from("rotation_list").delete().eq("round_id", activeRound.id);
if (rotationDelete.error) throw rotationDelete.error;

const [itemsResult, capsResult] = await Promise.all([
  supabase.from("auction_items").select("id,item_key,default_per_round_cap,gates_round_completion"),
  supabase.from("round_item_cap_overrides").select("item_id,cap").eq("round_id", activeRound.id)
]);
if (itemsResult.error) throw itemsResult.error;
if (capsResult.error) throw capsResult.error;

const caps = new Map((capsResult.data || []).map((row) => [row.item_id, row.cap]));
const completedCyclesByItemKey = new Map(
  (itemsResult.data || [])
    .filter((item) => item.gates_round_completion)
    .map((item) => [item.item_key, completedItemCycles(rows, membersByName, item, caps)])
);
const rotationRows = [];
const progressRows = [];

rows.forEach((row, index) => {
  const member = membersByName.get(normalizeName(row.char_name));
  if (!member) throw new Error(`Could not resolve member "${row.char_name}".`);
  rotationRows.push({
    round_id: activeRound.id,
    member_id: member.id,
    position: index + 1
  });
  const received = currentCycleReceived(row, itemsResult.data || [], caps, completedCyclesByItemKey);
  progressRows.push({
    round_id: activeRound.id,
    member_id: member.id,
    received,
    is_complete: isComplete(received, itemsResult.data || [], caps),
    completed_at: isComplete(received, itemsResult.data || [], caps) ? new Date().toISOString() : null
  });
});

const rotationResult = await supabase.from("rotation_list").insert(rotationRows);
if (rotationResult.error) throw rotationResult.error;
const progressResult = await supabase.from("member_round_progress").insert(progressRows);
if (progressResult.error) throw progressResult.error;

console.log(`Imported ${rows.length} lineup rows into active round ${activeRound.round_number}.`);
console.log(`Completed cycles from held totals: ${[...completedCyclesByItemKey.entries()].map(([key, cycles]) => `${key}=${cycles}`).join(", ")}`);
console.log(clearAuctions ? "Cleared existing auctions for this round." : "Existing auctions were kept.");
