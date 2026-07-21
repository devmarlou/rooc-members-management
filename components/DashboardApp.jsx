"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  LogOut,
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
  History,
  KeyRound
} from "lucide-react";
import { classByName, classes, classOrder, colorGroups } from "@/components/data";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";

const emptyMember = {
  char_name: "",
  char_class: "Lord Knight",
  group_id: "",
  party_slot: null,
  is_officer: false,
  auction_priority_override: false,
  joined_at: "",
  notes: ""
};

const AUCTION_JOIN_COOLDOWN_HOURS = 96;
const AUCTION_JOIN_COOLDOWN_MS = AUCTION_JOIN_COOLDOWN_HOURS * 60 * 60 * 1000;
const PH_TIME_ZONE = "Asia/Manila";
const DEFAULT_GUILD_MEMBER_LIMIT = 80;
const PROGRESS_SUMMARY_ITEM_LABELS = {
  puppet_card: "Puppet Card",
  feather_ld: "Light and Dark",
  feather_ts: "Time and Space"
};
const ITEM_ICON_SRC = {
  puppet_card: "/icons/puppet.png",
  feather_ld: "/icons/light-dark.png",
  feather_ts: "/icons/time-space.png"
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
  astrid: "astrid"
};
const PARTY_MEMBER_ORDER = Object.fromEntries(
  Object.entries({
    "Alpha 1": ["Miyuyua", "Jyliana", "Osnub", "Lalaa", "MT999"],
    "Alpha 2": ["WeeDevaBR", "WeeYagsBR", "WeeHuBR", "Helxine", "WeeSunxBR"],
    "Bravo 1": ["Darthas", "WeeGetziiBR", "WeeChrlygBR", "R0dd", "DocxBR"],
    "Bravo 2": ["Ryjj", "RSPKT", "BanoobsDR", "BanoobsBR", "Virgo"],
    "Charlie 1": ["AfyGPDS", "WeeYomiBR", "NakedGarfieldWiz", "WeeJOSHBR", "Yamato"],
    "Charlie 2": ["Godzillu", "JanKing", "jomski", "KrisJulio", "Zykenn"],
    "FLEX 1": ["fredplays", "Mamark", "Vogue", "Autumn", "itlognibatman"],
    "FLEX 2": ["Nasmi", "A1110", "WeeFrztttBR", "Java", "kimi"],
    "Sub Alpha 1": ["Senyoraaa", "Shammyre", "Sh1nBoo", "Shan", "Tobichan"],
    "Sub Alpha 2": ["Ynori", "TaichoBee", "Ordz", "Imbalance", "Kreyja"],
    "Sub Bravo 1": ["NakedMoon", "NakedGarfieldBard", "NakedGarfieldPaladin", "NakedGian", "Supreme"],
    "Sub Bravo 2": ["WeePriestBR", "WeeHuBeshy", "WeeJunBR", "WeeMigBR", "WeeSonixBR"],
    "Sub Charlie 1": ["AndromedA", "Kushinero", "Akii", "Alycone", "SNOW"],
    "Sub Charlie 2": ["WeeHuRye", "Bell", "Doidoi", "Hibernate", "Boldstar"],
    "Sub Delta 1": ["Astrid", "Sanguine", "Calixx", "Herius", "Puts"],
    "Sub Delta 2": ["Keshmeister", "Messt", "Akyra"]
  }).map(([groupName, names]) => [
    groupName,
    new Map(names.map((name, index) => [normalizePartyMemberName(name), index]))
  ])
);
const AUCTION_PAGE_ITEM_ORDER = {
  puppet_card: 1,
  puppet_fragment: 2,
  feather_ld: 3,
  feather_ts: 4
};
const SHARED_FEATHER_PAGE_KEYS = new Set(["feather_ld", "feather_ts"]);

function normalizePartyMemberName(name) {
  const normalized = String(name || "").trim().toLowerCase();
  return PARTY_MEMBER_ORDER_ALIASES[normalized] || normalized;
}

function auctionPriorityRank(member) {
  return member?.auction_priority_override ? 0 : 1;
}

function sortedPartyRoster(roster, groupName) {
  const hasSavedSlots = roster.some((member) => Number.isInteger(member.party_slot));
  return [...roster].sort((a, b) => {
    if (hasSavedSlots) {
      return (a.party_slot ?? 99) - (b.party_slot ?? 99) || a.char_name.localeCompare(b.char_name);
    }
    const order = PARTY_MEMBER_ORDER[groupName];
    if (!order) return a.char_name.localeCompare(b.char_name);
    const aPosition = order.get(normalizePartyMemberName(a.char_name));
    const bPosition = order.get(normalizePartyMemberName(b.char_name));
    return (aPosition ?? 99) - (bPosition ?? 99) || a.char_name.localeCompare(b.char_name);
  });
}

