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
  "FLEX 2"
];

const partyByKey = new Map(partyOrder.map((name) => [name.toLowerCase(), name]));
const memberAliases = new Map([
  ["r0dd", "rodd"],
  ["weefrztttbr", "frzttt"],
  ["zykenn", "zykennn"]
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
  ["kimi", { char_class: "Assassin Cross" }]
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
    for (const memberRow of memberRows) {
      parties.forEach((partyName, columnIndex) => {
        if (!partyName) return;
        const charName = memberRow[columnIndex]?.trim();
        if (!charName) return;
        assignments.push({ charName, partyName });
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

const assignments = parsePartyGroups(csvPath);
if (assignments.length !== 40) {
  throw new Error(`Expected 40 party assignments, found ${assignments.length}.`);
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
const { data: members, error: memberError } = await supabase
  .from("members")
  .select("id,char_name,group_id");

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
    memberDefaultUpdates.push({ id: member.id, ...memberDefaults.get(normalizedName) });
  }
  if (member.group_id !== group.id) {
    updates.push({ id: member.id, group_id: group.id, char_name: member.char_name, partyName: assignment.partyName });
  }
}

for (const update of updates) {
  const { error } = await supabase
    .from("members")
    .update({ group_id: update.group_id })
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
    const { data, error } = await supabase
      .from("members")
      .insert({
        char_name: assignment.charName,
        ...defaults,
        group_id: group.id
      })
      .select("id,char_name,char_class,group_id")
      .single();
    if (error) throw error;
    createdMembers.push(data);
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
