"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  LogOut,
  Menu,
  Plus,
  Search,
  Shield,
  Pencil,
  Trash2,
  UserMinus,
  Swords,
  Settings,
  Gavel,
  Trophy,
  Clock3,
  X,
  Check,
  Loader2,
  AlertTriangle,
  Copy,
  Save,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  ArrowUp,
  ArrowDown,
  LayoutGrid,
  List,
  Table2,
  History,
  KeyRound,
  User,
  BarChart3,
  Layers,
  ExternalLink,
  Users,
  Video,
  Download,
} from "lucide-react";
import { colorGroups } from "@/components/data";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import { auctionPageNavigation } from "@/lib/auctionPageSearch";
import { GUILD_MEMBER_LIMIT } from "@/lib/constants";
import { ensureAbsoluteUrl } from "@/lib/memberStats";

const emptyMember = {
  char_name: "",
  char_class: "Lord Knight",
  group_id: "",
  party_slot: null,
  is_officer: false,
  auction_priority_override: false,
  joined_at: "",
  notes: "",
};

const AUCTION_JOIN_COOLDOWN_HOURS = 96;
const AUCTION_JOIN_COOLDOWN_MS = AUCTION_JOIN_COOLDOWN_HOURS * 60 * 60 * 1000;
const PH_TIME_ZONE = "Asia/Manila";
// GUILD_MEMBER_LIMIT (80) is a hard cap enforced server-side too — see lib/constants.js.
const DEFAULT_GUILD_MEMBER_LIMIT = GUILD_MEMBER_LIMIT;
const DASHBOARD_CACHE_MAX_AGE_MS = 30_000;
const ITEM_ICON_SRC = {
  puppet_card: "/icons/puppet.png",
  feather_ld: "/icons/light-dark.png",
  feather_ts: "/icons/time-space.png",
};
const MAIN_FIELD_PARTY_LIMIT = 8;
const PARTY_MEMBER_ORDER_ALIASES = {
  rodd: "r0dd",
  frzttt: "weefrztttbr",
  zykennn: "zykenn",
  nakedgarfieldpally2: "nakedgarfieldbard",
  nakedgarfieldpal: "nakedgarfieldpaladin",
  taichoubee: "taichobee",
  alcyone: "alycone",
  boltstar: "boldstar",
  astrid: "astrid",
};
const PARTY_MEMBER_ORDER = Object.fromEntries(
  Object.entries({
    "Alpha 1": ["Miyuyua", "Jyliana", "Osnub", "Lalaa", "MT999"],
    "Alpha 2": ["WeeDevaBR", "WeeYagsBR", "WeeHuBR", "Helxine", "WeeSunxBR"],
    "Bravo 1": ["Darthas", "WeeGetziiBR", "WeeChrlygBR", "R0dd", "DocxBR"],
    "Bravo 2": ["Ryjj", "RSPKT", "BanoobsDR", "BanoobsBR", "Virgo"],
    "Charlie 1": [
      "AfyGPDS",
      "WeeYomiBR",
      "NakedGarfieldWiz",
      "WeeJOSHBR",
      "Yamato",
    ],
    "Charlie 2": ["Godzillu", "JanKing", "jomski", "KrisJulio", "Zykenn"],
    "FLEX 1": ["fredplays", "Mamark", "Vogue", "Autumn", "itlognibatman"],
    "FLEX 2": ["Nasmi", "A1110", "WeeFrztttBR", "Java", "kimi"],
    "Sub Alpha 1": ["Senyoraaa", "Shammyre", "Sh1nBoo", "Shan", "Tobichan"],
    "Sub Alpha 2": ["Ynori", "TaichoBee", "Ordz", "Imbalance", "Kreyja"],
    "Sub Bravo 1": [
      "NakedMoon",
      "NakedGarfieldBard",
      "NakedGarfieldPaladin",
      "NakedGian",
      "Supreme",
    ],
    "Sub Bravo 2": [
      "WeePriestBR",
      "WeeHuBeshy",
      "WeeJunBR",
      "WeeMigBR",
      "WeeSonixBR",
    ],
    "Sub Charlie 1": ["AndromedA", "Kushinero", "Akii", "Alycone", "SNOW"],
    "Sub Charlie 2": ["WeeHuRye", "Bell", "Doidoi", "Hibernate", "Boldstar"],
    "Sub Delta 1": ["Astrid", "Sanguine", "Calixx", "Herius", "Puts"],
    "Sub Delta 2": ["Keshmeister", "Messt", "Akyra"],
  }).map(([groupName, names]) => [
    groupName,
    new Map(
      names.map((name, index) => [normalizePartyMemberName(name), index]),
    ),
  ]),
);
const AUCTION_PAGE_ITEM_ORDER = {
  puppet_card: 1,
  puppet_fragment: 2,
  feather_ld: 3,
  feather_ts: 4,
};
const SHARED_FEATHER_PAGE_KEYS = new Set(["feather_ld", "feather_ts"]);
let adminSessionCache = null;
// Same idea as adminSessionCache, but for the public board's real-viewer
// identity — every app/**/page.js mounts a fresh DashboardApp, so without
// this a signed-in member bouncing to /public sees the sidebar disappear
// and reappear each time while the session check round-trips.
let viewerCache = null;
const dashboardDataCache = { admin: null, public: null };
// Module-level (not React state) so pending approvals / member stats survive
// a route change — every app/**/page.js mounts a fresh DashboardApp instance,
// and without this, navigating between admin pages re-fetched both lists on
// every single navigation instead of only when their cache goes stale.
let pendingAccountsCache = null; // { data, loadedAt }
let memberStatsSummaryCache = null; // { data, loadedAt }
let publicStatsBoardCache = null; // { data, loadedAt } — owned by PublicStatsBoardScreen
let povLinksCache = null; // { data, loadedAt } — owned by PovListScreen
let accountCache = null; // { data, loadedAt } — owned by AccountScreen
let accountStatsCache = null; // { data, loadedAt } — owned by AccountScreen
let auditLogsCache = null; // { data, loadedAt }
// /account and /public-stats skip loadData() entirely (see checkSession), so
// JobClassesContext would otherwise stay empty for them and ClassIcon would
// render blank placeholders — this keeps just the job class list available
// without pulling in the rest of the admin/public bootstrap.
let jobClassesCache = null; // { data, loadedAt }

function dashboardCacheKey(publicView) {
  return publicView ? "public" : "admin";
}

function normalizePartyMemberName(name) {
  const normalized = String(name || "")
    .trim()
    .toLowerCase();
  return PARTY_MEMBER_ORDER_ALIASES[normalized] || normalized;
}

function auctionPriorityRank(member) {
  return member?.auction_priority_override ? 0 : 1;
}

function sortedPartyRoster(roster, groupName) {
  const hasSavedSlots = roster.some((member) =>
    Number.isInteger(member.party_slot),
  );
  return [...roster].sort((a, b) => {
    if (hasSavedSlots) {
      return (
        (a.party_slot ?? 99) - (b.party_slot ?? 99) ||
        a.char_name.localeCompare(b.char_name)
      );
    }
    const order = PARTY_MEMBER_ORDER[groupName];
    if (!order) return a.char_name.localeCompare(b.char_name);
    const aPosition = order.get(normalizePartyMemberName(a.char_name));
    const bPosition = order.get(normalizePartyMemberName(b.char_name));
    return (
      (aPosition ?? 99) - (bPosition ?? 99) ||
      a.char_name.localeCompare(b.char_name)
    );
  });
}

function buildPartySlots(roster, groupName) {
  const hasSavedSlots = roster.some((member) =>
    Number.isInteger(member.party_slot),
  );
  const slots = [null, null, null, null, null];

  if (!hasSavedSlots) {
    const ordered = sortedPartyRoster(roster, groupName);
    for (let index = 0; index < slots.length; index++)
      slots[index] = ordered[index] || null;
    return slots;
  }

  const unslotted = [];
  for (const member of sortedPartyRoster(roster, groupName)) {
    if (
      Number.isInteger(member.party_slot) &&
      member.party_slot >= 1 &&
      member.party_slot <= 5 &&
      !slots[member.party_slot - 1]
    ) {
      slots[member.party_slot - 1] = member;
    } else {
      unslotted.push(member);
    }
  }

  for (const member of unslotted) {
    const openIndex = slots.findIndex((slot) => !slot);
    if (openIndex === -1) break;
    slots[openIndex] = member;
  }

  return slots;
}