function buildPartySlots(roster, groupName) {
  const hasSavedSlots = roster.some((member) => Number.isInteger(member.party_slot));
  const slots = [null, null, null, null, null];

  if (!hasSavedSlots) {
    const ordered = sortedPartyRoster(roster, groupName);
    for (let index = 0; index < slots.length; index++) slots[index] = ordered[index] || null;
    return slots;
  }

  const unslotted = [];
  for (const member of sortedPartyRoster(roster, groupName)) {
    if (Number.isInteger(member.party_slot) && member.party_slot >= 1 && member.party_slot <= 5 && !slots[member.party_slot - 1]) {
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
    hourCycle: "h23"
  }).formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`
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
    minute: "2-digit"
  }).format(new Date(timestampMs));
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    cache: "no-store",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

function ClassIcon({ name, size = 34, glow = true }) {
  const cls = classByName[name];
  if (!cls?.icon) return <span className="class-icon-placeholder" style={{ width: size, height: size }} />;
  const color = colorGroups[cls.group];
  return (
    <span className={glow ? "class-icon" : "class-icon no-glow"} style={{ width: size, height: size, "--class-color": color }}>
      <img src={cls.icon} alt={name} width={size} height={size} />
    </span>
  );
}

function NoiseLayer() {
  return <div className="noise-layer" aria-hidden="true" />;
}

function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password })
      });
      onLogin();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="brand-mark"><Shield size={28} /></div>
        <p className="eyebrow">guild admin</p>
        <h1>ENCORE</h1>
        <form onSubmit={submit} className="login-form">
          <label>
            <span>Username</span>
            <input value={username} onChange={(event) => setUsername(event.target.value)} autoFocus />
          </label>
          <label>
            <span>Password</span>
            <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" />
          </label>
          {error && <p className="form-error">{error}</p>}
          <button className="primary-button full" disabled={busy}>
            {busy ? <Loader2 className="spin" size={16} /> : <Shield size={16} />}
            Sign in
          </button>
        </form>
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
  const passwordMismatch = newPassword && confirmPassword && newPassword !== confirmPassword;

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
        body: JSON.stringify({ currentPassword, newPassword })
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
      <section className="login-card">
        <div className="brand-mark"><KeyRound size={28} /></div>
        <p className="eyebrow">first login</p>
        <h1>RESET</h1>
        <p className="field-note reset-note">Signed in as {username}. Change the default password before opening the dashboard.</p>
        <form onSubmit={submit} className="login-form">
          <label>
            <span>Current password</span>
            <input value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} type="password" autoFocus />
          </label>
          <label>
            <span>New password</span>
            <input value={newPassword} onChange={(event) => setNewPassword(event.target.value)} type="password" />
          </label>
          <label>
            <span>Confirm password</span>
            <input value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} type="password" />
          </label>
          {(error || passwordMismatch) && <p className="form-error">{error || "New passwords do not match."}</p>}
          <button className="primary-button full" disabled={busy || passwordMismatch}>
            {busy ? <Loader2 className="spin" size={16} /> : <Check size={16} />}
            Save password
          </button>
        </form>
      </section>
    </main>
  );
}

function Modal({ title, children, footer, onClose, size = "default" }) {
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-layer" role="dialog" aria-modal="true">
      <button className="modal-backdrop" onClick={onClose} aria-label="Close dialog" />
      <section className={`modal-card${size === "sm" ? " modal-sm" : ""}${size === "lg" ? " modal-lg" : ""}`}>
        <header className="modal-header">
          <h2>{title}</h2>
          <button className="icon-button" onClick={onClose} aria-label="Close"><X size={16} /></button>
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
    minute: "2-digit"
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
    return <div className="empty-panel compact">No updates have been logged yet.</div>;
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
              <td><time>{formatAuditDate(log.created_at)}</time></td>
              <td>{log.actor_username}</td>
              <td>{log.actor_role === "super_admin" ? "super admin" : "admin"}</td>
              <td>{prettifyAction(log.action)}</td>
              <td>{log.summary || "-"}</td>
              <td>{log.target_type ? `${log.target_type}${log.target_id ? ` · ${String(log.target_id).slice(0, 8)}` : ""}` : "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ConfirmModal({ title, body, confirmLabel = "Confirm", tone = "danger", onCancel, onConfirm, busy }) {
  return (
    <Modal title={title} onClose={onCancel}>
      <div className="confirm-body">
        <div className={tone === "danger" ? "confirm-icon danger" : "confirm-icon"}>
          <AlertTriangle size={18} />
        </div>
        <p>{body}</p>
      </div>
      <div className="form-actions wide">
        <button type="button" className="ghost-button" onClick={onCancel}>Cancel</button>
        <button className={tone === "danger" ? "danger-button" : "primary-button"} onClick={onConfirm} disabled={busy}>
          {busy ? <Loader2 className="spin" size={15} /> : <Check size={15} />}
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

function MemberForm({ groups, auctionItems = [], auctionState = null, initial, onCancel, onSave, onCatchUp, busy }) {
  const joinedParts = toPhDateTimeParts(initial?.joined_at) || {};
  const cappedAuctionItems = auctionItems.filter((item) => item.gates_round_completion);
  const savedMemberCaps = auctionState?.memberCapOverrides?.[initial?.id] || {};
  const sharedCaps = auctionState?.itemCaps || {};
  const initialMemberCapOverrides = Object.fromEntries(cappedAuctionItems.map((item) => [
    item.item_key,
    savedMemberCaps[item.item_key] === undefined ? "" : String(savedMemberCaps[item.item_key])
  ]));
  const [form, setForm] = useState(() => ({
    ...emptyMember,
    ...initial,
    group_id: initial?.group_id || "",
    joined_date: joinedParts.date || "",
    joined_time: joinedParts.time || "",
    notes: initial?.notes || "",
    memberCapOverrides: initialMemberCapOverrides
  }));

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateMemberCap(itemKey, value) {
    setForm((current) => ({
      ...current,
      memberCapOverrides: {
        ...(current.memberCapOverrides || {}),
        [itemKey]: value
      }
    }));
  }

  function submit(event) {
    event.preventDefault();
    const memberCapOverridesChanged = JSON.stringify(form.memberCapOverrides || {}) !== JSON.stringify(initialMemberCapOverrides);
    onSave({
      ...form,
      group_id: form.group_id || null,
      joined_at: toIsoTimestamp(form.joined_date, form.joined_time),
      ...(initial?.id && auctionState?.activeRound && memberCapOverridesChanged ? { memberCapOverrides: form.memberCapOverrides || {} } : {})
    });
  }

  return (
    <form onSubmit={submit} className="form-grid">
      <label>
        <span>Character name</span>
        <input value={form.char_name} onChange={(event) => update("char_name", event.target.value)} required />
      </label>
      <label>
        <span>Class</span>
        <select value={form.char_class} onChange={(event) => update("char_class", event.target.value)} required>
          {classes.map((cls) => <option key={cls.name} value={cls.name}>{cls.name}</option>)}
        </select>
      </label>
      <label>
        <span>Party group</span>
        <select value={form.group_id || ""} onChange={(event) => update("group_id", event.target.value)}>
          <option value="">Unassigned</option>
          {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
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
          onChange={(event) => update("auction_priority_override", event.target.checked)}
        />
        <span>Auction priority override - starts ahead for L&D and T&S</span>
      </label>
      {initial?.id && auctionState?.activeRound && cappedAuctionItems.length > 0 && (
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
                  onChange={(event) => updateMemberCap(item.item_key, event.target.value)}
                />
              </label>
            ))}
          </div>
        </div>
      )}
      <label className="wide">
        <span>Joined date/time</span>
        <div className="joined-fields">
          <input type="date" value={form.joined_date || ""} onChange={(event) => update("joined_date", event.target.value)} aria-label="Joined date" />
          <input type="time" value={form.joined_time || ""} onChange={(event) => update("joined_time", event.target.value)} aria-label="Joined time" />
        </div>
        <p className="field-note">Used for the 96h auction cooldown. Enter PH local time.</p>
      </label>
      <label className="wide">
        <span>Notes</span>
        <textarea rows={3} value={form.notes || ""} onChange={(event) => update("notes", event.target.value)} />
      </label>
      <div className="form-actions wide">
        <button type="button" className="ghost-button" onClick={onCancel}>Cancel</button>
        {initial?.id && (
          <button type="button" className="ghost-button" onClick={() => onCatchUp?.(initial)} disabled={busy}>
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
        <input value={name} onChange={(event) => setName(event.target.value)} required autoFocus />
      </label>
      <div className="form-actions">
        <button type="button" className="ghost-button" onClick={onCancel}>Cancel</button>
        <button className="primary-button" disabled={busy}>
          {busy ? <Loader2 className="spin" size={15} /> : <Check size={15} />}
          Save group
        </button>
      </div>
    </form>
  );
}

function RosterLimitForm({ current, minimum, onCancel, onSave }) {
  const [value, setValue] = useState(String(current));
  const parsed = Number.parseInt(value, 10);
  const valid = Number.isFinite(parsed) && parsed >= minimum;

  function submit(event) {
    event.preventDefault();
    if (valid) onSave(parsed);
  }

  return (
    <form onSubmit={submit} className="form-grid single">
      <label>
        <span>Guild member limit</span>
        <input type="number" min={minimum} value={value} onChange={(event) => setValue(event.target.value)} autoFocus />
      </label>
      <p className="field-note">The limit cannot be lower than the current roster count: {minimum}.</p>
      <div className="form-actions">
        <button type="button" className="ghost-button" onClick={onCancel}>Cancel</button>
        <button className="primary-button" disabled={!valid}><Check size={15} />Save limit</button>
      </div>
    </form>
  );
}

function Header({ username, role, onLogout, auditLogView = false, publicView = false, publicGlAuction = null }) {
  const roleLabel = role === "super_admin" ? "super admin" : "admin";
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="brand-row">
          <div className="brand-mark small"><Shield size={20} /></div>
          <div>
            <p className="eyebrow">{publicView ? "guild · public dashboard" : "guild · admin console"}</p>
            <h1>ENCORE</h1>
            <div className="brand-meta">
              <span>ragnarok origin classic</span>
              <span>prontera 6</span>
              <span className="online-dot">online</span>
            </div>
          </div>
        </div>
        <div className="admin-row">
          <div className="signed-in">
            <span>{publicView ? "view mode" : "signed in as"}</span>
            <strong>{publicView ? "public" : `${username || "admin"} · ${roleLabel}`}</strong>
          </div>
          {!publicView && role === "super_admin" && !auditLogView && (
            <a className="ghost-button" href="/audit-logs"><History size={15} />Logs</a>
          )}
          {!publicView && auditLogView && (
            <Link className="ghost-button" href="/"><LayoutGrid size={15} />Dashboard</Link>
          )}
          {!publicView && <button className="ghost-button" onClick={onLogout}><LogOut size={15} />Log out</button>}
        </div>
      </div>
      {publicGlAuction && (
        <div className="topbar-announcement">
          <Gavel size={15} />
          <span>{publicGlAuction.status === "locked" ? "Guild Auction list is locked. League Prize may be prepared next." : "Guild Auction is running. Check the auction table for current bid instructions."}</span>
        </div>
      )}
    </header>
  );
}

function CollapseButton({ collapsed, onToggle }) {
  return (
    <button className="ghost-button collapse-button" type="button" onClick={onToggle}>
      {collapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
      {collapsed ? "Show" : "Minimize"}
    </button>
  );
}

function Stats({ members, memberLimit, activeClass, onClassFilter, onEditLimit, readOnly = false }) {
  const statItems = useMemo(() => {
    const counts = {};
    for (const member of members) counts[member.char_class] = (counts[member.char_class] || 0) + 1;
    return classOrder
      .filter((name) => name !== "Dancer")
      .map((name) => {
        if (name === "Bard") {
          const count = (counts.Bard || 0) + (counts.Dancer || 0);
          return { key: "Bard", label: "Bard / Dancer", short: "BD", count };
        }
        const cls = classByName[name];
        return { key: name, label: name, short: cls?.short || name, count: counts[name] || 0 };
      })
      .filter((item) => item.count > 0);
  }, [members]);

  return (
    <section className="stats-row">
      <button className="stat-card roster-stat" onClick={onEditLimit} disabled={readOnly} title={readOnly ? "Guild member limit" : "Edit guild member limit"}>
        <span>Roster</span>
        <strong>{members.length}<small>/{memberLimit}</small></strong>
        <em>guild limit</em>
      </button>
      <div className="class-strip">
        <span className="strip-label">by class</span>
        {statItems.map((item) => {
          const active = activeClass === item.key || (item.key === "Bard" && activeClass === "Dancer");
          return (
            <button
              className={active ? "class-chip active" : "class-chip"}
              key={item.label}
              title={`Filter by ${item.label}`}
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
            <X size={13} />clear
          </button>
        )}
      </div>
    </section>
  );
}

function MembersSection({ members, groupsById, classFilter, onClassFilter, onAdd, onEdit, onDelete, canAddMember, memberLimit, readOnly = false }) {
  const [query, setQuery] = useState("");
  const [viewMode, setViewMode] = useState("cards");
  const [collapsed, setCollapsed] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  const filteredMembers = useMemo(() => {
    const q = query.trim().toLowerCase();
    return members.filter((member) => {
      const matchesQuery = !q
        || member.char_name.toLowerCase().includes(q)
        || member.char_class.toLowerCase().includes(q)
        || groupsById[member.group_id]?.name?.toLowerCase().includes(q);
      const matchesClass = !classFilter
        || member.char_class === classFilter
        || (classFilter === "Bard" && member.char_class === "Dancer");
      return matchesQuery && matchesClass;
    });
  }, [classFilter, groupsById, members, query]);

  const orderedMembers = useMemo(() => {
    return [...filteredMembers].sort((a, b) => {
      const classDelta = classOrder.indexOf(a.char_class) - classOrder.indexOf(b.char_class);
      if (classDelta) return classDelta;
      return a.char_name.localeCompare(b.char_name);
    });
  }, [filteredMembers]);

  const columns = useMemo(() => {
    const byClass = {};
    for (const member of orderedMembers) {
      const key = member.char_class === "Bard" || member.char_class === "Dancer" ? "Bard / Dancer" : member.char_class;
      byClass[key] ||= [];
      byClass[key].push(member);
    }

    const ordered = [];
    for (const name of classOrder) {
      if (name === "Dancer") continue;
      const key = name === "Bard" ? "Bard / Dancer" : name;
      if (byClass[key]?.length && !ordered.some((col) => col.key === key)) {
        ordered.push({ key, icon: name, members: byClass[key] });
      }
    }
    return ordered;
  }, [orderedMembers]);

  const maxClassRows = useMemo(() => {
    return columns.reduce((max, column) => Math.max(max, column.members.length), 0);
  }, [columns]);

  return (
    <section className="content-section">
      <div className="section-title-row">
        <div>
          <p className="eyebrow">member list</p>
          <h2>Roster</h2>
        </div>
        <div className="section-actions">
          <CollapseButton collapsed={collapsed} onToggle={() => setCollapsed((current) => !current)} />
          {!readOnly && (
            <button className="primary-button" onClick={onAdd} disabled={!canAddMember || collapsed} title={canAddMember ? "Add member" : `Roster is at ${members.length}/${memberLimit}`}>
              <Plus size={16} />Add member
            </button>
          )}
        </div>
      </div>
      {collapsed ? (
        <div className="collapsed-summary">{members.length}/{memberLimit} members · {columns.length} class groups</div>
      ) : (
        <>
      <div className="toolbar">
        <label className="search-box">
          <Search size={15} />
          <input placeholder="Search name, class, or party" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <select value={classFilter} onChange={(event) => onClassFilter(event.target.value)}>
          <option value="">All classes</option>
          {classes.map((cls) => <option key={cls.name} value={cls.name}>{cls.name}</option>)}
        </select>
        <div className="view-toggle" aria-label="Roster view">
          <button type="button" className={viewMode === "list" ? "active" : ""} onClick={() => setViewMode("list")} aria-pressed={viewMode === "list"}>
            <List size={15} />List
          </button>
          <button type="button" className={viewMode === "cards" ? "active" : ""} onClick={() => setViewMode("cards")} aria-pressed={viewMode === "cards"}>
            <LayoutGrid size={15} />Cards
          </button>
        </div>
      </div>
      {orderedMembers.length && viewMode === "list" ? (
        <div className="roster-class-table-wrap">
          <table className="roster-class-table">
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column.key}>
                    <span>
                      <ClassIcon name={column.icon} size={22} />
                      {column.key}
                    </span>
                    <em>{column.members.length}</em>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: maxClassRows }, (_, rowIndex) => (
                <tr key={rowIndex}>
                  {columns.map((column) => {
                    const member = column.members[rowIndex];
                    const cooldown = getAuctionCooldown(member, nowMs);
                    const cooldownLabel = cooldown ? `Auction cooldown: ${formatCooldownRemaining(cooldown.remainingMs)} left, eligible ${formatPhDateTime(cooldown.endsAtMs)} PH` : "";
                    return (
                      <td key={`${column.key}-${rowIndex}`} className={[!member ? "empty" : "", cooldown ? "cooldown" : ""].filter(Boolean).join(" ")} title={cooldownLabel || undefined}>
                        {member ? (
                          <div className="roster-class-cell">
                            <ClassIcon name={member.char_class} size={20} />
                            <div className="roster-class-info">
                              <strong>
                                {member.char_name}
                                {member.is_officer && <span className="officer-badge">Officer</span>}
                                {member.auction_priority_override && <span className="priority-badge">Priority</span>}
                              </strong>
                              <span>{groupsById[member.group_id]?.name || "Unassigned"}</span>
                              {cooldown && <em>{formatCooldownRemaining(cooldown.remainingMs)} cooldown</em>}
                            </div>
                            {!readOnly && (
                              <div className="row-actions always">
                                <button className="icon-button" onClick={() => onEdit(member)} aria-label={`Edit ${member.char_name}`}><Pencil size={14} /></button>
                                <button className="icon-button danger" onClick={() => onDelete(member)} aria-label={`Delete ${member.char_name}`}><Trash2 size={14} /></button>
                              </div>
                            )}
                          </div>
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : orderedMembers.length ? (
        <div className="class-grid">
          {columns.map((column) => (
            <article className="class-column" key={column.key}>
              <header>
                <ClassIcon name={column.icon} size={28} />
                <h3>{column.key}</h3>
                <span>{column.members.length}</span>
              </header>
              <div className="member-list">
                {column.members.map((member) => (
                  (() => {
                    const cooldown = getAuctionCooldown(member, nowMs);
                    const cooldownLabel = cooldown ? `Auction cooldown: ${formatCooldownRemaining(cooldown.remainingMs)} left, eligible ${formatPhDateTime(cooldown.endsAtMs)} PH` : "";
                    return (
                      <div className={`member-row ${cooldown ? "cooldown" : ""}`} key={member.id} title={cooldownLabel || undefined}>
                        <ClassIcon name={member.char_class} size={32} />
                        <div className="member-main">
                          <strong>
                            {member.char_name}
                            {member.is_officer && <span className="officer-badge">Officer</span>}
                            {member.auction_priority_override && <span className="priority-badge">Priority</span>}
                          </strong>
                          <span>{member.char_class}</span>
                          <em>Party: {groupsById[member.group_id]?.name || "Unassigned"}</em>
                          {cooldown && <b>{formatCooldownRemaining(cooldown.remainingMs)} auction cooldown</b>}
                        </div>
                        {!readOnly && (
                          <div className="row-actions">
                            <button className="icon-button" onClick={() => onEdit(member)} aria-label={`Edit ${member.char_name}`}><Pencil size={15} /></button>
                            <button className="icon-button danger" onClick={() => onDelete(member)} aria-label={`Delete ${member.char_name}`}><Trash2 size={15} /></button>
                          </div>
                        )}
                      </div>
                    );
                  })()
                ))}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-panel">No members match the current filters.</div>
      )}
        </>
      )}
    </section>
  );
}

function PartiesSection({ members, groups, onCreateGroup, onRenameGroup, onDeleteGroup, onPickEmptySlot, onRequestUnassign, onEditMember, onMoveMemberToSlot, busy = false, readOnly = false }) {
  const [collapsed, setCollapsed] = useState(false);
  const [draggingMemberId, setDraggingMemberId] = useState(null);
  const membersByGroup = useMemo(() => {
    const map = {};
    for (const group of groups) map[group.id] = [];
    for (const member of members) {
      if (member.group_id && map[member.group_id]) map[member.group_id].push(member);
    }
    for (const group of groups) {
      map[group.id] = sortedPartyRoster(map[group.id], group.name);
    }
    return map;
  }, [groups, members]);
  const unassigned = members.filter((member) => !member.group_id);
  const visibleGroups = useMemo(() => {
    if (!readOnly) return groups;
    return groups.filter((group) => (membersByGroup[group.id] || []).length > 0);
  }, [groups, membersByGroup, readOnly]);
  const fieldGroups = useMemo(() => {
    const mainField = visibleGroups.slice(0, MAIN_FIELD_PARTY_LIMIT);
    const subField = visibleGroups.slice(MAIN_FIELD_PARTY_LIMIT);
    return [
      {
        key: "main",
        title: "Main Field",
        meta: `${mainField.length}/${MAIN_FIELD_PARTY_LIMIT} parties`,
        groups: mainField
      },
      {
        key: "sub",
        title: "Sub Field",
        meta: `${subField.length} remaining ${subField.length === 1 ? "party" : "parties"}`,
        groups: subField
      }
    ];
  }, [visibleGroups]);
  const canCreateInField = (field) => !readOnly && (
    (field.key === "main" && visibleGroups.length < MAIN_FIELD_PARTY_LIMIT)
    || (field.key === "sub" && visibleGroups.length >= MAIN_FIELD_PARTY_LIMIT)
  );
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
          <p className="eyebrow">party management</p>
          <h2>Groups</h2>
        </div>
        <div className="section-actions">
          {!readOnly && draggingMemberId && (
            <div className="party-drop-zone" onDragOver={acceptDrag} onDrop={dropToUnassigned}>
              Drop to unassign
            </div>
          )}
          <CollapseButton collapsed={collapsed} onToggle={() => setCollapsed((current) => !current)} />
          {!readOnly && <button className="ghost-button" onClick={onCreateGroup} disabled={collapsed}><Plus size={16} />Create group</button>}
        </div>
      </div>

      {collapsed ? (
        <div className="collapsed-summary">{visibleGroups.length} visible groups · {members.filter((member) => member.group_id).length} assigned members</div>
      ) : (
        <>
      <div className="party-field-stack">
        {fieldGroups.map((field) => (
          <section className="party-field-section" key={field.key}>
            <div className="party-field-header">
              <div>
                <p className="eyebrow">{field.key === "main" ? "primary allocation" : "overflow allocation"}</p>
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
                            <button className="icon-button" onClick={() => onRenameGroup(group)} aria-label={`Rename ${group.name}`}><Pencil size={15} /></button>
                            <button className="icon-button danger" onClick={() => onDeleteGroup(group)} aria-label={`Delete ${group.name}`}><Trash2 size={15} /></button>
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
                              onDragStart={(event) => beginDrag(event, member)}
                              onDragEnd={() => setDraggingMemberId(null)}
                              onDragOver={acceptDrag}
                              onDrop={(event) => dropOnSlot(event, group, slot)}
                            >
                              <ClassIcon name={member.char_class} size={30} />
                              <button className="slot-name" onClick={() => !readOnly && onEditMember(member)} disabled={readOnly}>{member.char_name}</button>
                              {!readOnly && (
                                <>
                                  <div className="slot-order-actions">
                                    <button className="icon-button" onClick={() => moveMember(group, member, slot)} disabled={busy || slot === 0} aria-label={`Move ${member.char_name} up`} title="Move up">
                                      <ArrowUp size={13} />
                                    </button>
                                    <button className="icon-button" onClick={() => moveMember(group, member, slot + 2)} disabled={busy || slot === 4} aria-label={`Move ${member.char_name} down`} title="Move down">
                                      <ArrowDown size={13} />
                                    </button>
                                  </div>
                                  <button className="icon-button danger" onClick={() => onRequestUnassign(member, group)} disabled={busy} aria-label={`Remove ${member.char_name}`}>
                                    <UserMinus size={14} />
                                  </button>
                                </>
                              )}
                            </div>
                          ) : (
                            <button
                              className="party-slot empty"
                              key={slot}
                              onClick={() => !readOnly && onPickEmptySlot({ group, slot: slot + 1 })}
                              onDragOver={acceptDrag}
                              onDrop={(event) => dropOnSlot(event, group, slot)}
                              disabled={readOnly || (!unassigned.length && !draggingMemberId)}
                              title={unassigned.length ? `Add member to ${group.name} slot ${slot + 1}` : "No unassigned members"}
                            >
                              {draggingMemberId ? "Drop here" : unassigned.length ? "Empty slot" : "No unassigned"}
                            </button>
                          );
                        })}
                      </div>
                    </article>
                  );
                })}
                {canCreateInField(field) && (
                  <button className="new-party-card" onClick={onCreateGroup}>
                    <Plus size={20} />
                    <span>New group</span>
                    <em>5 open slots</em>
                  </button>
                )}
              </div>
            ) : (
              <div className="empty-panel compact">{field.key === "main" ? "No main field parties assigned yet." : "No sub field parties yet."}</div>
            )}
          </section>
        ))}
      </div>
      {readOnly && !visibleGroups.length && <div className="empty-panel">No party groups assigned yet.</div>}
        </>
      )}
    </section>
  );
}

function PartyMemberPicker({ group, targetSlot, members, currentCount, onCancel, onPickMany, busy }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  const openSlots = Math.max(0, 5 - currentCount);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return members.filter((member) => !q
      || member.char_name.toLowerCase().includes(q)
      || member.char_class.toLowerCase().includes(q));
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
    <Modal title={`Add to ${group.name}${targetSlot ? ` slot ${targetSlot}` : ""}`} onClose={onCancel} size="sm">
      <div className="picker-meta">
        <strong>{currentCount}/5 members</strong>
        <span>{targetSlot ? `First selected member goes to slot ${targetSlot}. ` : ""}{openSlots} open slot{openSlots === 1 ? "" : "s"} · select up to {openSlots}</span>
      </div>
      <div className="picker-search">
        <Search size={15} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search unassigned members" autoFocus />
      </div>
      <div className="picker-list">
        {filtered.length ? filtered.map((member) => {
          const checked = selected.has(member.id);
          const disabled = busy || (!checked && selected.size >= openSlots);
          return (
            <button className={checked ? "picker-row selected" : "picker-row"} key={member.id} onClick={() => toggleMember(member.id)} disabled={disabled}>
              <ClassIcon name={member.char_class} size={32} glow={false} />
              <span>
                <strong>{member.char_name}</strong>
                <em>{member.char_class}</em>
              </span>
              {checked ? <Check size={16} /> : <Plus size={16} />}
            </button>
          );
        }) : (
          <div className="empty-panel compact">No unassigned members match that search.</div>
        )}
      </div>
      <div className="picker-actions">
        <button className="ghost-button" type="button" onClick={onCancel}>Cancel</button>
        <button className="primary-button" type="button" onClick={addSelected} disabled={!selected.size || busy}>
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
    gl_woe_auction_cant_pay: "Someone skipped Guild Auction. The bid list was updated.",
    gl_woe_auction_done: "Guild Auction is done. Shared progress was updated.",
    league_prize_auction_started: "League Prize Auction is now running.",
    league_prize_auction_cant_pay: "Someone skipped League Prize Auction. The bid list was updated.",
    league_prize_auction_done: "League Prize Auction is done. Shared progress was updated.",
    auction_event_done: "Event auctions are done. Shared progress was updated."
  };
  return messages[eventType] || "";
}

function itemAppliesTo(item, type) {
  return Array.isArray(item.applies_to_auction_types) && item.applies_to_auction_types.includes(type);
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
    displaySlot: unit.slot
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
        ranges.push(start === previous ? String(start) : `${start}-${previous}`);
        start = slot;
        previous = slot;
      }

      return `Page ${page} and Slot ${ranges.join(", ")}`;
    })
    .join(" · ");
}

function formatDiscordBidList(auction, bidRows) {
  const lines = [
    `**${auction.name || auctionTypeLabel(auction.type)}**`,
    ""
  ];

  for (const row of bidRows) {
    const memberName = row.member?.char_name || "Unknown";
    const lineLabel = Number.isFinite(row.queuePosition) && row.queuePosition !== Number.MAX_SAFE_INTEGER
      ? `Line ${row.queuePosition}`
      : "Line";
    lines.push(`**${lineLabel} - ${memberName}**`);
    for (const item of row.items) {
      lines.push(`- ${item.item}: ${item.positions}${item.quantity > 1 ? ` x${item.quantity}` : ""}`);
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
    ...auctions.filter((auction) => auction.type !== "gl_woe")
  ];

  for (const auction of orderedAuctions) {
    const bidRows = groupedAuctionBids(displayPositionedAuctionUnits(auction, auctionItems), auction.queue || []);
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
  const activeAuctions = auctionState?.activeAuctions || (auctionState?.activeAuction ? [auctionState.activeAuction] : []);
  if (!activeAuctions.length) return [];

  const allocatedMemberIds = new Set();
  for (const auction of activeAuctions) {
    for (const unit of auction.units || []) {
      if (unit.member_id) allocatedMemberIds.add(unit.member_id);
    }
  }

  return (auctionState?.progress || [])
    .filter((row) => row.member?.id && !row.member?.is_officer && !allocatedMemberIds.has(row.member.id))
    .sort((a, b) => a.position - b.position || String(a.member.char_name || "").localeCompare(String(b.member.char_name || "")));
}

function groupedAuctionBids(units = [], queue = []) {
  const memberMap = new Map();
  const queueByMemberId = new Map(queue.map((row) => [row.member_id, row]));
  const cantPayCount = queue.filter((row) => row.status === "cant_pay").length;

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
        is_replacement: false,
        is_cant_pay: queueRow?.status === "cant_pay"
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
        cycle_reset: Boolean(unit.cycle_reset)
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
    if (unitPage < memberRow.firstPage || (unitPage === memberRow.firstPage && unitSlot < memberRow.firstSlot)) {
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
          firstPage: Math.min(...item.units.map((unit) => auctionUnitDisplayPage(unit))),
          firstSlot: Math.min(...item.units.map((unit) => auctionUnitDisplaySlot(unit)))
        }))
        .sort((a, b) => a.firstPage - b.firstPage || a.firstSlot - b.firstSlot)
    }))
    .sort((a, b) => a.firstPage - b.firstPage || a.firstSlot - b.firstSlot || a.queuePosition - b.queuePosition);
  if (cantPayCount > 0) {
    const replacementIds = new Set(
      rows
        .filter((row) => !row.is_cant_pay)
        .slice(-cantPayCount)
        .map((row) => row.member_id)
    );
    return rows.map((row) => ({ ...row, is_replacement: replacementIds.has(row.member_id) }));
  }

  return rows;
}

function auctionSearchMatches(row, query) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;
  return String(row.member?.char_name || "").toLowerCase().includes(normalizedQuery);
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
      quantity: row.quantity || 0
    }))
    .filter(({ item, quantity }) => item && quantity > 0)
    .sort((a, b) => (a.item.sort_order || 0) - (b.item.sort_order || 0));
}

function ItemIcon({ itemKey, label = "Item" }) {
  const src = ITEM_ICON_SRC[itemKey];
  if (!src) return <span className={`auction-item-dot item-${itemKey || "empty"}`} aria-hidden="true" />;
  return <img className="item-icon" src={src} alt="" title={label} />;
}

function auctionPageItemOptions(auction, auctionItems) {
  const quantityByItemId = new Map((auction.inventory || []).map((row) => [row.item_id, row.quantity || 0]));
  return auctionItems
    .filter((item) => itemAppliesTo(item, auction.type))
    .filter((item) => (quantityByItemId.get(item.id) || 0) > 0)
    .sort((a, b) => (
      (AUCTION_PAGE_ITEM_ORDER[a.item_key] || 99) - (AUCTION_PAGE_ITEM_ORDER[b.item_key] || 99)
      || (a.sort_order || 0) - (b.sort_order || 0)
    ));
}

function auctionItemPageJumps(auction, auctionItems) {
  const quantityByItemId = new Map((auction.inventory || []).map((row) => [row.item_id, row.quantity || 0]));
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
  const selectedItem = auctionItems.find((item) => item.id === selectedItemId) || null;
  const applicableItems = auctionItems
    .filter((item) => itemAppliesTo(item, auction.type))
    .filter((item) => {
      if (!selectedItemId) return true;
      if (SHARED_FEATHER_PAGE_KEYS.has(selectedItem?.item_key)) {
        return SHARED_FEATHER_PAGE_KEYS.has(item.item_key);
      }
      return item.id === selectedItemId;
    })
    .sort((a, b) => (
      auctionDisplayItemOrder(a) - auctionDisplayItemOrder(b)
      || (a.sort_order || 0) - (b.sort_order || 0)
    ));
  const quantityByItemId = new Map((auction.inventory || []).map((row) => [row.item_id, row.quantity || 0]));
  const unitsByItemId = new Map();
  for (const unit of auction.units || []) {
    const itemUnits = unitsByItemId.get(unit.item_id) || [];
    itemUnits.push(unit);
    unitsByItemId.set(unit.item_id, itemUnits);
  }
  for (const itemUnits of unitsByItemId.values()) {
    itemUnits.sort((a, b) => (
      auctionUnitDisplayPage(a) - auctionUnitDisplayPage(b)
      || auctionUnitDisplaySlot(a) - auctionUnitDisplaySlot(b)
    ));
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
          freeForAll: !item.gates_round_completion
        });
      }
      displayIndex += 1;
    }
  }

  const minDisplayPage = slots.length ? Math.min(...slots.map((slot) => slot.displayPage)) : 1;
  const maxDisplayPage = slots.length ? Math.max(...slots.map((slot) => slot.displayPage)) : 1;
  const pages = [];
  for (let displayPage = minDisplayPage; displayPage <= maxDisplayPage; displayPage += 1) {
    const page = displayPage - minDisplayPage + 1;
    pages.push({
      page,
      displayPage,
      slots: [1, 2, 3, 4].map((slot) => (
        slots.find((entry) => entry.displayPage === displayPage && entry.slot === slot) || { page, displayPage, slot, item: null, unit: null, member: null, freeForAll: false }
      )).map((entry) => ({ ...entry, displayPage }))
    });
  }

  return pages;
}

function auctionItemPageForMember(auction, auctionItems, itemId, memberId) {
  if (!memberId) return null;
  const pages = buildAuctionPages(auction, auctionItems, itemId);
  for (const page of pages) {
    const slot = page.slots.find((entry) => entry.member?.id === memberId || entry.member_id === memberId || entry.unit?.member_id === memberId);
    if (slot) return page.page;
  }
  return null;
}

function AuctionPageView({ auction, auctionItems, page, onPageChange, selectedItemId, onSelectedItemChange, searchQuery = "" }) {
  const itemOptions = auctionPageItemOptions(auction, auctionItems);
  const itemPageJumps = auctionItemPageJumps(auction, auctionItems);
  const safeSelectedItemId = itemOptions.some((item) => item.id === selectedItemId)
    ? selectedItemId
    : null;
  const selectedItem = itemOptions.find((item) => item.id === safeSelectedItemId) || null;
  const pages = buildAuctionPages(auction, auctionItems, null);
  const pageCount = pages.length || 1;
  const safePage = Math.min(Math.max(page || 1, 1), pageCount);
  const currentPage = pages[safePage - 1] || { page: 1, slots: [] };
  const normalizedSearch = searchQuery.trim().toLowerCase();

  function setPage(nextPage) {
    onPageChange(Math.min(Math.max(nextPage, 1), pageCount));
  }

  return (
    <div className="auction-page-view">
      <div className="auction-item-tabs" aria-label="Auction item page filter">
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
              <ItemIcon itemKey={item.item_key} label={item.name || item.short_name} />
              <span>{item.short_name}</span>
              <em>Page {startPage}</em>
              <strong>x{quantity}</strong>
            </button>
          );
        })}
      </div>
      <div className="auction-page-controls">
        <button className="ghost-button mini" type="button" onClick={() => setPage(safePage - 1)} disabled={safePage <= 1}>Prev</button>
        <label className="auction-page-jump">
          <input
            type="number"
            min="1"
            max={pageCount}
            value={currentPage.displayPage || safePage}
            onChange={(event) => setPage(Number.parseInt(event.target.value, 10) || 1)}
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
        <button className="ghost-button mini" type="button" onClick={() => setPage(safePage + 1)} disabled={safePage >= pageCount}>Next</button>
      </div>
      <div className="auction-page-card">
        <header>
          <span>{selectedItem?.name || auction.name || auctionTypeLabel(auction.type)}</span>
          <strong>Page {currentPage.displayPage || safePage}</strong>
        </header>
        <div className="auction-page-slots">
          {currentPage.slots.map((slot) => {
            const highlighted = normalizedSearch && String(slot.member?.char_name || "").toLowerCase().includes(normalizedSearch);
            return (
            <div className={`auction-page-slot ${slot.member ? "assigned" : slot.freeForAll ? "free" : "empty"}${highlighted ? " search-hit" : ""}`} key={`${slot.page}-${slot.slot}`}>
              <div className="auction-slot-number">Slot {slot.slot}</div>
              <div className="auction-slot-item">
                <ItemIcon itemKey={slot.item?.item_key} label={slot.item?.name || slot.item?.short_name || "Item"} />
                <strong>{slot.item?.short_name || "Empty"}</strong>
                <em>{slot.item?.name || "No item"}</em>
              </div>
              {slot.member ? (
                <div className="auction-slot-member">
                  <ClassIcon name={slot.member.char_class} size={30} glow={false} />
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
        <button className="ghost-button mini" type="button" onClick={() => setPage(safePage - 1)} disabled={safePage <= 1}>Prev</button>
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
        <button className="ghost-button mini" type="button" onClick={() => setPage(safePage + 1)} disabled={safePage >= pageCount}>Next</button>
      </div>
    </div>
  );
}

function AuctionStartForm({ type, auctionItems, internalCaps = {}, onCancel, onStart, busy }) {
  const applicable = auctionItems.filter((item) => itemAppliesTo(item, type));
  const cappedItems = applicable.filter((item) => item.gates_round_completion);
  const [name, setName] = useState(type === "league_prize" ? "League Prize" : "Guild Auction");
  const [inventory, setInventory] = useState(() => Object.fromEntries(applicable.map((item) => [item.item_key, "0"])));
  const [useInGameCaps, setUseInGameCaps] = useState(false);
  const [inGameCaps, setInGameCaps] = useState(() => Object.fromEntries(cappedItems.map((item) => [item.item_key, ""])));

  function submit(event) {
    event.preventDefault();
    onStart({
      type,
      name,
      inventory: Object.fromEntries(applicable.map((item) => [item.item_key, Number.parseInt(inventory[item.item_key] || "0", 10) || 0])),
      inGameCaps: useInGameCaps
        ? Object.fromEntries(cappedItems.map((item) => [item.item_key, Number.parseInt(inGameCaps[item.item_key] || "0", 10) || 0]))
        : {}
    });
  }

  return (
    <form onSubmit={submit} className="form-grid single">
      <label>
        <span>Auction name</span>
        <input value={name} onChange={(event) => setName(event.target.value)} autoFocus />
      </label>
      <div className="auction-form-items">
        {applicable.map((item) => (
          <label key={item.id}>
            <span>{item.name}</span>
            <input
              type="number"
              min="0"
              value={inventory[item.item_key] ?? "0"}
              onChange={(event) => setInventory((current) => ({ ...current, [item.item_key]: event.target.value }))}
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
                onChange={(event) => setInGameCaps((current) => ({ ...current, [item.item_key]: event.target.value }))}
              />
            </label>
          ))}
        </div>
      )}
      <p className="field-note">{type === "gl_woe" ? "Lock this Guild Auction list if you want to run optional League Prize after reviewing can't-pay members." : "League Prize is optional. Add only the items available from the event."}</p>
      <div className="form-actions">
        <button type="button" className="ghost-button" onClick={onCancel}>Cancel</button>
        <button className="primary-button" disabled={busy}>
          {busy ? <Loader2 className="spin" size={15} /> : <Gavel size={15} />}
          Start {auctionTypeLabel(type)}
        </button>
      </div>
    </form>
  );
}

function AuctionLimitsForm({ auctionItems, auctionState, onCancel, onSave, busy }) {
  const currentCaps = auctionState?.itemCaps || {};
  const limitedItems = auctionItems.filter((item) => item.gates_round_completion);
  const [caps, setCaps] = useState(() => Object.fromEntries(
    limitedItems.map((item) => [item.item_key, String(currentCaps[item.item_key] ?? item.default_per_round_cap ?? 0)])
  ));

  function submit(event) {
    event.preventDefault();
    onSave(Object.fromEntries(limitedItems.map((item) => [item.item_key, Number.parseInt(caps[item.item_key] || "0", 10) || 0])));
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
              onChange={(event) => setCaps((current) => ({ ...current, [item.item_key]: event.target.value }))}
            />
          </label>
        ))}
      </div>
      <p className="field-note">These shared caps apply to every member in the auction lineup. Illusion Card Fragments are free-for-all and do not affect limits.</p>
      <div className="form-actions">
        <button type="button" className="ghost-button" onClick={onCancel}>Cancel</button>
        <button className="primary-button" disabled={busy}>
          {busy ? <Loader2 className="spin" size={15} /> : <Check size={15} />}
          Save limits
        </button>
      </div>
    </form>
  );
}

function GlobalAuctionDefaultsForm({ auctionItems, onCancel, onSave, busy }) {
  const limitedItems = auctionItems.filter((item) => item.gates_round_completion);
  const [caps, setCaps] = useState(() => Object.fromEntries(
    limitedItems.map((item) => [item.item_key, String(item.default_per_round_cap ?? 0)])
  ));

  function submit(event) {
    event.preventDefault();
    onSave(Object.fromEntries(limitedItems.map((item) => [item.item_key, Number.parseInt(caps[item.item_key] || "0", 10) || 0])));
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
              onChange={(event) => setCaps((current) => ({ ...current, [item.item_key]: event.target.value }))}
            />
          </label>
        ))}
      </div>
      <p className="field-note">These defaults are used for future auction lineups and as the fallback when no lineup or member-specific override exists.</p>
      <div className="form-actions">
        <button type="button" className="ghost-button" onClick={onCancel}>Cancel</button>
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
    const formatMember = (member) => member ? `#${member.line} ${member.name}` : "";
    if (!last || first?.member_id === last?.member_id) return `from ${formatMember(first)}`;
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
              {warnings.map((warning) => <span key={warning}>{warning}</span>)}
            </div>
          </div>
        )}

        <div className="finalize-summary-grid">
          {itemSummaries.map((summary) => (
            <div className="finalize-summary-card" key={summary.item_key}>
              <strong>{summary.short_name}</strong>
              <span>{summary.quantity} items · {summary.memberCount} members</span>
              {summary.cycleBuckets.map((bucket) => (
                <em className="finalize-cycle-row" key={`${summary.item_key}-${bucket.item_cycle}`}>
                  <span>{bucket.item_cycle > 0 ? `Cycle ${bucket.item_cycle}` : "Current cycle"}: {bucket.quantity} items{bucket.memberCount ? ` · ${bucket.memberCount} members` : ""}</span>
                  {bucket.memberCount ? <span className="finalize-member-range">{memberRange(bucket)}</span> : null}
                </em>
              ))}
            </div>
          ))}
        </div>

        <div className="form-actions">
          <button type="button" className="ghost-button" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="button" className="primary-button" onClick={onConfirm} disabled={busy}>
            {busy ? <Loader2 className="spin" size={15} /> : <Check size={15} />}
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
  const receivedTotal = limitedItems.reduce((sum, item) => sum + (row.received[item.item_key] || 0), 0);
  if (!missingItems.length) return { label: "waiting cycle", state: "capped" };
  if (receivedTotal === 0) return null;
  const names = missingItems.slice(0, 2).map((item) => item.short_name);
  const suffix = missingItems.length > 2 ? ` +${missingItems.length - 2}` : "";
  return {
    label: `needs ${names.join(", ")}${suffix}`,
    state: "warning"
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
  return limitedItems.reduce((sum, item) => sum + (row.received[item.item_key] || 0), 0);
}

