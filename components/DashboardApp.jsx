"use client";

import { useEffect, useMemo, useState } from "react";
import {
  LogOut,
  Plus,
  Search,
  Shield,
  Pencil,
  Trash2,
  UserMinus,
  Swords,
  Eye,
  Settings,
  Shuffle,
  Gavel,
  Trophy,
  ChevronDown,
  Clock3,
  X,
  Check,
  Loader2,
  AlertTriangle,
  Ban
} from "lucide-react";
import { classByName, classes, classOrder, colorGroups } from "@/components/data";

const emptyMember = {
  char_name: "",
  char_class: "Lord Knight",
  group_id: "",
  joined_at: "",
  notes: ""
};

async function api(path, options = {}) {
  const response = await fetch(path, {
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
  if (!cls) return <span className="class-icon-placeholder" style={{ width: size, height: size }} />;
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
      <section className={size === "sm" ? "modal-card modal-sm" : "modal-card"}>
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

function MemberForm({ groups, initial, onCancel, onSave, busy }) {
  const [form, setForm] = useState(() => ({
    ...emptyMember,
    ...initial,
    group_id: initial?.group_id || "",
    joined_at: initial?.joined_at || "",
    notes: initial?.notes || ""
  }));

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function submit(event) {
    event.preventDefault();
    onSave({ ...form, group_id: form.group_id || null });
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
      <label>
        <span>Joined date</span>
        <input type="date" value={form.joined_at || ""} onChange={(event) => update("joined_at", event.target.value)} />
      </label>
      <label className="wide">
        <span>Notes</span>
        <textarea rows={3} value={form.notes || ""} onChange={(event) => update("notes", event.target.value)} />
      </label>
      <div className="form-actions wide">
        <button type="button" className="ghost-button" onClick={onCancel}>Cancel</button>
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

function Header({ username, onLogout }) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="brand-row">
          <div className="brand-mark small"><Shield size={20} /></div>
          <div>
            <p className="eyebrow">guild · admin console</p>
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
            <span>signed in as</span>
            <strong>{username || "admin"} · admin</strong>
          </div>
          <button className="ghost-button" onClick={onLogout}><LogOut size={15} />Log out</button>
        </div>
      </div>
    </header>
  );
}

function Stats({ members, memberLimit, activeClass, onClassFilter, onEditLimit }) {
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
      <button className="stat-card roster-stat" onClick={onEditLimit} title="Edit guild member limit">
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
              <span>{item.short}</span>
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

function MembersSection({ members, groupsById, classFilter, onClassFilter, onAdd, onEdit, onDelete, canAddMember, memberLimit }) {
  const [query, setQuery] = useState("");

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

  const columns = useMemo(() => {
    const byClass = {};
    for (const member of filteredMembers) {
      const key = member.char_class === "Dancer" ? "Bard / Dancer" : member.char_class;
      if (member.char_class === "Bard") {
        byClass["Bard / Dancer"] ||= [];
        byClass["Bard / Dancer"].push(member);
      } else if (member.char_class === "Dancer") {
        byClass["Bard / Dancer"] ||= [];
        byClass["Bard / Dancer"].push(member);
      } else {
        byClass[key] ||= [];
        byClass[key].push(member);
      }
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
  }, [filteredMembers]);

  return (
    <section className="content-section">
      <div className="section-title-row">
        <div>
          <p className="eyebrow">member list</p>
          <h2>Roster</h2>
        </div>
        <button className="primary-button" onClick={onAdd} disabled={!canAddMember} title={canAddMember ? "Add member" : `Roster is at ${members.length}/${memberLimit}`}>
          <Plus size={16} />Add member
        </button>
      </div>
      <div className="toolbar">
        <label className="search-box">
          <Search size={15} />
          <input placeholder="Search name, class, or party" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <select value={classFilter} onChange={(event) => onClassFilter(event.target.value)}>
          <option value="">All classes</option>
          {classes.map((cls) => <option key={cls.name} value={cls.name}>{cls.name}</option>)}
        </select>
      </div>
      {columns.length ? (
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
                  <div className="member-row" key={member.id}>
                    <ClassIcon name={member.char_class} size={32} />
                    <div className="member-main">
                      <strong>{member.char_name}</strong>
                      <span>{member.char_class}</span>
                      <em>Party: {groupsById[member.group_id]?.name || "Unassigned"}</em>
                    </div>
                    <div className="row-actions">
                      <button className="icon-button" onClick={() => onEdit(member)} aria-label={`Edit ${member.char_name}`}><Pencil size={15} /></button>
                      <button className="icon-button danger" onClick={() => onDelete(member)} aria-label={`Delete ${member.char_name}`}><Trash2 size={15} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-panel">No members match the current filters.</div>
      )}
    </section>
  );
}

function PartiesSection({ members, groups, onCreateGroup, onRenameGroup, onDeleteGroup, onPickEmptySlot, onRequestUnassign, onEditMember }) {
  const membersByGroup = useMemo(() => {
    const map = {};
    for (const group of groups) map[group.id] = [];
    for (const member of members) {
      if (member.group_id && map[member.group_id]) map[member.group_id].push(member);
    }
    return map;
  }, [groups, members]);
  const unassigned = members.filter((member) => !member.group_id);

  return (
    <section className="content-section">
      <div className="section-title-row">
        <div>
          <p className="eyebrow">party management</p>
          <h2>Groups</h2>
        </div>
        <button className="ghost-button" onClick={onCreateGroup}><Plus size={16} />Create group</button>
      </div>

      <div className="party-grid">
        {groups.map((group) => {
          const roster = membersByGroup[group.id] || [];
          return (
            <article className="party-card" key={group.id}>
              <header>
                <div>
                  <h3>{group.name}</h3>
                  <span>{roster.length}/5 members</span>
                </div>
                <div className="row-actions always">
                  <button className="icon-button" onClick={() => onRenameGroup(group)} aria-label={`Rename ${group.name}`}><Pencil size={15} /></button>
                  <button className="icon-button danger" onClick={() => onDeleteGroup(group)} aria-label={`Delete ${group.name}`}><Trash2 size={15} /></button>
                </div>
              </header>

              <div className="party-slots">
                {[0, 1, 2, 3, 4].map((slot) => {
                  const member = roster[slot];
                  return member ? (
                    <div className="party-slot filled" key={member.id}>
                      <ClassIcon name={member.char_class} size={30} />
                      <button className="slot-name" onClick={() => onEditMember(member)}>{member.char_name}</button>
                      <button className="icon-button danger" onClick={() => onRequestUnassign(member, group)} aria-label={`Remove ${member.char_name}`}>
                        <UserMinus size={14} />
                      </button>
                    </div>
                  ) : (
                    <button
                      className="party-slot empty"
                      key={slot}
                      onClick={() => onPickEmptySlot(group)}
                      disabled={!unassigned.length}
                      title={unassigned.length ? `Add member to ${group.name}` : "No unassigned members"}
                    >
                      {unassigned.length ? "Empty slot" : "No unassigned"}
                    </button>
                  );
                })}
              </div>
            </article>
          );
        })}
        <button className="new-party-card" onClick={onCreateGroup}>
          <Plus size={20} />
          <span>New group</span>
          <em>5 open slots</em>
        </button>
      </div>
    </section>
  );
}

function PartyMemberPicker({ group, members, currentCount, onCancel, onPickMany, busy }) {
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
    <Modal title={`Add to ${group.name}`} onClose={onCancel} size="sm">
      <div className="picker-meta">
        <strong>{currentCount}/5 members</strong>
        <span>{openSlots} open slot{openSlots === 1 ? "" : "s"} · select up to {openSlots}</span>
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
  return type === "league_prize" ? "League Prize" : "GL/WoE";
}

function itemAppliesTo(item, type) {
  return Array.isArray(item.applies_to_auction_types) && item.applies_to_auction_types.includes(type);
}

function compactSlots(units) {
  const byPage = new Map();
  for (const unit of units) {
    if (!byPage.has(unit.page)) byPage.set(unit.page, []);
    byPage.get(unit.page).push(unit.slot);
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
        ranges.push(start === previous ? `S${start}` : `S${start}-${previous}`);
        start = slot;
        previous = slot;
      }

      return `P${page} ${ranges.join(",")}`;
    })
    .join(" · ");
}

function groupedAuctionBids(units = []) {
  const map = new Map();

  for (const unit of units) {
    const key = `${unit.member_id}:${unit.item_id}:${unit.cycle_reset_item_key || "current"}`;
    if (!map.has(key)) {
      map.set(key, {
        member: unit.member,
        member_id: unit.member_id,
        item_id: unit.item_id,
        item: unit.short_name || unit.item_name,
        quantity: 0,
        units: [],
        cycle_reset: Boolean(unit.cycle_reset)
      });
    }
    const row = map.get(key);
    row.quantity += 1;
    row.units.push(unit);
    row.cycle_reset = row.cycle_reset || Boolean(unit.cycle_reset);
  }

  return [...map.values()]
    .map((row) => ({
      ...row,
      positions: compactSlots(row.units),
      firstPage: Math.min(...row.units.map((unit) => unit.page)),
      firstSlot: Math.min(...row.units.map((unit) => unit.slot))
    }))
    .sort((a, b) => a.firstPage - b.firstPage || a.firstSlot - b.firstSlot);
}

function AuctionStartForm({ type, auctionItems, onCancel, onStart, busy }) {
  const applicable = auctionItems.filter((item) => itemAppliesTo(item, type));
  const [name, setName] = useState(type === "league_prize" ? "League Prize" : "GL/WoE Auction");
  const [inventory, setInventory] = useState(() => Object.fromEntries(applicable.map((item) => [item.item_key, "0"])));

  function submit(event) {
    event.preventDefault();
    onStart({
      type,
      name,
      inventory: Object.fromEntries(applicable.map((item) => [item.item_key, Number.parseInt(inventory[item.item_key] || "0", 10) || 0]))
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
      <p className="field-note">Empty inventory is allowed. The auction can still be closed with zero allocations.</p>
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
      <p className="field-note">These shared caps apply to every member in the auction lineup. Illusion Fragments are free-for-all and do not affect limits.</p>
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

function MemberProgressTable({ auctionItems, auctionState }) {
  const limitedItems = auctionItems.filter((item) => item.gates_round_completion);
  const rows = auctionState?.progress || [];

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
      <div className="progress-table-wrap">
        <table className="progress-table">
          <thead>
            <tr>
              <th>Line</th>
              <th>Member</th>
              {limitedItems.map((item) => <th key={item.id}>{item.short_name}</th>)}
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.member.id}>
                <td>{row.position}</td>
                <td>
                  <strong>{row.member.char_name}</strong>
                  <span>{row.member.char_class}</span>
                </td>
                {limitedItems.map((item) => (
                  <td key={item.id}>{row.received[item.item_key] || 0}/{row.caps[item.item_key] ?? item.default_per_round_cap}</td>
                ))}
                <td><em>{row.is_complete ? "cycle capped" : "open"}</em></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RotationList({ auctionState }) {
  const progress = auctionState?.progress || [];
  return (
    <div className="rotation-list">
      {progress.length ? progress.map((row) => (
        <div className={row.is_complete ? "rotation-row complete" : "rotation-row"} key={row.member.id}>
          <span>{row.position}</span>
          <ClassIcon name={row.member.char_class} size={28} glow={false} />
          <strong>{row.member.char_name}</strong>
          <em>{row.is_complete ? "cycle capped" : "open"}</em>
        </div>
      )) : (
        <div className="empty-panel compact">Create an auction lineup to generate the randomized source list.</div>
      )}
    </div>
  );
}

function AuctionFoundation({
  auctionItems,
  memberCount,
  auctionState,
  onStartRound,
  onOpenStartAuction,
  onOpenLimits,
  onOpenRotation,
  onResetLineup,
  onRecalculateAuction,
  onCantPay,
  onDoneAuction,
  busy
}) {
  const activeRound = auctionState?.activeRound;
  const activeAuction = auctionState?.activeAuction;
  const history = auctionState?.history || [];
  const completedCount = activeRound?.completedCount || 0;
  const roundMemberCount = activeRound?.memberCount || memberCount;
  const progressPct = roundMemberCount ? Math.min(100, Math.round((completedCount / roundMemberCount) * 100)) : 0;
  const currentCaps = auctionState?.itemCaps || {};
  const units = activeAuction?.units || [];
  const bidRows = groupedAuctionBids(units);

  return (
    <section className="content-section auction-section">
      <div className="section-title-row">
        <div>
          <p className="eyebrow">reward rotation</p>
          <h2>Auctions</h2>
        </div>
        <span className="status-pill"><Swords size={14} />{activeRound ? "Lineup active" : "No lineup"}</span>
      </div>

      <div className="round-card">
        <div className="round-main">
          <div>
            <h3>{activeRound ? `Auction Lineup ${activeRound.round_number}` : "No auction lineup"}</h3>
            <p>{activeRound ? "randomized source list stays active over time" : "create a lineup to randomize all current members once"}</p>
          </div>
          <div className="round-progress-meta">
            <strong>{completedCount} / {roundMemberCount}</strong>
            <span>cycle capped</span>
          </div>
        </div>
        <div className="round-progress-track">
          <span style={{ width: `${progressPct}%` }} />
        </div>
        <div className="round-actions">
          <button className="ghost-button" type="button" onClick={onOpenRotation} disabled={!activeRound}><Eye size={15} />Lineup list</button>
          <button className="ghost-button" type="button" onClick={onOpenLimits} disabled={!activeRound || Boolean(activeAuction)}><Settings size={15} />Adjust limits</button>
          <button className="danger-button soft" type="button" onClick={onResetLineup} disabled={!activeRound || busy}><Shuffle size={15} />Test reset</button>
          <button className="ghost-button" type="button" onClick={onStartRound} disabled={Boolean(activeRound) || busy}><Shuffle size={15} />Create auction lineup</button>
        </div>
      </div>

      <div className="auction-grid">
        {activeAuction ? (
          <article className="active-auction-card">
            <div className="active-dot-row">
              <span className="live-dot" />
              <strong>{activeAuction.name || auctionTypeLabel(activeAuction.type)}</strong>
              <em>{auctionTypeLabel(activeAuction.type)}</em>
            </div>
            <p>Review the generated page table, mark any member who cannot pay, then finalize the auction.</p>
            <div className="active-auction-stats">
              <span><Clock3 size={14} />Active</span>
              <span><Gavel size={14} />{activeAuction.pageCount || 0} pages</span>
              <span><Trophy size={14} />{units.length} allocations</span>
            </div>
            <div className="allocation-table-wrap">
              {bidRows.length ? (
                <table className="allocation-table">
                  <thead>
                    <tr>
                      <th>Member</th>
                      <th>Item</th>
                      <th>Bid slots</th>
                      <th>Qty</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {bidRows.map((row) => (
                      <tr key={`${row.member_id}-${row.item_id}-${row.positions}`}>
                        <td>
                          <strong>{row.member?.char_name || "Unknown"}</strong>
                          {row.cycle_reset && <span>cycle reset</span>}
                        </td>
                        <td>{row.item}</td>
                        <td><code>{row.positions}</code></td>
                        <td>{row.quantity}</td>
                        <td>
                          <button className="ghost-button mini" type="button" onClick={() => onCantPay(row.member)} disabled={busy}>
                            <Ban size={13} />Can't pay
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="empty-panel compact">No allocations for this auction.</div>
              )}
            </div>
            <div className="active-actions">
              <button className="ghost-button" type="button" onClick={onRecalculateAuction} disabled={busy}>
                {busy ? <Loader2 className="spin" size={15} /> : <Shuffle size={15} />}
                Recalculate
              </button>
              <button className="primary-button" type="button" onClick={onDoneAuction} disabled={busy}>
                {busy ? <Loader2 className="spin" size={15} /> : <Check size={15} />}
                Done
              </button>
            </div>
          </article>
        ) : (
          <article className="active-auction-card empty-active">
            <div className="active-dot-row">
              <span className="idle-dot" />
              <strong>No active auction</strong>
              <em>{activeRound ? "ready" : "waiting"}</em>
            </div>
            <p>{activeRound ? "Start GL/WoE or optional League Prize when you are ready to distribute items." : "Create the auction lineup first so the app can lock the randomized source list."}</p>
            <div className="active-auction-stats">
              <span><Clock3 size={14} />Waiting</span>
              <span><Gavel size={14} />0 pages</span>
              <span><Trophy size={14} />{auctionItems.length} tracked items</span>
            </div>
          </article>
        )}

        <article className="auction-history-card">
          <header>
            <div>
              <p className="eyebrow">{activeRound ? `lineup ${activeRound.round_number} history` : "history"}</p>
              <h3>{history.length ? `${history.length} completed auction${history.length === 1 ? "" : "s"}` : "No completed auctions"}</h3>
            </div>
            <ChevronDown size={16} />
          </header>
          {history.length ? (
            <div className="history-list">
              {history.slice(0, 5).map((auction) => (
                <div className="history-row" key={auction.id}>
                  <strong>{auction.name || auctionTypeLabel(auction.type)}</strong>
                  <span>{auctionTypeLabel(auction.type)} · {auction.allocatedCount} items · {auction.pageCount} pages</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="history-empty">
              Completed GL/WoE and League Prize runs will appear here with item totals, pages, and completed-member counts.
            </div>
          )}
        </article>
      </div>

      <div className="auction-start-row">
        <button className="primary-button" type="button" disabled={!activeRound || Boolean(activeAuction)} onClick={() => onOpenStartAuction("gl_woe")}><Plus size={16} />New GL/WoE Auction</button>
        <button className="ghost-button" type="button" disabled={!activeRound || Boolean(activeAuction)} onClick={() => onOpenStartAuction("league_prize")}><Plus size={16} />New League Prize Auction</button>
      </div>

      <div className="auction-items">
        {auctionItems.map((item) => (
          <div className="auction-item" key={item.id}>
            <strong>{item.short_name}</strong>
            <span>{currentCaps[item.item_key] ?? item.default_per_round_cap}/round</span>
            <em>{item.gates_round_completion ? "gating" : "bonus"}</em>
          </div>
        ))}
      </div>
      <MemberProgressTable auctionItems={auctionItems} auctionState={auctionState} />
    </section>
  );
}

export default function DashboardApp() {
  const [session, setSession] = useState({ loading: true, authenticated: false, username: "" });
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
  const [rotationOpen, setRotationOpen] = useState(false);
  const [partyPickerGroup, setPartyPickerGroup] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  const [saving, setSaving] = useState(false);
  const [classFilter, setClassFilter] = useState("");
  const [memberLimit, setMemberLimit] = useState(null);

  const groupsById = useMemo(() => Object.fromEntries(groups.map((group) => [group.id, group])), [groups]);
  const effectiveMemberLimit = Math.max(memberLimit || members.length || 0, members.length);
  const unassignedMembers = members.filter((member) => !member.group_id);

  async function checkSession() {
    const data = await api("/api/auth/session");
    setSession({ loading: false, authenticated: data.authenticated, username: data.username || "" });
    if (data.authenticated) loadData();
  }

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const data = await api("/api/bootstrap");
      setMembers(data.members || []);
      setGroups(data.groups || []);
      setAuctionItems(data.auctionItems || []);
      setAuctionState(data.auctionState || null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    checkSession().catch((err) => {
      setSession({ loading: false, authenticated: false, username: "" });
      setError(err.message);
    });
  }, []);

  useEffect(() => {
    if (!members.length || memberLimit !== null) return;
    const stored = window.localStorage.getItem("encore_member_limit");
    const parsed = stored ? Number.parseInt(stored, 10) : NaN;
    setMemberLimit(Number.isFinite(parsed) ? Math.max(parsed, members.length) : members.length);
  }, [memberLimit, members.length]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    setSession({ loading: false, authenticated: false, username: "" });
    setMembers([]);
    setGroups([]);
    setAuctionItems([]);
    setAuctionState(null);
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
      setMemberModal(null);
      setToast(editing ? "Member updated" : "Member added");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
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

  async function assignMember(memberId, groupId) {
    const member = members.find((item) => item.id === memberId);
    if (!member) return;
    if (groupId) {
      const groupCount = members.filter((item) => item.group_id === groupId && item.id !== memberId).length;
      if (groupCount >= 5) {
        setError("That group already has 5 members.");
        return;
      }
    }
    setSaving(true);
    try {
      const data = await api(`/api/members/${memberId}`, {
        method: "PATCH",
        body: JSON.stringify({ ...member, group_id: groupId || null })
      });
      setMembers((current) => current.map((item) => item.id === data.member.id ? data.member : item));
      setToast(groupId ? "Member assigned" : "Member removed from group");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function assignMembersToGroup(memberIds, groupId) {
    const groupCount = members.filter((item) => item.group_id === groupId && !memberIds.includes(item.id)).length;
    const openSlots = 5 - groupCount;
    if (memberIds.length > openSlots) {
      setError(`That group only has ${openSlots} open slot${openSlots === 1 ? "" : "s"}.`);
      return;
    }

    setSaving(true);
    try {
      const updates = await Promise.all(memberIds.map(async (memberId) => {
        const member = members.find((item) => item.id === memberId);
        if (!member) return null;
        const data = await api(`/api/members/${memberId}`, {
          method: "PATCH",
          body: JSON.stringify({ ...member, group_id: groupId })
        });
        return data.member;
      }));
      const updatedMembers = updates.filter(Boolean);
      setMembers((current) => current.map((item) => updatedMembers.find((member) => member.id === item.id) || item));
      setToast(`${updatedMembers.length} member${updatedMembers.length === 1 ? "" : "s"} assigned`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
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
        setMembers((current) => current.map((member) => member.group_id === group.id ? { ...member, group_id: null } : member));
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
      await confirmAction.run();
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

  function requestStartRound() {
    setConfirmAction({
      title: "Create auction lineup",
      body: `Create the reusable auction lineup with all ${members.length} current members in a randomized order? New members will be added to the end later.`,
      confirmLabel: "Create lineup",
      tone: "default",
      run: async () => {
        const data = await api("/api/auctions/rounds", { method: "POST" });
        setAuctionState(data.auctionState);
        setToast("Auction lineup created");
      }
    });
  }

  async function startAuction(payload) {
    setSaving(true);
    try {
      const data = await api("/api/auctions/start", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      setAuctionState(data.auctionState);
      setAuctionStartType(null);
      setToast(`${auctionTypeLabel(payload.type)} auction started`);
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

  function requestCantPay(member) {
    if (!member) return;
    setConfirmAction({
      title: "Mark can't pay",
      body: `Remove ${member.char_name} from this auction only and recalculate the remaining allocations?`,
      confirmLabel: "Recalculate",
      tone: "default",
      run: async () => {
        const data = await api("/api/auctions/active/cant-pay", {
          method: "POST",
          body: JSON.stringify({ memberId: member.id })
        });
        setAuctionState(data.auctionState);
        setToast("Auction allocations recalculated");
      }
    });
  }

  function requestDoneAuction() {
    const activeAuction = auctionState?.activeAuction;
    setConfirmAction({
      title: "Finish auction",
      body: `Finalize ${activeAuction?.name || "this auction"}? This will update member progress and cannot be undone.`,
      confirmLabel: "Finalize auction",
      tone: "default",
      run: async () => {
        const data = await api("/api/auctions/active/done", { method: "POST" });
        setAuctionState(data.auctionState);
        setToast("Auction finalized");
      }
    });
  }

  function requestResetLineup() {
    setConfirmAction({
      title: "Reset test lineup",
      body: "Reset shared limit progress to zero, rerandomize the current roster, and clear auction test history for this lineup? This is only for testing.",
      confirmLabel: "Reset test data",
      tone: "danger",
      run: async () => {
        const data = await api("/api/auctions/lineup/reset", { method: "POST" });
        setAuctionState(data.auctionState);
        setToast("Auction lineup reset for testing");
      }
    });
  }

  async function recalculateAuction() {
    setSaving(true);
    try {
      const data = await api("/api/auctions/active/recalculate", { method: "POST" });
      setAuctionState(data.auctionState);
      setToast("Auction allocations recalculated");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (session.loading) {
    return <main className="loading-page"><Loader2 className="spin" size={28} /></main>;
  }

  if (!session.authenticated) {
    return <LoginScreen onLogin={checkSession} />;
  }

  return (
    <>
      <NoiseLayer />
      <Header username={session.username} onLogout={logout} />
      <main className="dashboard">
        <Stats
          members={members}
          memberLimit={effectiveMemberLimit}
          activeClass={classFilter}
          onClassFilter={setClassFilter}
          onEditLimit={() => setLimitModalOpen(true)}
        />
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
            />
            <AuctionFoundation
              auctionItems={auctionItems}
              memberCount={members.length}
              auctionState={auctionState}
              busy={saving}
              onStartRound={requestStartRound}
              onOpenStartAuction={setAuctionStartType}
              onOpenLimits={() => setAuctionLimitsOpen(true)}
              onOpenRotation={() => setRotationOpen(true)}
              onResetLineup={requestResetLineup}
              onRecalculateAuction={recalculateAuction}
              onCantPay={requestCantPay}
              onDoneAuction={requestDoneAuction}
            />
          </>
        )}
      </main>
      <FooterStrip memberCount={members.length} partyCount={groups.length} />

      {memberModal && (
        <Modal title={memberModal.id ? "Edit member" : "Add member"} onClose={() => setMemberModal(null)}>
          <MemberForm
            groups={groups}
            initial={memberModal.id ? memberModal : emptyMember}
            onCancel={() => setMemberModal(null)}
            onSave={saveMember}
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
          group={partyPickerGroup}
          members={unassignedMembers}
          currentCount={members.filter((member) => member.group_id === partyPickerGroup.id).length}
          busy={saving}
          onCancel={() => setPartyPickerGroup(null)}
          onPickMany={async (memberIds) => {
            await assignMembersToGroup(memberIds, partyPickerGroup.id);
            setPartyPickerGroup(null);
          }}
        />
      )}

      {auctionStartType && (
        <Modal title={`New ${auctionTypeLabel(auctionStartType)} Auction`} onClose={() => setAuctionStartType(null)}>
          <AuctionStartForm
            type={auctionStartType}
            auctionItems={auctionItems}
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

      {rotationOpen && (
        <Modal title="Rotation list" onClose={() => setRotationOpen(false)}>
          <RotationList auctionState={auctionState} />
        </Modal>
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
        <div className="toast">
          <Check size={15} />
          <span>{toast}</span>
          <button onClick={() => setToast("")}><X size={14} /></button>
        </div>
      )}
    </>
  );
}

function FooterStrip({ memberCount, partyCount }) {
  return (
    <footer className="footer-strip">
      <span>encore · admin console · v0.1.0</span>
      <span>{memberCount} members · {partyCount} groups · auctions pending</span>
    </footer>
  );
}