function toPhDateTimeParts(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PH_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .formatToParts(date)
    .reduce((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

function toIsoTimestamp(dateValue, timeValue) {
  if (!dateValue && !timeValue) return null;
  if (!dateValue) return null;
  const date = new Date(`${dateValue}T${timeValue || "00:00"}:00+08:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function getAuctionCooldown(member, nowMs = Date.now()) {
  if (!member?.joined_at) return null;
  const joinedAtMs = new Date(member.joined_at).getTime();
  if (Number.isNaN(joinedAtMs)) return null;
  const endsAtMs = joinedAtMs + AUCTION_JOIN_COOLDOWN_MS;
  const remainingMs = endsAtMs - nowMs;
  if (remainingMs <= 0) return null;
  return { endsAtMs, remainingMs };
}

function formatCooldownRemaining(ms) {
  const totalHours = Math.max(1, Math.ceil(ms / (60 * 60 * 1000)));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  if (days && hours) return `${days}d ${hours}h`;
  if (days) return `${days}d`;
  return `${hours}h`;
}

function formatPhDateTime(timestampMs) {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: PH_TIME_ZONE,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestampMs));
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    cache: "no-store",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

// Same contract as api(), but for FormData bodies (icon uploads) — no
// Content-Type header, so the browser sets the multipart boundary itself.
async function apiForm(path, options = {}) {
  const response = await fetch(path, { cache: "no-store", ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

// Job classes used to be a static array in components/data.js; they now live
// in the job_classes table and are loaded via bootstrap. This context makes
// the live list available to components (ClassIcon, Stats, MembersSection,
// MemberForm, ...) that are defined outside DashboardApp without threading
// props through every layer.
const JobClassesContext = createContext({
  jobClasses: [],
  classes: [],
  classOrder: [],
  classByName: {},
});

function useJobClasses() {
  return useContext(JobClassesContext);
}

function ClassIcon({ name, size = 34, glow = true }) {
  const { classByName } = useJobClasses();
  const cls = classByName[name];
  if (!cls?.icon)
    return (
      <span
        className="class-icon-placeholder"
        style={{ width: size, height: size }}
      />
    );
  const color = colorGroups[cls.group];
  return (
    <span
      className={glow ? "class-icon" : "class-icon no-glow"}
      style={{ width: size, height: size, "--class-color": color }}
    >
      <img src={cls.icon} alt={name} width={size} height={size} draggable={false} />
    </span>
  );
}

const DISCORD_AUTH_ERROR_MESSAGES = {
  discord_state_invalid:
    "Something went wrong linking your Discord account. Please try again.",
  account_disabled: "This account has been disabled. Contact a guild officer.",
  account_pending:
    "Your registration is awaiting admin approval. Check back soon.",
  discord_not_installed:
    "Discord sign-in isn't set up yet. Contact a guild officer.",
  discord_failed: "Could not sign in with Discord. Please try again.",
};

function LoginScreen({ onLogin, registerStep = "", authError = "" }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("login");

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      onLogin();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (registerStep === "complete") {
    return <DiscordRegistrationCompleteScreen />;
  }

  if (mode === "local-register") {
    return <LocalRegistrationCompleteScreen onBack={() => setMode("login")} />;
  }

  const authErrorMessage = DISCORD_AUTH_ERROR_MESSAGES[authError] || null;

  return (
    <main className="login-page">
      <section className="login-shell" aria-labelledby="login-title">
        <aside className="login-brand">
          <div className="brand-mark">
            <Shield size={28} />
          </div>
          <div>
            <h1>ENCORE</h1>
            <p>Ragnarok Origin Classic</p>
            <p>Prontera 6</p>
          </div>
          <p className="login-brand-note">
            Guild management.
          </p>
        </aside>
        <section className="login-card">
          <h2 id="login-title">Sign in</h2>
          <p className="login-intro">
            Use your guild account to manage the roster, parties, and auctions.
          </p>
          {authErrorMessage && (
            <p className="form-error" role="alert" style={{ marginTop: 16 }}>
              {authErrorMessage}
            </p>
          )}
          <form onSubmit={submit} className="login-form">
            <label>
              <span>Username</span>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoFocus
                autoComplete="username"
              />
            </label>
            <label>
              <span>Password</span>
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                autoComplete="current-password"
              />
            </label>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button className="primary-button full" disabled={busy}>
              {busy ? (
                <Loader2 className="spin" size={16} />
              ) : (
                <Shield size={16} />
              )}
              Sign in
            </button>
          </form>
          <div className="login-divider">
            <span>or</span>
          </div>
          <div className="login-discord-links">
            <a className="ghost-button" href="/api/auth/discord/start">
              Continue with Discord
            </a>
          </div>
          <button type="button" className="link-button" onClick={() => setMode("local-register")}>
            Register without Discord
          </button>
        </section>
      </section>
    </main>
  );
}

function DiscordRegistrationCompleteScreen() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [charName, setCharName] = useState("");
  const [charClass, setCharClass] = useState("");
  const [classOptions, setClassOptions] = useState([]);
  const [statsForm, setStatsForm] = useState({ video_link: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  function updateStat(key, value) {
    setStatsForm((current) => ({ ...current, [key]: value }));
  }

  // This screen renders before any session exists, so it can't read the
  // JobClassesContext — fetch the public bootstrap directly for its options.
  useEffect(() => {
    let cancelled = false;
    api("/api/public/bootstrap")
      .then((data) => {
        if (cancelled) return;
        const options = data.jobClasses || [];
        setClassOptions(options);
        setCharClass((current) => current || options[0]?.name || "");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit(event) {
    event.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    try {
      await api("/api/auth/discord/register", {
        method: "POST",
        body: JSON.stringify({ username, password, charName, charClass, stats: statsForm }),
      });
      // Registrations land as pending — no session is issued yet, so show a
      // confirmation here instead of calling onRegistered() (which would just
      // bounce back to the login screen since there's still no session cookie).
      setSubmitted(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (submitted) {
    return (
      <main className="login-page">
        <section className="login-shell" aria-labelledby="discord-register-pending-title">
          <aside className="login-brand">
            <div className="brand-mark">
              <Shield size={28} />
            </div>
            <div>
              <h1>ENCORE</h1>
              <p>Ragnarok Origin Classic</p>
              <p>Prontera 6</p>
            </div>
            <p className="login-brand-note">
              Guild management.
            </p>
          </aside>
          <section className="login-card">
            <p className="login-kicker">Registration submitted</p>
            <h2 id="discord-register-pending-title">Awaiting admin approval</h2>
            <p className="login-intro">
              Thanks, {username}! An officer needs to approve your registration
              before you can sign in. Check back soon, or ask a guild officer to
              approve you.
            </p>
            <div className="login-discord-links">
              {/* Plain <a>, not <Link> — this needs a full page reload so the
                  mount-only registerStep query-param read below resets; a
                  client-side Link nav to the same "/" route would just leave
                  this confirmation screen showing. */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- intentional full reload, see comment above */}
              <a className="ghost-button" href="/">
                Back to login
              </a>
            </div>
          </section>
        </section>
      </main>
    );
  }

  return (
    <main className="login-page">
      <section className="login-shell" aria-labelledby="discord-register-title">
        <aside className="login-brand">
          <div className="brand-mark">
            <Shield size={28} />
          </div>
          <div>
            <h1>ENCORE</h1>
            <p>Ragnarok Origin Classic</p>
            <p>Prontera 6</p>
          </div>
          <p className="login-brand-note">
            Guild management.
          </p>
        </aside>
        <section className="login-card">
          <p className="login-kicker">Discord linked</p>
          <h2 id="discord-register-title">Finish registration</h2>
          <p className="login-intro">
            Pick a local username and password, and tell us your character so
            we can add you to the roster.
          </p>
          <form onSubmit={submit} className="login-form">
            <label>
              <span>Username</span>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoFocus
                autoComplete="username"
                maxLength={32}
              />
            </label>
            <label>
              <span>Password</span>
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                autoComplete="new-password"
                minLength={8}
              />
            </label>
            <label>
              <span>Character name</span>
              <input
                value={charName}
                onChange={(event) => setCharName(event.target.value)}
                maxLength={24}
              />
            </label>
            <label>
              <span>Class</span>
              <select
                value={charClass}
                onChange={(event) => setCharClass(event.target.value)}
              >
                {classOptions.map((cls) => (
                  <option key={cls.name} value={cls.name}>
                    {cls.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="wide">
              <h3 className="form-subsection-title">Initial stats submission</h3>
              <p className="field-note">
                An initial stats snapshot is required to join the roster. The
                officers use this to place you correctly in auctions.
              </p>
            </div>
            <StatsFormFields form={statsForm} onChange={updateStat} />
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button className="primary-button full" disabled={busy}>
              {busy ? (
                <Loader2 className="spin" size={16} />
              ) : (
                <Check size={16} />
              )}
              Complete registration
            </button>
          </form>
        </section>
      </section>
    </main>
  );
}

// Local (non-Discord) counterpart to DiscordRegistrationCompleteScreen above —
// same fields/flow (username, password, character, mandatory initial stats,
// "awaiting approval" confirmation), posting to /api/auth/register instead.
// Discord can always be connected afterward from AccountScreen's "Connect
// Discord" button.
function LocalRegistrationCompleteScreen({ onBack }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [charName, setCharName] = useState("");
  const [charClass, setCharClass] = useState("");
  const [classOptions, setClassOptions] = useState([]);
  const [statsForm, setStatsForm] = useState({ video_link: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  function updateStat(key, value) {
    setStatsForm((current) => ({ ...current, [key]: value }));
  }

  // This screen renders before any session exists, so it can't read the
  // JobClassesContext — fetch the public bootstrap directly for its options.
  useEffect(() => {
    let cancelled = false;
    api("/api/public/bootstrap")
      .then((data) => {
        if (cancelled) return;
        const options = data.jobClasses || [];
        setClassOptions(options);
        setCharClass((current) => current || options[0]?.name || "");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit(event) {
    event.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    try {
      await api("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ username, password, charName, charClass, stats: statsForm }),
      });
      // Registrations land as pending — no session is issued yet, so show a
      // confirmation here rather than logging in.
      setSubmitted(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (submitted) {
    return (
      <main className="login-page">
        <section className="login-shell" aria-labelledby="local-register-pending-title">
          <aside className="login-brand">
            <div className="brand-mark">
              <Shield size={28} />
            </div>
            <div>
              <h1>ENCORE</h1>
              <p>Ragnarok Origin Classic</p>
              <p>Prontera 6</p>
            </div>
            <p className="login-brand-note">
              Guild management.
            </p>
          </aside>
          <section className="login-card">
            <p className="login-kicker">Registration submitted</p>
            <h2 id="local-register-pending-title">Awaiting admin approval</h2>
            <p className="login-intro">
              Thanks, {username}! An officer needs to approve your registration
              before you can sign in. Check back soon, or ask a guild officer to
              approve you. You can connect Discord later from your account page.
            </p>
            <div className="login-discord-links">
              <button type="button" className="ghost-button" onClick={onBack}>
                Back to sign in
              </button>
            </div>
          </section>
        </section>
      </main>
    );
  }

  return (
    <main className="login-page">
      <section className="login-shell" aria-labelledby="local-register-title">
        <aside className="login-brand">
          <div className="brand-mark">
            <Shield size={28} />
          </div>
          <div>
            <h1>ENCORE</h1>
            <p>Ragnarok Origin Classic</p>
            <p>Prontera 6</p>
          </div>
          <p className="login-brand-note">
            Guild management.
          </p>
        </aside>
        <section className="login-card">
          <p className="login-kicker">Register</p>
          <h2 id="local-register-title">Create your account</h2>
          <p className="login-intro">
            Pick a username and password, and tell us your character so we can
            add you to the roster. No Discord account is required. You can
            connect one later from your account page if you want to.
          </p>
          <form onSubmit={submit} className="login-form">
            <label>
              <span>Username</span>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoFocus
                autoComplete="username"
                maxLength={32}
              />
            </label>
            <label>
              <span>Password</span>
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                autoComplete="new-password"
                minLength={8}
              />
            </label>
            <label>
              <span>Character name</span>
              <input
                value={charName}
                onChange={(event) => setCharName(event.target.value)}
                maxLength={24}
              />
            </label>
            <label>
              <span>Class</span>
              <select
                value={charClass}
                onChange={(event) => setCharClass(event.target.value)}
              >
                {classOptions.map((cls) => (
                  <option key={cls.name} value={cls.name}>
                    {cls.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="wide">
              <h3 className="form-subsection-title">Initial stats submission</h3>
              <p className="field-note">
                An initial stats snapshot is required to join the roster. The
                officers use this to place you correctly in auctions.
              </p>
            </div>
            <StatsFormFields form={statsForm} onChange={updateStat} />
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button className="primary-button full" disabled={busy}>
              {busy ? (
                <Loader2 className="spin" size={16} />
              ) : (
                <Check size={16} />
              )}
              Complete registration
            </button>
          </form>
          <button type="button" className="link-button" onClick={onBack}>
            Back to sign in
          </button>
        </section>
      </section>
    </main>
  );
}

function ResetPasswordScreen({ username, onReset }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const passwordMismatch =
    newPassword && confirmPassword && newPassword !== confirmPassword;

  async function submit(event) {
    event.preventDefault();
    setError("");
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      await api("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      onReset();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-shell" aria-labelledby="reset-title">
        <aside className="login-brand">
          <div className="brand-mark">
            <Shield size={28} />
          </div>
          <div>
            <h1>ENCORE</h1>
            <p>Ragnarok Origin Classic</p>
            <p>Prontera 6</p>
          </div>
          <p className="login-brand-note">
            Guild management.
          </p>
        </aside>
        <section className="login-card">
          <p className="login-kicker">
            <KeyRound size={14} />
            First sign in
          </p>
          <h2 id="reset-title">Set a new password</h2>
          <p className="login-intro">
            Signed in as {username}. Change the default password before opening
            the dashboard.
          </p>
          <form onSubmit={submit} className="login-form">
            <label>
              <span>Current password</span>
              <input
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                type="password"
                autoFocus
                autoComplete="current-password"
              />
            </label>
            <label>
              <span>New password</span>
              <input
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                type="password"
                autoComplete="new-password"
                minLength={8}
              />
            </label>
            <label>
              <span>Confirm password</span>
              <input
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                type="password"
                autoComplete="new-password"
              />
            </label>
            {(error || passwordMismatch) && (
              <p className="form-error" role="alert">
                {error || "New passwords do not match."}
              </p>
            )}
            <button
              className="primary-button full"
              disabled={busy || passwordMismatch}
            >
              {busy ? (
                <Loader2 className="spin" size={16} />
              ) : (
                <Check size={16} />
              )}
              Save password
            </button>
          </form>
        </section>
      </section>
    </main>
  );
}

function formatStatsTimestamp(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: PH_TIME_ZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

// member_pov_links.recorded_date is a plain DATE column ("YYYY-MM-DD", no time
// or timezone) — re-slicing the string avoids the off-by-one-day bug that
// routing it through `new Date()`/Intl (like formatStatsTimestamp does) would
// risk in a viewer whose local timezone is behind UTC.
function formatDateOnly(value) {
  if (!value) return "";
  const [year, month, day] = String(value).split("-");
  if (!year || !month || !day) return "";
  return `${month}-${day}-${year}`;
}

// Rounding hides small differences that matter when comparing OLD vs UPDATED —
// show the same precision the server stores instead.
function formatStatDecimal(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num.toFixed(2) : "-";
}

// Field lists mirror app/api/member-stats/route.js's CORE_NUMERIC_FIELDS /
// OPTIONAL_NUMERIC_FIELDS exactly — used by both the submission form and the
// admin/member read-only history views. Labels use PDEF/MDEF/PDMG/MDMG
// (uppercase, no periods) per the in-game stat naming convention.
const STATS_CORE_FIELDS = [
  { key: "hp", label: "HP" },
  { key: "patk_matk", label: "P.Atk / M.Atk" },
  { key: "pdef", label: "PDEF" },
  { key: "mdef", label: "MDEF" },
  { key: "equipment_pdef", label: "Equipment PDEF" },
  { key: "equipment_mdef", label: "Equipment MDEF" },
  { key: "equipment_pdef_pct", label: "Equipment PDEF %" },
  { key: "equipment_mdef_pct", label: "Equipment MDEF %" },
];


// The subset of stats worth flagging when they change between the OLD and
// UPDATED submissions — the rest are tracked but not important enough to
// highlight (would be too noisy). All ten are "higher is better" stats, so
// up = green (improved), down = red (regressed) holds consistently.
const PRIORITY_STAT_KEYS = new Set([
  "pdef",
  "mdef",
  "equipment_pdef",
  "equipment_mdef",
  "equipment_pdef_pct",
  "equipment_mdef_pct",
  "effective_pdef",
  "effective_mdef",
  "pdmg_reduction",
  "mdmg_reduction",
]);

// Tiny diffs are float noise from the equipment-% formula, not a real change.
function compareStatTrend(current, previous) {
  const a = Number(current);
  const b = Number(previous);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const diff = a - b;
  if (Math.abs(diff) < 0.005) return null;
  return diff > 0 ? "up" : "down";
}

// One trend per priority field, computed once from the (newer, older) pair —
// "up" means the newer submission is the bigger (better) number for that
// stat. Shared by both history cards, which read it like a comparison chart:
// whichever row actually holds the bigger number is the "winner" for that
// field, regardless of which card (OLD or UPDATED) it happens to be in — see
// StatTrendValue's `invert` handling.
function buildStatTrends(newerRow, olderRow) {
  const trends = {};
  if (!newerRow || !olderRow) return trends;
  for (const key of PRIORITY_STAT_KEYS) {
    trends[key] = compareStatTrend(newerRow[key], olderRow[key]);
  }
  return trends;
}

function invertTrend(trend) {
  if (trend === "up") return "down";
  if (trend === "down") return "up";
  return null;
}

const STATS_OPTIONAL_GROUPS = [
  {
    title: "Damage & reduction",
    fields: [
      { key: "pdmg_mdmg", label: "PDMG / MDMG" },
      { key: "pdmg_reduction", label: "PDMG reduction" },
      { key: "mdmg_reduction", label: "MDMG reduction" },
      { key: "ignore_pdef", label: "Ignore PDEF" },
      { key: "ignore_mdef", label: "Ignore MDEF" },
    ],
  },
  {
    title: "Healing & PvP",
    fields: [
      { key: "healing_done", label: "Healing done" },
      { key: "healing_taken", label: "Healing taken" },
      { key: "pvp_dmg_bonus", label: "PvP damage bonus" },
      { key: "pvp_dmg_reduction", label: "PvP damage reduction" },
    ],
  },
  {
    title: "Crit",
    fields: [
      { key: "crit", label: "Crit" },
      { key: "crit_dmg", label: "Crit damage" },
      { key: "crit_res", label: "Crit resistance" },
      { key: "crit_dmg_res", label: "Crit damage resistance" },
    ],
  },
  {
    title: "Race matchups",
    fields: [
      { key: "dmg_vs_small", label: "Dmg vs Small" },
      { key: "dmg_reduction_vs_small", label: "Dmg reduction vs Small" },
      { key: "dmg_vs_medium", label: "Dmg vs Medium" },
      { key: "dmg_reduction_vs_medium", label: "Dmg reduction vs Medium" },
      { key: "dmg_vs_large", label: "Dmg vs Large" },
      { key: "dmg_reduction_vs_large", label: "Dmg reduction vs Large" },
      { key: "dmg_vs_brute", label: "Dmg vs Brute" },
      { key: "dmg_reduction_vs_brute", label: "Dmg reduction vs Brute" },
      { key: "dmg_vs_demi_human", label: "Dmg vs Demi-Human" },
      {
        key: "dmg_reduction_vs_demi_human",
        label: "Dmg reduction vs Demi-Human",
      },
    ],
  },
];

// Column groups for the admin "all stats" table view — built from the same
// core/optional field lists the history cards and form use, so the full-sheet
// table can't drift out of sync with them. Rendered as a grouped header (one
// spanning title per group, e.g. "Damage & reduction") so ~35 columns read as
// distinct sections instead of one undifferentiated wall of numbers.
const STATS_ALL_TABLE_GROUPS = [
  {
    title: "Core & Effective",
    fields: [
      ...STATS_CORE_FIELDS,
      { key: "effective_pdef", label: "Effective PDEF" },
      { key: "effective_mdef", label: "Effective MDEF" },
    ],
  },
  ...STATS_OPTIONAL_GROUPS,
];
const STATS_ALL_TABLE_FIELDS = STATS_ALL_TABLE_GROUPS.flatMap((group) => group.fields);

function csvCell(value) {
  const str = String(value ?? "");
  return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

// Snapshot rows to include per member for a given export mode. "both" emits
// two labeled rows per member (Updated, then Old) rather than doubling every
// column, since each snapshot already carries its own timestamp/damage type.
function statsSnapshotsForMode(row, mode) {
  if (mode === "both") return [["Updated", row.latest], ["Old", row.previous]];
  if (mode === "previous") return [["Old", row.previous]];
  return [["Updated", row.latest]];
}

function statsCsvRow(charName, charClass, snapshotLabel, stats, includeSnapshotColumn) {
  const damageType = stats?.damage_type === "magic" ? "Magic" : stats?.damage_type === "physical" ? "Physical" : "";
  return [
    charName,
    charClass,
    ...(includeSnapshotColumn ? [snapshotLabel] : []),
    damageType,
    stats ? formatStatsTimestamp(stats.submitted_at) : "",
    ...STATS_ALL_TABLE_FIELDS.map((field) => {
      if (!stats) return "";
      if (field.key === "effective_pdef" || field.key === "effective_mdef") {
        return formatStatDecimal(stats[field.key]);
      }
      return stats[field.key] ?? "";
    }),
    stats?.video_link || "",
  ];
}

// Always exports the full roster passed in (not just a search-filtered
// subset) so the file matches what's actually on the live sheet. `mode` is
// "latest" (Updated only), "previous" (Old only), or "both" (Updated + Old,
// two rows per member).
function buildStatsCsv(summary, mode) {
  const includeSnapshotColumn = mode === "both";
  const header = [
    "Member",
    "Class",
    ...(includeSnapshotColumn ? ["Submission"] : []),
    "Damage type",
    "Last submitted",
    ...STATS_ALL_TABLE_FIELDS.map((field) => field.label),
    "Proof video link",
  ];
  const rows = summary.flatMap((row) =>
    statsSnapshotsForMode(row, mode).map(([label, stats]) =>
      statsCsvRow(row.char_name, row.char_class, label, stats, includeSnapshotColumn),
    ),
  );
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}

function downloadCsv(filename, csvContent) {
  // Leading BOM so Excel (the primary target here) doesn't guess the wrong
  // encoding and mangle anything non-ASCII.
  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Mirrors the server-side formula in lib/memberStats.js's buildStatsRow — kept
// in sync manually since this one runs client-side for a live preview only;
// the server always recomputes and persists the authoritative value.
function computeEffectiveDef(rawDef, pct) {
  const def = Number(rawDef);
  const pctNum = Number(pct);
  if (!Number.isFinite(def) || !Number.isFinite(pctNum)) return null;
  const denom = 100 + pctNum;
  if (denom === 0) return null;
  return (def * 100) / denom;
}

// Shared body of the stats form — the damage-type picker, the Core stats grid,
// the STATS_OPTIONAL_GROUPS blocks, and the required proof-video input. Used
// both by MemberStatsForm (the post-approval self-service modal) and
// DiscordRegistrationCompleteScreen (the mandatory initial submission collected
// during registration), so the ~38-field layout only exists once.
function StatsFormFields({ form, onChange }) {
  const effectivePdef = computeEffectiveDef(form.equipment_pdef, form.equipment_pdef_pct);
  const effectiveMdef = computeEffectiveDef(form.equipment_mdef, form.equipment_mdef_pct);

  return (
    <>
      <label>
        <span>Damage type</span>
        <select
          value={form.damage_type || ""}
          onChange={(event) => onChange("damage_type", event.target.value)}
          required
        >
          <option value="" disabled>
            Select physical or magic
          </option>
          <option value="physical">Physical</option>
          <option value="magic">Magic</option>
        </select>
      </label>
      <div className="wide">
        <h3 className="form-subsection-title">Core stats</h3>
        <div className="auction-form-items">
          {STATS_CORE_FIELDS.map((field) => (
            <label key={field.key}>
              <span>{field.label}</span>
              <input
                type="number"
                step="any"
                inputMode="decimal"
                value={form[field.key] ?? ""}
                onChange={(event) => onChange(field.key, event.target.value)}
                required
              />
            </label>
          ))}
        </div>
        <p className="field-note">
          Effective PDEF/MDEF are calculated automatically from the
          equipment values above.
        </p>
        <div className="auction-form-items compact">
          <div className="stats-history-field">
            <span>Effective PDEF</span>
            <strong>{effectivePdef === null ? "-" : formatStatDecimal(effectivePdef)}</strong>
          </div>
          <div className="stats-history-field">
            <span>Effective MDEF</span>
            <strong>{effectiveMdef === null ? "-" : formatStatDecimal(effectiveMdef)}</strong>
          </div>
        </div>
      </div>
      {STATS_OPTIONAL_GROUPS.map((group) => (
        <div className="wide" key={group.title}>
          <h3 className="form-subsection-title">{group.title}</h3>
          <div className="auction-form-items">
            {group.fields.map((field) => (
              <label key={field.key}>
                <span>{field.label}</span>
                <input
                  type="number"
                  step="any"
                  inputMode="decimal"
                  value={form[field.key] ?? ""}
                  onChange={(event) => onChange(field.key, event.target.value)}
                />
              </label>
            ))}
          </div>
        </div>
      ))}
      <label className="wide">
        <span>Proof video link</span>
        <div className="stats-video-row">
          <input
            value={form.video_link}
            onChange={(event) => onChange("video_link", event.target.value)}
            placeholder="https://..."
            required
          />
          <a
            className="ghost-button"
            href={ensureAbsoluteUrl(form.video_link) || undefined}
            target="_blank"
            rel="noreferrer noopener"
            aria-disabled={!form.video_link}
            onClick={(event) => {
              if (!form.video_link) event.preventDefault();
            }}
          >
            <ExternalLink size={14} />
            Open
          </a>
        </div>
      </label>
    </>
  );
}

// Inline on AccountScreen (not a modal) so it's as easy to find as the POV
// submission form on PovListScreen. onSave should resolve to true on a
// successful submit, false on failure, matching PovLinkSubmitForm's contract
// so the form only clears itself once the submission actually went through.
//
// `initial`, when given (editing the UPDATED row — see StatsHistoryCard's
// onEdit), prefills every field from that row instead of starting blank, and
// the form isn't reset back to empty after a successful save (there's nothing
// to "clear" when editing an existing entry, unlike a fresh submission).
function MemberStatsForm({ charClass, onSave, busy, initial, submitLabel = "Submit stats", onCancel }) {
  // AccountScreen (the only caller) renders for member-role sessions, which
  // never load the admin bootstrap — so JobClassesContext is empty here.
  // Fetch the public bootstrap directly for the class list instead, same as
  // DiscordRegistrationCompleteScreen does pre-auth.
  const [classOrder, setClassOrder] = useState([]);
  const [form, setForm] = useState(() =>
    initial ? { ...initial, char_class: initial.char_class || charClass || "" } : { video_link: "", char_class: charClass || "" },
  );

  useEffect(() => {
    let cancelled = false;
    api("/api/public/bootstrap")
      .then((data) => {
        if (cancelled) return;
        setClassOrder((data.jobClasses || []).map((cls) => cls.name));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    const ok = await onSave(form);
    if (ok && !initial) setForm({ video_link: "", char_class: charClass || "" });
  }

  return (
    <form onSubmit={submit} className="form-grid">
      <label>
        <span>Class</span>
        <select value={form.char_class} onChange={(event) => update("char_class", event.target.value)} required>
          {/* Covers a class the account currently holds that isn't in the live list anymore
              (e.g. renamed/removed), so the select never silently drops the current value. */}
          {form.char_class && !classOrder.includes(form.char_class) && (
            <option value={form.char_class}>{form.char_class}</option>
          )}
          {classOrder.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <p className="field-note">
          Changing this updates your roster class immediately.
        </p>
      </label>
      <StatsFormFields form={form} onChange={update} />
      <div className="form-actions wide">
        <button className="primary-button" disabled={busy}>
          {busy ? <Loader2 className="spin" size={15} /> : <Check size={15} />}
          {submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="ghost-button" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

// Renders one stat's value per the shared `trends` map (see buildStatTrends),
// read like a comparison chart: the row with the bigger number is the
// "winner" for that field and gets green + an up arrow, the smaller one is
// the "loser" and gets red + a down arrow — on BOTH cards. `trends` is always
// computed as (UPDATED, OLD), so the OLD card passes `invert` to flip that
// into its own perspective instead of reusing UPDATED's direction verbatim.
function StatTrendValue({ fieldKey, value, trends, invert }) {
  const rawTrend = trends?.[fieldKey] || null;
  const trend = invert ? invertTrend(rawTrend) : rawTrend;
  if (!trend) return <strong>{value ?? "-"}</strong>;
  return (
    <strong className={`stat-trend stat-trend-${trend}`}>
      {trend === "up" && <ArrowUp size={12} />}
      {trend === "down" && <ArrowDown size={12} />}
      {value ?? "-"}
    </strong>
  );
}

// label: "updated" for the most recent of the (up to 2) kept submissions, "old"
// for the previous one — passed by the caller based on position in the
// already-newest-first `stats` array, not derived here. `trends`, when given,
// is the shared per-field up/down map (see buildStatTrends), always computed
// as (UPDATED, OLD) — the OLD card passes `invert` so each priority stat is
// colored from its own row's perspective (bigger number = green/winner,
// smaller = red/loser), like a head-to-head comparison chart.
function StatsHistoryCard({ row, label, trends, onEdit }) {
  const isOld = label !== "updated";
  return (
    <article className={`stats-history-card ${isOld ? "" : "is-updated"}`}>
      <header>
        <div className="stats-history-top">
          <div className="stats-history-heading">
            <span className={`history-badge ${label === "updated" ? "is-updated" : "is-old"}`}>
              {label === "updated" ? "UPDATED" : "OLD"}
            </span>
            <strong>{formatStatsTimestamp(row.submitted_at)}</strong>
          </div>
          <div className="stats-history-actions">
            <a
              className="ghost-button stats-video-button"
              href={ensureAbsoluteUrl(row.video_link)}
              target="_blank"
              rel="noreferrer noopener"
            >
              <ExternalLink size={13} />
              Video Proof
            </a>
            {/* Only the UPDATED (latest) row is ever editable — OLD is kept
                strictly for reference/comparison, so it gets no edit affordance.
                Its own accent color keeps it from being mistaken for the
                Video Proof link at a glance. */}
            {!isOld && onEdit && (
              <button type="button" className="ghost-button stats-edit-button" onClick={onEdit}>
                <Pencil size={13} />
                Edit
              </button>
            )}
          </div>
        </div>
        <div className="stats-history-meta">
          <span className="field-note">
            {row.damage_type === "magic" ? "Magic" : row.damage_type === "physical" ? "Physical" : "-"}
          </span>
        </div>
      </header>
      <div className="auction-form-items compact">
        {STATS_CORE_FIELDS.map((field) => (
          <div className="stats-history-field" key={field.key}>
            <span>{field.label}</span>
            <StatTrendValue fieldKey={field.key} value={row[field.key]} trends={trends} invert={isOld} />
          </div>
        ))}
        <div className="stats-history-field">
          <span>Effective PDEF</span>
          <StatTrendValue
            fieldKey="effective_pdef"
            value={formatStatDecimal(row.effective_pdef)}
            trends={trends}
            invert={isOld}
          />
        </div>
        <div className="stats-history-field">
          <span>Effective MDEF</span>
          <StatTrendValue
            fieldKey="effective_mdef"
            value={formatStatDecimal(row.effective_mdef)}
            trends={trends}
            invert={isOld}
          />
        </div>
      </div>
      {STATS_OPTIONAL_GROUPS.map((group) => (
        <div key={group.title}>
          <h4 className="form-subsection-title">{group.title}</h4>
          <div className="auction-form-items compact">
            {group.fields.map((field) => (
              <div className="stats-history-field" key={field.key}>
                <span>{field.label}</span>
                <StatTrendValue fieldKey={field.key} value={row[field.key]} trends={trends} invert={isOld} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </article>
  );
}

function AccountScreen() {
  const [account, setAccount] = useState(() => accountCache?.data || null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(!accountCache);
  const [stats, setStats] = useState(() => accountStatsCache?.data || []);
  const [statsLoading, setStatsLoading] = useState(!accountStatsCache);
  const [statsNotice, setStatsNotice] = useState(null);
  const [statsFormCollapsed, setStatsFormCollapsed] = useState(true);
  const [editingStats, setEditingStats] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [linkNotice, setLinkNotice] = useState(null);
  const [nameEditing, setNameEditing] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const [nameSaving, setNameSaving] = useState(false);
  const [nameError, setNameError] = useState("");
  const [visibilitySaving, setVisibilitySaving] = useState(false);

  // Same cache-then-refresh-if-stale pattern as PublicStatsBoardScreen — a
  // member bouncing between pages (account -> stats -> account) shouldn't
  // re-fetch their own profile every single time.
  function loadAccount() {
    const cached = accountCache;
    const cacheIsFresh = cached && Date.now() - cached.loadedAt < DASHBOARD_CACHE_MAX_AGE_MS;
    if (cached) setAccount(cached.data);
    if (cacheIsFresh) return Promise.resolve();
    if (!cached) setLoading(true);
    return api("/api/account")
      .then((data) => {
        accountCache = { data, loadedAt: Date.now() };
        setAccount(data);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadAccount();
  }, []);

  // "Connect Discord" round-trips through a full-page redirect
  // (app/api/auth/discord/link/start -> Discord -> callback -> here), so read
  // its result off the URL once on mount rather than local component state.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const linkSuccess = params.get("linkSuccess");
    const linkError = params.get("linkError");
    if (linkSuccess) {
      setLinkNotice({ type: "success", message: "Discord account connected." });
    } else if (linkError) {
      const messages = {
        already_linked_elsewhere: "That Discord account is already connected to a different guild account.",
        already_linked: "Your account is already connected to Discord.",
        link_failed: "Could not connect your Discord account. Please try again.",
      };
      setLinkNotice({ type: "error", message: messages[linkError] || messages.link_failed });
    }
    if (linkSuccess || linkError) {
      const url = new URL(window.location.href);
      url.searchParams.delete("linkSuccess");
      url.searchParams.delete("linkError");
      window.history.replaceState({}, "", url);
    }
  }, []);

  function loadStats() {
    const cached = accountStatsCache;
    const cacheIsFresh = cached && Date.now() - cached.loadedAt < DASHBOARD_CACHE_MAX_AGE_MS;
    if (cached) setStats(cached.data);
    if (cacheIsFresh) return Promise.resolve();
    if (!cached) setStatsLoading(true);
    return api("/api/member-stats")
      .then((data) => {
        accountStatsCache = { data: data.stats || [], loadedAt: Date.now() };
        setStats(accountStatsCache.data);
      })
      .catch((err) => setStatsNotice({ type: "error", message: err.message }))
      .finally(() => setStatsLoading(false));
  }

  useEffect(() => {
    loadStats();
  }, []);

  async function submitStats(payload) {
    setSubmitting(true);
    setStatsNotice(null);
    try {
      await api("/api/member-stats", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setStatsNotice({ type: "success", message: "Stats submitted." });
      // Data just changed server-side — invalidate the caches so loadStats/
      // loadAccount actually refetch instead of re-serving a still-fresh
      // pre-submission snapshot.
      accountStatsCache = null;
      accountCache = null;
      loadStats();
      // A submission can also change char_class — refresh so "Your account" reflects it.
      loadAccount();
      return true;
    } catch (err) {
      setStatsNotice({ type: "error", message: err.message });
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  // Corrects the UPDATED row in place (see StatsHistoryCard's onEdit) rather
  // than adding a new submission — OLD is left untouched either way, since
  // the API always resolves "latest" itself and never targets anything else.
  async function updateStats(payload) {
    setSubmitting(true);
    setStatsNotice(null);
    try {
      const data = await api("/api/member-stats", {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      setStatsNotice({ type: "success", message: "Stats updated." });
      // Splice the server's saved row straight into local state instead of
      // waiting on a refetch — the OLD/UPDATED comparison (statTrends below)
      // is keyed off `stats`, so this guarantees it's diffing the actual
      // saved values the instant the form closes, with no window where a
      // stale pre-edit row could still be what's being compared against OLD.
      setStats((current) => {
        const next = [...current];
        next[0] = data.stats;
        return next;
      });
      // Still invalidate + refetch in the background to reconcile with the
      // server as source of truth (e.g. picks up a char_class change).
      accountStatsCache = null;
      accountCache = null;
      loadStats();
      loadAccount();
      setEditingStats(false);
      return true;
    } catch (err) {
      setStatsNotice({ type: "error", message: err.message });
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  const statTrends = useMemo(() => buildStatTrends(stats[0], stats[1]), [stats]);

  function startEditingName() {
    setNameValue(account.member.char_name);
    setNameError("");
    setNameEditing(true);
  }

  function cancelEditingName() {
    setNameEditing(false);
    setNameError("");
  }

  async function saveName() {
    const trimmed = nameValue.trim();
    if (!trimmed) {
      setNameError("Character name is required.");
      return;
    }
    if (trimmed === account.member.char_name) {
      setNameEditing(false);
      return;
    }
    setNameSaving(true);
    setNameError("");
    try {
      const data = await api("/api/account", {
        method: "PATCH",
        body: JSON.stringify({ charName: trimmed }),
      });
      setAccount((current) => {
        const next = { ...current, member: { ...current.member, ...data.member } };
        accountCache = { data: next, loadedAt: Date.now() };
        return next;
      });
      setNameEditing(false);
    } catch (err) {
      setNameError(err.message);
    } finally {
      setNameSaving(false);
    }
  }

  async function toggleShowStatsPublicly(checked) {
    setVisibilitySaving(true);
    try {
      const data = await api("/api/account", {
        method: "PATCH",
        body: JSON.stringify({ showStatsPublicly: checked }),
      });
      setAccount((current) => {
        const next = { ...current, member: { ...current.member, ...data.member } };
        accountCache = { data: next, loadedAt: Date.now() };
        return next;
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setVisibilitySaving(false);
    }
  }

  if (loading) {
    return (
      <div className="loading-panel">
        <Loader2 className="spin" size={20} />
        Loading account
      </div>
    );
  }

  if (error || !account) {
    return (
      <div className="alert-panel">
        <AlertTriangle size={17} />
        <span>{error || "Could not load your account."}</span>
      </div>
    );
  }

  const roleLabel =
    account.role === "super_admin"
      ? "super admin"
      : account.role === "member"
        ? "member"
        : "admin";

  return (
    <>
      <section className="audit-page">
        <div className="section-heading">
          <div>
            <p className="eyebrow">account</p>
            <h2>Your account</h2>
            <p>Identity and linked character details.</p>
          </div>
        </div>
        {linkNotice && (
          <div className={linkNotice.type === "error" ? "alert-panel" : "success-panel"}>
            {linkNotice.type === "error" ? <AlertTriangle size={17} /> : <Check size={17} />}
            <span>{linkNotice.message}</span>
            <button onClick={() => setLinkNotice(null)}>Dismiss</button>
          </div>
        )}
        <div className="form-grid">
          <label>
            <span>Username</span>
            <input value={account.username} disabled />
          </label>
          <label>
            <span>Role</span>
            <input value={roleLabel} disabled />
          </label>
          <label>
            <span>Discord</span>
            {account.discordLinked ? (
              <input value="Connected" disabled />
            ) : (
              <a className="ghost-button" href="/api/auth/discord/link/start">
                Connect Discord
              </a>
            )}
          </label>
          {account.member ? (
            <>
              <label>
                <span>Character name</span>
                <div className="field-with-action">
                  <input
                    value={nameEditing ? nameValue : account.member.char_name}
                    disabled={!nameEditing || nameSaving}
                    onChange={(event) => setNameValue(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") saveName();
                      if (event.key === "Escape") cancelEditingName();
                    }}
                    autoFocus={nameEditing}
                    maxLength={24}
                  />
                  {nameEditing ? (
                    <>
                      <button
                        type="button"
                        className="icon-button"
                        onClick={saveName}
                        disabled={nameSaving}
                        aria-label="Save character name"
                      >
                        {nameSaving ? <Loader2 className="spin" size={15} /> : <Check size={15} />}
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        onClick={cancelEditingName}
                        disabled={nameSaving}
                        aria-label="Cancel"
                      >
                        <X size={15} />
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="icon-button"
                      onClick={startEditingName}
                      aria-label="Rename character"
                    >
                      <Pencil size={15} />
                    </button>
                  )}
                </div>
                {nameError && <span className="field-error">{nameError}</span>}
              </label>
              <label>
                <span>Class</span>
                <input value={account.member.char_class} disabled />
              </label>
              <label className="checkbox-row wide">
                <input
                  type="checkbox"
                  checked={Boolean(account.member.show_stats_publicly)}
                  disabled={visibilitySaving}
                  onChange={(event) => toggleShowStatsPublicly(event.target.checked)}
                />
                <span>Show my stats on the Public Stats board.</span>
              </label>
            </>
          ) : (
            <p>No character is linked to this account yet.</p>
          )}
        </div>
      </section>
      {account.member && (
        <>
          <section className="content-section stats-submit-panel" aria-label="Submit new stats">
            <button
              type="button"
              className="stats-submit-toggle"
              onClick={() => setStatsFormCollapsed((current) => !current)}
              aria-expanded={!statsFormCollapsed}
            >
              <span className="stats-submit-toggle-heading">
                <p className="eyebrow">weekly stats</p>
                <h2>Submit new stats</h2>
                <p>Your last 2 submissions are kept.</p>
              </span>
              <span className="ghost-button stats-submit-toggle-button">
                {statsFormCollapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
                {statsFormCollapsed ? "Update stats" : "Collapse"}
              </span>
            </button>
            {!statsFormCollapsed && (
              <>
                {statsNotice && (
                  <div className={statsNotice.type === "error" ? "alert-panel" : "success-panel"}>
                    {statsNotice.type === "error" ? <AlertTriangle size={17} /> : <Check size={17} />}
                    <span>{statsNotice.message}</span>
                    <button onClick={() => setStatsNotice(null)}>Dismiss</button>
                  </div>
                )}
                <MemberStatsForm
                  charClass={account.member.char_class}
                  onSave={submitStats}
                  busy={submitting}
                />
              </>
            )}
          </section>
          <section className="content-section" aria-label="Your stats">
            <div className="section-heading">
              <div>
                <p className="eyebrow">history</p>
                <h2>Your stats</h2>
                <p>Your last 2 submissions.</p>
              </div>
            </div>
            {statsLoading ? (
              <div className="loading-panel">
                <Loader2 className="spin" size={20} />
                Loading stats
              </div>
            ) : stats.length === 0 ? (
              <div className="empty-panel">
                You haven&apos;t submitted any stats yet.
              </div>
            ) : (
              <div className="stats-history">
                {stats.map((row, index) =>
                  index === 0 && editingStats ? (
                    <div className="stats-history-edit" key={row.id}>
                      {statsNotice && (
                        <div className={statsNotice.type === "error" ? "alert-panel" : "success-panel"}>
                          {statsNotice.type === "error" ? <AlertTriangle size={17} /> : <Check size={17} />}
                          <span>{statsNotice.message}</span>
                          <button onClick={() => setStatsNotice(null)}>Dismiss</button>
                        </div>
                      )}
                      <MemberStatsForm
                        charClass={account.member.char_class}
                        initial={row}
                        submitLabel="Save changes"
                        onSave={updateStats}
                        onCancel={() => setEditingStats(false)}
                        busy={submitting}
                      />
                    </div>
                  ) : (
                    <StatsHistoryCard
                      row={row}
                      label={index === 0 ? "updated" : "old"}
                      trends={statTrends}
                      onEdit={index === 0 ? () => setEditingStats(true) : undefined}
                      key={row.id}
                    />
                  ),
                )}
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}

function Modal({ title, children, footer, onClose, size = "default" }) {
  const panelRef = useRef(null);
  const openerRef = useRef(
    typeof document === "undefined" ? null : document.activeElement,
  );
  useEffect(() => {
    const previousFocus = openerRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (!panelRef.current?.contains(document.activeElement))
      panelRef.current?.focus();
    const trapFocus = (event) => {
      if (event.key !== "Tab") return;
      const controls = [
        ...panelRef.current.querySelectorAll(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]',
        ),
      ].filter((element) => element.getClientRects().length);
      const first = controls[0];
      const last = controls.at(-1);
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          document.activeElement === panelRef.current)
      ) {
        event.preventDefault();
        last?.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          document.activeElement === panelRef.current)
      ) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", trapFocus);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", trapFocus);
      previousFocus?.focus();
    };
  }, []);
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="modal-layer"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        className="modal-backdrop"
        onClick={onClose}
        aria-label="Close dialog"
        tabIndex={-1}
      />
      <section
        ref={panelRef}
        tabIndex={-1}
        className={`modal-card${size === "sm" ? " modal-sm" : ""}${size === "lg" ? " modal-lg" : ""}`}
      >
        <header className="modal-header">
          <h2>{title}</h2>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-footer">{footer}</footer>}
      </section>
    </div>
  );
}

function formatAuditDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: PH_TIME_ZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function prettifyAction(action) {
  return String(action || "")
    .replaceAll(".", " ")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function AuditLogsTable({ logs }) {
  if (!logs.length) {
    return (
      <div className="empty-panel compact">
        No updates have been logged yet.
      </div>
    );
  }

  return (
    <div className="audit-table-wrap">
      <table className="audit-table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Who</th>
            <th>Role</th>
            <th>Action</th>
            <th>What changed</th>
            <th>Target</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log.id}>
              <td>
                <time>{formatAuditDate(log.created_at)}</time>
              </td>
              <td>{log.actor_username}</td>
              <td>
                {log.actor_role === "super_admin" ? "super admin" : "admin"}
              </td>
              <td>{prettifyAction(log.action)}</td>
              <td>{log.summary || "-"}</td>
              <td>
                {log.target_type
                  ? `${log.target_type}${log.target_id ? ` · ${String(log.target_id).slice(0, 8)}` : ""}`
                  : "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ConfirmModal({
  title,
  body,
  confirmLabel = "Confirm",
  tone = "danger",
  onCancel,
  onConfirm,
  busy,
}) {
  return (
    <Modal title={title} onClose={onCancel}>
      <div className="confirm-body">
        <div
          className={tone === "danger" ? "confirm-icon danger" : "confirm-icon"}
        >
          <AlertTriangle size={18} />
        </div>
        <p>{body}</p>
      </div>
      <div className="form-actions wide">
        <button type="button" className="ghost-button" onClick={onCancel}>
          Cancel
        </button>
        <button
          className={tone === "danger" ? "danger-button" : "primary-button"}
          onClick={onConfirm}
          disabled={busy}
        >
          {busy ? <Loader2 className="spin" size={15} /> : <Check size={15} />}
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

function MemberForm({
  groups,
  auctionItems = [],
  auctionState = null,
  initial,
  onCancel,
  onSave,
  onCatchUp,
  busy,
}) {
  const { classes } = useJobClasses();
  const joinedParts = toPhDateTimeParts(initial?.joined_at) || {};
  const cappedAuctionItems = auctionItems.filter(
    (item) => item.gates_round_completion,
  );
  const sharedCaps = auctionState?.itemCaps || {};
  // Frozen at mount (not recomputed from the live auctionState prop on every
  // render) so a background dashboard refresh while this modal is open can't
  // make memberCapOverridesChanged below look true just because auctionState
  // changed out from under it. That false "changed" reading was sending a
  // memberCapOverrides payload on every edit (even ones that only touched
  // unrelated fields like joined date), which 400'd with "Create an auction
  // lineup..." whenever the round had since ended.
  const [initialMemberCapOverrides] = useState(() => {
    const savedMemberCaps = auctionState?.memberCapOverrides?.[initial?.id] || {};
    return Object.fromEntries(
      cappedAuctionItems.map((item) => [
        item.item_key,
        savedMemberCaps[item.item_key] === undefined
          ? ""
          : String(savedMemberCaps[item.item_key]),
      ]),
    );
  });
  const [form, setForm] = useState(() => ({
    ...emptyMember,
    ...initial,
    group_id: initial?.group_id || "",
    joined_date: joinedParts.date || "",
    joined_time: joinedParts.time || "",
    notes: initial?.notes || "",
    memberCapOverrides: initialMemberCapOverrides,
  }));

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateMemberCap(itemKey, value) {
    setForm((current) => ({
      ...current,
      memberCapOverrides: {
        ...(current.memberCapOverrides || {}),
        [itemKey]: value,
      },
    }));
  }

  function submit(event) {
    event.preventDefault();
    const memberCapOverridesChanged =
      JSON.stringify(form.memberCapOverrides || {}) !==
      JSON.stringify(initialMemberCapOverrides);
    onSave({
      ...form,
      group_id: form.group_id || null,
      joined_at: toIsoTimestamp(form.joined_date, form.joined_time),
      ...(initial?.id && auctionState?.activeRound && memberCapOverridesChanged
        ? { memberCapOverrides: form.memberCapOverrides || {} }
        : {}),
    });
  }

  return (
    <form onSubmit={submit} className="form-grid">
      <label>
        <span>Character name</span>
        <input
          value={form.char_name}
          onChange={(event) => update("char_name", event.target.value)}
          required
          maxLength={24}
        />
      </label>
      <label>
        <span>Class</span>
        <select
          value={form.char_class}
          onChange={(event) => update("char_class", event.target.value)}
          required
        >
          {classes.map((cls) => (
            <option key={cls.name} value={cls.name}>
              {cls.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Party group</span>
        <select
          value={form.group_id || ""}
          onChange={(event) => update("group_id", event.target.value)}
        >
          <option value="">Unassigned</option>
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </select>
      </label>
      <label className="checkbox-row wide">
        <input
          type="checkbox"
          checked={Boolean(form.is_officer)}
          onChange={(event) => update("is_officer", event.target.checked)}
        />
        <span>Officer - does not need to log out when unallocated</span>
      </label>
      <label className="checkbox-row wide">
        <input
          type="checkbox"
          checked={Boolean(form.auction_priority_override)}
          onChange={(event) =>
            update("auction_priority_override", event.target.checked)
          }
        />
        <span>Feather priority. Receives L&D and T&S in every auction.</span>
      </label>
      {initial?.id &&
        auctionState?.activeRound &&
        cappedAuctionItems.length > 0 && (
          <div className="member-cap-overrides wide">
            <div className="member-cap-header">
              <span>Auction limit override</span>
              <em>Blank follows auction/default limit</em>
            </div>
            <div className="auction-form-items compact">
              {cappedAuctionItems.map((item) => (
                <label key={item.id}>
                  <span>{item.short_name} member limit</span>
                  <input
                    type="number"
                    min="0"
                    placeholder={`Shared ${sharedCaps[item.item_key] ?? item.default_per_round_cap ?? 0}`}
                    value={form.memberCapOverrides?.[item.item_key] ?? ""}
                    onChange={(event) =>
                      updateMemberCap(item.item_key, event.target.value)
                    }
                  />
                </label>
              ))}
            </div>
          </div>
        )}
      <label className="wide">
        <span>Joined date/time</span>
        <div className="joined-fields">
          <input
            type="date"
            value={form.joined_date || ""}
            onChange={(event) => update("joined_date", event.target.value)}
            aria-label="Joined date"
          />
          <input
            type="time"
            value={form.joined_time || ""}
            onChange={(event) => update("joined_time", event.target.value)}
            aria-label="Joined time"
          />
        </div>
        <p className="field-note">
          Used for the 96h auction cooldown. Enter PH local time.
        </p>
      </label>
      <label className="wide">
        <span>Notes</span>
        <textarea
          rows={3}
          value={form.notes || ""}
          onChange={(event) => update("notes", event.target.value)}
        />
      </label>
      <div className="form-actions wide">
        <button type="button" className="ghost-button" onClick={onCancel}>
          Cancel
        </button>
        {initial?.id && (
          <button
            type="button"
            className="ghost-button"
            onClick={() => onCatchUp?.(initial)}
            disabled={busy}
          >
            <RefreshCw size={15} />
            Catch up cycles
          </button>
        )}
        <button className="primary-button" disabled={busy}>
          {busy ? <Loader2 className="spin" size={15} /> : <Check size={15} />}
          Save member
        </button>
      </div>
    </form>
  );
}

function GroupForm({ initial, onCancel, onSave, busy }) {
  const [name, setName] = useState(initial?.name || "");

  function submit(event) {
    event.preventDefault();
    onSave({ name });
  }

  return (
    <form onSubmit={submit} className="form-grid single">
      <label>
        <span>Group name</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          autoFocus
        />
      </label>
      <div className="form-actions">
        <button type="button" className="ghost-button" onClick={onCancel}>
          Cancel
        </button>
        <button className="primary-button" disabled={busy}>
          {busy ? <Loader2 className="spin" size={15} /> : <Check size={15} />}
          Save group
        </button>
      </div>
    </form>
  );
}

function RosterLimitForm({ current, minimum, maximum, onCancel, onSave }) {
  const [value, setValue] = useState(String(current));
  const parsed = Number.parseInt(value, 10);
  const valid = Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum;

  function submit(event) {
    event.preventDefault();
    if (valid) onSave(parsed);
  }

  return (
    <form onSubmit={submit} className="form-grid single">
      <label>
        <span>Guild member limit</span>
        <input
          type="number"
          min={minimum}
          max={maximum}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          autoFocus
        />
      </label>
      <p className="field-note">
        Must be between the current roster count ({minimum}) and the guild&apos;s hard
        cap ({maximum}). {maximum} is the max the game allows, so it can&apos;t be
        raised any higher.
      </p>
      <div className="form-actions">
        <button type="button" className="ghost-button" onClick={onCancel}>
          Cancel
        </button>
        <button className="primary-button" disabled={!valid}>
          <Check size={15} />
          Save limit
        </button>
      </div>
    </form>
  );
}

function JobClassForm({ initial, colorOptions, onCancel, onSave, busy }) {
  const [name, setName] = useState(initial?.name || "");
  const [shortLabel, setShortLabel] = useState(initial?.short || "");
  const [colorGroup, setColorGroup] = useState(
    initial?.group || colorOptions[0] || "gray",
  );
  const [iconFile, setIconFile] = useState(null);
  const [iconPreview, setIconPreview] = useState(initial?.icon || "");
  const [removeIcon, setRemoveIcon] = useState(false);

  function pickIcon(event) {
    const file = event.target.files?.[0] || null;
    setIconFile(file);
    setRemoveIcon(false);
    setIconPreview(file ? URL.createObjectURL(file) : initial?.icon || "");
  }

  function toggleRemoveIcon(event) {
    const checked = event.target.checked;
    setRemoveIcon(checked);
    setIconPreview(checked ? "" : initial?.icon || "");
  }

  function submit(event) {
    event.preventDefault();
    const formData = new FormData();
    formData.set("name", name);
    formData.set("short_label", shortLabel);
    formData.set("color_group", colorGroup);
    if (iconFile) formData.set("icon", iconFile);
    if (removeIcon) formData.set("remove_icon", "true");
    onSave(formData);
  }

  return (
    <form onSubmit={submit} className="form-grid">
      <label>
        <span>Class name</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          autoFocus
        />
      </label>
      <label>
        <span>Short label</span>
        <input
          value={shortLabel}
          onChange={(event) => setShortLabel(event.target.value)}
          required
        />
      </label>
      <label>
        <span>Color group</span>
        <select
          value={colorGroup}
          onChange={(event) => setColorGroup(event.target.value)}
        >
          {colorOptions.map((group) => (
            <option key={group} value={group}>
              {group}
            </option>
          ))}
        </select>
      </label>
      <label className="wide">
        <span>Icon</span>
        <div className="job-class-icon-picker">
          {iconPreview ? (
            <img src={iconPreview} alt="" width={40} height={40} />
          ) : (
            <span
              className="class-icon-placeholder"
              style={{ width: 40, height: 40 }}
            />
          )}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={pickIcon}
          />
        </div>
        {initial?.icon && !iconFile && (
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={removeIcon}
              onChange={toggleRemoveIcon}
            />
            <span>Remove current icon</span>
          </label>
        )}
        <p className="field-note">PNG, JPEG, or WebP, up to 2MB.</p>
      </label>
      <div className="form-actions wide">
        <button type="button" className="ghost-button" onClick={onCancel}>
          Cancel
        </button>
        <button className="primary-button" disabled={busy}>
          {busy ? <Loader2 className="spin" size={15} /> : <Check size={15} />}
          Save class
        </button>
      </div>
    </form>
  );
}

function JobClassesPanel({ jobClasses, onAdd, onEdit, onDelete, busy }) {
  const ordered = useMemo(
    () =>
      [...jobClasses].sort(
        (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
      ),
    [jobClasses],
  );

  return (
    <section className="content-section" aria-label="Job classes">
      <div className="section-title-row">
        <div>
          <h2>Job classes</h2>
          <p className="section-description">
            Manage the class list used across the roster, member forms, and
            Discord registration.
          </p>
        </div>
        <div className="section-actions">
          <button className="primary-button" onClick={onAdd}>
            <Plus size={16} />
            Add class
          </button>
        </div>
      </div>
      {ordered.length === 0 ? (
        <div className="empty-panel">No job classes yet.</div>
      ) : (
        <div className="pending-members-list">
          {ordered.map((cls) => (
            <div key={cls.id} className="pending-member-row">
              <div className="pending-member-info">
                <ClassIcon name={cls.name} size={32} />
                <strong>{cls.name}</strong>
                <span>{cls.short}</span>
                <span>{cls.group}</span>
              </div>
              <div className="pending-member-actions">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => onEdit(cls)}
                >
                  <Pencil size={14} />
                  Edit
                </button>
                <button
                  type="button"
                  className="icon-button danger"
                  onClick={() => onDelete(cls)}
                  aria-label={`Delete ${cls.name}`}
                  disabled={busy}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function MemberStatsAdminPanel({
  summary,
  loading,
  onViewMember,
  eyebrow = "weekly submissions",
  title = "Member stats",
  description = "Latest self-reported gear/combat stats per member. Reference only, not used by the auction system.",
  allowExport = false,
}) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState("all");
  const [exportMode, setExportMode] = useState("both");
  const [hoveredField, setHoveredField] = useState(null);
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = normalizedQuery
    ? summary.filter(
        (row) =>
          row.char_name.toLowerCase().includes(normalizedQuery) ||
          row.char_class.toLowerCase().includes(normalizedQuery),
      )
    : summary;

  function handleExport() {
    // Always exports the full roster, ignoring any active search filter, so
    // the file always reflects everyone (up to the guild's member cap).
    const csv = buildStatsCsv(summary, exportMode);
    const modeLabel = exportMode === "both" ? "updated-and-old" : exportMode === "previous" ? "old" : "updated";
    downloadCsv(`member-stats-${modeLabel}-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  return (
    <section className="content-section" aria-label={title}>
      <div className="section-heading">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <div className="stats-panel-actions">
          {allowExport && (
            <div className="export-controls">
              <span className="field-note">Exports all {summary.length} members</span>
              <select
                aria-label="What to include in the export"
                value={exportMode}
                onChange={(event) => setExportMode(event.target.value)}
              >
                <option value="both">Updated + Old</option>
                <option value="latest">Updated only</option>
                <option value="previous">Old only</option>
              </select>
              <button type="button" className="ghost-button" onClick={handleExport} disabled={summary.length === 0}>
                <Download size={15} />
                Export CSV
              </button>
            </div>
          )}
          <div className="section-actions">
            <div className="view-toggle" aria-label="Stats table view">
              <button
                type="button"
                className={view === "simplified" ? "active" : ""}
                onClick={() => setView("simplified")}
                aria-pressed={view === "simplified"}
              >
                <List size={15} />
                Simplified
              </button>
              <button
                type="button"
                className={view === "all" ? "active" : ""}
                onClick={() => setView("all")}
                aria-pressed={view === "all"}
              >
                <Table2 size={15} />
                All stats
              </button>
            </div>
          </div>
        </div>
      </div>
      {/* Its own full-width row instead of squeezed alongside the view-toggle/
          export buttons above, so it's easy to spot rather than easy to miss. */}
      {summary.length > 0 && (
        <label className="search-box search-box-block">
          <Search size={15} />
          <input
            aria-label="Search members"
            placeholder="Search name or class"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      )}
      {loading ? (
        <div className="loading-panel">
          <Loader2 className="spin" size={20} />
          Loading stats
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-panel">
          No members match &ldquo;{query}&rdquo;.
        </div>
      ) : view === "all" ? (
        <div
          className="roster-table-wrap"
          tabIndex={0}
          role="region"
          aria-label="Member stats table, all fields"
        >
          <table className="roster-table stats-all-table">
            <thead>
              <tr>
                <th rowSpan={2} className="stats-sticky-col">Member</th>
                <th rowSpan={2}>Class</th>
                <th rowSpan={2}>Last submitted</th>
                {STATS_ALL_TABLE_GROUPS.map((group) => (
                  <th key={group.title} colSpan={group.fields.length} className="stats-group-header">
                    {group.title}
                  </th>
                ))}
                <th rowSpan={2}>Proof</th>
                <th rowSpan={2}>Actions</th>
              </tr>
              <tr>
                {STATS_ALL_TABLE_FIELDS.map((field) => (
                  <th
                    key={field.key}
                    className={hoveredField === field.key ? "stats-col-hover" : ""}
                    onMouseEnter={() => setHoveredField(field.key)}
                    onMouseLeave={() => setHoveredField(null)}
                  >
                    {field.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.member_id}>
                  <td className="stats-sticky-col">
                    <strong>{row.char_name}</strong>
                  </td>
                  <td>{row.char_class}</td>
                  <td>
                    {row.latest ? (
                      formatStatsTimestamp(row.latest.submitted_at)
                    ) : (
                      <span className="table-secondary">No submissions</span>
                    )}
                  </td>
                  {STATS_ALL_TABLE_FIELDS.map((field) => (
                    <td
                      key={field.key}
                      className={hoveredField === field.key ? "stats-col-hover" : ""}
                      onMouseEnter={() => setHoveredField(field.key)}
                      onMouseLeave={() => setHoveredField(null)}
                    >
                      {!row.latest
                        ? "-"
                        : field.key === "effective_pdef" || field.key === "effective_mdef"
                          ? formatStatDecimal(row.latest[field.key])
                          : row.latest[field.key] ?? "-"}
                    </td>
                  ))}
                  <td>
                    {row.latest?.video_link ? (
                      <a
                        className="ghost-button"
                        href={ensureAbsoluteUrl(row.latest.video_link)}
                        target="_blank"
                        rel="noreferrer noopener"
                      >
                        <ExternalLink size={13} />
                        View
                      </a>
                    ) : (
                      <span className="table-secondary">-</span>
                    )}
                  </td>
                  <td>
                    <button
                      className="ghost-button"
                      onClick={() => onViewMember(row.member_id)}
                      disabled={!row.latest}
                      title={
                        row.latest ? "View history" : "No submissions yet"
                      }
                    >
                      <History size={14} />
                      History
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div
          className="roster-table-wrap"
          tabIndex={0}
          role="region"
          aria-label="Member stats table"
        >
          <table className="roster-table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Class</th>
                <th>Last submitted</th>
                <th>Eff. PDEF</th>
                <th>Eff. MDEF</th>
                <th>Proof</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.member_id}>
                  <td>
                    <strong>{row.char_name}</strong>
                  </td>
                  <td>
                    <span className="roster-class-label">
                      <ClassIcon name={row.char_class} size={24} />
                      {row.char_class}
                    </span>
                  </td>
                  <td>
                    {row.latest ? (
                      formatStatsTimestamp(row.latest.submitted_at)
                    ) : (
                      <span className="table-secondary">No submissions</span>
                    )}
                  </td>
                  <td>
                    {row.latest ? formatStatDecimal(row.latest.effective_pdef) : "-"}
                  </td>
                  <td>
                    {row.latest ? formatStatDecimal(row.latest.effective_mdef) : "-"}
                  </td>
                  <td>
                    {row.latest?.video_link ? (
                      <a
                        className="ghost-button"
                        href={ensureAbsoluteUrl(row.latest.video_link)}
                        target="_blank"
                        rel="noreferrer noopener"
                      >
                        <ExternalLink size={13} />
                        View
                      </a>
                    ) : (
                      <span className="table-secondary">-</span>
                    )}
                  </td>
                  <td>
                    <button
                      className="ghost-button"
                      onClick={() => onViewMember(row.member_id)}
                      disabled={!row.latest}
                      title={
                        row.latest ? "View history" : "No submissions yet"
                      }
                    >
                      <History size={14} />
                      History
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function MemberStatsDetailView({ data, onClose }) {
  const stats = data?.stats || [];
  const trends = buildStatTrends(stats[0], stats[1]);
  return (
    <Modal
      title={`${data?.member?.char_name || "Member"} stats history`}
      onClose={onClose}
      size="lg"
    >
      {stats.length === 0 ? (
        <div className="empty-panel">No submissions yet.</div>
      ) : (
        <div className="stats-history">
          {stats.map((row, index) => (
            <StatsHistoryCard
              row={row}
              label={index === 0 ? "updated" : "old"}
              trends={trends}
              key={row.id}
            />
          ))}
        </div>
      )}
    </Modal>
  );
}

// A self-contained peer view of member_stats — mirrors AccountScreen's pattern
// (own fetch, own state) rather than plugging into the main dashboard's
// members/groups/session-gated load flow, since it's reachable by both member
// and admin roles and only ever needs one thing: the opted-in board list.
// Exact text of the API's reciprocity-gate error (app/api/member-stats/board/
// route.js and its [memberId] sibling) — matched below to tell "you haven't
// opted in yet" apart from any other fetch failure.
const STATS_OPT_IN_REQUIRED_MESSAGE = "Opt in on your Account page to view the public stats board.";

function PublicStatsBoardScreen() {
  const [board, setBoard] = useState(() => publicStatsBoardCache?.data || []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [optInRequired, setOptInRequired] = useState(false);
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    const cached = publicStatsBoardCache;
    const cacheIsFresh = cached && Date.now() - cached.loadedAt < DASHBOARD_CACHE_MAX_AGE_MS;
    if (cached) setBoard(cached.data);
    if (cacheIsFresh) return;
    if (!cached) setLoading(true);
    api("/api/member-stats/board")
      .then((data) => {
        publicStatsBoardCache = { data: data.board || [], loadedAt: Date.now() };
        setBoard(publicStatsBoardCache.data);
      })
      .catch((err) => {
        if (err.message === STATS_OPT_IN_REQUIRED_MESSAGE) setOptInRequired(true);
        else setError(err.message);
      })
      .finally(() => setLoading(false));
  }, []);

  async function viewMember(memberId) {
    try {
      const data = await api(`/api/member-stats/board/${memberId}`);
      setDetail(data);
    } catch (err) {
      setError(err.message);
    }
  }

  if (optInRequired) {
    return (
      <div className="alert-panel">
        <AlertTriangle size={17} />
        <span>{STATS_OPT_IN_REQUIRED_MESSAGE}</span>
        <Link className="ghost-button" href="/account">
          Account
        </Link>
      </div>
    );
  }

  return (
    <>
      {error && (
        <div className="alert-panel">
          <AlertTriangle size={17} />
          <span>{error}</span>
          <button onClick={() => setError("")}>Dismiss</button>
        </div>
      )}
      <MemberStatsAdminPanel
        summary={board}
        loading={loading}
        onViewMember={viewMember}
        eyebrow="guild board"
        title="Public stats"
        description="Stats from members who opted in on their Account page."
      />
      {detail && <MemberStatsDetailView data={detail} onClose={() => setDetail(null)} />}
    </>
  );
}

// Read-only table used by PovListScreen. No simplified/all toggle or
// per-member history drill-down like MemberStatsAdminPanel has, since a POV
// entry is just link/title/date, not a set of comparable numeric stats.
function PovListPanel({ list, loading }) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  // Matches against every column actually shown in the table, not just
  // name/class, so a search for a title or a recorded date finds the row too.
  const filtered = normalizedQuery
    ? list.filter((row) => {
        const haystack = [
          row.char_name,
          row.char_class,
          row.latest?.title,
          row.latest ? formatDateOnly(row.latest.recorded_date) : "",
          row.latest?.link
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(normalizedQuery);
      })
    : list;

  return (
    <section className="content-section" aria-label="POV List">
      <div className="section-heading">
        <div>
          <p className="eyebrow">guild pov list</p>
          <h2>POV List</h2>
          <p>Every member&apos;s latest POV recording link.</p>
        </div>
      </div>
      {/* Its own full-width row instead of squeezed into the heading, so it's
          easy to spot rather than easy to miss. */}
      {list.length > 0 && (
        <label className="search-box search-box-block">
          <Search size={15} />
          <input
            aria-label="Search POV links"
            placeholder="Search name, class, title, or date"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      )}
      {loading ? (
        <div className="loading-panel">
          <Loader2 className="spin" size={20} />
          Loading POV links
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-panel">
          {query ? <>No members match &ldquo;{query}&rdquo;.</> : "No POV links submitted yet."}
        </div>
      ) : (
        <div className="roster-table-wrap" tabIndex={0} role="region" aria-label="POV links table">
          <table className="roster-table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Class</th>
                <th>Title</th>
                <th>Date recorded</th>
                <th>Link</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.member_id}>
                  <td>
                    <strong>{row.char_name}</strong>
                  </td>
                  <td>
                    <span className="roster-class-label">
                      <ClassIcon name={row.char_class} size={24} />
                      {row.char_class}
                    </span>
                  </td>
                  <td>{row.latest ? row.latest.title : <span className="table-secondary">No submissions</span>}</td>
                  <td>
                    {row.latest ? (
                      formatDateOnly(row.latest.recorded_date)
                    ) : (
                      <span className="table-secondary">No submissions</span>
                    )}
                  </td>
                  <td>
                    {row.latest ? (
                      <a className="ghost-button" href={row.latest.link} target="_blank" rel="noreferrer noopener">
                        <ExternalLink size={13} />
                        View
                      </a>
                    ) : (
                      <span className="table-secondary">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// Self-service submit form for the caller's own POV link — add-only by
// design (no edit/delete UI): a new submission naturally rolls the oldest of
// the kept 2 rows off via enforceLatestNRows, same as member_stats.
function PovLinkSubmitForm({ onSave, busy }) {
  const [form, setForm] = useState({ title: "", link: "", recorded_date: "" });

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    const ok = await onSave(form);
    if (ok) setForm({ title: "", link: "", recorded_date: "" });
  }

  return (
    <form onSubmit={submit} className="form-grid">
      <label>
        <span>Title</span>
        <input value={form.title} onChange={(event) => update("title", event.target.value)} maxLength={80} required />
      </label>
      <label>
        <span>Link</span>
        <input
          value={form.link}
          onChange={(event) => update("link", event.target.value)}
          placeholder="https://..."
          required
        />
      </label>
      <label>
        <span>Date recorded</span>
        <input
          type="date"
          value={form.recorded_date}
          onChange={(event) => update("recorded_date", event.target.value)}
          required
        />
      </label>
      <div className="form-actions wide">
        <button className="primary-button" disabled={busy}>
          {busy ? <Loader2 className="spin" size={15} /> : <Check size={15} />}
          Submit POV link
        </button>
      </div>
    </form>
  );
}

// Self-contained peer view, same shape as AccountScreen/PublicStatsBoardScreen.
// Own fetch, own state, reachable by every role (checkSession lets the member
// role in without the usual /account redirect). POV is always public within
// the app, so this shows everyone's latest entry, no opt-in.
function PovListScreen() {
  const [list, setList] = useState(() => povLinksCache?.data || []);
  const [loading, setLoading] = useState(!povLinksCache);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(null);
  const [saving, setSaving] = useState(false);

  function refresh() {
    return api("/api/pov-links")
      .then((data) => {
        povLinksCache = { data: data.links || [], loadedAt: Date.now() };
        setList(povLinksCache.data);
      })
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    const cached = povLinksCache;
    const cacheIsFresh = cached && Date.now() - cached.loadedAt < DASHBOARD_CACHE_MAX_AGE_MS;
    if (cached) setList(cached.data);
    if (cacheIsFresh) return;
    if (!cached) setLoading(true);
    refresh().finally(() => setLoading(false));
  }, []);

  async function submit(form) {
    setSaving(true);
    setNotice(null);
    try {
      await api("/api/pov-links", { method: "POST", body: JSON.stringify(form) });
      setNotice({ type: "success", message: "POV link submitted." });
      povLinksCache = null;
      await refresh();
      return true;
    } catch (err) {
      setNotice({ type: "error", message: err.message });
      return false;
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {error && (
        <div className="alert-panel">
          <AlertTriangle size={17} />
          <span>{error}</span>
          <button onClick={() => setError("")}>Dismiss</button>
        </div>
      )}
      <section className="content-section" aria-label="Submit a POV link">
        <div className="section-heading">
          <div>
            <p className="eyebrow">share your pov</p>
            <h2>Submit a POV link</h2>
            <p>Link, title, and the date it was recorded. Your last 2 submissions are kept.</p>
          </div>
        </div>
        {notice && (
          <div className={notice.type === "error" ? "alert-panel" : "success-panel"}>
            {notice.type === "error" ? <AlertTriangle size={17} /> : <Check size={17} />}
            <span>{notice.message}</span>
            <button onClick={() => setNotice(null)}>Dismiss</button>
          </div>
        )}
        <PovLinkSubmitForm onSave={submit} busy={saving} />
      </section>
      <PovListPanel list={list} loading={loading} />
    </>
  );
}

function AdminSidebar({ activePage, memberCount, partyCount, pendingCount, role }) {
  // Collapsed by default on narrow screens — a hamburger toggle opens it as a
  // full-width dropdown instead of squeezing every item into one cramped row.
  // Unused (and harmless) once the sidebar renders as the normal desktop
  // column, since CSS hides the toggle button there.
  const [navOpen, setNavOpen] = useState(false);

  // Account is reachable from the header (top right) on every page instead of
  // living here too — keep this list to the role's core views only.
  const navigation =
    role === "member"
      ? [
          {
            href: "/public",
            label: "Auction view",
            icon: Gavel,
            page: "public",
          },
          {
            href: "/public-stats",
            label: "Public stats",
            icon: Users,
            page: "public-stats",
          },
          {
            href: "/pov-list",
            label: "POV List",
            icon: Video,
            page: "pov-list",
          },
        ]
      : [
          {
            href: "/",
            label: "Master list",
            icon: List,
            count: memberCount,
            page: "members",
          },
          {
            href: "/parties",
            label: "Party list",
            icon: LayoutGrid,
            count: partyCount,
            page: "parties",
          },
          {
            href: "/auctions",
            label: "Auction list",
            icon: Gavel,
            page: "auctions",
          },
          {
            href: "/pending",
            label: "Pending approvals",
            icon: Clock3,
            count: pendingCount,
            page: "pending",
          },
          {
            href: "/member-stats",
            label: "Member stats",
            icon: BarChart3,
            page: "member-stats",
          },
          {
            href: "/public-stats",
            label: "Public stats",
            icon: Users,
            page: "public-stats",
          },
          {
            href: "/pov-list",
            label: "POV List",
            icon: Video,
            page: "pov-list",
          },
          {
            href: "/job-classes",
            label: "Job classes",
            icon: Layers,
            page: "job-classes",
          },
        ];

  return (
    <aside className="admin-sidebar">
      <div className="sidebar-top-row">
        <Link href="/" className="sidebar-brand" onClick={() => setNavOpen(false)}>
          <span className="brand-mark small">
            <Shield size={20} />
          </span>
          <span>
            <strong>ENCORE</strong>
            <em>Guild management</em>
          </span>
        </Link>
        {/* Desktop hides this via CSS — the full nav column is always visible
            there, so there's nothing to toggle. */}
        <button
          type="button"
          className="mobile-nav-toggle"
          onClick={() => setNavOpen((open) => !open)}
          aria-expanded={navOpen}
          aria-controls="admin-navigation"
        >
          {navOpen ? <X size={18} /> : <Menu size={18} />}
          Menu
        </button>
      </div>
      <nav
        id="admin-navigation"
        className={navOpen ? "admin-navigation is-open" : "admin-navigation"}
        aria-label="Admin navigation"
      >
        {navigation.map(({ href, label, icon: Icon, count, page }) => (
          <Link
            key={page}
            href={href}
            className={activePage === page ? "active" : ""}
            aria-current={activePage === page ? "page" : undefined}
            onClick={() => setNavOpen(false)}
          >
            <Icon size={17} />
            <span className="nav-label">{label}</span>
            {Number.isFinite(count) && <em>{count}</em>}
          </Link>
        ))}
      </nav>
      <p className="sidebar-note">
        Ragnarok Origin Classic
        <br />
        Prontera 6
      </p>
    </aside>
  );
}

// Discord self-registrations sit at status='pending' until an admin approves or
// rejects them here — approving is the only place new Discord signups get
// enrolled into the active auction round (see app/api/members/pending/[id]/route.js).
function PendingMembersPanel({ pending, busyId, onApprove, onReject, onViewMember }) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = normalizedQuery
    ? pending.filter((account) => {
        const charName = account.member?.char_name || "";
        return (
          account.username.toLowerCase().includes(normalizedQuery) ||
          charName.toLowerCase().includes(normalizedQuery)
        );
      })
    : pending;

  return (
    <section className="content-section pending-members-panel" aria-label="Pending registrations">
      <div className="section-heading">
        <div>
          <p className="eyebrow">discord registrations</p>
          <h2>Pending approval</h2>
          <p>
            {pending.length
              ? `${pending.length} account${pending.length === 1 ? "" : "s"} registered via Discord and waiting on approval before they can sign in.`
              : "No Discord registrations waiting on approval."}
          </p>
        </div>
        {pending.length > 5 && (
          <label className="search-box">
            <Search size={15} />
            <input
              aria-label="Search pending registrations"
              placeholder="Search username or character"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        )}
      </div>
      {pending.length > 0 && (
        <div className="pending-members-list">
          {filtered.length === 0 && (
            <div className="empty-panel">No pending registrations match &ldquo;{query}&rdquo;.</div>
          )}
          {filtered.map((account) => (
          <div key={account.id} className="pending-member-row">
            <div className="pending-member-info">
              <strong>{account.member?.char_name || "(no character)"}</strong>
              <span>{account.member?.char_class}</span>
              <span className="pending-member-username">@{account.username}</span>
            </div>
            <div className="pending-member-actions">
              <button
                type="button"
                className="ghost-button"
                disabled={!account.member}
                title={account.member ? "View submitted stats" : "No character on this registration"}
                onClick={() => onViewMember(account.member.id)}
              >
                <History size={15} />
                Stats
              </button>
              <button
                type="button"
                className="ghost-button"
                disabled={busyId === account.id}
                onClick={() => onApprove(account)}
              >
                {busyId === account.id ? <Loader2 className="spin" size={15} /> : <Check size={15} />}
                Approve
              </button>
              <button
                type="button"
                className="danger-button soft"
                disabled={busyId === account.id}
                onClick={() => onReject(account)}
              >
                <X size={15} />
                Reject
              </button>
            </div>
          </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Header({
  username,
  role,
  onLogout,
  auditLogView = false,
  accountView = false,
  publicView = false,
  publicGlAuction = null,
  compact = false,
  viewerAuthenticated = false,
}) {
  const roleLabel =
    role === "super_admin" ? "super admin" : role === "member" ? "member" : "admin";
  // On the public board, a signed-in visitor (member or admin browsing /public)
  // still gets identity + account/logout controls instead of the anonymous view.
  const showAccountControls = !publicView || viewerAuthenticated;
  return (
    <header className="topbar">
      <div className={compact ? "topbar-inner compact" : "topbar-inner"}>
        {!compact && (
          <div className="brand-row">
            <div className="brand-mark small">
              <Shield size={20} />
            </div>
            <div>
              <p className="eyebrow">
                {publicView ? "Guild dashboard" : "Guild management"}
              </p>
              <h1>ENCORE</h1>
              <div className="brand-meta">
                <span>Ragnarok Origin Classic</span>
                <span>Prontera 6</span>
              </div>
            </div>
          </div>
        )}
        <div className="admin-row">
          <div className="signed-in">
            <span>{showAccountControls ? "signed in as" : "view mode"}</span>
            <strong>
              {showAccountControls
                ? `${username || "admin"} · ${roleLabel}`
                : "public"}
            </strong>
          </div>
          {!publicView && role === "super_admin" && !auditLogView && !accountView && (
            <a className="ghost-button" href="/audit-logs">
              <History size={15} />
              Logs
            </a>
          )}
          {publicView && viewerAuthenticated && role !== "member" && (
            <Link className="ghost-button" href="/">
              <LayoutGrid size={15} />
              Dashboard
            </Link>
          )}
          {showAccountControls && (
            <Link className="ghost-button" href="/account">
              <User size={15} />
              Account
            </Link>
          )}
          {showAccountControls && (
            <button className="ghost-button" onClick={onLogout}>
              <LogOut size={15} />
              Log out
            </button>
          )}
        </div>
      </div>
      {publicGlAuction && (
        <div className="topbar-announcement">
          <Gavel size={15} />
          <span>
            {publicGlAuction.status === "locked"
              ? "Guild Auction list is locked. Check the auction table for your bid instructions."
              : "Guild Auction is running. Check the auction table for current bid instructions."}
          </span>
        </div>
      )}
    </header>
  );
}

function CollapseButton({ collapsed, onToggle }) {
  return (
    <button
      className="ghost-button collapse-button"
      type="button"
      onClick={onToggle}
    >
      {collapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
      {collapsed ? "Expand" : "Collapse"}
    </button>
  );
}

function Stats({
  members,
  memberLimit,
  activeClass,
  onClassFilter,
  onEditLimit,
  readOnly = false,
}) {
  const { classOrder, classByName } = useJobClasses();
  const statItems = useMemo(() => {
    const counts = {};
    for (const member of members)
      counts[member.char_class] = (counts[member.char_class] || 0) + 1;
    return classOrder
      .map((name) => {
        const cls = classByName[name];
        return {
          key: name,
          label: name,
          short: cls?.short || name,
          count: counts[name] || 0,
        };
      })
      .filter((item) => item.count > 0);
  }, [classByName, classOrder, members]);

  return (
    <section className="stats-row">
      <button
        className="stat-card roster-stat"
        onClick={onEditLimit}
        disabled={readOnly}
        title={readOnly ? "Guild member limit" : "Edit guild member limit"}
      >
        <span>Roster</span>
        <strong>
          {members.length}
          <small>/{memberLimit}</small>
        </strong>
        <em>guild limit</em>
      </button>
      <div className="class-strip">
        <span className="strip-label">by class</span>
        {statItems.map((item) => {
          const active = activeClass === item.key;
          return (
            <button
              className={active ? "class-chip active" : "class-chip"}
              key={item.label}
              title={`Filter by ${item.label}`}
              aria-pressed={active}
              onClick={() => onClassFilter(active ? "" : item.key)}
            >
              <ClassIcon name={item.key} size={28} />
              <span>{item.label}</span>
              <strong>{item.count}</strong>
            </button>
          );
        })}
        {activeClass && (
          <button className="clear-filter" onClick={() => onClassFilter("")}>
            <X size={13} />
            clear
          </button>
        )}
      </div>
    </section>
  );
}

function MembersSection({
  members,
  groupsById,
  classFilter,
  onClassFilter,
  onAdd,
  onEdit,
  onDelete,
  canAddMember,
  memberLimit,
  readOnly = false,
}) {
  const { classes, classOrder } = useJobClasses();
  const [query, setQuery] = useState("");
  const [viewMode, setViewMode] = useState("list");
  const [collapsed, setCollapsed] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  const filteredMembers = useMemo(() => {
    const q = query.trim().toLowerCase();
    return members.filter((member) => {
      const matchesQuery =
        !q ||
        member.char_name.toLowerCase().includes(q) ||
        member.char_class.toLowerCase().includes(q) ||
        groupsById[member.group_id]?.name?.toLowerCase().includes(q);
      const matchesClass = !classFilter || member.char_class === classFilter;
      return matchesQuery && matchesClass;
    });
  }, [classFilter, groupsById, members, query]);

  const orderedMembers = useMemo(() => {
    return [...filteredMembers].sort((a, b) => {
      const classDelta =
        classOrder.indexOf(a.char_class) - classOrder.indexOf(b.char_class);
      if (classDelta) return classDelta;
      return a.char_name.localeCompare(b.char_name);
    });
  }, [classOrder, filteredMembers]);

  const columns = useMemo(() => {
    const byClass = {};
    for (const member of orderedMembers) {
      byClass[member.char_class] ||= [];
      byClass[member.char_class].push(member);
    }

    const ordered = [];
    for (const name of classOrder) {
      if (byClass[name]?.length) {
        ordered.push({ key: name, icon: name, members: byClass[name] });
      }
    }
    return ordered;
  }, [classOrder, orderedMembers]);

  return (
    <section className="content-section">
      <div className="section-title-row">
        <div>
          <h2>Roster</h2>
          <p className="section-description">
            Find members, update their details, and manage auction priority.
          </p>
        </div>
        <div className="section-actions">
          <CollapseButton
            collapsed={collapsed}
            onToggle={() => setCollapsed((current) => !current)}
          />
          {!readOnly && (
            <button
              className="primary-button"
              onClick={onAdd}
              disabled={!canAddMember || collapsed}
              title={
                canAddMember
                  ? "Add member"
                  : `Roster is at ${members.length}/${memberLimit}`
              }
            >
              <Plus size={16} />
              Add member
            </button>
          )}
        </div>
      </div>
      {collapsed ? (
        <div className="collapsed-summary">
          {members.length}/{memberLimit} members · {columns.length} class groups
        </div>
      ) : (
        <>
          <div className="toolbar">
            <label className="search-box">
              <Search size={15} />
              <input
                aria-label="Search roster"
                placeholder="Search name, class, or party"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <select
              aria-label="Filter roster by class"
              value={classFilter}
              onChange={(event) => onClassFilter(event.target.value)}
            >
              <option value="">All classes</option>
              {classes.map((cls) => (
                <option key={cls.name} value={cls.name}>
                  {cls.name}
                </option>
              ))}
            </select>
            <div className="view-toggle" aria-label="Roster view">
              <button
                type="button"
                className={viewMode === "list" ? "active" : ""}
                onClick={() => setViewMode("list")}
                aria-pressed={viewMode === "list"}
              >
                <List size={15} />
                List
              </button>
              <button
                type="button"
                className={viewMode === "cards" ? "active" : ""}
                onClick={() => setViewMode("cards")}
                aria-pressed={viewMode === "cards"}
              >
                <LayoutGrid size={15} />
                Cards
              </button>
            </div>
          </div>
          {orderedMembers.length && viewMode === "list" ? (
            <div
              className="roster-table-wrap"
              tabIndex={0}
              role="region"
              aria-label="Roster table. Scroll horizontally to see all columns."
            >
              <table className="roster-table">
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Class</th>
                    <th>Party</th>
                    <th>Auction priority</th>
                    <th>Cooldown</th>
                    {!readOnly && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {orderedMembers.map((member) => {
                    const cooldown = getAuctionCooldown(member, nowMs);
                    return (
                      <tr key={member.id}>
                        <td>
                          <strong>{member.char_name}</strong>
                          {member.is_officer && (
                            <span className="officer-badge">Officer</span>
                          )}
                        </td>
                        <td>
                          <span className="roster-class-label">
                            <ClassIcon name={member.char_class} size={24} />
                            {member.char_class}
                          </span>
                        </td>
                        <td>
                          {groupsById[member.group_id]?.name || "Unassigned"}
                        </td>
                        <td>
                          {member.auction_priority_override ? (
                            <span className="priority-badge">
                              Feather priority
                            </span>
                          ) : (
                            <span className="table-secondary">Standard</span>
                          )}
                        </td>
                        <td>
                          {cooldown ? (
                            <span
                              className="cooldown-label"
                              title={`Eligible ${formatPhDateTime(cooldown.endsAtMs)} PH`}
                            >
                              {formatCooldownRemaining(cooldown.remainingMs)}{" "}
                              remaining
                            </span>
                          ) : (
                            <span className="table-secondary">Complete</span>
                          )}
                        </td>
                        {!readOnly && (
                          <td>
                            <div className="row-actions always">
                              <button
                                className="ghost-button"
                                onClick={() => onEdit(member)}
                                aria-label={`Edit ${member.char_name}`}
                              >
                                <Pencil size={14} />
                                Edit
                              </button>
                              <button
                                className="icon-button danger"
                                onClick={() => onDelete(member)}
                                aria-label={`Delete ${member.char_name}`}
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : orderedMembers.length ? (
            <div
              className="class-grid"
              tabIndex={0}
              role="region"
              aria-label="Roster cards, scroll horizontally for more classes"
            >
              {columns.map((column) => (
                <article className="class-column" key={column.key}>
                  <header>
                    <ClassIcon name={column.icon} size={28} />
                    <h3>{column.key}</h3>
                    <span>{column.members.length}</span>
                  </header>
                  <div className="member-list">
                    {column.members.map((member) =>
                      (() => {
                        const cooldown = getAuctionCooldown(member, nowMs);
                        const cooldownLabel = cooldown
                          ? `Auction cooldown: ${formatCooldownRemaining(cooldown.remainingMs)} left, eligible ${formatPhDateTime(cooldown.endsAtMs)} PH`
                          : "";
                        return (
                          <div
                            className={`member-row ${cooldown ? "cooldown" : ""}`}
                            key={member.id}
                            title={cooldownLabel || undefined}
                          >
                            <ClassIcon name={member.char_class} size={32} />
                            <div className="member-main">
                              <strong>
                                {member.char_name}
                                {member.is_officer && (
                                  <span className="officer-badge">Officer</span>
                                )}
                                {member.auction_priority_override && (
                                  <span className="priority-badge">
                                    Priority
                                  </span>
                                )}
                              </strong>
                              <span>{member.char_class}</span>
                              <em>
                                Party:{" "}
                                {groupsById[member.group_id]?.name ||
                                  "Unassigned"}
                              </em>
                              {cooldown && (
                                <b>
                                  {formatCooldownRemaining(
                                    cooldown.remainingMs,
                                  )}{" "}
                                  auction cooldown
                                </b>
                              )}
                            </div>
                            {!readOnly && (
                              <div className="row-actions">
                                <button
                                  className="icon-button"
                                  onClick={() => onEdit(member)}
                                  aria-label={`Edit ${member.char_name}`}
                                >
                                  <Pencil size={15} />
                                </button>
                                <button
                                  className="icon-button danger"
                                  onClick={() => onDelete(member)}
                                  aria-label={`Delete ${member.char_name}`}
                                >
                                  <Trash2 size={15} />
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })(),
                    )}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-panel">
              No members match the current filters.
            </div>
          )}
        </>
      )}
    </section>
  );
}

function PartiesSection({
  members,
  groups,
  onCreateGroup,
  onRenameGroup,
  onDeleteGroup,
  onPickEmptySlot,
  onRequestUnassign,
  onEditMember,
  onMoveMemberToSlot,
  busy = false,
  readOnly = false,
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [draggingMemberId, setDraggingMemberId] = useState(null);
  const membersByGroup = useMemo(() => {
    const map = {};
    for (const group of groups) map[group.id] = [];
    for (const member of members) {
      if (member.group_id && map[member.group_id])
        map[member.group_id].push(member);
    }
    for (const group of groups) {
      map[group.id] = sortedPartyRoster(map[group.id], group.name);
    }
    return map;
  }, [groups, members]);
  const unassigned = members.filter((member) => !member.group_id);
  const visibleGroups = useMemo(() => {
    if (!readOnly) return groups;
    return groups.filter(
      (group) => (membersByGroup[group.id] || []).length > 0,
    );
  }, [groups, membersByGroup, readOnly]);
  const fieldGroups = useMemo(() => {
    const mainField = visibleGroups.slice(0, MAIN_FIELD_PARTY_LIMIT);
    const subField = visibleGroups.slice(MAIN_FIELD_PARTY_LIMIT);
    return [
      {
        key: "main",
        title: "Main Field",
        meta: `${mainField.length}/${MAIN_FIELD_PARTY_LIMIT} parties`,
        groups: mainField,
      },
      {
        key: "sub",
        title: "Sub Field",
        meta: `${subField.length} remaining ${subField.length === 1 ? "party" : "parties"}`,
        groups: subField,
      },
    ];
  }, [visibleGroups]);
  const canCreateInField = (field) =>
    !readOnly &&
    ((field.key === "main" && visibleGroups.length < MAIN_FIELD_PARTY_LIMIT) ||
      (field.key === "sub" && visibleGroups.length >= MAIN_FIELD_PARTY_LIMIT));
  const moveMember = (group, member, targetSlot) => {
    if (readOnly || busy) return;
    if (targetSlot < 1 || targetSlot > 5) return;
    onMoveMemberToSlot(member.id, group.id, targetSlot);
  };
  const beginDrag = (event, member) => {
    if (readOnly || busy) return;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", member.id);
    setDraggingMemberId(member.id);
  };
  const acceptDrag = (event) => {
    if (readOnly || busy) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  };
  const dropOnSlot = (event, group, slot) => {
    if (readOnly || busy) return;
    event.preventDefault();
    const memberId = event.dataTransfer.getData("text/plain");
    setDraggingMemberId(null);
    if (!memberId) return;
    onMoveMemberToSlot(memberId, group.id, slot + 1);
  };
  const dropToUnassigned = (event) => {
    if (readOnly || busy) return;
    event.preventDefault();
    const memberId = event.dataTransfer.getData("text/plain");
    setDraggingMemberId(null);
    if (!memberId) return;
    onMoveMemberToSlot(memberId, null, null);
  };

  return (
    <section className="content-section">
      <div className="section-title-row">
        <div>
          <h2>Parties</h2>
          <p className="section-description">
            Assign members to a party. Drag to move, or use the arrow controls.
          </p>
        </div>
        <div className="section-actions">
          {!readOnly && draggingMemberId && (
            <div
              className="party-drop-zone"
              onDragOver={acceptDrag}
              onDrop={dropToUnassigned}
            >
              Drop to unassign
            </div>
          )}
          <CollapseButton
            collapsed={collapsed}
            onToggle={() => setCollapsed((current) => !current)}
          />
          {!readOnly && (
            <button
              className="ghost-button"
              onClick={onCreateGroup}
              disabled={collapsed}
            >
              <Plus size={16} />
              Create group
            </button>
          )}
        </div>
      </div>

      {collapsed ? (
        <div className="collapsed-summary">
          {visibleGroups.length} visible groups ·{" "}
          {members.filter((member) => member.group_id).length} assigned members
        </div>
      ) : (
        <>
          <div className="party-field-stack">
            {fieldGroups.map((field) => (
              <section className="party-field-section" key={field.key}>
                <div className="party-field-header">
                  <div>
                    <p className="eyebrow">
                      {field.key === "main"
                        ? "primary allocation"
                        : "overflow allocation"}
                    </p>
                    <h3>{field.title}</h3>
                  </div>
                  <span>{field.meta}</span>
                </div>
                {field.groups.length || canCreateInField(field) ? (
                  <div className="party-grid">
                    {field.groups.map((group) => {
                      const roster = membersByGroup[group.id] || [];
                      const rosterSlots = buildPartySlots(roster, group.name);
                      return (
                        <article className="party-card" key={group.id}>
                          <header>
                            <div>
                              <h3>{group.name}</h3>
                              <span>{roster.length}/5 members</span>
                            </div>
                            {!readOnly && (
                              <div className="row-actions always">
                                <button
                                  className="icon-button"
                                  onClick={() => onRenameGroup(group)}
                                  aria-label={`Rename ${group.name}`}
                                >
                                  <Pencil size={15} />
                                </button>
                                <button
                                  className="icon-button danger"
                                  onClick={() => onDeleteGroup(group)}
                                  aria-label={`Delete ${group.name}`}
                                >
                                  <Trash2 size={15} />
                                </button>
                              </div>
                            )}
                          </header>

                          <div className="party-slots">
                            {[0, 1, 2, 3, 4].map((slot) => {
                              const member = rosterSlots[slot];
                              return member ? (
                                <div
                                  className={`party-slot filled ${draggingMemberId === member.id ? "dragging" : ""}`}
                                  key={member.id}
                                  draggable={!readOnly && !busy}
                                  onDragStart={(event) =>
                                    beginDrag(event, member)
                                  }
                                  onDragEnd={() => setDraggingMemberId(null)}
                                  onDragOver={acceptDrag}
                                  onDrop={(event) =>
                                    dropOnSlot(event, group, slot)
                                  }
                                >
                                  <ClassIcon
                                    name={member.char_class}
                                    size={30}
                                  />
                                  <button
                                    className="slot-name"
                                    onClick={() =>
                                      !readOnly && onEditMember(member)
                                    }
                                    disabled={readOnly}
                                  >
                                    {member.char_name}
                                  </button>
                                  {!readOnly && (
                                    <>
                                      <div className="slot-order-actions">
                                        <button
                                          className="icon-button"
                                          onClick={() =>
                                            moveMember(group, member, slot)
                                          }
                                          disabled={busy || slot === 0}
                                          aria-label={`Move ${member.char_name} up`}
                                          title="Move up"
                                        >
                                          <ArrowUp size={13} />
                                        </button>
                                        <button
                                          className="icon-button"
                                          onClick={() =>
                                            moveMember(group, member, slot + 2)
                                          }
                                          disabled={busy || slot === 4}
                                          aria-label={`Move ${member.char_name} down`}
                                          title="Move down"
                                        >
                                          <ArrowDown size={13} />
                                        </button>
                                      </div>
                                      <button
                                        className="icon-button danger"
                                        onClick={() =>
                                          onRequestUnassign(member, group)
                                        }
                                        disabled={busy}
                                        aria-label={`Remove ${member.char_name}`}
                                      >
                                        <UserMinus size={14} />
                                      </button>
                                    </>
                                  )}
                                </div>
                              ) : (
                                <button
                                  className="party-slot empty"
                                  key={slot}
                                  onClick={() =>
                                    !readOnly &&
                                    onPickEmptySlot({ group, slot: slot + 1 })
                                  }
                                  onDragOver={acceptDrag}
                                  onDrop={(event) =>
                                    dropOnSlot(event, group, slot)
                                  }
                                  disabled={
                                    readOnly ||
                                    (!unassigned.length && !draggingMemberId)
                                  }
                                  title={
                                    unassigned.length
                                      ? `Add member to ${group.name} slot ${slot + 1}`
                                      : "No unassigned members"
                                  }
                                >
                                  {draggingMemberId
                                    ? "Drop here"
                                    : unassigned.length
                                      ? "Empty slot"
                                      : "No unassigned"}
                                </button>
                              );
                            })}
                          </div>
                        </article>
                      );
                    })}
                    {canCreateInField(field) && (
                      <button
                        className="new-party-card"
                        onClick={onCreateGroup}
                      >
                        <Plus size={20} />
                        <span>New group</span>
                        <em>5 open slots</em>
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="empty-panel compact">
                    {field.key === "main"
                      ? "No main field parties assigned yet."
                      : "No sub field parties yet."}
                  </div>
                )}
              </section>
            ))}
          </div>
          {readOnly && !visibleGroups.length && (
            <div className="empty-panel">No party groups assigned yet.</div>
          )}
        </>
      )}
    </section>
  );
}

function PartyMemberPicker({
  group,
  targetSlot,
  members,
  currentCount,
  onCancel,
  onPickMany,
  busy,
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  const openSlots = Math.max(0, 5 - currentCount);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return members.filter(
      (member) =>
        !q ||
        member.char_name.toLowerCase().includes(q) ||
        member.char_class.toLowerCase().includes(q),
    );
  }, [members, query]);

  function toggleMember(memberId) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(memberId)) {
        next.delete(memberId);
      } else if (next.size < openSlots) {
        next.add(memberId);
      }
      return next;
    });
  }

  async function addSelected() {
    if (!selected.size) return;
    await onPickMany([...selected]);
  }

  return (
    <Modal
      title={`Add to ${group.name}${targetSlot ? ` slot ${targetSlot}` : ""}`}
      onClose={onCancel}
      size="sm"
    >
      <div className="picker-meta">
        <strong>{currentCount}/5 members</strong>
        <span>
          {targetSlot
            ? `First selected member goes to slot ${targetSlot}. `
            : ""}
          {openSlots} open slot{openSlots === 1 ? "" : "s"} · select up to{" "}
          {openSlots}
        </span>
      </div>
      <div className="picker-search">
        <Search size={15} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search unassigned members"
          autoFocus
        />
      </div>
      <div className="picker-list">
        {filtered.length ? (
          filtered.map((member) => {
            const checked = selected.has(member.id);
            const disabled = busy || (!checked && selected.size >= openSlots);
            return (
              <button
                className={checked ? "picker-row selected" : "picker-row"}
                key={member.id}
                onClick={() => toggleMember(member.id)}
                disabled={disabled}
              >
                <ClassIcon name={member.char_class} size={32} glow={false} />
                <span>
                  <strong>{member.char_name}</strong>
                  <em>{member.char_class}</em>
                </span>
                {checked ? <Check size={16} /> : <Plus size={16} />}
              </button>
            );
          })
        ) : (
          <div className="empty-panel compact">
            No unassigned members match that search.
          </div>
        )}
      </div>
      <div className="picker-actions">
        <button className="ghost-button" type="button" onClick={onCancel}>
          Cancel
        </button>
        <button
          className="primary-button"
          type="button"
          onClick={addSelected}
          disabled={!selected.size || busy}
        >
          {busy ? <Loader2 className="spin" size={15} /> : <Plus size={15} />}
          Add selected ({selected.size})
        </button>
      </div>
    </Modal>
  );
}

function auctionTypeLabel(type) {
  return type === "league_prize" ? "League Prize" : "Guild Auction";
}

function dashboardEventMessage(eventType) {
  const messages = {
    gl_woe_auction_started: "Guild Auction is now running.",
    gl_woe_auction_done: "Guild Auction is done. Shared progress was updated.",
    league_prize_auction_started: "League Prize Auction is now running.",
    league_prize_auction_done:
      "League Prize Auction is done. Shared progress was updated.",
    auction_event_done: "Event auctions are done. Shared progress was updated.",
  };
  return messages[eventType] || "";
}

function itemAppliesTo(item, type) {
  return (
    Array.isArray(item.applies_to_auction_types) &&
    item.applies_to_auction_types.includes(type)
  );
}

function auctionDisplayGroupKey(item) {
  if (!item) return "unknown";
  return SHARED_FEATHER_PAGE_KEYS.has(item.item_key) ? "feathers" : item.id;
}

function auctionDisplayItemOrder(item) {
  return AUCTION_PAGE_ITEM_ORDER[item?.item_key] || item?.sort_order || 99;
}

function auctionUnitDisplayPage(unit) {
  return unit.displayPage || unit.page;
}

function auctionUnitDisplaySlot(unit) {
  return unit.displaySlot || unit.slot;
}

function displayPositionedAuctionUnits(auction, auctionItems) {
  return (auction.units || []).map((unit) => ({
    ...unit,
    displayPage: unit.page,
    displaySlot: unit.slot,
  }));
}

function compactSlots(units) {
  if (!units.length) return "";
  const byPage = new Map();
  for (const unit of units) {
    const page = auctionUnitDisplayPage(unit);
    const slot = auctionUnitDisplaySlot(unit);
    if (!byPage.has(page)) byPage.set(page, []);
    byPage.get(page).push(slot);
  }

  return [...byPage.entries()]
    .sort(([a], [b]) => a - b)
    .map(([page, slots]) => {
      const sortedSlots = [...new Set(slots)].sort((a, b) => a - b);
      const ranges = [];
      let start = sortedSlots[0];
      let previous = sortedSlots[0];

      for (let index = 1; index <= sortedSlots.length; index += 1) {
        const slot = sortedSlots[index];
        if (slot === previous + 1) {
          previous = slot;
          continue;
        }
        ranges.push(
          start === previous ? String(start) : `${start}-${previous}`,
        );
        start = slot;
        previous = slot;
      }

      return `Page ${page} and Slot ${ranges.join(", ")}`;
    })
    .join(" · ");
}

function formatDiscordBidList(auction, bidRows) {
  const lines = [`**${auction.name || auctionTypeLabel(auction.type)}**`, ""];

  for (const row of bidRows) {
    const memberName = row.member?.char_name || "Unknown";
    const lineLabel =
      Number.isFinite(row.queuePosition) &&
      row.queuePosition !== Number.MAX_SAFE_INTEGER
        ? `Line ${row.queuePosition}`
        : "Line";
    lines.push(`**${lineLabel} - ${memberName}**`);
    for (const item of row.items) {
      lines.push(
        `- ${item.item}: ${item.positions}${item.quantity > 1 ? ` x${item.quantity}` : ""}`,
      );
    }
    lines.push("");
  }

  return lines.join("\n").trim();
}

function uniqueBidderNames(auctions = [], auctionItems = []) {
  const seen = new Set();
  const names = [];
  const orderedAuctions = [
    ...auctions.filter((auction) => auction.type === "gl_woe"),
    ...auctions.filter((auction) => auction.type !== "gl_woe"),
  ];

  for (const auction of orderedAuctions) {
    const bidRows = groupedAuctionBids(
      displayPositionedAuctionUnits(auction, auctionItems),
      auction.queue || [],
    );
    for (const row of bidRows) {
      const name = row.member?.char_name?.trim();
      if (!name) continue;
      const key = row.member_id || name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      names.push(name);
    }
  }

  return names;
}

function logoutCandidateRows(auctionState) {
  const activeAuctions =
    auctionState?.activeAuctions ||
    (auctionState?.activeAuction ? [auctionState.activeAuction] : []);
  if (!activeAuctions.length) return [];

  const allocatedMemberIds = new Set();
  for (const auction of activeAuctions) {
    for (const unit of auction.units || []) {
      if (unit.member_id) allocatedMemberIds.add(unit.member_id);
    }
  }

  return (auctionState?.progress || [])
    .filter(
      (row) =>
        row.member?.id &&
        !row.member?.is_officer &&
        !allocatedMemberIds.has(row.member.id),
    )
    .sort(
      (a, b) =>
        a.position - b.position ||
        String(a.member.char_name || "").localeCompare(
          String(b.member.char_name || ""),
        ),
    );
}

function groupedAuctionBids(units = [], queue = []) {
  const memberMap = new Map();
  const queueByMemberId = new Map(queue.map((row) => [row.member_id, row]));

  for (const unit of units) {
    const queueRow = queueByMemberId.get(unit.member_id);
    if (!memberMap.has(unit.member_id)) {
      const unitPage = auctionUnitDisplayPage(unit);
      const unitSlot = auctionUnitDisplaySlot(unit);
      memberMap.set(unit.member_id, {
        member: unit.member,
        member_id: unit.member_id,
        queuePosition: queueRow?.position || Number.MAX_SAFE_INTEGER,
        items: new Map(),
        quantity: 0,
        firstPage: unitPage,
        firstSlot: unitSlot,
        cycle_reset: false,
      });
    }

    const memberRow = memberMap.get(unit.member_id);
    const itemKey = `${unit.item_id}:${unit.cycle_reset_item_key || "current"}`;
    if (!memberRow.items.has(itemKey)) {
      memberRow.items.set(itemKey, {
        item_id: unit.item_id,
        item: unit.short_name || unit.item_name,
        units: [],
        quantity: 0,
        cycle_reset: Boolean(unit.cycle_reset),
      });
    }

    const itemRow = memberRow.items.get(itemKey);
    itemRow.units.push(unit);
    itemRow.quantity += 1;
    itemRow.cycle_reset = itemRow.cycle_reset || Boolean(unit.cycle_reset);
    memberRow.quantity += 1;
    memberRow.cycle_reset = memberRow.cycle_reset || Boolean(unit.cycle_reset);
    const unitPage = auctionUnitDisplayPage(unit);
    const unitSlot = auctionUnitDisplaySlot(unit);
    if (
      unitPage < memberRow.firstPage ||
      (unitPage === memberRow.firstPage && unitSlot < memberRow.firstSlot)
    ) {
      memberRow.firstPage = unitPage;
      memberRow.firstSlot = unitSlot;
    }
  }

  const rows = [...memberMap.values()]
    .map((row) => ({
      ...row,
      items: [...row.items.values()]
        .map((item) => ({
          ...item,
          positions: compactSlots(item.units),
          firstPage: Math.min(
            ...item.units.map((unit) => auctionUnitDisplayPage(unit)),
          ),
          firstSlot: Math.min(
            ...item.units.map((unit) => auctionUnitDisplaySlot(unit)),
          ),
        }))
        .sort((a, b) => a.firstPage - b.firstPage || a.firstSlot - b.firstSlot),
    }))
    .sort(
      (a, b) =>
        a.firstPage - b.firstPage ||
        a.firstSlot - b.firstSlot ||
        a.queuePosition - b.queuePosition,
    );
  return rows;
}

function auctionSearchMatches(row, query) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;
  return String(row.member?.char_name || "")
    .toLowerCase()
    .includes(normalizedQuery);
}

function auctionSearchLocation(row) {
  if (!row) return "";
  const positions = row.items
    .map((item) => item.positions)
    .filter(Boolean)
    .join(" · ");
  return positions || "";
}

function auctionInventorySummary(auction, auctionItems) {
  const itemById = new Map(auctionItems.map((item) => [item.id, item]));
  return (auction.inventory || [])
    .map((row) => ({
      item: itemById.get(row.item_id),
      quantity: row.quantity || 0,
    }))
    .filter(({ item, quantity }) => item && quantity > 0)
    .sort((a, b) => (a.item.sort_order || 0) - (b.item.sort_order || 0));
}

function ItemIcon({ itemKey, label = "Item" }) {
  const src = ITEM_ICON_SRC[itemKey];
  if (!src)
    return (
      <span
        className={`auction-item-dot item-${itemKey || "empty"}`}
        aria-hidden="true"
      />
    );
  // Display size is fully controlled by the .item-icon CSS rules (16-22px per
  // context, object-fit: contain) — width/height here just give next/image the
  // source aspect ratio, they don't set the on-screen size.
  return <Image className="item-icon" src={src} alt="" title={label} width={64} height={64} />;
}

function auctionPageItemOptions(auction, auctionItems) {
  const quantityByItemId = new Map(
    (auction.inventory || []).map((row) => [row.item_id, row.quantity || 0]),
  );
  return auctionItems
    .filter((item) => itemAppliesTo(item, auction.type))
    .filter((item) => (quantityByItemId.get(item.id) || 0) > 0)
    .sort(
      (a, b) =>
        (AUCTION_PAGE_ITEM_ORDER[a.item_key] || 99) -
          (AUCTION_PAGE_ITEM_ORDER[b.item_key] || 99) ||
        (a.sort_order || 0) - (b.sort_order || 0),
    );
}

function auctionItemPageJumps(auction, auctionItems) {
  const quantityByItemId = new Map(
    (auction.inventory || []).map((row) => [row.item_id, row.quantity || 0]),
  );
  let slotOffset = 0;
  return auctionPageItemOptions(auction, auctionItems).map((item) => {
    const quantity = quantityByItemId.get(item.id) || 0;
    const startPage = Math.floor(slotOffset / 4) + 1;
    const endPage = Math.floor((slotOffset + quantity - 1) / 4) + 1;
    slotOffset += quantity;
    return { item, quantity, startPage, endPage };
  });
}

function buildAuctionPages(auction, auctionItems, selectedItemId = null) {
  const selectedItem =
    auctionItems.find((item) => item.id === selectedItemId) || null;
  const applicableItems = auctionItems
    .filter((item) => itemAppliesTo(item, auction.type))
    .filter((item) => {
      if (!selectedItemId) return true;
      if (SHARED_FEATHER_PAGE_KEYS.has(selectedItem?.item_key)) {
        return SHARED_FEATHER_PAGE_KEYS.has(item.item_key);
      }
      return item.id === selectedItemId;
    })
    .sort(
      (a, b) =>
        auctionDisplayItemOrder(a) - auctionDisplayItemOrder(b) ||
        (a.sort_order || 0) - (b.sort_order || 0),
    );
  const quantityByItemId = new Map(
    (auction.inventory || []).map((row) => [row.item_id, row.quantity || 0]),
  );
  const unitsByItemId = new Map();
  for (const unit of auction.units || []) {
    const itemUnits = unitsByItemId.get(unit.item_id) || [];
    itemUnits.push(unit);
    unitsByItemId.set(unit.item_id, itemUnits);
  }
  for (const itemUnits of unitsByItemId.values()) {
    itemUnits.sort(
      (a, b) =>
        auctionUnitDisplayPage(a) - auctionUnitDisplayPage(b) ||
        auctionUnitDisplaySlot(a) - auctionUnitDisplaySlot(b),
    );
  }
  const slots = [];
  let displayIndex = 0;

  for (const item of applicableItems) {
    const quantity = quantityByItemId.get(item.id) || 0;
    const itemUnits = unitsByItemId.get(item.id) || [];
    for (let index = 0; index < quantity; index += 1) {
      const page = Math.floor(displayIndex / 4) + 1;
      const slot = (displayIndex % 4) + 1;
      const unit = itemUnits[index];
      if (!selectedItemId || item.id === selectedItemId) {
        slots.push({
          page,
          displayPage: page,
          slot,
          item,
          unit,
          member: unit?.member || null,
          freeForAll: !item.gates_round_completion,
        });
      }
      displayIndex += 1;
    }
  }

  const minDisplayPage = slots.length
    ? Math.min(...slots.map((slot) => slot.displayPage))
    : 1;
  const maxDisplayPage = slots.length
    ? Math.max(...slots.map((slot) => slot.displayPage))
    : 1;
  const pages = [];
  for (
    let displayPage = minDisplayPage;
    displayPage <= maxDisplayPage;
    displayPage += 1
  ) {
    const page = displayPage - minDisplayPage + 1;
    pages.push({
      page,
      displayPage,
      slots: [1, 2, 3, 4]
        .map(
          (slot) =>
            slots.find(
              (entry) =>
                entry.displayPage === displayPage && entry.slot === slot,
            ) || {
              page,
              displayPage,
              slot,
              item: null,
              unit: null,
              member: null,
              freeForAll: false,
            },
        )
        .map((entry) => ({ ...entry, displayPage })),
    });
  }

  return pages;
}

function AuctionPageView({
  auction,
  auctionItems,
  page,
  onPageChange,
  selectedItemId,
  onSelectedItemChange,
  searchQuery = "",
}) {
  const itemOptions = auctionPageItemOptions(auction, auctionItems);
  const itemPageJumps = auctionItemPageJumps(auction, auctionItems);
  const safeSelectedItemId = itemOptions.some(
    (item) => item.id === selectedItemId,
  )
    ? selectedItemId
    : null;
  const selectedItem =
    itemOptions.find((item) => item.id === safeSelectedItemId) || null;
  const pages = buildAuctionPages(auction, auctionItems, null);
  const pageCount = pages.length || 1;
  const { searching, matchingPages, currentPage, previousPage, nextPage } =
    auctionPageNavigation(pages, page || 1, searchQuery);
  const safePage = currentPage?.page || 1;
  const normalizedSearch = searchQuery.trim().toLowerCase();

  function setPage(nextPage) {
    onPageChange(Math.min(Math.max(nextPage, 1), pageCount));
  }

  return (
    <div className="auction-page-view">
      {searching && (
        <div className="auction-page-matches">
          <p role="status">
            {matchingPages.length
              ? `Found on ${matchingPages.length} page${matchingPages.length === 1 ? "" : "s"}`
              : `No matching bids for “${searchQuery.trim()}”.`}
          </p>
          {matchingPages.length > 0 && (
            <div
              className="auction-matching-pages"
              role="group"
              aria-label="Matching auction pages"
              tabIndex={0}
              key={normalizedSearch}
            >
              {matchingPages.map((match) => (
                <button
                  type="button"
                  className="ghost-button"
                  key={match.page}
                  aria-label={`Go to matching page ${match.displayPage || match.page}`}
                  aria-pressed={match.page === safePage}
                  onClick={() => setPage(match.page)}
                >
                  Page {match.displayPage || match.page}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {!searching && (
        <div
          className="auction-item-tabs"
          aria-label="Auction item page filter"
        >
          {/* Item buttons are page jumps in the combined book; selectedItemId plumbing remains for possible item-only tabs later. */}
          <button
            type="button"
            className={!safeSelectedItemId ? "active" : ""}
            onClick={() => {
              onSelectedItemChange(null);
              setPage(1);
            }}
          >
            <LayoutGrid size={14} />
            <span>All items</span>
          </button>
          {itemPageJumps.map(({ item, quantity, startPage }) => {
            return (
              <button
                type="button"
                className={safeSelectedItemId === item.id ? "active" : ""}
                onClick={() => {
                  onSelectedItemChange(item.id);
                  setPage(startPage);
                }}
                key={item.id}
              >
                <ItemIcon
                  itemKey={item.item_key}
                  label={item.name || item.short_name}
                />
                <span>{item.short_name}</span>
                <em>Page {startPage}</em>
                <strong>x{quantity}</strong>
              </button>
            );
          })}
        </div>
      )}
      {currentPage && (
        <>
          <div className="auction-page-controls">
            <button
              className="ghost-button mini"
              type="button"
              onClick={() => setPage(previousPage)}
              disabled={previousPage === null}
            >
              {searching ? "Previous match" : "Prev"}
            </button>
            <label className="auction-page-jump">
              <input
                type="number"
                min="1"
                max={pageCount}
                value={currentPage.displayPage || safePage}
                disabled={searching}
                onChange={(event) =>
                  setPage(Number.parseInt(event.target.value, 10) || 1)
                }
                aria-label="Jump to page"
              />
              <span className="auction-page-divider">|</span>
              <input
                type="text"
                value={pageCount}
                disabled
                aria-label="Total pages"
              />
            </label>
            <button
              className="ghost-button mini"
              type="button"
              onClick={() => setPage(nextPage)}
              disabled={nextPage === null}
            >
              {searching ? "Next match" : "Next"}
            </button>
          </div>
          <div className="auction-page-card">
            <header>
              <span>
                {(!searching && selectedItem?.name) ||
                  auction.name ||
                  auctionTypeLabel(auction.type)}
              </span>
              <strong>Page {currentPage.displayPage || safePage}</strong>
            </header>
            <div className="auction-page-slots">
              {currentPage.slots.map((slot) => {
                const highlighted =
                  normalizedSearch &&
                  String(slot.member?.char_name || "")
                    .toLowerCase()
                    .includes(normalizedSearch);
                return (
                  <div
                    className={`auction-page-slot ${slot.member ? "assigned" : slot.freeForAll ? "free" : "empty"}${highlighted ? " search-hit" : ""}`}
                    key={`${slot.page}-${slot.slot}`}
                  >
                    <div className="auction-slot-number">Slot {slot.slot}</div>
                    <div className="auction-slot-item">
                      <ItemIcon
                        itemKey={slot.item?.item_key}
                        label={
                          slot.item?.name || slot.item?.short_name || "Item"
                        }
                      />
                      <strong>{slot.item?.short_name || "Empty"}</strong>
                      <em>{slot.item?.name || "No item"}</em>
                    </div>
                    {slot.member ? (
                      <div className="auction-slot-member">
                        <ClassIcon
                          name={slot.member.char_class}
                          size={30}
                          glow={false}
                        />
                        <span>
                          <strong>{slot.member.char_name}</strong>
                          <em>{slot.member.char_class}</em>
                        </span>
                      </div>
                    ) : slot.freeForAll ? (
                      <div className="auction-slot-member free">
                        <Trophy size={20} />
                        <span>
                          <strong>Free for all</strong>
                          <em>No bid limit</em>
                        </span>
                      </div>
                    ) : (
                      <div className="auction-slot-member empty">
                        <span>
                          <strong>No bidder</strong>
                          <em>Unassigned slot</em>
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="auction-page-controls bottom">
            <button
              className="ghost-button mini"
              type="button"
              onClick={() => setPage(previousPage)}
              disabled={previousPage === null}
            >
              {searching ? "Previous match" : "Prev"}
            </button>
            <span className="auction-page-jump static">
              <input
                type="text"
                value={currentPage.displayPage || safePage}
                disabled
                aria-label="Current page"
              />
              <span className="auction-page-divider">|</span>
              <input
                type="text"
                value={pageCount}
                disabled
                aria-label="Total pages"
              />
            </span>
            <button
              className="ghost-button mini"
              type="button"
              onClick={() => setPage(nextPage)}
              disabled={nextPage === null}
            >
              {searching ? "Next match" : "Next"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function AuctionStartForm({
  type,
  auctionItems,
  internalCaps = {},
  onCancel,
  onStart,
  busy,
}) {
  const applicable = auctionItems.filter((item) => itemAppliesTo(item, type));
  const cappedItems = applicable.filter((item) => item.gates_round_completion);
  const [name, setName] = useState(
    type === "league_prize" ? "League Prize" : "Guild Auction",
  );
  const [inventory, setInventory] = useState(() =>
    Object.fromEntries(applicable.map((item) => [item.item_key, "0"])),
  );
  const [useInGameCaps, setUseInGameCaps] = useState(false);
  const [inGameCaps, setInGameCaps] = useState(() =>
    Object.fromEntries(cappedItems.map((item) => [item.item_key, ""])),
  );

  function submit(event) {
    event.preventDefault();
    onStart({
      type,
      name,
      inventory: Object.fromEntries(
        applicable.map((item) => [
          item.item_key,
          Number.parseInt(inventory[item.item_key] || "0", 10) || 0,
        ]),
      ),
      inGameCaps: useInGameCaps
        ? Object.fromEntries(
            cappedItems.map((item) => [
              item.item_key,
              Number.parseInt(inGameCaps[item.item_key] || "0", 10) || 0,
            ]),
          )
        : {},
    });
  }

  return (
    <form onSubmit={submit} className="form-grid single">
      <label>
        <span>Auction name</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoFocus
        />
      </label>
      <div className="auction-form-items">
        {applicable.map((item) => (
          <label key={item.id}>
            <span>{item.name}</span>
            <input
              type="number"
              min="0"
              value={inventory[item.item_key] ?? "0"}
              onChange={(event) =>
                setInventory((current) => ({
                  ...current,
                  [item.item_key]: event.target.value,
                }))
              }
            />
          </label>
        ))}
      </div>
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={useInGameCaps}
          onChange={(event) => setUseInGameCaps(event.target.checked)}
        />
        <span>Use in-game per-member limits for this auction</span>
      </label>
      {useInGameCaps && (
        <div className="auction-form-items compact">
          {cappedItems.map((item) => (
            <label key={item.id}>
              <span>{item.short_name} in-game limit</span>
              <input
                type="number"
                min="0"
                placeholder={`Internal ${internalCaps[item.item_key] ?? item.default_per_round_cap ?? 0}`}
                value={inGameCaps[item.item_key] ?? ""}
                onChange={(event) =>
                  setInGameCaps((current) => ({
                    ...current,
                    [item.item_key]: event.target.value,
                  }))
                }
              />
            </label>
          ))}
        </div>
      )}
      <p className="field-note">
        Enter the combined Guild and League prize totals for each item. These
        quantities generate one auction list with each member’s bid
        instructions.
      </p>
      <div className="form-actions">
        <button type="button" className="ghost-button" onClick={onCancel}>
          Cancel
        </button>
        <button className="primary-button" disabled={busy}>
          {busy ? <Loader2 className="spin" size={15} /> : <Gavel size={15} />}
          Start {auctionTypeLabel(type)}
        </button>
      </div>
    </form>
  );
}

function AuctionLimitsForm({
  auctionItems,
  auctionState,
  onCancel,
  onSave,
  busy,
}) {
  const currentCaps = auctionState?.itemCaps || {};
  const limitedItems = auctionItems.filter(
    (item) => item.gates_round_completion,
  );
  const [caps, setCaps] = useState(() =>
    Object.fromEntries(
      limitedItems.map((item) => [
        item.item_key,
        String(currentCaps[item.item_key] ?? item.default_per_round_cap ?? 0),
      ]),
    ),
  );

  function submit(event) {
    event.preventDefault();
    onSave(
      Object.fromEntries(
        limitedItems.map((item) => [
          item.item_key,
          Number.parseInt(caps[item.item_key] || "0", 10) || 0,
        ]),
      ),
    );
  }

  return (
    <form onSubmit={submit} className="form-grid single">
      <div className="auction-form-items">
        {limitedItems.map((item) => (
          <label key={item.id}>
            <span>{item.name}</span>
            <input
              type="number"
              min="0"
              value={caps[item.item_key] ?? "0"}
              onChange={(event) =>
                setCaps((current) => ({
                  ...current,
                  [item.item_key]: event.target.value,
                }))
              }
            />
          </label>
        ))}
      </div>
      <p className="field-note">
        These shared caps apply to every member in the auction lineup. Illusion
        Card Fragments are free-for-all and do not affect limits.
      </p>
      <div className="form-actions">
        <button type="button" className="ghost-button" onClick={onCancel}>
          Cancel
        </button>
        <button className="primary-button" disabled={busy}>
          {busy ? <Loader2 className="spin" size={15} /> : <Check size={15} />}
          Save limits
        </button>
      </div>
    </form>
  );
}

function GlobalAuctionDefaultsForm({ auctionItems, onCancel, onSave, busy }) {
  const limitedItems = auctionItems.filter(
    (item) => item.gates_round_completion,
  );
  const [caps, setCaps] = useState(() =>
    Object.fromEntries(
      limitedItems.map((item) => [
        item.item_key,
        String(item.default_per_round_cap ?? 0),
      ]),
    ),
  );

  function submit(event) {
    event.preventDefault();
    onSave(
      Object.fromEntries(
        limitedItems.map((item) => [
          item.item_key,
          Number.parseInt(caps[item.item_key] || "0", 10) || 0,
        ]),
      ),
    );
  }

  return (
    <form onSubmit={submit} className="form-grid single">
      <div className="auction-form-items">
        {limitedItems.map((item) => (
          <label key={item.id}>
            <span>{item.name}</span>
            <input
              type="number"
              min="0"
              value={caps[item.item_key] ?? "0"}
              onChange={(event) =>
                setCaps((current) => ({
                  ...current,
                  [item.item_key]: event.target.value,
                }))
              }
            />
          </label>
        ))}
      </div>
      <p className="field-note">
        These defaults are used for future auction lineups and as the fallback
        when no lineup or member-specific override exists.
      </p>
      <div className="form-actions">
        <button type="button" className="ghost-button" onClick={onCancel}>
          Cancel
        </button>
        <button className="primary-button" disabled={busy}>
          {busy ? <Loader2 className="spin" size={15} /> : <Check size={15} />}
          Save defaults
        </button>
      </div>
    </form>
  );
}

function FinalizePreviewModal({ preview, busy, onCancel, onConfirm }) {
  const warnings = preview?.warnings || [];
  const itemSummaries = preview?.itemSummaries || [];
  const memberRange = (bucket) => {
    const first = bucket.firstMember;
    const last = bucket.lastMember;
    if (!first && !last) return "";
    const formatMember = (member) =>
      member ? `#${member.line} ${member.name}` : "";
    if (!last || first?.member_id === last?.member_id)
      return `from ${formatMember(first)}`;
    return `from ${formatMember(first)} to ${formatMember(last)}`;
  };

  return (
    <Modal title="Finalize preview" onClose={onCancel} size="default">
      <div className="finalize-preview">
        <div className="finalize-preview-heading">
          <div>
            <p className="eyebrow">transaction preview</p>
            <h3>{preview?.auction?.name || "Auction"}</h3>
          </div>
          <span>{preview?.totals?.allocations || 0} allocations</span>
        </div>

        {warnings.length > 0 && (
          <div className="finalize-warning">
            <AlertTriangle size={16} />
            <div>
              <strong>Review cycle rollover</strong>
              {warnings.map((warning) => (
                <span key={warning}>{warning}</span>
              ))}
            </div>
          </div>
        )}

        <div className="finalize-summary-grid">
          {itemSummaries.map((summary) => (
            <div className="finalize-summary-card" key={summary.item_key}>
              <strong>{summary.short_name}</strong>
              <span>
                {summary.quantity} items · {summary.memberCount} members
              </span>
              {summary.cycleBuckets.map((bucket) => (
                <em
                  className="finalize-cycle-row"
                  key={`${summary.item_key}-${bucket.item_cycle}`}
                >
                  <span>
                    {bucket.item_cycle > 0
                      ? `Cycle ${bucket.item_cycle}`
                      : "Current cycle"}
                    : {bucket.quantity} items
                    {bucket.memberCount
                      ? ` · ${bucket.memberCount} members`
                      : ""}
                  </span>
                  {bucket.memberCount ? (
                    <span className="finalize-member-range">
                      {memberRange(bucket)}
                    </span>
                  ) : null}
                </em>
              ))}
            </div>
          ))}
        </div>

        <div className="form-actions">
          <button
            type="button"
            className="ghost-button"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? (
              <Loader2 className="spin" size={15} />
            ) : (
              <Check size={15} />
            )}
            Finalize with transaction
          </button>
        </div>
      </div>
    </Modal>
  );
}

function progressCellState(received, cap) {
  if (cap <= 0) return "capped";
  if (received > cap) return "ahead";
  if (received >= cap) return "capped";
  if (received > 0) return "warning";
  return "empty";
}

function progressCellValue(received, cap) {
  if (cap <= 0) return received;
  return Math.min(received, cap);
}

function progressRowNextNeed(row, limitedItems) {
  const missingItems = limitedItems.filter((item) => {
    const received = row.received[item.item_key] || 0;
    const cap = row.caps[item.item_key] ?? item.default_per_round_cap ?? 0;
    return cap > 0 && received < cap;
  });
  const receivedTotal = limitedItems.reduce(
    (sum, item) => sum + (row.received[item.item_key] || 0),
    0,
  );
  if (!missingItems.length) return { label: "waiting cycle", state: "capped" };
  if (receivedTotal === 0) return null;
  const names = missingItems.slice(0, 2).map((item) => item.short_name);
  const suffix = missingItems.length > 2 ? ` +${missingItems.length - 2}` : "";
  return {
    label: `needs ${names.join(", ")}${suffix}`,
    state: "warning",
  };
}

function progressRowReady(row, limitedItems) {
  return limitedItems.every((item) => {
    const received = row.received[item.item_key] || 0;
    const cap = row.caps[item.item_key] ?? item.default_per_round_cap ?? 0;
    return cap <= 0 || received >= cap;
  });
}

function progressReceivedTotal(row, limitedItems) {
  return limitedItems.reduce(
    (sum, item) => sum + (row.received[item.item_key] || 0),
    0,
  );
}

function progressRowQueueState(row, limitedItems, priorityMemberId) {
  if (progressRowReady(row, limitedItems))
    return { label: "ready", state: "ready" };
  if (row.member.id === priorityMemberId)
    return { label: "priority", state: "priority" };
  if (progressReceivedTotal(row, limitedItems) > 0)
    return { label: "partial", state: "partial" };
  return { label: "in queue", state: "queue" };
}

function buildActiveBidStatus(auctionState, limitedItems) {
  const itemById = new Map(limitedItems.map((item) => [item.id, item]));
  const biddingByMemberId = new Map();
  for (const auction of auctionState?.activeAuctions || []) {
    for (const unit of auction.units || []) {
      const item = itemById.get(unit.item_id);
      if (!item || !unit.member_id) continue;
      const memberItems = biddingByMemberId.get(unit.member_id) || new Map();
      const current = memberItems.get(item.item_key) || {
        item,
        quantity: 0,
        regularQuantity: 0,
        resetQuantity: 0,
        cycleReset: false,
      };
      current.quantity += 1;
      if (unit.cycle_reset) {
        current.resetQuantity += 1;
        current.cycleReset = true;
      } else {
        current.regularQuantity += 1;
      }
      memberItems.set(item.item_key, current);
      biddingByMemberId.set(unit.member_id, memberItems);
    }
  }

  return { biddingByMemberId };
}

function activeItemPreview(activeItem, received, cap) {
  if (!activeItem) return null;
  const usesResetCycle = activeItem.resetQuantity > 0 || activeItem.cycleReset;
  const quantity = usesResetCycle
    ? activeItem.resetQuantity || activeItem.quantity
    : activeItem.regularQuantity || activeItem.quantity;
  const base = usesResetCycle ? 0 : received;
  return {
    quantity,
    next: cap > 0 ? Math.min(base + quantity, cap) : base + quantity,
    usesResetCycle,
  };
}

function MemberProgressTable({ auctionItems, auctionState }) {
  const limitedItems = auctionItems.filter(
    (item) => item.gates_round_completion,
  );
  const rows = auctionState?.progress || [];
  const nowMs = Date.now();
  const priorityMemberId =
    [...rows]
      .sort(
        (a, b) =>
          auctionPriorityRank(a.member) - auctionPriorityRank(b.member) ||
          a.position - b.position,
      )
      .find(
        (row) =>
          !getAuctionCooldown(row.member, nowMs) &&
          !progressRowReady(row, limitedItems),
      )?.member.id || null;
  const activeBidStatus = buildActiveBidStatus(auctionState, limitedItems);
  if (!rows.length) {
    return (
      <div className="empty-panel compact">
        Create an auction lineup to track member item progress.
      </div>
    );
  }

  return (
    <div className="member-progress-card">
      <header>
        <div>
          <h3>Permanent auction lineup</h3>
        </div>
        <span>{rows.length} members</span>
      </header>
      <p className="progress-cycle-note">
        This lineup stays across auctions. Item counts and statuses show each
        member&apos;s progress in the current cycle.
      </p>
      <div
        className="progress-table-wrap"
        tabIndex={0}
        role="region"
        aria-label="Permanent auction lineup table. Scroll horizontally to see all columns."
      >
        <table className="progress-table">
          <colgroup>
            <col className="progress-col-line" />
            <col className="progress-col-member" />
            {limitedItems.map((item) => (
              <col className="progress-col-item" key={item.id} />
            ))}
            <col className="progress-col-status" />
            <col className="progress-col-held" />
          </colgroup>
          <thead>
            <tr>
              <th>Line</th>
              <th>Member</th>
              {limitedItems.map((item) => (
                <th key={item.id}>{item.short_name}</th>
              ))}
              <th>Status</th>
              <th>Current cycle</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const nextNeed = progressRowNextNeed(row, limitedItems);
              const queueState = progressRowQueueState(
                row,
                limitedItems,
                priorityMemberId,
              );
              const activeBidItems = activeBidStatus.biddingByMemberId.get(
                row.member.id,
              );
              const cooldown = getAuctionCooldown(row.member, nowMs);
              const cooldownLabel = cooldown
                ? `Eligible ${formatPhDateTime(cooldown.endsAtMs)} PH`
                : "";
              const biddingIncomplete = activeBidItems
                ? limitedItems.some((item) => {
                    const cap =
                      row.caps[item.item_key] ??
                      item.default_per_round_cap ??
                      0;
                    if (cap <= 0) return false;
                    const activeItem = activeBidItems.get(item.item_key);
                    const preview = activeItemPreview(
                      activeItem,
                      row.received[item.item_key] || 0,
                      cap,
                    );
                    return cap > 0 && preview && preview.next < cap;
                  })
                : false;
              return (
                <tr
                  className={cooldown ? "cooldown-row" : ""}
                  key={row.member.id}
                >
                  <td>{row.position}</td>
                  <td>
                    <strong>{row.member.char_name}</strong>
                    <span>{row.member.char_class}</span>
                    {cooldown && <em>{cooldownLabel}</em>}
                  </td>
                  {limitedItems.map((item) => {
                    const received = row.received[item.item_key] || 0;
                    const cap =
                      row.caps[item.item_key] ??
                      item.default_per_round_cap ??
                      0;
                    const activeItem = activeBidItems?.get(item.item_key);
                    const bidPreview = activeItemPreview(
                      activeItem,
                      received,
                      cap,
                    );
                    const displayReceived = progressCellValue(received, cap);
                    return (
                      <td key={item.id}>
                        <div className="progress-item-stack">
                          <span
                            className={`progress-count ${progressCellState(received, cap)}`}
                          >
                            {displayReceived}/{cap}
                          </span>
                          {bidPreview && (
                            <span
                              className={`progress-bid-text bid-${item.item_key}`}
                            >
                              +{bidPreview.quantity} → {bidPreview.next}/{cap}
                            </span>
                          )}
                        </div>
                      </td>
                    );
                  })}
                  <td>
                    <div className="progress-status-stack">
                      {cooldown ? (
                        <>
                          <em className="progress-status cooldown">
                            cooldown{" "}
                            {formatCooldownRemaining(cooldown.remainingMs)}
                          </em>
                          <em className="progress-status queue">
                            {cooldownLabel}
                          </em>
                        </>
                      ) : activeBidItems ? (
                        <em
                          className={`progress-status ${biddingIncomplete ? "bidding-partial" : "bidding"}`}
                        >
                          {biddingIncomplete ? "partial bidding" : "bidding"}
                        </em>
                      ) : (
                        <>
                          {queueState.state !== "ready" && (
                            <em
                              className={`progress-status ${queueState.state}`}
                            >
                              {queueState.label}
                            </em>
                          )}
                          {nextNeed && (
                            <em className={`progress-status ${nextNeed.state}`}>
                              {nextNeed.label}
                            </em>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                  <td>
                    <div className="progress-cycle-summary">
                      {limitedItems.map((item) => {
                        const received = (row.received[item.item_key] || 0) > 0;
                        return (
                          <span
                            className={`progress-cycle-pill ${received ? "received" : "pending"}`}
                            key={item.id}
                          >
                            <ItemIcon
                              itemKey={item.item_key}
                              label={item.name || item.short_name}
                            />
                            <em>{received ? "Received" : "Pending"}</em>
                          </span>
                        );
                      })}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AuctionFoundation({
  auctionItems,
  auctionState,
  onOpenStartAuction,
  onOpenLimits,
  onOpenGlobalLimits,
  onSaveSavepoint,
  onRestoreSavepoint,
  canManageGlobalDefaults = false,
  onLockAuction,
  onDoneAuction,
  onCancelAuction,
  onDoneEvent,
  onCopyAuctionList,
  onCopyBidderNames,
  readOnly = false,
  busy,
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [auctionView, setAuctionView] = useState("list");
  const [auctionPages, setAuctionPages] = useState({});
  const [auctionPageItems, setAuctionPageItems] = useState({});
  const [auctionSearch, setAuctionSearch] = useState("");
  const activeRound = auctionState?.activeRound;
  const activeAuctions =
    auctionState?.activeAuctions ||
    (auctionState?.activeAuction ? [auctionState.activeAuction] : []);
  const hasOpenAuctions = activeAuctions.length > 0;
  const glAuction = activeAuctions.find((auction) => auction.type === "gl_woe");
  const leagueAuction = activeAuctions.find(
    (auction) => auction.type === "league_prize",
  );
  const lockedGlReadyForLeague = glAuction?.status === "locked";
  const pairedEventActive = Boolean(lockedGlReadyForLeague && leagueAuction);
  const auctionHint = pairedEventActive
    ? "These existing auctions can still be finalized together. For future auctions, enter combined Guild and League prize totals in one list."
    : hasOpenAuctions
      ? "Review the bid instructions, then finalize after the in-game bids are complete."
      : "Enter combined Guild and League prize totals to generate one auction list.";
  const bidderNames = uniqueBidderNames(activeAuctions, auctionItems);
  const logoutRows = logoutCandidateRows(auctionState);
  const logoutNames = logoutRows
    .map((row) => row.member.char_name)
    .filter(Boolean);

  function applyAuctionSearch(nextQuery) {
    setAuctionSearch(nextQuery);
    setAuctionPages({});
    setAuctionPageItems({});
  }

  return (
    <>
      {activeAuctions.length ? (
        <section className="content-section auction-logout-section">
          <div className="auction-logout-heading">
            <div>
              <h3>
                <LogOut size={18} />
                Members without bids
              </h3>
              <em>Review these members for logout or the 96-hour cooldown.</em>
            </div>
            <span>
              {logoutRows.length} member{logoutRows.length === 1 ? "" : "s"}
            </span>
            {!readOnly && (
              <button
                className="ghost-button"
                type="button"
                onClick={() => onCopyBidderNames(logoutNames, "logout member")}
                disabled={!logoutNames.length}
              >
                <Copy size={15} />
                Copy names
              </button>
            )}
          </div>
          {logoutRows.length ? (
            <div className="auction-logout-list">
              {logoutRows.map((row) => (
                <div className="auction-logout-row" key={row.member.id}>
                  <strong>{row.member.char_name}</strong>
                  <span>Line {row.position}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="auction-logout-empty">
              Every lineup member has an active bid allocation.
            </div>
          )}
        </section>
      ) : null}

      <section className="content-section auction-section">
        <div className="section-title-row">
          <div>
            <h2>Auctions</h2>
            <p className="section-description">
              {readOnly
                ? "Find your items and check which page and slot to bid on."
                : "Enter the rewards. Review who bids, on which page, and in which slot."}
            </p>
          </div>
          <div className="section-actions">
            <CollapseButton
              collapsed={collapsed}
              onToggle={() => setCollapsed((current) => !current)}
            />
            <span className="status-pill">
              <Swords size={14} />
              {activeRound ? "Lineup active" : "No lineup"}
            </span>
          </div>
        </div>

        {collapsed ? (
          <div className="collapsed-summary">
            {activeAuctions.length
              ? `${activeAuctions.length} active auction${activeAuctions.length === 1 ? "" : "s"}`
              : "No active auction list"}
          </div>
        ) : (
          <>
            {!readOnly && (
              <>
                <ol className="auction-workflow" aria-label="Auction steps">
                  <li aria-current={!hasOpenAuctions ? "step" : undefined}>
                    <span>1</span>
                    <div>
                      <strong>Enter rewards</strong>
                      <p>Set the item quantities available in game.</p>
                    </div>
                  </li>
                  <li
                    aria-current={
                      hasOpenAuctions && !lockedGlReadyForLeague
                        ? "step"
                        : undefined
                    }
                  >
                    <span>2</span>
                    <div>
                      <strong>Review bids</strong>
                      <p>
                        Check each member’s assigned items, pages, and slots.
                      </p>
                    </div>
                  </li>
                  <li
                    aria-current={lockedGlReadyForLeague ? "step" : undefined}
                  >
                    <span>3</span>
                    <div>
                      <strong>Finalize</strong>
                      <p>Confirm the completed bids to save progress.</p>
                    </div>
                  </li>
                </ol>
                <div className="auction-start-row">
                  <button
                    className="primary-button"
                    type="button"
                    disabled={
                      !activeRound ||
                      Boolean(glAuction) ||
                      Boolean(leagueAuction)
                    }
                    onClick={() => onOpenStartAuction("gl_woe")}
                  >
                    <Plus size={16} />
                    New Guild Auction
                  </button>
                  {pairedEventActive && (
                    <button
                      className="primary-button"
                      type="button"
                      onClick={() => onDoneEvent([glAuction, leagueAuction])}
                      disabled={busy}
                    >
                      {busy ? (
                        <Loader2 className="spin" size={15} />
                      ) : (
                        <Check size={15} />
                      )}
                      Review & finalize event
                    </button>
                  )}
                  {hasOpenAuctions && (
                    <button
                      className="danger-button soft"
                      type="button"
                      onClick={() =>
                        onCancelAuction(
                          [glAuction, leagueAuction].filter(Boolean),
                        )
                      }
                      disabled={busy}
                    >
                      <X size={15} />
                      Cancel auction
                    </button>
                  )}
                </div>
                <p className="auction-flow-note">{auctionHint}</p>
              </>
            )}
            {!readOnly && (
              <details className="round-card auction-settings">
                <summary>
                  <Settings size={16} />
                  Auction settings & checkpoints
                </summary>
                <div className="round-main">
                  <div>
                    <h3>Allocation limits</h3>
                    <p>
                      {activeRound
                        ? "shared limits for the current auction lineup"
                        : "create members first, then adjust auction settings"}
                    </p>
                  </div>
                </div>
                <div className="round-actions">
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={onOpenLimits}
                    disabled={!activeRound || hasOpenAuctions}
                  >
                    <Settings size={15} />
                    Adjust limits
                  </button>
                  {canManageGlobalDefaults && (
                    <>
                      <button
                        className="ghost-button"
                        type="button"
                        onClick={onOpenGlobalLimits}
                      >
                        <Settings size={15} />
                        Global defaults
                      </button>
                      <button
                        className="ghost-button"
                        type="button"
                        onClick={onSaveSavepoint}
                        disabled={!activeRound || busy}
                      >
                        <Save size={15} />
                        Save checkpoint
                      </button>
                      <button
                        className="danger-button soft"
                        type="button"
                        onClick={onRestoreSavepoint}
                        disabled={busy}
                      >
                        <RefreshCw size={15} />
                        Restore checkpoint
                      </button>
                    </>
                  )}
                </div>
              </details>
            )}

            {activeAuctions.length ? (
              <div className="auction-table-tools">
                <label className="auction-search auction-search-shared">
                  <Search size={15} />
                  <input
                    value={auctionSearch}
                    onChange={(event) => applyAuctionSearch(event.target.value)}
                    placeholder="Search auction list"
                    aria-label="Search auction list"
                  />
                  {auctionSearch && (
                    <button
                      type="button"
                      onClick={() => applyAuctionSearch("")}
                      aria-label="Clear member search"
                    >
                      <X size={14} />
                    </button>
                  )}
                </label>
                <div className="auction-view-toggle" aria-label="Auction view">
                  <button
                    type="button"
                    className={auctionView === "list" ? "active" : ""}
                    onClick={() => setAuctionView("list")}
                    aria-pressed={auctionView === "list"}
                  >
                    <List size={14} />
                    By member
                  </button>
                  <button
                    type="button"
                    className={auctionView === "page" ? "active" : ""}
                    onClick={() => setAuctionView("page")}
                    aria-pressed={auctionView === "page"}
                  >
                    <LayoutGrid size={14} />
                    By game page
                  </button>
                </div>
                {!readOnly && (
                  <button
                    className="ghost-button auction-copy-bidders"
                    type="button"
                    onClick={() => onCopyBidderNames(bidderNames)}
                    disabled={!bidderNames.length}
                  >
                    <Copy size={15} />
                    Copy bidders
                  </button>
                )}
              </div>
            ) : null}

            <div
              className={`auction-grid${activeAuctions.length > 1 ? " two-up" : ""}`}
            >
              {activeAuctions.length ? (
                activeAuctions.map((auction) => {
                  const displayAuction = {
                    ...auction,
                    units: displayPositionedAuctionUnits(auction, auctionItems),
                  };
                  const bidRows = groupedAuctionBids(
                    displayAuction.units,
                    auction.queue || [],
                  );
                  const inventorySummary = auctionInventorySummary(
                    auction,
                    auctionItems,
                  );
                  const locked = auction.status === "locked";
                  const activeView = auctionView;
                  const pageItemOptions = auctionPageItemOptions(
                    auction,
                    auctionItems,
                  );
                  const selectedPageItemId = pageItemOptions.some(
                    (item) => item.id === auctionPageItems[auction.id],
                  )
                    ? auctionPageItems[auction.id]
                    : null;
                  const pageStateKey = `${auction.id}:all`;
                  const currentPage = auctionPages[pageStateKey] || 1;
                  const searchQuery = auctionSearch;
                  const filteredBidRows = searchQuery.trim()
                    ? bidRows.filter((row) =>
                        auctionSearchMatches(row, searchQuery),
                      )
                    : bidRows;
                  const searchMatch = filteredBidRows[0] || null;
                  const searchLocation = searchQuery.trim()
                    ? searchMatch
                      ? auctionSearchLocation(searchMatch)
                      : "No matching bid"
                    : "";
                  const cycleResetItems = [
                    ...new Set(
                      bidRows.flatMap((row) =>
                        row.items
                          .filter((item) => item.cycle_reset)
                          .map((item) => item.item),
                      ),
                    ),
                  ];
                  return (
                    <article
                      className={`active-auction-card auction-${auction.type}${locked ? " locked" : ""}`}
                      key={auction.id}
                    >
                      <div className="active-dot-row">
                        <span className={locked ? "idle-dot" : "live-dot"} />
                        <strong>
                          {auction.name || auctionTypeLabel(auction.type)}
                        </strong>
                        <em>
                          {locked
                            ? `${auctionTypeLabel(auction.type)} locked`
                            : auctionTypeLabel(auction.type)}
                        </em>
                      </div>
                      {!readOnly && (
                        <p>
                          {locked
                            ? "This auction list is locked. Finalize after the in-game bids are complete."
                            : "Review the generated page table, then finalize the auction."}
                        </p>
                      )}
                      <div className="active-auction-stats">
                        <span>
                          <Clock3 size={14} />
                          {locked ? "Locked" : "Active"}
                        </span>
                        <span>
                          <Gavel size={14} />
                          {auction.pageCount || 0} pages
                        </span>
                        <span>
                          <Trophy size={14} />
                          {auction.units?.length || 0} allocations
                        </span>
                      </div>
                      {activeView !== "page" && (
                        <div
                          className="auction-prize-summary"
                          aria-label="Auction prize inventory"
                        >
                          {inventorySummary.length ? (
                            inventorySummary.map(({ item, quantity }) => (
                              <span
                                className={`auction-prize-pill prize-${item.item_key}`}
                                key={item.id}
                              >
                                <ItemIcon
                                  itemKey={item.item_key}
                                  label={item.name || item.short_name}
                                />
                                <strong>{item.short_name}</strong>
                                <em>x{quantity}</em>
                              </span>
                            ))
                          ) : (
                            <span className="auction-prize-empty">
                              No prizes entered
                            </span>
                          )}
                        </div>
                      )}
                      {activeView !== "page" && searchLocation && (
                        <div
                          className={
                            searchMatch
                              ? "auction-search-result"
                              : "auction-search-result empty"
                          }
                        >
                          {searchMatch ? (
                            <span>
                              {searchMatch.member?.char_name} · {searchLocation}
                            </span>
                          ) : (
                            <span>
                              No member with active bids matches “
                              {searchQuery.trim()}”.
                            </span>
                          )}
                        </div>
                      )}
                      {cycleResetItems.length > 0 && (
                        <div className="auction-cycle-note">
                          <RefreshCw size={15} />
                          <span>
                            {cycleResetItems.join(", ")}{" "}
                            {cycleResetItems.length === 1
                              ? "cycle finished for all members, so this auction starts a fresh item cycle."
                              : "cycles finished for all members, so this auction starts fresh item cycles."}
                          </span>
                        </div>
                      )}
                      <div className="auction-view-panel">
                        {activeView === "page" ? (
                          <AuctionPageView
                            auction={displayAuction}
                            auctionItems={auctionItems}
                            page={currentPage}
                            onPageChange={(page) =>
                              setAuctionPages((current) => ({
                                ...current,
                                [pageStateKey]: page,
                              }))
                            }
                            selectedItemId={selectedPageItemId}
                            onSelectedItemChange={(itemId) => {
                              setAuctionPageItems((current) => ({
                                ...current,
                                [auction.id]: itemId,
                              }));
                              setAuctionPages((current) => ({
                                ...current,
                                [`${auction.id}:${itemId}`]:
                                  current[`${auction.id}:${itemId}`] || 1,
                              }));
                            }}
                            searchQuery={searchQuery}
                          />
                        ) : (
                          <div
                            className="allocation-table-wrap"
                            tabIndex={0}
                            role="region"
                            aria-label={`${auction.name || auctionTypeLabel(auction.type)} allocation table. Scroll horizontally to see all columns.`}
                          >
                            {filteredBidRows.length ? (
                              <table className="allocation-table">
                                <colgroup>
                                  <col className="allocation-col-member" />
                                  <col />
                                </colgroup>
                                <thead>
                                  <tr>
                                    <th>Member</th>
                                    <th>Bid instructions</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {filteredBidRows.map((row) => (
                                    <tr key={`${auction.id}-${row.member_id}`}>
                                      <td>
                                        <strong>
                                          {row.member?.char_name || "Unknown"}
                                        </strong>
                                        {Number.isFinite(row.queuePosition) &&
                                          row.queuePosition !==
                                            Number.MAX_SAFE_INTEGER && (
                                            <span>
                                              Line {row.queuePosition}
                                            </span>
                                          )}
                                        {row.cycle_reset && (
                                          <span>cycle reset</span>
                                        )}
                                      </td>
                                      <td>
                                        <div className="bid-stack">
                                          {row.items.map((item) => (
                                            <div
                                              className="bid-line"
                                              key={`${item.item_id}-${item.positions}`}
                                            >
                                              <ItemIcon
                                                itemKey={
                                                  item.units?.[0]?.item_key
                                                }
                                                label={item.item}
                                              />
                                              <strong>{item.item}</strong>
                                              <code>{item.positions}</code>
                                              <span>x{item.quantity}</span>
                                            </div>
                                          ))}
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            ) : (
                              <div className="empty-panel compact">
                                {searchQuery.trim()
                                  ? "No matching member has active bids in this auction."
                                  : "No allocations for this auction."}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      {!readOnly && (
                        <div className="active-actions">
                          <button
                            className="ghost-button"
                            type="button"
                            onClick={() => onCopyAuctionList(auction, bidRows)}
                            disabled={!bidRows.length}
                          >
                            <Copy size={15} />
                            Copy list
                          </button>
                          {auction.type === "gl_woe" && !locked && (
                            <button
                              className="ghost-button"
                              type="button"
                              onClick={() => onLockAuction(auction)}
                              disabled={busy}
                            >
                              <Shield size={15} />
                              Lock-in list
                            </button>
                          )}
                          {!pairedEventActive && (
                            <button
                              className="primary-button"
                              type="button"
                              onClick={() => onDoneAuction(auction)}
                              disabled={busy}
                            >
                              {busy ? (
                                <Loader2 className="spin" size={15} />
                              ) : (
                                <Check size={15} />
                              )}
                              Review & finalize
                            </button>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })
              ) : (
                <article className="active-auction-card empty-active">
                  <div className="active-dot-row">
                    <span className="idle-dot" />
                    <strong>No active auction</strong>
                    <em>{activeRound ? "ready" : "waiting"}</em>
                  </div>
                  <p>
                    {activeRound
                      ? "Start a Guild Auction with the rewards available in game. The dashboard will assign bids using your permanent lineup and item limits."
                      : "Create the permanent auction lineup before distributing rewards."}
                  </p>
                  <div className="active-auction-stats">
                    <span>
                      <Clock3 size={14} />
                      Waiting
                    </span>
                    <span>
                      <Gavel size={14} />0 pages
                    </span>
                    <span>
                      <Trophy size={14} />
                      {auctionItems.length} tracked items
                    </span>
                  </div>
                </article>
              )}
            </div>
          </>
        )}
      </section>
      <section
        className="content-section permanent-lineup"
        aria-label="Permanent auction lineup"
      >
        <MemberProgressTable
          auctionItems={auctionItems}
          auctionState={auctionState}
        />
      </section>
    </>
  );
}

export default function DashboardApp({
  publicView = false,
  auditLogView = false,
  accountView = false,
  publicStatsView = false,
  povListView = false,
  adminPage = "members",
}) {
  const router = useRouter();
  const cacheKey = dashboardCacheKey(publicView);
  const cachedDashboardData = dashboardDataCache[cacheKey]?.data || null;
  const [session, setSession] = useState({
    loading: publicView ? false : !adminSessionCache,
    authenticated: publicView || Boolean(adminSessionCache?.authenticated),
    username: publicView ? "public" : adminSessionCache?.username || "",
    role: publicView ? "" : adminSessionCache?.role || "",
    mustResetPassword: Boolean(adminSessionCache?.mustResetPassword),
  });
  // On the public board, `session` above stays forced-authenticated so anonymous
  // visitors keep browsing (and realtime updates keep working) regardless of login.
  // `viewer` separately tracks whether there's a *real* signed-in member/admin
  // behind that, so the header can offer them Account/Log out instead of hiding them.
  const [viewer, setViewer] = useState(
    () => viewerCache || { authenticated: false, username: "", role: "" },
  );
  const [members, setMembers] = useState(cachedDashboardData?.members || []);
  const [groups, setGroups] = useState(cachedDashboardData?.groups || []);
  const [auctionItems, setAuctionItems] = useState(cachedDashboardData?.auctionItems || []);
  const [auctionState, setAuctionState] = useState(cachedDashboardData?.auctionState || null);
  const [jobClasses, setJobClasses] = useState(
    () => cachedDashboardData?.jobClasses || jobClassesCache?.data || [],
  );
  // Was `publicView && !cachedDashboardData` — always false on admin pages
  // regardless of cache state, so a stale/missing dashboard cache (e.g. the
  // first visit to /auctions in a tab that's already signed in, so
  // session.loading is already false) rendered the dashboard shell with
  // auctionState still null/empty before loadData() had actually run,
  // flashing an incorrect "no auction running" empty state.
  const [loading, setLoading] = useState(!cachedDashboardData);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [memberModal, setMemberModal] = useState(null);
  const [groupModal, setGroupModal] = useState(null);
  const [limitModalOpen, setLimitModalOpen] = useState(false);
  const [auctionStartType, setAuctionStartType] = useState(null);
  const [auctionLimitsOpen, setAuctionLimitsOpen] = useState(false);
  const [globalLimitsOpen, setGlobalLimitsOpen] = useState(false);
  const [partyPickerGroup, setPartyPickerGroup] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  const [finalizePreview, setFinalizePreview] = useState(null);
  const [auditLogs, setAuditLogs] = useState(() => auditLogsCache?.data || []);
  const [auditLogsLoading, setAuditLogsLoading] = useState(false);
  const [pendingAccounts, setPendingAccounts] = useState(() => pendingAccountsCache?.data || []);
  const [pendingActionId, setPendingActionId] = useState(null);
  const [jobClassModal, setJobClassModal] = useState(null);
  const [memberStatsSummary, setMemberStatsSummary] = useState(() => memberStatsSummaryCache?.data || []);
  const [memberStatsSummaryLoading, setMemberStatsSummaryLoading] = useState(false);
  const [memberStatsDetail, setMemberStatsDetail] = useState(null);
  const [saving, setSaving] = useState(false);
  const [classFilter, setClassFilter] = useState("");
  const [memberLimit, setMemberLimit] = useState(null);
  const [authQuery, setAuthQuery] = useState({ registerStep: "", authError: "" });
  const realtimeTimerRef = useRef(null);
  const realtimeLoadingRef = useRef(false);
  const scrollRestoreRef = useRef(null);
  const hasDashboardDataRef = useRef(Boolean(cachedDashboardData));
  const skipCacheSyncRef = useRef(Boolean(cachedDashboardData));

  const groupsById = useMemo(
    () => Object.fromEntries(groups.map((group) => [group.id, group])),
    [groups],
  );
  const jobClassesContextValue = useMemo(() => {
    const classOrder = jobClasses.map((cls) => cls.name);
    const classByName = Object.fromEntries(jobClasses.map((cls) => [cls.name, cls]));
    return { jobClasses, classes: jobClasses, classOrder, classByName };
  }, [jobClasses]);
  const effectiveMemberLimit = Math.min(
    Math.max(memberLimit || DEFAULT_GUILD_MEMBER_LIMIT, members.length),
    GUILD_MEMBER_LIMIT,
  );
  const unassignedMembers = members.filter((member) => !member.group_id);
  const publicGlAuction = publicView
    ? (auctionState?.activeAuctions || []).find(
        (auction) => auction.type === "gl_woe",
      )
    : null;

  const captureScrollPosition = useCallback(() => {
    if (typeof window === "undefined") return;
    scrollRestoreRef.current = {
      x: window.scrollX,
      y: window.scrollY,
    };
  }, []);

  const restoreScrollPosition = useCallback(() => {
    if (typeof window === "undefined" || !scrollRestoreRef.current) return;
    const position = scrollRestoreRef.current;
    scrollRestoreRef.current = null;
    window.requestAnimationFrame(() => {
      window.scrollTo({ left: position.x, top: position.y, behavior: "auto" });
      window.requestAnimationFrame(() => {
        window.scrollTo({
          left: position.x,
          top: position.y,
          behavior: "auto",
        });
      });
    });
  }, []);

  const loadData = useCallback(
    async ({ silent = false } = {}) => {
      if (realtimeLoadingRef.current) return;
      const cached = dashboardDataCache[cacheKey];
      const cacheIsFresh = cached && Date.now() - cached.loadedAt < DASHBOARD_CACHE_MAX_AGE_MS;
      if (cached) {
        skipCacheSyncRef.current = true;
        hasDashboardDataRef.current = true;
        setMembers(cached.data.members || []);
        setGroups(cached.data.groups || []);
        setAuctionItems(cached.data.auctionItems || []);
        setAuctionState(cached.data.auctionState || null);
        setJobClasses(cached.data.jobClasses || []);
        if (!silent && cacheIsFresh) return;
      }
      realtimeLoadingRef.current = true;
      if (silent) captureScrollPosition();
      if (!silent && !cached) setLoading(true);
      setError("");
      try {
        const data = await api(
          publicView ? "/api/public/bootstrap" : "/api/bootstrap",
        );
        dashboardDataCache[cacheKey] = { data, loadedAt: Date.now() };
        hasDashboardDataRef.current = true;
        setMembers(data.members || []);
        setGroups(data.groups || []);
        setAuctionItems(data.auctionItems || []);
        setAuctionState(data.auctionState || null);
        setJobClasses(data.jobClasses || []);
      } catch (err) {
        setError(err.message);
      } finally {
        if (!silent) setLoading(false);
        realtimeLoadingRef.current = false;
        if (silent) restoreScrollPosition();
      }
    },
    [cacheKey, captureScrollPosition, publicView, restoreScrollPosition],
  );

  async function checkSession() {
    if (publicView) {
      setSession({
        loading: false,
        authenticated: true,
        username: "public",
        role: "",
        mustResetPassword: false,
      });
      const data = await api("/api/auth/session");
      const nextViewer = {
        authenticated: Boolean(data.authenticated),
        username: data.username || "",
        role: data.role || "",
      };
      viewerCache = nextViewer;
      setViewer(nextViewer);
      loadData();
      // The sidebar now shows for a signed-in admin/super_admin here too, so
      // its "Pending" badge needs a real count instead of whatever stale
      // value happens to be cached from an earlier admin-page visit.
      if (data.authenticated && data.role !== "member") {
        loadPendingAccounts();
      }
      return;
    }
    const data = await api("/api/auth/session");
    const nextSession = {
      loading: false,
      authenticated: data.authenticated,
      username: data.username || "",
      role: data.role || "",
      mustResetPassword: Boolean(data.mustResetPassword),
    };
    adminSessionCache = nextSession;
    if (!nextSession.authenticated) {
      dashboardDataCache.admin = null;
      // accountCache/accountStatsCache are keyed by nothing but "whoever's
      // logged in" — without this, logging out of one account and into
      // another in the same tab briefly paints the previous account's cached
      // profile/stats on /account until its own fetch resolves.
      accountCache = null;
      accountStatsCache = null;
      viewerCache = null;
    }
    setSession(nextSession);
    if (data.authenticated && !data.mustResetPassword) {
      if (auditLogView) {
        if (data.role === "super_admin") loadAuditLogs();
      } else if (accountView || publicStatsView || povListView) {
        // AccountScreen / PublicStatsBoardScreen / PovListScreen all fetch
        // their own data. Reachable by every role, so nothing here to gate
        // or preload. Job classes are the exception: all of them render
        // <ClassIcon>, which reads JobClassesContext (fed by the
        // `jobClasses` state below), and that state only ever gets
        // populated by loadData(), skipped for these views. Without this,
        // icons silently render blank for any member who never loads an
        // admin/public bootstrap page.
        const cachedJobClasses = jobClassesCache;
        const jobClassesFresh =
          cachedJobClasses && Date.now() - cachedJobClasses.loadedAt < DASHBOARD_CACHE_MAX_AGE_MS;
        if (cachedJobClasses) setJobClasses(cachedJobClasses.data);
        if (!jobClassesFresh) {
          api("/api/public/bootstrap")
            .then((bootstrapData) => {
              jobClassesCache = { data: bootstrapData.jobClasses || [], loadedAt: Date.now() };
              setJobClasses(jobClassesCache.data);
            })
            .catch(() => {});
        }
      } else if (data.role === "member") {
        // Member accounts have no business on admin pages — send them straight
        // to their Account page instead of showing the "not permitted" gate.
        router.replace("/account");
      } else {
        loadData();
        loadPendingAccounts();
        loadMemberStatsSummary();
      }
    }
  }

  useEffect(() => {
    checkSession().catch((err) => {
      setSession({
        loading: false,
        authenticated: false,
        username: "",
        role: "",
        mustResetPassword: false,
      });
      setError(err.message);
    });
  }, [loadData, publicView]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    setAuthQuery({
      registerStep: params.get("registerStep") || "",
      authError: params.get("authError") || "",
    });
  }, []);

  useEffect(() => {
    if (!hasDashboardDataRef.current) return;
    if (skipCacheSyncRef.current) {
      skipCacheSyncRef.current = false;
      return;
    }
    dashboardDataCache[cacheKey] = {
      data: { members, groups, auctionItems, auctionState, jobClasses },
      loadedAt: Date.now(),
    };
  }, [auctionItems, auctionState, cacheKey, groups, jobClasses, members]);

  useEffect(() => {
    if (!session.authenticated) return undefined;
    if (!publicView && session.role === "member") return undefined;
    const supabase = getSupabaseBrowser();
    if (!supabase) return undefined;

    const scheduleRefresh = (payload) => {
      if (publicView) {
        const message = dashboardEventMessage(payload?.new?.event_type);
        if (message) setToast(message);
      }
      window.clearTimeout(realtimeTimerRef.current);
      realtimeTimerRef.current = window.setTimeout(() => {
        loadData({ silent: true });
      }, 450);
    };

    const channel = supabase
      .channel("auction-dashboard")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "dashboard_events" },
        scheduleRefresh,
      )
      .subscribe();

    return () => {
      window.clearTimeout(realtimeTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [loadData, publicView, session.authenticated, session.role]);

  useEffect(() => {
    if (!members.length || memberLimit !== null) return;
    const stored = window.localStorage.getItem("encore_member_limit");
    const parsed = stored ? Number.parseInt(stored, 10) : NaN;
    const savedLimit =
      Number.isFinite(parsed) && parsed > 0
        ? parsed
        : DEFAULT_GUILD_MEMBER_LIMIT;
    setMemberLimit(Math.max(savedLimit, members.length));
  }, [memberLimit, members.length]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function syncAuctionMember(updatedMember) {
    setAuctionState((current) => {
      if (!current) return current;
      const mergeMember = (member) =>
        member?.id === updatedMember.id
          ? { ...member, ...updatedMember }
          : member;
      const patchAuction = (auction) => {
        if (!auction) return auction;
        return {
          ...auction,
          queue:
            auction.queue?.map((row) => ({
              ...row,
              member: mergeMember(row.member),
            })) || [],
          units:
            auction.units?.map((unit) => ({
              ...unit,
              member: mergeMember(unit.member),
            })) || [],
        };
      };
      const activeAuctions = current.activeAuctions?.map(patchAuction) || [];

      return {
        ...current,
        progress:
          current.progress?.map((row) => ({
            ...row,
            member: mergeMember(row.member),
          })) || [],
        activeAuctions,
        activeAuction: current.activeAuction
          ? patchAuction(current.activeAuction)
          : activeAuctions[0] || null,
      };
    });
  }

  async function runWithScrollRestore(action) {
    captureScrollPosition();
    try {
      return await action();
    } finally {
      restoreScrollPosition();
    }
  }

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    adminSessionCache = null;
    dashboardDataCache.admin = null;
    // Same reasoning as checkSession's unauthenticated branch above: these are
    // the logged-in user's own profile/stats, not shared data, so they must
    // not survive into whichever account logs in next.
    accountCache = null;
    accountStatsCache = null;
    if (publicView) {
      // The public board stays visible for anonymous visitors after logging out —
      // just drop the real viewer identity, don't wipe the board itself.
      viewerCache = null;
      setViewer({ authenticated: false, username: "", role: "" });
      return;
    }
    setSession({
      loading: false,
      authenticated: false,
      username: "",
      role: "",
      mustResetPassword: false,
    });
    setMembers([]);
    setGroups([]);
    setAuctionItems([]);
    setAuctionState(null);
    setJobClasses([]);
    // Every route renders the login screen in place when unauthenticated, so
    // this isn't required to show it — but without it the URL stays on
    // whatever page you logged out from (e.g. /member-stats) instead of "/".
    router.replace("/");
  }

  async function loadAuditLogs({ force = false } = {}) {
    const cached = auditLogsCache;
    const cacheIsFresh = cached && Date.now() - cached.loadedAt < DASHBOARD_CACHE_MAX_AGE_MS;
    if (cached) setAuditLogs(cached.data);
    if (!force && cacheIsFresh) return;
    setAuditLogsLoading(true);
    try {
      const data = await api("/api/audit-logs");
      auditLogsCache = { data: data.logs || [], loadedAt: Date.now() };
      setAuditLogs(auditLogsCache.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setAuditLogsLoading(false);
    }
  }

  async function loadPendingAccounts({ force = false } = {}) {
    const cached = pendingAccountsCache;
    const cacheIsFresh = cached && Date.now() - cached.loadedAt < DASHBOARD_CACHE_MAX_AGE_MS;
    if (cached) setPendingAccounts(cached.data);
    if (!force && cacheIsFresh) return;
    try {
      const data = await api("/api/members/pending");
      pendingAccountsCache = { data: data.pending || [], loadedAt: Date.now() };
      setPendingAccounts(pendingAccountsCache.data);
    } catch (err) {
      setError(err.message);
    }
  }

  async function respondToPending(account, action) {
    setPendingActionId(account.id);
    try {
      await api(`/api/members/pending/${account.id}`, {
        method: "POST",
        body: JSON.stringify({ action }),
      });
      setToast(
        action === "approve"
          ? `Approved ${account.member?.char_name || account.username}`
          : `Rejected ${account.member?.char_name || account.username}`,
      );
      await loadPendingAccounts({ force: true });
      if (action === "approve") {
        loadData();
        // Approval moves a member off the pending list and onto the roster,
        // which changes membership in the stats summary's excluded set.
        loadMemberStatsSummary({ force: true });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setPendingActionId(null);
    }
  }

  async function saveMember(payload) {
    if (!memberModal?.id && members.length >= effectiveMemberLimit) {
      setError(
        effectiveMemberLimit >= GUILD_MEMBER_LIMIT
          ? `Roster is full at the guild's hard cap: ${members.length}/${GUILD_MEMBER_LIMIT}. Remove a member before adding another.`
          : `Roster is at the guild limit: ${members.length}/${effectiveMemberLimit}. Increase the limit before adding another member.`,
      );
      return;
    }
    setSaving(true);
    try {
      const editing = Boolean(memberModal?.id);
      const data = await api(
        editing ? `/api/members/${memberModal.id}` : "/api/members",
        {
          method: editing ? "PATCH" : "POST",
          body: JSON.stringify(payload),
        },
      );
      setMembers((current) =>
        editing
          ? current.map((member) =>
              member.id === data.member.id ? data.member : member,
            )
          : [...current, data.member].sort((a, b) =>
              a.char_name.localeCompare(b.char_name),
            ),
      );
      if (data.auctionState) {
        setAuctionState(data.auctionState);
      } else {
        syncAuctionMember(data.member);
      }
      if (!editing && auctionState?.activeRound) {
        await loadData();
      }
      setMemberModal(null);
      setToast(editing ? "Member updated" : "Member added");
      // The member record above already saved successfully. Auction cap
      // overrides are a separate, optional step, and the API reports a
      // failure there without failing the whole request, so surface it as its
      // own warning instead of implying the member edit itself didn't save.
      if (data.capOverridesError) {
        setError(`Member saved, but auction limits were not updated: ${data.capOverridesError}`);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function requestCatchUpMemberCycles(member) {
    if (!member?.id) return;
    setMemberModal(null);
    setConfirmAction({
      title: "Catch up auction cycles",
      body: `Catch ${member.char_name} up to current completed item cycles for cooldown overlap? This only updates cycle history and will not create auction allocations.`,
      confirmLabel: "Catch up cycles",
      tone: "default",
      run: async () => {
        const data = await api(`/api/members/${member.id}/catch-up`, {
          method: "POST",
        });
        setAuctionState(data.auctionState || null);
        setToast(
          data.changes?.length
            ? "Member cycles caught up"
            : "Member was already caught up",
        );
      },
    });
  }

  function requestSaveAuctionSavepoint() {
    setConfirmAction({
      title: "Save auction savepoint",
      body: "Save the current auction lineup, progress, limits, and auction history as the restore point for testing?",
      confirmLabel: "Save savepoint",
      tone: "default",
      run: async () => {
        const data = await api("/api/auctions/savepoint", {
          method: "POST",
          body: JSON.stringify({ action: "save" }),
        });
        setToast(
          data.savepoint?.created_at
            ? "Auction savepoint saved"
            : "Savepoint saved",
        );
      },
    });
  }

  function requestRestoreAuctionSavepoint() {
    setConfirmAction({
      title: "Restore auction savepoint",
      body: "Restore the saved auction checkpoint? This removes test auctions and returns lineup progress, limits, and auction history to the savepoint.",
      confirmLabel: "Restore savepoint",
      tone: "danger",
      run: async () => {
        const data = await api("/api/auctions/savepoint", {
          method: "POST",
          body: JSON.stringify({ action: "restore" }),
        });
        if (data.auctionState) setAuctionState(data.auctionState);
        setToast("Auction savepoint restored");
      },
    });
  }

  async function deleteMember(member) {
    setConfirmAction({
      title: "Delete member",
      body: `Delete ${member.char_name}? This removes them from the guild roster and any party slot, and deletes their login account if they have one.`,
      confirmLabel: "Delete member",
      tone: "danger",
      run: async () => {
        const data = await api(`/api/members/${member.id}`, { method: "DELETE" });
        setMembers((current) =>
          current.filter((item) => item.id !== member.id),
        );
        setToast(data?.accountDeleted ? "Member and linked account deleted" : "Member deleted");
      },
    });
  }

  function getOpenPartySlots(groupId, excludedMemberIds = []) {
    const excluded = new Set(excludedMemberIds);
    const used = new Set(
      members
        .filter((item) => item.group_id === groupId && !excluded.has(item.id))
        .map((item) => item.party_slot)
        .filter((slot) => Number.isInteger(slot) && slot >= 1 && slot <= 5),
    );
    return [1, 2, 3, 4, 5].filter((slot) => !used.has(slot));
  }

  function partySlotsFor(memberList, groupId) {
    const group = groupsById[groupId];
    const roster = memberList.filter((member) => member.group_id === groupId);
    return buildPartySlots(roster, group?.name);
  }

  function memberSlot(memberList, member) {
    if (!member?.group_id) return null;
    const slots = partySlotsFor(memberList, member.group_id);
    const index = slots.findIndex((slotMember) => slotMember?.id === member.id);
    return index === -1 ? null : index + 1;
  }

  function applyPartyTargets(memberList, targets) {
    const targetByMemberId = new Map(
      targets.map((target) => [target.member_id, target]),
    );
    return memberList.map((member) => {
      const target = targetByMemberId.get(member.id);
      return target
        ? {
            ...member,
            group_id: target.group_id,
            party_slot: target.party_slot,
          }
        : member;
    });
  }

  function targetsForGroupSlots(groupId, slots) {
    return slots
      .map((member, index) =>
        member
          ? { member_id: member.id, group_id: groupId, party_slot: index + 1 }
          : null,
      )
      .filter(Boolean);
  }

  async function savePartyTargets(targets, successMessage) {
    if (!targets.length) return;
    const previousMembers = members;
    const nextMembers = applyPartyTargets(previousMembers, targets);
    const groupsByLayoutId = new Map();
    const unassignedMemberIds = [];

    for (const target of targets) {
      if (!target.group_id) {
        unassignedMemberIds.push(target.member_id);
        continue;
      }
      if (!groupsByLayoutId.has(target.group_id)) {
        groupsByLayoutId.set(target.group_id, {
          group_id: target.group_id,
          members: [],
        });
      }
      groupsByLayoutId.get(target.group_id).members.push({
        member_id: target.member_id,
        party_slot: target.party_slot,
      });
    }

    setMembers(nextMembers);
    setSaving(true);
    try {
      const data = await api("/api/parties/layout", {
        method: "PATCH",
        body: JSON.stringify({
          groups: [...groupsByLayoutId.values()],
          unassignedMemberIds,
        }),
      });
      const updatedById = new Map(
        (data.members || []).map((member) => [member.id, member]),
      );
      setMembers((current) =>
        current.map((member) => updatedById.get(member.id) || member),
      );
      setToast(successMessage || "Party layout saved");
    } catch (err) {
      setMembers(previousMembers);
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function moveMemberToSlot(memberId, targetGroupId, targetSlot) {
    const source = members.find((member) => member.id === memberId);
    if (!source) return;

    if (!targetGroupId) {
      const targets = [
        { member_id: memberId, group_id: null, party_slot: null },
      ];
      if (source.group_id) {
        const sourceSlots = partySlotsFor(members, source.group_id).map(
          (member) => (member?.id === memberId ? null : member),
        );
        targets.push(...targetsForGroupSlots(source.group_id, sourceSlots));
      }
      await savePartyTargets(targets, "Member unassigned");
      return;
    }

    const slot = Number(targetSlot);
    if (!Number.isInteger(slot) || slot < 1 || slot > 5) return;

    if (source.group_id === targetGroupId) {
      const slots = partySlotsFor(members, targetGroupId);
      const sourceIndex = slots.findIndex((member) => member?.id === memberId);
      const targetIndex = slot - 1;
      if (sourceIndex === -1 || sourceIndex === targetIndex) return;
      [slots[sourceIndex], slots[targetIndex]] = [
        slots[targetIndex],
        slots[sourceIndex],
      ];
      await savePartyTargets(
        targetsForGroupSlots(targetGroupId, slots),
        "Party layout saved",
      );
      return;
    }

    const targetSlots = partySlotsFor(members, targetGroupId);
    const targetOccupant = targetSlots[slot - 1];
    if (targetOccupant?.id === memberId) return;

    const targetCount = members.filter(
      (member) => member.group_id === targetGroupId && member.id !== memberId,
    ).length;
    if (!targetOccupant && targetCount >= 5) {
      setError("That group already has 5 members.");
      return;
    }

    const targets = [];
    if (source.group_id) {
      const sourceSlots = partySlotsFor(members, source.group_id);
      const sourceIndex = sourceSlots.findIndex(
        (member) => member?.id === memberId,
      );
      if (sourceIndex !== -1) sourceSlots[sourceIndex] = targetOccupant || null;
      targets.push(...targetsForGroupSlots(source.group_id, sourceSlots));
    } else if (targetOccupant) {
      targets.push({
        member_id: targetOccupant.id,
        group_id: null,
        party_slot: null,
      });
    }
    targetSlots[slot - 1] = source;
    targets.push(...targetsForGroupSlots(targetGroupId, targetSlots));
    if (targetOccupant) {
      const occupantTarget = targets.find(
        (target) => target.member_id === targetOccupant.id,
      );
      if (occupantTarget && !source.group_id) {
        occupantTarget.group_id = null;
        occupantTarget.party_slot = null;
      }
    }

    await savePartyTargets(targets, "Party layout saved");
  }

  async function assignMember(memberId, groupId) {
    const member = members.find((item) => item.id === memberId);
    if (!member) return;
    if (!groupId) {
      await moveMemberToSlot(memberId, null, null);
      return;
    }
    const openSlots = groupId ? getOpenPartySlots(groupId, [memberId]) : [];
    if (groupId) {
      const groupCount = members.filter(
        (item) => item.group_id === groupId && item.id !== memberId,
      ).length;
      if (groupCount >= 5) {
        setError("That group already has 5 members.");
        return;
      }
    }
    await moveMemberToSlot(memberId, groupId, openSlots[0] || null);
  }

  async function assignMembersToGroup(
    memberIds,
    groupId,
    preferredSlot = null,
  ) {
    const groupCount = members.filter(
      (item) => item.group_id === groupId && !memberIds.includes(item.id),
    ).length;
    const openSlots = 5 - groupCount;
    if (memberIds.length > openSlots) {
      setError(
        `That group only has ${openSlots} open slot${openSlots === 1 ? "" : "s"}.`,
      );
      return;
    }

    const selectedMembers = memberIds
      .map((memberId) => members.find((item) => item.id === memberId))
      .filter(Boolean);
    const availableSlots = getOpenPartySlots(groupId, memberIds);
    const orderedSlots =
      preferredSlot && availableSlots.includes(preferredSlot)
        ? [
            preferredSlot,
            ...availableSlots.filter((slot) => slot !== preferredSlot),
          ]
        : availableSlots;
    const slots = partySlotsFor(members, groupId);
    for (const [index, member] of selectedMembers.entries()) {
      const slot = orderedSlots[index];
      if (!slot) continue;
      slots[slot - 1] = member;
    }
    const targets = targetsForGroupSlots(groupId, slots);
    await savePartyTargets(
      targets,
      `${selectedMembers.length} member${selectedMembers.length === 1 ? "" : "s"} assigned`,
    );
  }

  async function saveGroup(payload) {
    setSaving(true);
    try {
      const editing = Boolean(groupModal?.id);
      const data = await api(
        editing ? `/api/groups/${groupModal.id}` : "/api/groups",
        {
          method: editing ? "PATCH" : "POST",
          body: JSON.stringify(payload),
        },
      );
      setGroups((current) =>
        editing
          ? current.map((group) =>
              group.id === data.group.id ? data.group : group,
            )
          : [...current, data.group].sort(
              (a, b) =>
                a.sort_order - b.sort_order || a.name.localeCompare(b.name),
            ),
      );
      setGroupModal(null);
      setToast(editing ? "Group renamed" : "Group created");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteGroup(group) {
    setConfirmAction({
      title: "Delete group",
      body: `Delete ${group.name}? Members in this group will become unassigned.`,
      confirmLabel: "Delete group",
      tone: "danger",
      run: async () => {
        await api(`/api/groups/${group.id}`, { method: "DELETE" });
        setGroups((current) => current.filter((item) => item.id !== group.id));
        setMembers((current) =>
          current.map((member) =>
            member.group_id === group.id
              ? { ...member, group_id: null, party_slot: null }
              : member,
          ),
        );
        setToast("Group deleted");
      },
    });
  }

  async function saveJobClass(formData) {
    setSaving(true);
    try {
      const editing = Boolean(jobClassModal?.id);
      const data = await apiForm(
        editing ? `/api/job-classes/${jobClassModal.id}` : "/api/job-classes",
        {
          method: editing ? "PATCH" : "POST",
          body: formData,
        },
      );
      setJobClasses((current) =>
        editing
          ? current.map((cls) => (cls.id === data.jobClass.id ? data.jobClass : cls))
          : [...current, data.jobClass].sort(
              (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
            ),
      );
      if (editing && data.membersUpdated > 0) {
        setMembers((current) =>
          current.map((member) =>
            member.char_class === jobClassModal.name
              ? { ...member, char_class: data.jobClass.name }
              : member,
          ),
        );
      }
      setJobClassModal(null);
      setToast(editing ? "Job class updated" : "Job class created");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteJobClass(cls) {
    setConfirmAction({
      title: "Delete job class",
      body: `Delete ${cls.name}? This only works if no members currently use this class.`,
      confirmLabel: "Delete class",
      tone: "danger",
      run: async () => {
        await api(`/api/job-classes/${cls.id}`, { method: "DELETE" });
        setJobClasses((current) => current.filter((item) => item.id !== cls.id));
        setToast("Job class deleted");
      },
    });
  }

  async function loadMemberStatsSummary({ force = false } = {}) {
    const cached = memberStatsSummaryCache;
    const cacheIsFresh = cached && Date.now() - cached.loadedAt < DASHBOARD_CACHE_MAX_AGE_MS;
    if (cached) setMemberStatsSummary(cached.data);
    if (!force && cacheIsFresh) return;
    // Only show the loading state on an actual network fetch — not when
    // serving cached data on a route remount (avoids a visible reload flash).
    if (!cached) setMemberStatsSummaryLoading(true);
    try {
      const data = await api("/api/member-stats");
      memberStatsSummaryCache = { data: data.stats || [], loadedAt: Date.now() };
      setMemberStatsSummary(memberStatsSummaryCache.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setMemberStatsSummaryLoading(false);
    }
  }

  async function viewMemberStats(memberId) {
    try {
      const data = await api(`/api/member-stats/${memberId}`);
      setMemberStatsDetail(data);
    } catch (err) {
      setError(err.message);
    }
  }

  function requestUnassign(member, group) {
    setConfirmAction({
      title: "Remove from party",
      body: `Remove ${member.char_name} from ${group.name}? They will stay in the guild as unassigned.`,
      confirmLabel: "Remove member",
      tone: "default",
      run: async () => assignMember(member.id, null),
    });
  }

  async function runConfirmAction() {
    if (!confirmAction) return;
    setSaving(true);
    try {
      await runWithScrollRestore(confirmAction.run);
      setConfirmAction(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function saveMemberLimit(nextLimit) {
    setMemberLimit(nextLimit);
    window.localStorage.setItem("encore_member_limit", String(nextLimit));
    setLimitModalOpen(false);
    setToast("Guild member limit updated");
  }

  async function startAuction(payload) {
    setSaving(true);
    try {
      await runWithScrollRestore(async () => {
        const data = await api("/api/auctions/start", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setAuctionState(data.auctionState);
        setAuctionStartType(null);
        setToast(`${auctionTypeLabel(payload.type)} auction started`);
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveAuctionLimits(caps) {
    setSaving(true);
    try {
      const data = await api("/api/auctions/limits", {
        method: "PATCH",
        body: JSON.stringify({ caps }),
      });
      setAuctionState(data.auctionState);
      setAuctionLimitsOpen(false);
      setToast("Auction limits updated");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveGlobalAuctionLimits(caps) {
    setSaving(true);
    try {
      const data = await api("/api/auctions/default-limits", {
        method: "PATCH",
        body: JSON.stringify({ caps }),
      });
      setAuctionItems(data.auctionItems || []);
      setAuctionState((current) =>
        current && !current.activeRound
          ? { ...current, itemCaps: caps }
          : current,
      );
      setGlobalLimitsOpen(false);
      setToast("Global auction defaults updated");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function requestLockAuction(auction) {
    if (!auction) return;
    setConfirmAction({
      title: "Lock-in Guild Auction list",
      body: `Freeze the bid assignments for ${auction.name || "this Guild Auction"}? Member progress will be saved when the auction is finalized.`,
      confirmLabel: "Lock list",
      tone: "default",
      run: async () => {
        const data = await api("/api/auctions/active/lock", {
          method: "POST",
          body: JSON.stringify({ auctionId: auction.id }),
        });
        setAuctionState(data.auctionState);
        setToast("Guild Auction list locked");
      },
    });
  }

  async function requestDoneAuction(auction) {
    const activeAuction = auction || auctionState?.activeAuction;
    if (!activeAuction) return;
    setSaving(true);
    try {
      const data = await api("/api/auctions/active/finalize-preview", {
        method: "POST",
        body: JSON.stringify({ auctionId: activeAuction.id }),
      });
      setFinalizePreview({
        auctionIds: [activeAuction.id],
        preview: data.preview,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function finalizePreviewedAuction() {
    const auctionIds = finalizePreview?.auctionIds || [];
    if (!auctionIds.length) return;
    const isEventFinalize = auctionIds.length > 1;
    setSaving(true);
    try {
      const data = await api(
        isEventFinalize
          ? "/api/auctions/active/done-event"
          : "/api/auctions/active/done",
        {
          method: "POST",
          body: JSON.stringify(
            isEventFinalize ? { auctionIds } : { auctionId: auctionIds[0] },
          ),
        },
      );
      setAuctionState(data.auctionState);
      setFinalizePreview(null);
      setToast(
        isEventFinalize ? "Event auctions finalized" : "Auction finalized",
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function requestCancelAuction(auctions) {
    const auctionList = Array.isArray(auctions)
      ? auctions.filter(Boolean)
      : [auctions].filter(Boolean);
    if (!auctionList.length) return;
    const orderedAuctions = [
      ...auctionList.filter((auction) => auction.type !== "gl_woe"),
      ...auctionList.filter((auction) => auction.type === "gl_woe"),
    ];
    const hasLeaguePrize = orderedAuctions.some(
      (auction) => auction.type === "league_prize",
    );
    const title = hasLeaguePrize ? "Cancel event auctions" : "Cancel auction";
    const body = hasLeaguePrize
      ? "Cancel the open League Prize and Guild Auction lists? Finished history and member progress will not be changed."
      : `Cancel ${orderedAuctions[0]?.name || "this auction"}? Finished history and member progress will not be changed.`;
    setConfirmAction({
      title,
      body,
      confirmLabel: hasLeaguePrize ? "Cancel event" : "Cancel auction",
      tone: "danger",
      run: async () => {
        const data = await api("/api/auctions/active/cancel", {
          method: "POST",
          body: JSON.stringify({
            auctionIds: orderedAuctions.map((auction) => auction.id),
          }),
        });
        setAuctionState(data.auctionState);
        setToast(
          hasLeaguePrize ? "Event auctions cancelled" : "Auction cancelled",
        );
      },
    });
  }

  async function requestDoneEvent(auctions) {
    const eventAuctions = (auctions || []).filter(Boolean);
    if (!eventAuctions.length) return;
    const orderedAuctions = [
      ...eventAuctions.filter((auction) => auction.type === "gl_woe"),
      ...eventAuctions.filter((auction) => auction.type !== "gl_woe"),
    ];

    setSaving(true);
    try {
      const auctionIds = orderedAuctions.map((auction) => auction.id);
      const data = await api("/api/auctions/active/finalize-preview", {
        method: "POST",
        body: JSON.stringify({ auctionIds }),
      });
      setFinalizePreview({ auctionIds, preview: data.preview });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function copyAuctionList(auction, bidRows) {
    try {
      await navigator.clipboard.writeText(
        formatDiscordBidList(auction, bidRows),
      );
      setToast("Auction list copied for Discord");
    } catch (err) {
      setError("Could not copy the auction list.");
    }
  }

  async function copyBidderNames(names, label = "bidder") {
    const copyNames = names || [];
    try {
      await navigator.clipboard.writeText(copyNames.join("\n"));
      setToast(
        `${copyNames.length} unique ${label}${copyNames.length === 1 ? "" : "s"} copied`,
      );
    } catch (err) {
      setError(`Could not copy the ${label} list.`);
    }
  }

  if (session.loading) {
    return (
      <main className="loading-page guild-console">
        <Loader2 className="spin" size={28} />
      </main>
    );
  }

  if (!publicView && !session.authenticated) {
    return (
      <LoginScreen
        onLogin={checkSession}
        registerStep={authQuery.registerStep}
        authError={authQuery.authError}
      />
    );
  }

  if (!publicView && session.mustResetPassword) {
    return (
      <ResetPasswordScreen username={session.username} onReset={checkSession} />
    );
  }

  // A signed-in visitor browsing the public board still gets the same sidebar
  // nav they'd see anywhere else in the dashboard, instead of the stripped-down
  // anonymous layout — consistent chrome for anyone who's actually logged in.
  const showSidebar = !publicView || viewer.authenticated;

  return (
    <JobClassesContext.Provider value={jobClassesContextValue}>
    <div
      className={
        showSidebar
          ? "guild-console admin-console"
          : "guild-console public-console"
      }
    >
      {showSidebar && (
        <AdminSidebar
          activePage={publicView ? "public" : adminPage}
          memberCount={members.length}
          partyCount={groups.length}
          pendingCount={pendingAccounts.length}
          role={publicView ? viewer.role : session.role}
        />
      )}
      <div className={showSidebar ? "admin-workspace" : "public-workspace"}>
        <Header
          username={publicView ? viewer.username : session.username}
          role={publicView ? viewer.role : session.role}
          onLogout={logout}
          auditLogView={auditLogView}
          accountView={accountView}
          publicView={publicView}
          publicGlAuction={publicGlAuction}
          compact={showSidebar}
          viewerAuthenticated={publicView ? viewer.authenticated : true}
        />
        <main className="dashboard">
          {accountView ? (
            <AccountScreen />
          ) : publicStatsView ? (
            <PublicStatsBoardScreen />
          ) : povListView ? (
            <PovListScreen />
          ) : !publicView && session.role === "member" ? (
            <div className="alert-panel">
              <AlertTriangle size={17} />
              <span>
                Member accounts can only view the public auction board, the
                public stats board, the POV list, and their account page.
              </span>
              <Link className="ghost-button" href="/public">
                Auction view
              </Link>
              <Link className="ghost-button" href="/public-stats">
                Public stats
              </Link>
              <Link className="ghost-button" href="/pov-list">
                POV List
              </Link>
              <Link className="ghost-button" href="/account">
                Account
              </Link>
            </div>
          ) : auditLogView ? (
            <>
              {session.role !== "super_admin" ? (
                <div className="alert-panel">
                  <AlertTriangle size={17} />
                  <span>Only super admins can view update logs.</span>
                </div>
              ) : (
                <section className="audit-page">
                  <div className="section-heading">
                    <div>
                      <p className="eyebrow">super admin</p>
                      <h2>Update logs</h2>
                      <p>
                        Recent dashboard changes, who made them, and what was
                        updated.
                      </p>
                    </div>
                    <button
                      className="ghost-button"
                      onClick={() => loadAuditLogs({ force: true })}
                      disabled={auditLogsLoading}
                    >
                      {auditLogsLoading ? (
                        <Loader2 className="spin" size={15} />
                      ) : (
                        <RefreshCw size={15} />
                      )}
                      Refresh
                    </button>
                  </div>
                  {error && (
                    <div className="alert-panel">
                      <AlertTriangle size={17} />
                      <span>{error}</span>
                      <button onClick={() => setError("")}>Dismiss</button>
                    </div>
                  )}
                  {auditLogsLoading ? (
                    <div className="loading-panel">
                      <Loader2 className="spin" size={20} />
                      Loading logs
                    </div>
                  ) : (
                    <AuditLogsTable logs={auditLogs} />
                  )}
                </section>
              )}
            </>
          ) : (
            <>
              {error && (
                <div className="alert-panel">
                  <AlertTriangle size={17} />
                  <span>{error}</span>
                  <button onClick={() => setError("")}>Dismiss</button>
                </div>
              )}
              {loading ? (
                <div className="loading-panel">
                  <Loader2 className="spin" size={24} />
                  Loading guild data
                </div>
              ) : (
                <>
                  {publicView ? (
                    <>
                      <AuctionFoundation
                        auctionItems={auctionItems}
                        auctionState={auctionState}
                        busy={saving}
                        onOpenStartAuction={setAuctionStartType}
                        onOpenLimits={() => setAuctionLimitsOpen(true)}
                        onOpenGlobalLimits={() => setGlobalLimitsOpen(true)}
                        onSaveSavepoint={requestSaveAuctionSavepoint}
                        onRestoreSavepoint={requestRestoreAuctionSavepoint}
                        canManageGlobalDefaults={false}
                        onLockAuction={requestLockAuction}
                        onDoneAuction={requestDoneAuction}
                        onCancelAuction={requestCancelAuction}
                        onDoneEvent={requestDoneEvent}
                        onCopyAuctionList={copyAuctionList}
                        onCopyBidderNames={copyBidderNames}
                        readOnly
                      />
                      <PartiesSection
                        members={members}
                        groups={groups}
                        onCreateGroup={() => setGroupModal({})}
                        onRenameGroup={setGroupModal}
                        onDeleteGroup={deleteGroup}
                        onPickEmptySlot={setPartyPickerGroup}
                        onRequestUnassign={requestUnassign}
                        onEditMember={setMemberModal}
                        onMoveMemberToSlot={moveMemberToSlot}
                        busy={saving}
                        readOnly
                      />
                    </>
                  ) : (
                    <>
                      {adminPage === "members" && (
                        <>
                          <Stats
                            members={members}
                            memberLimit={effectiveMemberLimit}
                            activeClass={classFilter}
                            onClassFilter={setClassFilter}
                            onEditLimit={() => setLimitModalOpen(true)}
                            readOnly={false}
                          />
                          <MembersSection
                            members={members}
                            groupsById={groupsById}
                            classFilter={classFilter}
                            onClassFilter={setClassFilter}
                            canAddMember={members.length < effectiveMemberLimit}
                            memberLimit={effectiveMemberLimit}
                            onAdd={() => setMemberModal({})}
                            onEdit={setMemberModal}
                            onDelete={deleteMember}
                            readOnly={false}
                          />
                        </>
                      )}
                      {adminPage === "parties" && (
                        <PartiesSection
                          members={members}
                          groups={groups}
                          onCreateGroup={() => setGroupModal({})}
                          onRenameGroup={setGroupModal}
                          onDeleteGroup={deleteGroup}
                          onPickEmptySlot={setPartyPickerGroup}
                          onRequestUnassign={requestUnassign}
                          onEditMember={setMemberModal}
                          onMoveMemberToSlot={moveMemberToSlot}
                          busy={saving}
                          readOnly={false}
                        />
                      )}
                      {adminPage === "auctions" && (
                        <AuctionFoundation
                          auctionItems={auctionItems}
                          auctionState={auctionState}
                          busy={saving}
                          onOpenStartAuction={setAuctionStartType}
                          onOpenLimits={() => setAuctionLimitsOpen(true)}
                          onOpenGlobalLimits={() => setGlobalLimitsOpen(true)}
                          onSaveSavepoint={requestSaveAuctionSavepoint}
                          onRestoreSavepoint={requestRestoreAuctionSavepoint}
                          canManageGlobalDefaults={[
                            "admin",
                            "super_admin",
                          ].includes(session.role)}
                          onLockAuction={requestLockAuction}
                          onDoneAuction={requestDoneAuction}
                          onCancelAuction={requestCancelAuction}
                          onDoneEvent={requestDoneEvent}
                          onCopyAuctionList={copyAuctionList}
                          onCopyBidderNames={copyBidderNames}
                          readOnly={false}
                        />
                      )}
                      {adminPage === "pending" && (
                        <PendingMembersPanel
                          pending={pendingAccounts}
                          busyId={pendingActionId}
                          onApprove={(account) => respondToPending(account, "approve")}
                          onReject={(account) => respondToPending(account, "reject")}
                          onViewMember={viewMemberStats}
                        />
                      )}

                      {adminPage === "member-stats" && (
                        <MemberStatsAdminPanel
                          summary={memberStatsSummary}
                          loading={memberStatsSummaryLoading}
                          onViewMember={viewMemberStats}
                          allowExport
                        />
                      )}

                      {adminPage === "job-classes" && (
                        <JobClassesPanel
                          jobClasses={jobClasses}
                          onAdd={() => setJobClassModal({})}
                          onEdit={(cls) => setJobClassModal(cls)}
                          onDelete={deleteJobClass}
                          busy={saving}
                        />
                      )}
                    </>
                  )}
                </>
              )}
            </>
          )}
        </main>
      </div>

      {memberModal && (
        <Modal
          title={memberModal.id ? "Edit member" : "Add member"}
          onClose={() => setMemberModal(null)}
        >
          <MemberForm
            groups={groups}
            auctionItems={auctionItems}
            auctionState={auctionState}
            initial={memberModal.id ? memberModal : emptyMember}
            onCancel={() => setMemberModal(null)}
            onSave={saveMember}
            onCatchUp={requestCatchUpMemberCycles}
            busy={saving}
          />
        </Modal>
      )}

      {groupModal && (
        <Modal
          title={groupModal.id ? "Rename group" : "Create group"}
          onClose={() => setGroupModal(null)}
        >
          <GroupForm
            initial={groupModal.id ? groupModal : null}
            onCancel={() => setGroupModal(null)}
            onSave={saveGroup}
            busy={saving}
          />
        </Modal>
      )}

      {jobClassModal && (
        <Modal
          title={jobClassModal.id ? "Edit job class" : "Add job class"}
          onClose={() => setJobClassModal(null)}
        >
          <JobClassForm
            initial={jobClassModal.id ? jobClassModal : null}
            colorOptions={Object.keys(colorGroups)}
            onCancel={() => setJobClassModal(null)}
            onSave={saveJobClass}
            busy={saving}
          />
        </Modal>
      )}

      {memberStatsDetail && (
        <MemberStatsDetailView
          data={memberStatsDetail}
          onClose={() => setMemberStatsDetail(null)}
        />
      )}

      {limitModalOpen && (
        <Modal title="Roster limit" onClose={() => setLimitModalOpen(false)}>
          <RosterLimitForm
            current={effectiveMemberLimit}
            minimum={members.length}
            maximum={GUILD_MEMBER_LIMIT}
            onCancel={() => setLimitModalOpen(false)}
            onSave={saveMemberLimit}
          />
        </Modal>
      )}

      {partyPickerGroup && (
        <PartyMemberPicker
          group={partyPickerGroup.group}
          targetSlot={partyPickerGroup.slot}
          members={unassignedMembers}
          currentCount={
            members.filter(
              (member) => member.group_id === partyPickerGroup.group.id,
            ).length
          }
          busy={saving}
          onCancel={() => setPartyPickerGroup(null)}
          onPickMany={async (memberIds) => {
            await assignMembersToGroup(
              memberIds,
              partyPickerGroup.group.id,
              partyPickerGroup.slot,
            );
            setPartyPickerGroup(null);
          }}
        />
      )}

      {auctionStartType && (
        <Modal
          title={`New ${auctionTypeLabel(auctionStartType)}`}
          onClose={() => setAuctionStartType(null)}
        >
          <AuctionStartForm
            type={auctionStartType}
            auctionItems={auctionItems}
            internalCaps={auctionState?.itemCaps || {}}
            busy={saving}
            onCancel={() => setAuctionStartType(null)}
            onStart={startAuction}
          />
        </Modal>
      )}

      {auctionLimitsOpen && (
        <Modal
          title="Adjust auction limits"
          onClose={() => setAuctionLimitsOpen(false)}
        >
          <AuctionLimitsForm
            auctionItems={auctionItems}
            auctionState={auctionState}
            busy={saving}
            onCancel={() => setAuctionLimitsOpen(false)}
            onSave={saveAuctionLimits}
          />
        </Modal>
      )}

      {globalLimitsOpen && (
        <Modal
          title="Global auction defaults"
          onClose={() => setGlobalLimitsOpen(false)}
        >
          <GlobalAuctionDefaultsForm
            auctionItems={auctionItems}
            busy={saving}
            onCancel={() => setGlobalLimitsOpen(false)}
            onSave={saveGlobalAuctionLimits}
          />
        </Modal>
      )}

      {finalizePreview && (
        <FinalizePreviewModal
          preview={finalizePreview.preview}
          busy={saving}
          onCancel={() => setFinalizePreview(null)}
          onConfirm={finalizePreviewedAuction}
        />
      )}

      {confirmAction && (
        <ConfirmModal
          title={confirmAction.title}
          body={confirmAction.body}
          confirmLabel={confirmAction.confirmLabel}
          tone={confirmAction.tone}
          busy={saving}
          onCancel={() => setConfirmAction(null)}
          onConfirm={runConfirmAction}
        />
      )}

      {toast && (
        <div className={publicView ? "toast public-toast" : "toast"}>
          <Check size={15} />
          <span>{toast}</span>
          <button onClick={() => setToast("")}>
            <X size={14} />
          </button>
        </div>
      )}
    </div>
    </JobClassesContext.Provider>
  );
}

function FooterStrip({ memberCount, partyCount, publicView = false }) {
  return (
    <footer className="footer-strip">
      <span>
        encore · {publicView ? "public dashboard" : "admin console"} · v0.1.0
      </span>
      <span>
        {memberCount} members · {partyCount} parties
      </span>
    </footer>
  );
}