function progressRowQueueState(row, limitedItems, priorityMemberId) {
  if (progressRowReady(row, limitedItems)) return { label: "ready", state: "ready" };
  if (row.member.id === priorityMemberId) return { label: "priority", state: "priority" };
  if (progressReceivedTotal(row, limitedItems) > 0) return { label: "partial", state: "partial" };
  return { label: "in queue", state: "queue" };
}

function heldItemCount(row, item) {
  return Math.max(Number(row.held?.[item.item_key] || 0), Number(row.received[item.item_key] || 0));
}

function itemCycleCount(row, item) {
  const cap = row.caps[item.item_key] ?? item.default_per_round_cap ?? 0;
  if (cap <= 0) return 0;
  return Math.floor(heldItemCount(row, item) / cap);
}

function buildActiveBidStatus(auctionState, limitedItems) {
  const itemById = new Map(limitedItems.map((item) => [item.id, item]));
  const biddingByMemberId = new Map();
  const skippedMemberIds = new Set();

  for (const auction of auctionState?.activeAuctions || []) {
    for (const queueRow of auction.queue || []) {
      if (queueRow.status === "cant_pay") skippedMemberIds.add(queueRow.member_id);
    }

    for (const unit of auction.units || []) {
      const item = itemById.get(unit.item_id);
      if (!item || !unit.member_id) continue;
      const memberItems = biddingByMemberId.get(unit.member_id) || new Map();
      const current = memberItems.get(item.item_key) || { item, quantity: 0, regularQuantity: 0, resetQuantity: 0, cycleReset: false };
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

  return { biddingByMemberId, skippedMemberIds };
}

function activeItemPreview(activeItem, received, cap) {
  if (!activeItem) return null;
  const usesResetCycle = activeItem.resetQuantity > 0 || activeItem.cycleReset;
  const quantity = usesResetCycle ? activeItem.resetQuantity || activeItem.quantity : activeItem.regularQuantity || activeItem.quantity;
  const base = usesResetCycle ? 0 : received;
  return {
    quantity,
    next: cap > 0 ? Math.min(base + quantity, cap) : base + quantity,
    usesResetCycle
  };
}

function MemberProgressTable({ auctionItems, auctionState }) {
  const limitedItems = auctionItems.filter((item) => item.gates_round_completion);
  const rows = auctionState?.progress || [];
  const nowMs = Date.now();
  const priorityMemberId = [...rows]
    .sort((a, b) => auctionPriorityRank(a.member) - auctionPriorityRank(b.member) || a.position - b.position)
    .find((row) => !getAuctionCooldown(row.member, nowMs) && !progressRowReady(row, limitedItems))?.member.id || null;
  const activeBidStatus = buildActiveBidStatus(auctionState, limitedItems);
  const itemSummaries = limitedItems.map((item) => {
    let capped = 0;
    let partial = 0;
    let empty = 0;
    let cooldown = 0;
    let currentTotal = 0;
    let heldTotal = 0;
    const cycleCounts = [];

    for (const row of rows) {
      const received = row.received[item.item_key] || 0;
      const cap = row.caps[item.item_key] ?? item.default_per_round_cap ?? 0;
      const inCooldown = Boolean(getAuctionCooldown(row.member, nowMs));
      currentTotal += received;
      heldTotal += heldItemCount(row, item);
      if (inCooldown) {
        cooldown += 1;
        continue;
      }
      if (cap > 0) cycleCounts.push(itemCycleCount(row, item));
      const state = progressCellState(received, cap);
      if (state === "capped") capped += 1;
      if (state === "warning") partial += 1;
      if (state === "empty") empty += 1;
    }

    const completedCycles = cycleCounts.length ? Math.min(...cycleCounts) : 0;
    return { item, capped, partial, empty, cooldown, currentTotal, heldTotal, completedCycles };
  });

  if (!rows.length) {
    return <div className="empty-panel compact">Create an auction lineup to track member item progress.</div>;
  }

  return (
    <div className="member-progress-card">
      <header>
        <div>
          <p className="eyebrow">member item tracker</p>
          <h3>Shared Limit Progress</h3>
        </div>
        <span>{rows.length} members</span>
      </header>
      <div className="progress-summary-grid">
        {itemSummaries.map(({ item, capped, partial, empty, cooldown, currentTotal, heldTotal, completedCycles }) => (
          <div className="progress-summary-card" key={item.id}>
            <ItemIcon itemKey={item.item_key} label={item.name || item.short_name} />
            <div>
              <strong>{PROGRESS_SUMMARY_ITEM_LABELS[item.item_key] || item.name || item.short_name}</strong>
              <span>{heldTotal} held total</span>
              <em>{completedCycles} cycles complete · {capped} capped · {partial} incomplete · {empty} none · {cooldown} cooldown · {currentTotal} current</em>
            </div>
          </div>
        ))}
      </div>
      <p className="progress-cycle-note">Item cells show the current cycle. Cycle history shows why a member is skipped for an item.</p>
      <div className="progress-table-wrap">
        <table className="progress-table">
          <colgroup>
            <col className="progress-col-line" />
            <col className="progress-col-member" />
            {limitedItems.map((item) => <col className="progress-col-item" key={item.id} />)}
            <col className="progress-col-status" />
            <col className="progress-col-held" />
          </colgroup>
          <thead>
            <tr>
              <th>Line</th>
              <th>Member</th>
              {limitedItems.map((item) => <th key={item.id}>{item.short_name}</th>)}
              <th>Status</th>
              <th>Cycles held</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const nextNeed = progressRowNextNeed(row, limitedItems);
              const queueState = progressRowQueueState(row, limitedItems, priorityMemberId);
              const activeBidItems = activeBidStatus.biddingByMemberId.get(row.member.id);
              const skipped = activeBidStatus.skippedMemberIds.has(row.member.id);
              const cooldown = getAuctionCooldown(row.member, nowMs);
              const cooldownLabel = cooldown ? `Eligible ${formatPhDateTime(cooldown.endsAtMs)} PH` : "";
              const biddingIncomplete = activeBidItems
                ? limitedItems.some((item) => {
                  const cap = row.caps[item.item_key] ?? item.default_per_round_cap ?? 0;
                  if (cap <= 0) return false;
                  const activeItem = activeBidItems.get(item.item_key);
                  const preview = activeItemPreview(activeItem, row.received[item.item_key] || 0, cap);
                  return cap > 0 && preview && preview.next < cap;
                })
                : false;
              return (
                <tr className={cooldown ? "cooldown-row" : ""} key={row.member.id}>
                  <td>{row.position}</td>
                  <td>
                    <strong>{row.member.char_name}</strong>
                    <span>{row.member.char_class}</span>
                    {cooldown && <em>{cooldownLabel}</em>}
                  </td>
                  {limitedItems.map((item) => {
                    const received = row.received[item.item_key] || 0;
                    const cap = row.caps[item.item_key] ?? item.default_per_round_cap ?? 0;
                    const activeItem = activeBidItems?.get(item.item_key);
                    const bidPreview = activeItemPreview(activeItem, received, cap);
                    const displayReceived = progressCellValue(received, cap);
                    return (
                      <td key={item.id}>
                        <div className="progress-item-stack">
                          <span className={`progress-count ${progressCellState(received, cap)}`}>{displayReceived}/{cap}</span>
                          {bidPreview && (
                            <span className={`progress-bid-text bid-${item.item_key}`}>
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
                          <em className="progress-status cooldown">cooldown {formatCooldownRemaining(cooldown.remainingMs)}</em>
                          <em className="progress-status queue">{cooldownLabel}</em>
                        </>
                      ) : skipped ? (
                        <em className="progress-status skipped">skipped</em>
                      ) : activeBidItems ? (
                        <em className={`progress-status ${biddingIncomplete ? "bidding-partial" : "bidding"}`}>{biddingIncomplete ? "partial bidding" : "bidding"}</em>
                      ) : (
                        <>
                          {queueState.state !== "ready" && <em className={`progress-status ${queueState.state}`}>{queueState.label}</em>}
                          {nextNeed && <em className={`progress-status ${nextNeed.state}`}>{nextNeed.label}</em>}
                        </>
                      )}
                    </div>
                  </td>
                  <td>
                    <div className="progress-cycle-summary">
                      {limitedItems.map((item) => (
                        <span className={`progress-cycle-pill held-${item.item_key}`} key={item.id}>
                          <ItemIcon itemKey={item.item_key} label={item.name || item.short_name} />
                          <em>Cycle {itemCycleCount(row, item)}</em>
                        </span>
                      ))}
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
  busy
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [auctionView, setAuctionView] = useState("list");
  const [auctionPages, setAuctionPages] = useState({});
  const [auctionPageItems, setAuctionPageItems] = useState({});
  const [auctionSearch, setAuctionSearch] = useState("");
  const activeRound = auctionState?.activeRound;
  const activeAuctions = auctionState?.activeAuctions || (auctionState?.activeAuction ? [auctionState.activeAuction] : []);
  const hasOpenAuctions = activeAuctions.length > 0;
  const glAuction = activeAuctions.find((auction) => auction.type === "gl_woe");
  const leagueAuction = activeAuctions.find((auction) => auction.type === "league_prize");
  const lockedGlReadyForLeague = glAuction?.status === "locked";
  const pairedEventActive = Boolean(lockedGlReadyForLeague && leagueAuction);
  const canStartLeague = Boolean(activeRound && lockedGlReadyForLeague && !leagueAuction);
  const leagueHint = glAuction
    ? lockedGlReadyForLeague
      ? "League Prize is ready. It will use current progress plus locked Guild Auction reservations."
      : "Lock-in the Guild Auction first, then League Prize becomes available."
    : "Create and lock a Guild Auction first, then League Prize becomes available.";
  const bidderNames = uniqueBidderNames(activeAuctions, auctionItems);
  const logoutRows = logoutCandidateRows(auctionState);
  const logoutNames = logoutRows.map((row) => row.member.char_name).filter(Boolean);

  function applyAuctionSearch(nextQuery) {
    setAuctionSearch(nextQuery);
    const trimmedQuery = nextQuery.trim();
    if (!trimmedQuery) return;

    const nextPages = {};
    const nextPageItems = {};
    for (const auction of activeAuctions) {
      const bidRows = groupedAuctionBids(displayPositionedAuctionUnits(auction, auctionItems), auction.queue || []);
      const match = bidRows.find((row) => auctionSearchMatches(row, trimmedQuery));
      if (!match) continue;

      const targetPage = auctionItemPageForMember(auction, auctionItems, null, match.member_id);
      if (targetPage) {
        nextPages[`${auction.id}:all`] = targetPage;
        nextPageItems[auction.id] = null;
      }
    }

    if (Object.keys(nextPageItems).length) {
      setAuctionPageItems((current) => ({ ...current, ...nextPageItems }));
    }
    if (Object.keys(nextPages).length) {
      setAuctionPages((current) => ({ ...current, ...nextPages }));
    }
  }

  return (
    <>
      {activeAuctions.length ? (
        <section className="content-section auction-logout-section">
          <div className="auction-logout-heading">
            <div>
              <p className="eyebrow">required action</p>
              <h3><LogOut size={22} />LOG OUT or 4 DAYS COOLDOWN?</h3>
              <em>These members have no item allocation in the running auction.</em>
            </div>
            <span>{logoutRows.length} member{logoutRows.length === 1 ? "" : "s"}</span>
            {!readOnly && (
              <button
                className="ghost-button"
                type="button"
                onClick={() => onCopyBidderNames(logoutNames, "logout member")}
                disabled={!logoutNames.length}
              >
                <Copy size={15} />Copy names
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
            <div className="auction-logout-empty">Every lineup member has an active bid allocation.</div>
          )}
        </section>
      ) : null}

    <section className="content-section auction-section">
      <div className="section-title-row">
        <div>
          <p className="eyebrow">reward rotation</p>
          <h2>Auctions</h2>
        </div>
        <div className="section-actions">
          <CollapseButton collapsed={collapsed} onToggle={() => setCollapsed((current) => !current)} />
          <span className="status-pill"><Swords size={14} />{activeRound ? "Lineup active" : "No lineup"}</span>
        </div>
      </div>

      {collapsed ? (
        <div className="collapsed-summary">
          {activeAuctions.length ? `${activeAuctions.length} active auction${activeAuctions.length === 1 ? "" : "s"}` : "No active auction list"}
        </div>
      ) : (
        <>
      {!readOnly && (
        <div className="round-card">
          <div className="round-main">
            <div>
              <h3>Auction Settings</h3>
              <p>{activeRound ? "shared limits for the current auction lineup" : "create members first, then adjust auction settings"}</p>
            </div>
          </div>
          <div className="round-actions">
            <button className="ghost-button" type="button" onClick={onOpenLimits} disabled={!activeRound || hasOpenAuctions}><Settings size={15} />Adjust limits</button>
            {canManageGlobalDefaults && (
              <>
                <button className="ghost-button" type="button" onClick={onOpenGlobalLimits}><Settings size={15} />Global defaults</button>
                <button className="ghost-button" type="button" onClick={onSaveSavepoint} disabled={!activeRound || busy}><Save size={15} />Save savepoint</button>
                <button className="danger-button soft" type="button" onClick={onRestoreSavepoint} disabled={busy}><RefreshCw size={15} />Restore savepoint</button>
              </>
            )}
          </div>
        </div>
      )}

      {activeAuctions.length ? (
        <div className="auction-table-tools">
          <label className="auction-search auction-search-shared">
            <Search size={15} />
            <input
              value={auctionSearch}
              onChange={(event) => applyAuctionSearch(event.target.value)}
              placeholder="Search auction list"
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
              <List size={14} />List View
            </button>
            <button
              type="button"
              className={auctionView === "page" ? "active" : ""}
              onClick={() => setAuctionView("page")}
              aria-pressed={auctionView === "page"}
            >
              <LayoutGrid size={14} />Page View
            </button>
          </div>
          {!readOnly && (
            <button
              className="ghost-button auction-copy-bidders"
              type="button"
              onClick={() => onCopyBidderNames(bidderNames)}
              disabled={!bidderNames.length}
            >
              <Copy size={15} />Copy bidders
            </button>
          )}
        </div>
      ) : null}

      <div className={`auction-grid${activeAuctions.length > 1 ? " two-up" : ""}`}>
        {activeAuctions.length ? (
          activeAuctions.map((auction) => {
            const displayAuction = { ...auction, units: displayPositionedAuctionUnits(auction, auctionItems) };
            const bidRows = groupedAuctionBids(displayAuction.units, auction.queue || []);
            const inventorySummary = auctionInventorySummary(auction, auctionItems);
            const locked = auction.status === "locked";
            const activeView = auctionView;
            const pageItemOptions = auctionPageItemOptions(auction, auctionItems);
            const selectedPageItemId = pageItemOptions.some((item) => item.id === auctionPageItems[auction.id])
              ? auctionPageItems[auction.id]
              : null;
            const pageStateKey = `${auction.id}:all`;
            const currentPage = auctionPages[pageStateKey] || 1;
            const searchQuery = auctionSearch;
            const filteredBidRows = searchQuery.trim()
              ? bidRows.filter((row) => auctionSearchMatches(row, searchQuery))
              : bidRows;
            const searchMatch = filteredBidRows[0] || null;
            const searchLocation = searchQuery.trim()
              ? searchMatch
                ? auctionSearchLocation(searchMatch)
                : "No matching bid"
              : "";
            const cycleResetItems = [
              ...new Set(
                bidRows.flatMap((row) => row.items
                  .filter((item) => item.cycle_reset)
                  .map((item) => item.item))
              )
            ];
            return (
              <article className={`active-auction-card auction-${auction.type}${locked ? " locked" : ""}`} key={auction.id}>
                <div className="active-dot-row">
                  <span className={locked ? "idle-dot" : "live-dot"} />
                  <strong>{auction.name || auctionTypeLabel(auction.type)}</strong>
                  <em>{locked ? `${auctionTypeLabel(auction.type)} locked` : auctionTypeLabel(auction.type)}</em>
                </div>
                {!readOnly && (
                  <p>{locked ? "This Guild Auction list is locked. League Prize can now use these reserved bids." : "Review the generated page table, then finalize the auction."}</p>
                )}
                <div className="active-auction-stats">
                  <span><Clock3 size={14} />{locked ? "Locked" : "Active"}</span>
                  <span><Gavel size={14} />{auction.pageCount || 0} pages</span>
                  <span><Trophy size={14} />{auction.units?.length || 0} allocations</span>
                </div>
                {activeView !== "page" && (
                  <div className="auction-prize-summary" aria-label="Auction prize inventory">
                    {inventorySummary.length ? inventorySummary.map(({ item, quantity }) => (
                      <span className={`auction-prize-pill prize-${item.item_key}`} key={item.id}>
                        <ItemIcon itemKey={item.item_key} label={item.name || item.short_name} />
                        <strong>{item.short_name}</strong>
                        <em>x{quantity}</em>
                      </span>
                    )) : (
                      <span className="auction-prize-empty">No prizes entered</span>
                    )}
                  </div>
                )}
                {searchLocation && (
                  <div className={searchMatch ? "auction-search-result" : "auction-search-result empty"}>
                    {searchMatch ? (
                      <span>{searchMatch.member?.char_name} · {searchLocation}</span>
                    ) : (
                      <span>No member with active bids matches “{searchQuery.trim()}”.</span>
                    )}
                  </div>
                )}
                {cycleResetItems.length > 0 && (
                  <div className="auction-cycle-note">
                    <RefreshCw size={15} />
                    <span>
                      {cycleResetItems.join(", ")} {cycleResetItems.length === 1
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
                      onPageChange={(page) => setAuctionPages((current) => ({ ...current, [pageStateKey]: page }))}
                      selectedItemId={selectedPageItemId}
                      onSelectedItemChange={(itemId) => {
                        setAuctionPageItems((current) => ({ ...current, [auction.id]: itemId }));
                        setAuctionPages((current) => ({ ...current, [`${auction.id}:${itemId}`]: current[`${auction.id}:${itemId}`] || 1 }));
                      }}
                      searchQuery={searchQuery}
                    />
                  ) : (
                    <div className="allocation-table-wrap">
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
                              <tr className={row.is_replacement ? "replacement-row" : row.is_cant_pay ? "cant-pay-row" : ""} key={`${auction.id}-${row.member_id}`}>
                                <td>
                                  <strong>{row.member?.char_name || "Unknown"}</strong>
                                  {Number.isFinite(row.queuePosition) && row.queuePosition !== Number.MAX_SAFE_INTEGER && <span>Line {row.queuePosition}</span>}
                                  {row.is_replacement && <span className="replacement-label">bumped up, someone skipped today</span>}
                                  {row.cycle_reset && <span>cycle reset</span>}
                                </td>
                                <td>
                                  <div className="bid-stack">
                                    {row.items.map((item) => (
                                      <div className="bid-line" key={`${item.item_id}-${item.positions}`}>
                                        <ItemIcon itemKey={item.units?.[0]?.item_key} label={item.item} />
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
                        <div className="empty-panel compact">{searchQuery.trim() ? "No matching member has active bids in this auction." : "No allocations for this auction."}</div>
                      )}
                    </div>
                  )}
                </div>
                {!readOnly && (
                  <div className="active-actions">
                    <button className="ghost-button" type="button" onClick={() => onCopyAuctionList(auction, bidRows)} disabled={!bidRows.length}>
                      <Copy size={15} />Copy list
                    </button>
                    {auction.type === "gl_woe" && !locked && (
                      <button className="ghost-button" type="button" onClick={() => onLockAuction(auction)} disabled={busy}>
                        <Shield size={15} />Lock-in list
                      </button>
                    )}
                    {!pairedEventActive && (
                      <button className="primary-button" type="button" onClick={() => onDoneAuction(auction)} disabled={busy}>
                        {busy ? <Loader2 className="spin" size={15} /> : <Check size={15} />}
                        Done
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
            <p>{activeRound ? "Start Guild Auction or optional League Prize when you are ready to distribute items." : "Create the auction lineup first so the app can lock the randomized source list."}</p>
            <div className="active-auction-stats">
              <span><Clock3 size={14} />Waiting</span>
              <span><Gavel size={14} />0 pages</span>
              <span><Trophy size={14} />{auctionItems.length} tracked items</span>
            </div>
          </article>
        )}

      </div>

      {!readOnly && (
        <>
          <div className="auction-start-row">
            <button className="primary-button" type="button" disabled={!activeRound || Boolean(glAuction) || Boolean(leagueAuction)} onClick={() => onOpenStartAuction("gl_woe")}><Plus size={16} />New Guild Auction</button>
            <button className="ghost-button" type="button" disabled={!canStartLeague} onClick={() => onOpenStartAuction("league_prize")} title={canStartLeague ? "Start League Prize" : "Lock-in Guild Auction first"}><Plus size={16} />New League Prize Auction</button>
            {pairedEventActive && (
              <button className="primary-button" type="button" onClick={() => onDoneEvent([glAuction, leagueAuction])} disabled={busy}>
                {busy ? <Loader2 className="spin" size={15} /> : <Check size={15} />}
                Done event
              </button>
            )}
            {hasOpenAuctions && (
              <button className="danger-button soft" type="button" onClick={() => onCancelAuction([glAuction, leagueAuction].filter(Boolean))} disabled={busy}>
                <X size={15} />Cancel auction
              </button>
            )}
          </div>
          <p className={canStartLeague ? "auction-flow-note ready" : "auction-flow-note"}>{leagueHint}</p>
        </>
      )}

      <MemberProgressTable auctionItems={auctionItems} auctionState={auctionState} />
        </>
      )}
    </section>
    </>
  );
}

export default function DashboardApp({ publicView = false, auditLogView = false }) {
  const [session, setSession] = useState({ loading: true, authenticated: false, username: "", role: "", mustResetPassword: false });
  const [members, setMembers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [auctionItems, setAuctionItems] = useState([]);
  const [auctionState, setAuctionState] = useState(null);
  const [loading, setLoading] = useState(false);
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
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditLogsLoading, setAuditLogsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [classFilter, setClassFilter] = useState("");
  const [memberLimit, setMemberLimit] = useState(null);
  const realtimeTimerRef = useRef(null);
  const realtimeLoadingRef = useRef(false);
  const scrollRestoreRef = useRef(null);

  const groupsById = useMemo(() => Object.fromEntries(groups.map((group) => [group.id, group])), [groups]);
  const effectiveMemberLimit = Math.max(memberLimit || DEFAULT_GUILD_MEMBER_LIMIT, members.length);
  const unassignedMembers = members.filter((member) => !member.group_id);
  const publicGlAuction = publicView
    ? (auctionState?.activeAuctions || []).find((auction) => auction.type === "gl_woe")
    : null;

  const captureScrollPosition = useCallback(() => {
    if (typeof window === "undefined") return;
    scrollRestoreRef.current = {
      x: window.scrollX,
      y: window.scrollY
    };
  }, []);

  const restoreScrollPosition = useCallback(() => {
    if (typeof window === "undefined" || !scrollRestoreRef.current) return;
    const position = scrollRestoreRef.current;
    scrollRestoreRef.current = null;
    window.requestAnimationFrame(() => {
      window.scrollTo({ left: position.x, top: position.y, behavior: "auto" });
      window.requestAnimationFrame(() => {
        window.scrollTo({ left: position.x, top: position.y, behavior: "auto" });
      });
    });
  }, []);

  const loadData = useCallback(async ({ silent = false } = {}) => {
    if (realtimeLoadingRef.current) return;
    realtimeLoadingRef.current = true;
    if (silent) captureScrollPosition();
    if (!silent) setLoading(true);
    setError("");
    try {
      const data = await api(publicView ? "/api/public/bootstrap" : "/api/bootstrap");
      setMembers(data.members || []);
      setGroups(data.groups || []);
      setAuctionItems(data.auctionItems || []);
      setAuctionState(data.auctionState || null);
    } catch (err) {
      setError(err.message);
    } finally {
      if (!silent) setLoading(false);
      realtimeLoadingRef.current = false;
      if (silent) restoreScrollPosition();
    }
  }, [captureScrollPosition, publicView, restoreScrollPosition]);

  async function checkSession() {
    if (publicView) {
      setSession({ loading: false, authenticated: true, username: "public", role: "", mustResetPassword: false });
      loadData();
      return;
    }
    const data = await api("/api/auth/session");
    setSession({
      loading: false,
      authenticated: data.authenticated,
      username: data.username || "",
      role: data.role || "",
      mustResetPassword: Boolean(data.mustResetPassword)
    });
    if (data.authenticated && !data.mustResetPassword) {
      if (auditLogView) {
        if (data.role === "super_admin") loadAuditLogs();
      } else {
        loadData();
      }
    }
  }

  useEffect(() => {
    checkSession().catch((err) => {
      setSession({ loading: false, authenticated: false, username: "", role: "", mustResetPassword: false });
      setError(err.message);
    });
  }, [loadData, publicView]);

  useEffect(() => {
    if (!session.authenticated) return undefined;
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
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "dashboard_events" }, scheduleRefresh)
      .subscribe();

    return () => {
      window.clearTimeout(realtimeTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [loadData, publicView, session.authenticated]);

  useEffect(() => {
    if (!members.length || memberLimit !== null) return;
    const stored = window.localStorage.getItem("encore_member_limit");
    const parsed = stored ? Number.parseInt(stored, 10) : NaN;
    const savedLimit = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_GUILD_MEMBER_LIMIT;
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
      const mergeMember = (member) => member?.id === updatedMember.id ? { ...member, ...updatedMember } : member;
      const patchAuction = (auction) => {
        if (!auction) return auction;
        return {
          ...auction,
          queue: auction.queue?.map((row) => ({ ...row, member: mergeMember(row.member) })) || [],
          units: auction.units?.map((unit) => ({ ...unit, member: mergeMember(unit.member) })) || []
        };
      };
      const activeAuctions = current.activeAuctions?.map(patchAuction) || [];

      return {
        ...current,
        progress: current.progress?.map((row) => ({ ...row, member: mergeMember(row.member) })) || [],
        activeAuctions,
        activeAuction: current.activeAuction ? patchAuction(current.activeAuction) : activeAuctions[0] || null
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
    setSession({ loading: false, authenticated: false, username: "", role: "", mustResetPassword: false });
    setMembers([]);
    setGroups([]);
    setAuctionItems([]);
    setAuctionState(null);
  }

  async function loadAuditLogs() {
    setAuditLogsLoading(true);
    try {
      const data = await api("/api/audit-logs");
      setAuditLogs(data.logs || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setAuditLogsLoading(false);
    }
  }

  async function saveMember(payload) {
    if (!memberModal?.id && members.length >= effectiveMemberLimit) {
      setError(`Roster is at the guild limit: ${members.length}/${effectiveMemberLimit}. Increase the limit before adding another member.`);
      return;
    }
    setSaving(true);
    try {
      const editing = Boolean(memberModal?.id);
      const data = await api(editing ? `/api/members/${memberModal.id}` : "/api/members", {
        method: editing ? "PATCH" : "POST",
        body: JSON.stringify(payload)
      });
      setMembers((current) => editing
        ? current.map((member) => member.id === data.member.id ? data.member : member)
        : [...current, data.member].sort((a, b) => a.char_name.localeCompare(b.char_name)));
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
        const data = await api(`/api/members/${member.id}/catch-up`, { method: "POST" });
        setAuctionState(data.auctionState || null);
        setToast(data.changes?.length ? "Member cycles caught up" : "Member was already caught up");
      }
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
          body: JSON.stringify({ action: "save" })
        });
        setToast(data.savepoint?.created_at ? "Auction savepoint saved" : "Savepoint saved");
      }
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
          body: JSON.stringify({ action: "restore" })
        });
        if (data.auctionState) setAuctionState(data.auctionState);
        setToast("Auction savepoint restored");
      }
    });
  }

  async function deleteMember(member) {
    setConfirmAction({
      title: "Delete member",
      body: `Delete ${member.char_name}? This removes them from the guild roster and any party slot.`,
      confirmLabel: "Delete member",
      tone: "danger",
      run: async () => {
        await api(`/api/members/${member.id}`, { method: "DELETE" });
        setMembers((current) => current.filter((item) => item.id !== member.id));
        setToast("Member deleted");
      }
    });
  }

  function getOpenPartySlots(groupId, excludedMemberIds = []) {
    const excluded = new Set(excludedMemberIds);
    const used = new Set(
      members
        .filter((item) => item.group_id === groupId && !excluded.has(item.id))
        .map((item) => item.party_slot)
        .filter((slot) => Number.isInteger(slot) && slot >= 1 && slot <= 5)
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
    const targetByMemberId = new Map(targets.map((target) => [target.member_id, target]));
    return memberList.map((member) => {
      const target = targetByMemberId.get(member.id);
      return target
        ? { ...member, group_id: target.group_id, party_slot: target.party_slot }
        : member;
    });
  }

  function targetsForGroupSlots(groupId, slots) {
    return slots
      .map((member, index) => member ? { member_id: member.id, group_id: groupId, party_slot: index + 1 } : null)
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
        groupsByLayoutId.set(target.group_id, { group_id: target.group_id, members: [] });
      }
      groupsByLayoutId.get(target.group_id).members.push({
        member_id: target.member_id,
        party_slot: target.party_slot
      });
    }

    setMembers(nextMembers);
    setSaving(true);
    try {
      const data = await api("/api/parties/layout", {
        method: "PATCH",
        body: JSON.stringify({
          groups: [...groupsByLayoutId.values()],
          unassignedMemberIds
        })
      });
      const updatedById = new Map((data.members || []).map((member) => [member.id, member]));
      setMembers((current) => current.map((member) => updatedById.get(member.id) || member));
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
      const targets = [{ member_id: memberId, group_id: null, party_slot: null }];
      if (source.group_id) {
        const sourceSlots = partySlotsFor(members, source.group_id).map((member) => member?.id === memberId ? null : member);
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
      [slots[sourceIndex], slots[targetIndex]] = [slots[targetIndex], slots[sourceIndex]];
      await savePartyTargets(targetsForGroupSlots(targetGroupId, slots), "Party layout saved");
      return;
    }

    const targetSlots = partySlotsFor(members, targetGroupId);
    const targetOccupant = targetSlots[slot - 1];
    if (targetOccupant?.id === memberId) return;

    const targetCount = members.filter((member) => member.group_id === targetGroupId && member.id !== memberId).length;
    if (!targetOccupant && targetCount >= 5) {
      setError("That group already has 5 members.");
      return;
    }

    const targets = [];
    if (source.group_id) {
      const sourceSlots = partySlotsFor(members, source.group_id);
      const sourceIndex = sourceSlots.findIndex((member) => member?.id === memberId);
      if (sourceIndex !== -1) sourceSlots[sourceIndex] = targetOccupant || null;
      targets.push(...targetsForGroupSlots(source.group_id, sourceSlots));
    } else if (targetOccupant) {
      targets.push({ member_id: targetOccupant.id, group_id: null, party_slot: null });
    }
    targetSlots[slot - 1] = source;
    targets.push(...targetsForGroupSlots(targetGroupId, targetSlots));
    if (targetOccupant) {
      const occupantTarget = targets.find((target) => target.member_id === targetOccupant.id);
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
      const groupCount = members.filter((item) => item.group_id === groupId && item.id !== memberId).length;
      if (groupCount >= 5) {
        setError("That group already has 5 members.");
        return;
      }
    }
    await moveMemberToSlot(memberId, groupId, openSlots[0] || null);
  }

  async function assignMembersToGroup(memberIds, groupId, preferredSlot = null) {
    const groupCount = members.filter((item) => item.group_id === groupId && !memberIds.includes(item.id)).length;
    const openSlots = 5 - groupCount;
    if (memberIds.length > openSlots) {
      setError(`That group only has ${openSlots} open slot${openSlots === 1 ? "" : "s"}.`);
      return;
    }

    const selectedMembers = memberIds
      .map((memberId) => members.find((item) => item.id === memberId))
      .filter(Boolean);
    const availableSlots = getOpenPartySlots(groupId, memberIds);
    const orderedSlots = preferredSlot && availableSlots.includes(preferredSlot)
      ? [preferredSlot, ...availableSlots.filter((slot) => slot !== preferredSlot)]
      : availableSlots;
    const slots = partySlotsFor(members, groupId);
    for (const [index, member] of selectedMembers.entries()) {
      const slot = orderedSlots[index];
      if (!slot) continue;
      slots[slot - 1] = member;
    }
    const targets = targetsForGroupSlots(groupId, slots);
    await savePartyTargets(targets, `${selectedMembers.length} member${selectedMembers.length === 1 ? "" : "s"} assigned`);
  }

  async function saveGroup(payload) {
    setSaving(true);
    try {
      const editing = Boolean(groupModal?.id);
      const data = await api(editing ? `/api/groups/${groupModal.id}` : "/api/groups", {
        method: editing ? "PATCH" : "POST",
        body: JSON.stringify(payload)
      });
      setGroups((current) => editing
        ? current.map((group) => group.id === data.group.id ? data.group : group)
        : [...current, data.group].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)));
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
        setMembers((current) => current.map((member) => member.group_id === group.id ? { ...member, group_id: null, party_slot: null } : member));
        setToast("Group deleted");
      }
    });
  }

  function requestUnassign(member, group) {
    setConfirmAction({
      title: "Remove from party",
      body: `Remove ${member.char_name} from ${group.name}? They will stay in the guild as unassigned.`,
      confirmLabel: "Remove member",
      tone: "default",
      run: async () => assignMember(member.id, null)
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
          body: JSON.stringify(payload)
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
        body: JSON.stringify({ caps })
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
        body: JSON.stringify({ caps })
      });
      setAuctionItems(data.auctionItems || []);
      setAuctionState((current) => current && !current.activeRound ? { ...current, itemCaps: caps } : current);
      setGlobalLimitsOpen(false);
      setToast("Global auction defaults updated");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function requestCantPay(member, auction) {
    if (!member) return;
    const auctionName = auction?.name || "this auction";
    setConfirmAction({
      title: "Mark can't pay",
      body: `Remove ${member.char_name} from ${auctionName} only? The remaining allocations will update automatically.`,
      confirmLabel: "Mark can't pay",
      tone: "default",
      run: async () => {
        const data = await api("/api/auctions/active/cant-pay", {
          method: "POST",
          body: JSON.stringify({ memberId: member.id, auctionId: auction?.id })
        });
        setAuctionState(data.auctionState);
        setToast("Auction allocations recalculated");
      }
    });
  }

  function requestLockAuction(auction) {
    if (!auction) return;
    setConfirmAction({
      title: "Lock-in Guild Auction list",
      body: `Freeze ${auction.name || "this Guild Auction"} so League Prize can start from the next incomplete member using these reserved bids?`,
      confirmLabel: "Lock list",
      tone: "default",
      run: async () => {
        const data = await api("/api/auctions/active/lock", {
          method: "POST",
          body: JSON.stringify({ auctionId: auction.id })
        });
        setAuctionState(data.auctionState);
        setToast("Guild Auction list locked");
      }
    });
  }

  async function requestDoneAuction(auction) {
    const activeAuction = auction || auctionState?.activeAuction;
    if (!activeAuction) return;
    setSaving(true);
    try {
      const data = await api("/api/auctions/active/finalize-preview", {
        method: "POST",
        body: JSON.stringify({ auctionId: activeAuction.id })
      });
      setFinalizePreview({ auctionIds: [activeAuction.id], preview: data.preview });
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
      const data = await api(isEventFinalize ? "/api/auctions/active/done-event" : "/api/auctions/active/done", {
        method: "POST",
        body: JSON.stringify(isEventFinalize ? { auctionIds } : { auctionId: auctionIds[0] })
      });
      setAuctionState(data.auctionState);
      setFinalizePreview(null);
      setToast(isEventFinalize ? "Event auctions finalized" : "Auction finalized");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function requestCancelAuction(auctions) {
    const auctionList = Array.isArray(auctions) ? auctions.filter(Boolean) : [auctions].filter(Boolean);
    if (!auctionList.length) return;
    const orderedAuctions = [
      ...auctionList.filter((auction) => auction.type !== "gl_woe"),
      ...auctionList.filter((auction) => auction.type === "gl_woe")
    ];
    const hasLeaguePrize = orderedAuctions.some((auction) => auction.type === "league_prize");
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
          body: JSON.stringify({ auctionIds: orderedAuctions.map((auction) => auction.id) })
        });
        setAuctionState(data.auctionState);
        setToast(hasLeaguePrize ? "Event auctions cancelled" : "Auction cancelled");
      }
    });
  }

  async function requestDoneEvent(auctions) {
    const eventAuctions = (auctions || []).filter(Boolean);
    if (!eventAuctions.length) return;
    const orderedAuctions = [
      ...eventAuctions.filter((auction) => auction.type === "gl_woe"),
      ...eventAuctions.filter((auction) => auction.type !== "gl_woe")
    ];

    setSaving(true);
    try {
      const auctionIds = orderedAuctions.map((auction) => auction.id);
      const data = await api("/api/auctions/active/finalize-preview", {
        method: "POST",
        body: JSON.stringify({ auctionIds })
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
      await navigator.clipboard.writeText(formatDiscordBidList(auction, bidRows));
      setToast("Auction list copied for Discord");
    } catch (err) {
      setError("Could not copy the auction list.");
    }
  }

  async function copyBidderNames(names, label = "bidder") {
    const copyNames = names || [];
    try {
      await navigator.clipboard.writeText(copyNames.join("\n"));
      setToast(`${copyNames.length} unique ${label}${copyNames.length === 1 ? "" : "s"} copied`);
    } catch (err) {
      setError(`Could not copy the ${label} list.`);
    }
  }

  if (session.loading) {
    return <main className="loading-page"><Loader2 className="spin" size={28} /></main>;
  }

  if (!publicView && !session.authenticated) {
    return <LoginScreen onLogin={checkSession} />;
  }

  if (!publicView && session.mustResetPassword) {
    return <ResetPasswordScreen username={session.username} onReset={checkSession} />;
  }

  return (
    <>
      <NoiseLayer />
      <Header
        username={session.username}
        role={session.role}
        onLogout={logout}
        auditLogView={auditLogView}
        publicView={publicView}
        publicGlAuction={publicGlAuction}
      />
      <main className="dashboard">
        {auditLogView ? (
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
                    <p>Recent dashboard changes, who made them, and what was updated.</p>
                  </div>
                  <button className="ghost-button" onClick={loadAuditLogs} disabled={auditLogsLoading}>
                    {auditLogsLoading ? <Loader2 className="spin" size={15} /> : <RefreshCw size={15} />}
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
                  <div className="loading-panel"><Loader2 className="spin" size={20} />Loading logs</div>
                ) : (
                  <AuditLogsTable logs={auditLogs} />
                )}
              </section>
            )}
          </>
        ) : (
          <>
        {!publicView && (
          <Stats
            members={members}
            memberLimit={effectiveMemberLimit}
            activeClass={classFilter}
            onClassFilter={setClassFilter}
            onEditLimit={() => setLimitModalOpen(true)}
            readOnly={false}
          />
        )}
        {error && (
          <div className="alert-panel">
            <AlertTriangle size={17} />
            <span>{error}</span>
            <button onClick={() => setError("")}>Dismiss</button>
          </div>
        )}
        {loading ? (
          <div className="loading-panel"><Loader2 className="spin" size={24} />Loading guild data</div>
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
                <AuctionFoundation
                  auctionItems={auctionItems}
                  auctionState={auctionState}
                  busy={saving}
                  onOpenStartAuction={setAuctionStartType}
                  onOpenLimits={() => setAuctionLimitsOpen(true)}
                  onOpenGlobalLimits={() => setGlobalLimitsOpen(true)}
                  onSaveSavepoint={requestSaveAuctionSavepoint}
                  onRestoreSavepoint={requestRestoreAuctionSavepoint}
                  canManageGlobalDefaults={["admin", "super_admin"].includes(session.role)}
                  onLockAuction={requestLockAuction}
                  onDoneAuction={requestDoneAuction}
                  onCancelAuction={requestCancelAuction}
                  onDoneEvent={requestDoneEvent}
                  onCopyAuctionList={copyAuctionList}
                  onCopyBidderNames={copyBidderNames}
                  readOnly={false}
                />
              </>
            )}
          </>
        )}
          </>
        )}
      </main>
      <FooterStrip memberCount={members.length} partyCount={groups.length} publicView={publicView} />

      {memberModal && (
        <Modal title={memberModal.id ? "Edit member" : "Add member"} onClose={() => setMemberModal(null)}>
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
        <Modal title={groupModal.id ? "Rename group" : "Create group"} onClose={() => setGroupModal(null)}>
          <GroupForm
            initial={groupModal.id ? groupModal : null}
            onCancel={() => setGroupModal(null)}
            onSave={saveGroup}
            busy={saving}
          />
        </Modal>
      )}

      {limitModalOpen && (
        <Modal title="Roster limit" onClose={() => setLimitModalOpen(false)}>
          <RosterLimitForm
            current={effectiveMemberLimit}
            minimum={members.length}
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
          currentCount={members.filter((member) => member.group_id === partyPickerGroup.group.id).length}
          busy={saving}
          onCancel={() => setPartyPickerGroup(null)}
          onPickMany={async (memberIds) => {
            await assignMembersToGroup(memberIds, partyPickerGroup.group.id, partyPickerGroup.slot);
            setPartyPickerGroup(null);
          }}
        />
      )}

      {auctionStartType && (
        <Modal title={`New ${auctionTypeLabel(auctionStartType)} Auction`} onClose={() => setAuctionStartType(null)}>
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
        <Modal title="Adjust auction limits" onClose={() => setAuctionLimitsOpen(false)}>
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
        <Modal title="Global auction defaults" onClose={() => setGlobalLimitsOpen(false)}>
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
          <button onClick={() => setToast("")}><X size={14} /></button>
        </div>
      )}
    </>
  );
}

function FooterStrip({ memberCount, partyCount, publicView = false }) {
  return (
    <footer className="footer-strip">
      <span>encore · {publicView ? "public dashboard" : "admin console"} · v0.1.0</span>
      <span>{memberCount} members · {partyCount} groups · auctions pending</span>
    </footer>
  );
}
