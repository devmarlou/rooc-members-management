import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const classAliases = new Map([
  ["HighPriest", "High Priest"],
  ["Minstrel", "Bard"],
  ["Gypsy", "Dancer"],
  ["Mastersmith", "Whitesmith"],
  ["Summoner", "Doram"]
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

function parseMembers(csvPath) {
  const text = fs.readFileSync(csvPath, "utf8").replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  const header = parseCsvLine(lines.shift()).map((name) => name.toLowerCase());
  const nameIndex = header.indexOf("ign");
  const classIndex = header.indexOf("job");
  if (nameIndex === -1 || classIndex === -1) {
    throw new Error("CSV must include IGN and Job columns.");
  }

  const seen = new Set();
  const members = [];
  for (const line of lines) {
    const cols = parseCsvLine(line);
    const char_name = cols[nameIndex]?.trim();
    const rawClass = cols[classIndex]?.trim();
    if (!char_name || !rawClass) continue;
    const key = char_name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    members.push({
      char_name,
      char_class: classAliases.get(rawClass) || rawClass
    });
  }
  return members;
}

loadEnv(path.resolve(process.cwd(), ".env.local"));

const csvPath = process.argv[2];
if (!csvPath) {
  throw new Error("Usage: node scripts/import-members.mjs /path/to/members.csv");
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

const members = parseMembers(csvPath);
const { data, error } = await supabase
  .from("members")
  .upsert(members, { onConflict: "char_name" })
  .select("id,char_name,char_class");

if (error) throw error;

const byClass = new Map();
for (const member of data || []) {
  byClass.set(member.char_class, (byClass.get(member.char_class) || 0) + 1);
}

console.log(`Imported ${data?.length || 0} members.`);
for (const [className, count] of [...byClass.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  console.log(`${className}: ${count}`);
}
