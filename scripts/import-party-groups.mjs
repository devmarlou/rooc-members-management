import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const partyOrder = [
  "Alpha 1",
  "Alpha 2",
  "Bravo 1",
  "Bravo 2",
  "Charlie 1",
  "Charlie 2",
  "FLEX 1",
  "FLEX 2",
  "Sub Alpha 1",
  "Sub Alpha 2",
  "Sub Bravo 1",
  "Sub Bravo 2",
  "Sub Charlie 1",
  "Sub Charlie 2",
  "Sub Delta 1",
  "Sub Delta 2"
];

const partyByKey = new Map(partyOrder.map((name) => [name.toLowerCase(), name]));
const subFieldParties = [
  { partyName: "Sub Alpha 1", members: ["Senyoraaa", "Shammyre", "Sh1nBoo", "Shan", "Tobichan"] },
  { partyName: "Sub Alpha 2", members: ["Ynori", "TaichoBee", "Ordz", "Imbalance", "Kreyja"] },
  { partyName: "Sub Bravo 1", members: ["NakedMoon", "NakedGarfieldBard", "NakedGarfieldPaladin", "NakedGian", "Supreme"] },
  { partyName: "Sub Bravo 2", members: ["WeePriestBR", "WeeHuBeshy", "WeeJunBR", "WeeMigBR", "WeeSonixBR"] },
  { partyName: "Sub Charlie 1", members: ["AndromedA", "Kushinero", "Akii", "Alycone", "SNOW"] },
  { partyName: "Sub Charlie 2", members: ["WeeHuRye", "Bell", "Doidoi", "Hibernate", "Boldstar"] },
  { partyName: "Sub Delta 1", members: ["Astrid", "Sanguine", "Calixx", "Herius", "Puts"] },
  { partyName: "Sub Delta 2", members: [null, null, "Keshmeister", "Messt", "Akyra"] }
];
const memberAliases = new Map([
  ["r0dd", "rodd"],
  ["weefrztttbr", "frzttt"],
  ["zykenn", "zykennn"],
  ["taichobee", "taichoubee"],
  ["nakedgarfieldbard", "nakedgarfieldpally2"],
  ["nakedgarfieldpaladin", "nakedgarfieldpal"],
  ["alycone", "alcyone"],
  ["boldstar", "boltstar"],
  ["astrid", "astrid"]
]);
const memberRenames = new Map([
  ["nakedgarfieldbard", "NakedGarfieldBard"],
  ["nakedgarfieldpaladin", "NakedGarfieldPaladin"]
]);
const memberDefaults = new Map([
  ["miyuyua", { char_class: "High Priest" }],
  ["jyliana", { char_class: "Bard" }],
  ["osnub", { char_class: "High Wizard" }],
  ["lalaa", { char_class: "Doram" }],
  ["mt999", { char_class: "Sniper" }],
  ["weedevabr", { char_class: "High Priest" }],
  ["weeyagsbr", { char_class: "Bard" }],
  ["weehubr", { char_class: "High Wizard" }],
  ["helxine", { char_class: "Whitesmith" }],
  ["weesunxbr", { char_class: "Biochemist" }],
  ["darthas", { char_class: "High Priest" }],
  ["weegetziibr", { char_class: "Bard" }],
  ["weechrlygbr", { char_class: "Professor" }],
  ["r0dd", { char_class: "Doram" }],
  ["docxbr", { char_class: "Assassin Cross" }],
  ["ryjj", { char_class: "High Priest" }],
  ["rspkt", { char_class: "Bard" }],
  ["banoobsdr", { char_class: "Paladin" }],
  ["banoobsbr", { char_class: "Doram", joined_at: "2026-06-04T00:00:00+08:00" }],
  ["virgo", { char_class: "Biochemist" }],
  ["afygpds", { char_class: "High Priest" }],
  ["weeyomibr", { char_class: "Bard" }],
  ["nakedgarfieldwiz", { char_class: "High Wizard" }],
  ["weejoshbr", { char_class: "Whitesmith" }],
  ["yamato", { char_class: "Biochemist" }],
  ["godzillu", { char_class: "High Priest" }],
  ["janking", { char_class: "Bard" }],
  ["jomski", { char_class: "Paladin" }],
  ["krisjulio", { char_class: "Whitesmith" }],
  ["zykenn", { char_class: "Assassin Cross" }],
  ["fredplays", { char_class: "High Priest" }],
  ["mamark", { char_class: "Bard" }],
  ["vogue", { char_class: "Paladin" }],
  ["autumn", { char_class: "Doram" }],
  ["itlognibatman", { char_class: "Assassin Cross" }],
  ["nasmi", { char_class: "High Priest" }],
  ["a1110", { char_class: "Bard" }],
  ["weefrztttbr", { char_class: "Professor" }],
  ["java", { char_class: "Doram" }],
  ["kimi", { char_class: "Assassin Cross" }],
  ["senyoraaa", { char_class: "High Priest" }],
  ["shammyre", { char_class: "Bard" }],
  ["sh1nboo", { char_class: "Paladin" }],
  ["shan", { char_class: "Assassin Cross" }],
  ["tobichan", { char_class: "Professor" }],
  ["ynori", { char_class: "High Priest" }],
  ["taichobee", { char_class: "Bard" }],
  ["ordz", { char_class: "Paladin" }],
  ["imbalance", { char_class: "Assassin Cross" }],
  ["kreyja", { char_class: "Paladin" }],
  ["nakedmoon", { char_class: "High Priest" }],
  ["nakedgarfieldbard", { char_class: "Bard" }],
  ["nakedgarfieldpaladin", { char_class: "Paladin" }],
  ["nakedgian", { char_class: "Doram" }],
  ["supreme", { char_class: "Whitesmith" }],
  ["weepriestbr", { char_class: "High Priest" }],
  ["weehubeshy", { char_class: "Bard" }],
  ["weejunbr", { char_class: "Assassin Cross" }],
  ["weemigbr", { char_class: "Paladin" }],
  ["weesonixbr", { char_class: "Sniper" }],
  ["andromeda", { char_class: "High Priest" }],
  ["kushinero", { char_class: "Bard" }],
  ["akii", { char_class: "Paladin" }],
  ["alycone", { char_class: "Sniper" }],
  ["snow", { char_class: "Assassin Cross" }],
  ["weehurye", { char_class: "High Priest" }],
  ["bell", { char_class: "Bard" }],
  ["doidoi", { char_class: "Biochemist" }],
  ["hibernate", { char_class: "Assassin Cross" }],
  ["boldstar", { char_class: "Professor" }],
  ["astrid", { char_class: "High Priest" }],
  ["sanguine", { char_class: "Whitesmith" }],
  ["calixx", { char_class: "High Wizard" }],
  ["herius", { char_class: "Paladin" }],
  ["puts", { char_class: "High Wizard" }],
  ["keshmeister", { char_class: "High Wizard" }],
  ["messt", { char_class: "Sniper" }],
  ["akyra", { char_class: "Paladin" }]
]);

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

function normalizeName(name) {
  return String(name || "").trim().toLowerCase();
}

function isMissingPartySlotError(error) {
  const message = String(error?.message || "");
  return error?.code === "42703" || message.includes("party_slot");
}

function parsePartyGroups(csvPath) {
  const text = fs.readFileSync(csvPath, "utf8").replace(/^\uFEFF/, "");
  const rows = text
    .split(/\r?\n/)
    .map(parseCsvLine)
    .filter((row) => row.some((value) => value.trim()));

  const assignments = [];
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    const parties = row.map((value) => partyByKey.get(value.trim().toLowerCase()) || null);
    if (!parties.some(Boolean)) continue;

    const memberRows = rows.slice(rowIndex + 2, rowIndex + 7);
    for (const [slotIndex, memberRow] of memberRows.entries()) {
      parties.forEach((partyName, columnIndex) => {
        if (!partyName) return;
        const charName = memberRow[columnIndex]?.trim();
        if (!charName) return;
        assignments.push({ charName, partyName, party_slot: slotIndex + 1 });
      });
    }
  }

  const seen = new Set();
  return assignments.filter((assignment) => {
    const key = normalizeName(assignment.charName);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getSubFieldAssignments() {
  return subFieldParties.flatMap((party) => (
    party.members
      .map((charName, index) => charName ? { charName, partyName: party.partyName, party_slot: index + 1 } : null)
      .filter(Boolean)
  ));
}

loadEnv(path.resolve(process.cwd(), ".env.local"));

const csvPath = process.argv[2];
if (!csvPath) {
  throw new Error("Usage: node scripts/import-party-groups.mjs /path/to/main-field.csv [--create-missing]");
}
const createMissing = process.argv.includes("--create-missing");

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

const assignments = [...parsePartyGroups(csvPath), ...getSubFieldAssignments()];
if (assignments.length !== 78) {
  throw new Error(`Expected 78 party assignments, found ${assignments.length}.`);
}

const { data: groups, error: groupError } = await supabase
  .from("groups")
  .upsert(
    partyOrder.map((name, index) => ({ name, sort_order: (index + 1) * 10 })),
    { onConflict: "name" }
  )
  .select("id,name,sort_order");

if (groupError) throw groupError;

const groupsByName = new Map((groups || []).map((group) => [group.name, group]));
let hasPartySlot = true;
let { data: members, error: memberError } = await supabase
  .from("members")
  .select("id,char_name,group_id,party_slot");

if (isMissingPartySlotError(memberError)) {
  hasPartySlot = false;
  const fallbackResult = await supabase
    .from("members")
    .select("id,char_name,group_id");
  members = fallbackResult.data?.map((member) => ({ ...member, party_slot: null }));
  memberError = fallbackResult.error;
}

if (memberError) throw memberError;

const membersByName = new Map((members || []).map((member) => [normalizeName(member.char_name), member]));
const missing = [];
const updates = [];
const memberDefaultUpdates = [];
let aliasMatches = 0;

for (const assignment of assignments) {
  const normalizedName = normalizeName(assignment.charName);
  const member = membersByName.get(normalizedName) || membersByName.get(memberAliases.get(normalizedName));
  const group = groupsByName.get(assignment.partyName);
  if (!member) {
    missing.push(assignment);
    continue;
  }
  if (normalizeName(member.char_name) !== normalizedName) aliasMatches++;
  if (memberDefaults.has(normalizedName)) {
    memberDefaultUpdates.push({
      id: member.id,
      ...memberDefaults.get(normalizedName),
      ...(memberRenames.has(normalizedName) ? { char_name: memberRenames.get(normalizedName) } : {})
    });
  }
  if (member.group_id !== group.id || (hasPartySlot && member.party_slot !== assignment.party_slot)) {
    updates.push({ id: member.id, group_id: group.id, party_slot: assignment.party_slot, char_name: member.char_name, partyName: assignment.partyName });
  }
}

for (const update of updates) {
  const updateBody = hasPartySlot
    ? { group_id: update.group_id, party_slot: update.party_slot }
    : { group_id: update.group_id };
  const { error } = await supabase
    .from("members")
    .update(updateBody)
    .eq("id", update.id);
  if (error) throw error;
}

for (const update of memberDefaultUpdates) {
  const { id, ...defaults } = update;
  const { error } = await supabase
    .from("members")
    .update(defaults)
    .eq("id", id);
  if (error) throw error;
}

const createdMembers = [];
const unresolvedMissing = [];
if (missing.length && createMissing) {
  for (const assignment of missing) {
    const group = groupsByName.get(assignment.partyName);
    const defaults = memberDefaults.get(normalizeName(assignment.charName)) || { char_class: "Unknown" };
    const insertBody = {
      char_name: assignment.charName,
      ...defaults,
      group_id: group.id
    };
    if (hasPartySlot) insertBody.party_slot = assignment.party_slot;

    const selectColumns = hasPartySlot
      ? "id,char_name,char_class,group_id,party_slot"
      : "id,char_name,char_class,group_id";
    const { data, error } = await supabase
      .from("members")
      .insert(insertBody)
      .select(selectColumns)
      .single();
    if (error) throw error;
    createdMembers.push({ ...data, party_slot: data.party_slot ?? null });
  }

  const { data: activeRound, error: roundError } = await supabase
    .from("rounds")
    .select("id")
    .eq("status", "active")
    .maybeSingle();
  if (roundError) throw roundError;

  if (activeRound && createdMembers.length) {
    const { data: lastPosition, error: positionError } = await supabase
      .from("rotation_list")
      .select("position")
      .eq("round_id", activeRound.id)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (positionError) throw positionError;

    let position = lastPosition?.position || 0;
    for (const member of createdMembers) {
      position++;
      const rotationResult = await supabase.from("rotation_list").insert({
        round_id: activeRound.id,
        member_id: member.id,
        position
      });
      if (rotationResult.error) throw rotationResult.error;

      const progressResult = await supabase.from("member_round_progress").insert({
        round_id: activeRound.id,
        member_id: member.id,
        received: {}
      });
      if (progressResult.error) throw progressResult.error;
    }
  }
} else {
  unresolvedMissing.push(...missing);
}

console.log(`Parsed ${assignments.length} party assignments.`);
console.log(`Upserted ${partyOrder.length} party groups.`);
if (!hasPartySlot) console.log("party_slot column is missing, so only group assignments and classes were saved.");
console.log(`Assigned ${updates.length} members to party groups.`);
if (aliasMatches) console.log(`Matched ${aliasMatches} members through known roster aliases.`);
if (memberDefaultUpdates.length) console.log(`Updated ${memberDefaultUpdates.length} members with party CSV defaults.`);
if (createdMembers.length) console.log(`Created ${createdMembers.length} missing members.`);

const alreadyAssigned = assignments.length - updates.length - missing.length;
if (alreadyAssigned) console.log(`${alreadyAssigned} members were already in the correct party.`);

if (unresolvedMissing.length) {
  console.log("");
  console.log("Missing roster members:");
  for (const item of unresolvedMissing) {
    console.log(`- ${item.charName} -> ${item.partyName}`);
  }
  process.exitCode = 1;
}
