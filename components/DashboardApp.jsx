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
  Clock3,
  X,
  Check,
  Loader2,
  AlertTriangle,
  Ban,
  Copy,
  LayoutGrid,
  List
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

function Header({ username, onLogout, publicView = false }) {
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
            <strong>{publicView ? "public" : `${username || "admin"} · admin`}</strong>
          </div>
          {!publicView && <button className="ghost-button" onClick={onLogout}><LogOut size={15} />Log out</button>}
        </div>
      </div>
    </header>
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
  const [viewMode, setViewMode] = useState("list");

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

  return (
    <section className="content-section">
      <div className="section-title-row">
        <div>
          <p className="eyebrow">member list</p>
          <h2>Roster</h2>
        </div>
        {!readOnly && (
          <button className="primary-button" onClick={onAdd} disabled={!canAddMember} title={canAddMember ? "Add member" : `Roster is at ${members.length}/${memberLimit}`}>
            <Plus size={16} />Add member
          </button>
        )}
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
        <div className="roster-table-wrap">
          <table className="roster-table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Class</th>
                <th>Party</th>
                {!readOnly && <th />}
              </tr>
            </thead>
            <tbody>
              {orderedMembers.map((member) => (
                <tr key={member.id}>
                  <td>
                    <div className="roster-member">
                      <ClassIcon name={member.char_class} size={30} />
                      <strong>{member.char_name}</strong>
                    </div>
                  </td>
                  <td>{member.char_class}</td>
                  <td>{groupsById[member.group_id]?.name || "Unassigned"}</td>
                  {!readOnly && (
                    <td className="roster-actions-cell">
                      <div className="row-actions always">
                        <button className="icon-button" onClick={() => onEdit(member)} aria-label={`Edit ${member.char_name}`}><Pencil size={15} /></button>
                        <button className="icon-button danger" onClick={() => onDelete(member)} aria-label={`Delete ${member.char_name}`}><Trash2 size={15} /></button>
                      </div>
                    </td>
                  )}
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
                  <div className="member-row" key={member.id}>
                    <ClassIcon name={member.char_class} size={32} />
                    <div className="member-main">
                      <strong>{member.char_name}</strong>
                      <span>{member.char_class}</span>
                      <em>Party: {groupsById[member.group_id]?.name || "Unassigned"}</em>
                    </div>
                    {!readOnly && (
                      <div className="row-actions">
                        <button className="icon-button" onClick={() => onEdit(member)} aria-label={`Edit ${member.char_name}`}><Pencil size={15} /></button>
                        <button className="icon-button danger" onClick={() => onDelete(member)} aria-label={`Delete ${member.char_name}`}><Trash2 size={15} /></button>
                      </div>
                    )}
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

function PartiesSection({ members, groups, onCreateGroup, onRenameGroup, onDeleteGroup, onPickEmptySlot, onRequestUnassign, onEditMember, readOnly = false }) {
  const membersByGroup = useMemo(() => {
    const map = {};
    for (const group of groups) map[group.id] = [];
    for (const member of members) {
      if (member.group_id && map[member.group_id]) map[member.group_id].push(member);
    }
    return map;
  }, [groups, members]);
  const unassigned = members.filter((member) => !member.group_id);
  const visibleGroups = useMemo(() => {
    if (!readOnly) return groups;
    return groups.filter((group) => (membersByGroup[group.id] || []).length > 0);
  }, [groups, membersByGroup, readOnly]);

  return (
    <section className="content-section">
      <div className="section-title-row">
        <div>
          <p className="eyebrow">party management</p>
          <h2>Groups</h2>
        </div>
        {!readOnly && <button className="ghost-button" onClick={onCreateGroup}><Plus size={16} />Create group</button>}
      </div>

      <div className="party-grid">
        {visibleGroups.map((group) => {
          const roster = membersByGroup[group.id] || [];
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
                  const member = roster[slot];
                  return member ? (
                    <div className="party-slot filled" key={member.id}>
                      <ClassIcon name={member.char_class} size={30} />
                      <button className="slot-name" onClick={() => !readOnly && onEditMember(member)} disabled={readOnly}>{member.char_name}</button>
                      {!readOnly && (
                        <button className="icon-button danger" onClick={() => onRequestUnassign(member, group)} aria-label={`Remove ${member.char_name}`}>
                          <UserMinus size={14} />
                        </button>
                      )}
                    </div>
                  ) : (
                    <button
                      className="party-slot empty"
                      key={slot}
                      onClick={() => !readOnly && onPickEmptySlot(group)}
                      disabled={readOnly || !unassigned.length}
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
        {!readOnly && (
          <button className="new-party-card" onClick={onCreateGroup}>
            <Plus size={20} />
            <span>New group</span>
            <em>5 open slots</em>
          </button>
        )}
      </div>
      {!visibleGroups.length && <div className="empty-panel">No party groups assigned yet.</div>}
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
  if (!units.length) return "";
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

function groupedAuctionBids(units = [], queue = []) {
  const memberMap = new Map();
  const queueByMemberId = new Map(queue.map((row) => [row.member_id, row]));

  for (const unit of units) {
    const queueRow = queueByMemberId.get(unit.member_id);
    if (!memberMap.has(unit.member_id)) {
      memberMap.set(unit.member_id, {
        member: unit.member,
        member_id: unit.member_id,
        queuePosition: queueRow?.position || Number.MAX_SAFE_INTEGER,
        items: new Map(),
        quantity: 0,
        firstPage: unit.page,
        firstSlot: unit.slot,
        cycle_reset: false
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
    if (unit.page < memberRow.firstPage || (unit.page === memberRow.firstPage && unit.slot < memberRow.firstSlot)) {
      memberRow.firstPage = unit.page;
      memberRow.firstSlot = unit.slot;
    }
  }

  return [...memberMap.values()]
    .map((row) => ({
      ...row,
      items: [...row.items.values()]
        .map((item) => ({
          ...item,
          positions: compactSlots(item.units),
          firstPage: Math.min(...item.units.map((unit) => unit.page)),
          firstSlot: Math.min(...item.units.map((unit) => unit.slot))
        }))
        .sort((a, b) => a.firstPage - b.firstPage || a.firstSlot - b.firstSlot)
    }))
    .sort((a, b) => a.queuePosition - b.queuePosition || a.firstPage - b.firstPage || a.firstSlot - b.firstSlot);
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
      <p className="field-note">{type === "gl_woe" ? "Lock this GL/WoE list if you want to run optional League Prize after reviewing can't-pay members." : "League Prize is optional. Add only the items available from the event."}</p>
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

function progressCellState(received, cap) {
  if (cap <= 0) return "capped";
  if (received > cap) return "over";
  if (received >= cap) return "capped";
  if (received > 0) return "warning";
  return "empty";
}

function progressRowStatus(row, limitedItems) {
  const receivedTotal = limitedItems.reduce((sum, item) => sum + (row.received[item.item_key] || 0), 0);
  if (row.is_complete) return { label: "cycle capped", state: "capped" };
  if (receivedTotal === 0) return { label: "in queue", state: "empty" };
  return { label: "incomplete", state: "warning" };
}

function MemberProgressTable({ auctionItems, auctionState }) {
  const limitedItems = auctionItems.filter((item) => item.gates_round_completion);
  const rows = auctionState?.progress || [];
  const itemSummaries = limitedItems.map((item) => {
    let capped = 0;
    let partial = 0;
    let empty = 0;
    let total = 0;

    for (const row of rows) {
      const received = row.received[item.item_key] || 0;
      const cap = row.caps[item.item_key] ?? item.default_per_round_cap ?? 0;
      total += received;
      const state = progressCellState(received, cap);
      if (state === "capped") capped += 1;
      if (state === "warning") partial += 1;
      if (state === "empty") empty += 1;
    }

    return { item, capped, partial, empty, total };
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
        {itemSummaries.map(({ item, capped, partial, empty, total }) => (
          <div className="progress-summary-card" key={item.id}>
            <strong>{item.short_name}</strong>
            <span>{capped + partial} received</span>
            <em>{capped} capped · {partial} incomplete · {empty} none · {total} total</em>
          </div>
        ))}
      </div>
      <div className="progress-table-wrap">
        <table className="progress-table">
          <thead>
            <tr>
              <th>Line</th>
              <th>Member</th>
              {limitedItems.map((item) => <th key={item.id}>{item.short_name}</th>)}
              <th>Total</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const status = progressRowStatus(row, limitedItems);
              const totalReceived = auctionItems.reduce((sum, item) => sum + (row.received[item.item_key] || 0), 0);
              return (
                <tr key={row.member.id}>
                  <td>{row.position}</td>
                  <td>
                    <strong>{row.member.char_name}</strong>
                    <span>{row.member.char_class}</span>
                  </td>
                  {limitedItems.map((item) => {
                    const received = row.received[item.item_key] || 0;
                    const cap = row.caps[item.item_key] ?? item.default_per_round_cap ?? 0;
                    return (
                      <td key={item.id}>
                        <span className={`progress-count ${progressCellState(received, cap)}`}>{received}/{cap}</span>
                      </td>
                    );
                  })}
                  <td><span className="progress-total">{totalReceived}</span></td>
                  <td><em className={`progress-status ${status.state}`}>{status.label}</em></td>
                </tr>
              );
            })}
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
  onLockAuction,
  onCantPay,
  onDoneAuction,
  onDoneEvent,
  onCopyAuctionList,
  readOnly = false,
  busy
}) {
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
      ? "League Prize is ready. It will use current progress plus locked GL/WoE reservations."
      : "Lock-in the GL/WoE auction first, then League Prize becomes available."
    : "Create and lock a GL/WoE auction first, then League Prize becomes available.";
  const completedCount = activeRound?.completedCount || 0;
  const roundMemberCount = activeRound?.memberCount || memberCount;
  const progressPct = roundMemberCount ? Math.min(100, Math.round((completedCount / roundMemberCount) * 100)) : 0;

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
          {!readOnly && (
            <>
              <button className="ghost-button" type="button" onClick={onOpenLimits} disabled={!activeRound || hasOpenAuctions}><Settings size={15} />Adjust limits</button>
              <button className="danger-button soft" type="button" onClick={onResetLineup} disabled={!activeRound || busy}><Shuffle size={15} />Test reset</button>
              <button className="ghost-button" type="button" onClick={onStartRound} disabled={Boolean(activeRound) || busy}><Shuffle size={15} />Create auction lineup</button>
            </>
          )}
        </div>
      </div>

      <div className="auction-grid">
        {activeAuctions.length ? (
          activeAuctions.map((auction) => {
            const bidRows = groupedAuctionBids(auction.units || [], auction.queue || []);
            const locked = auction.status === "locked";
            return (
              <article className={locked ? "active-auction-card locked" : "active-auction-card"} key={auction.id}>
                <div className="active-dot-row">
                  <span className={locked ? "idle-dot" : "live-dot"} />
                  <strong>{auction.name || auctionTypeLabel(auction.type)}</strong>
                  <em>{locked ? `${auctionTypeLabel(auction.type)} locked` : auctionTypeLabel(auction.type)}</em>
                </div>
                <p>{locked ? "This GL/WoE list is locked. League Prize can now use these reserved bids while skipping can't-pay members." : "Review the generated page table, mark any member who cannot pay, then finalize the auction."}</p>
                <div className="active-auction-stats">
                  <span><Clock3 size={14} />{locked ? "Locked" : "Active"}</span>
                  <span><Gavel size={14} />{auction.pageCount || 0} pages</span>
                  <span><Trophy size={14} />{auction.units?.length || 0} allocations</span>
                </div>
                <div className="allocation-table-wrap">
                  {bidRows.length ? (
                    <table className="allocation-table">
                      <thead>
                        <tr>
                          <th>Member</th>
                          <th>Bid instructions</th>
                          <th>Total</th>
                          {!readOnly && <th />}
                        </tr>
                      </thead>
                      <tbody>
                        {bidRows.map((row) => (
                          <tr key={`${auction.id}-${row.member_id}`}>
                            <td>
                              <strong>{row.member?.char_name || "Unknown"}</strong>
                              {Number.isFinite(row.queuePosition) && row.queuePosition !== Number.MAX_SAFE_INTEGER && <span>Line {row.queuePosition}</span>}
                              {row.cycle_reset && <span>cycle reset</span>}
                            </td>
                            <td>
                              <div className="bid-stack">
                                {row.items.map((item) => (
                                  <div className="bid-line" key={`${item.item_id}-${item.positions}`}>
                                    <strong>{item.item}</strong>
                                    <code>{item.positions}</code>
                                    <span>x{item.quantity}</span>
                                  </div>
                                ))}
                              </div>
                            </td>
                            <td>{row.quantity}</td>
                            {!readOnly && (
                              <td>
                                <button className="ghost-button mini" type="button" onClick={() => onCantPay(row.member, auction)} disabled={busy || locked}>
                                  <Ban size={13} />Can't pay
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="empty-panel compact">No allocations for this auction.</div>
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
            <p>{activeRound ? "Start GL/WoE or optional League Prize when you are ready to distribute items." : "Create the auction lineup first so the app can lock the randomized source list."}</p>
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
            <button className="primary-button" type="button" disabled={!activeRound || Boolean(glAuction) || Boolean(leagueAuction)} onClick={() => onOpenStartAuction("gl_woe")}><Plus size={16} />New GL/WoE Auction</button>
            <button className="ghost-button" type="button" disabled={!canStartLeague} onClick={() => onOpenStartAuction("league_prize")} title={canStartLeague ? "Start League Prize" : "Lock-in GL/WoE first"}><Plus size={16} />New League Prize Auction</button>
            {pairedEventActive && (
              <button className="primary-button" type="button" onClick={() => onDoneEvent([glAuction, leagueAuction])} disabled={busy}>
                {busy ? <Loader2 className="spin" size={15} /> : <Check size={15} />}
                Done event
              </button>
            )}
          </div>
          <p className={canStartLeague ? "auction-flow-note ready" : "auction-flow-note"}>{leagueHint}</p>
        </>
      )}

      <MemberProgressTable auctionItems={auctionItems} auctionState={auctionState} />
    </section>
  );
}

export default function DashboardApp({ publicView = false }) {
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
    if (publicView) {
      setSession({ loading: false, authenticated: true, username: "public" });
      loadData();
      return;
    }
    const data = await api("/api/auth/session");
    setSession({ loading: false, authenticated: data.authenticated, username: data.username || "" });
    if (data.authenticated) loadData();
  }

  async function loadData() {
    setLoading(true);
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
      setLoading(false);
    }
  }

  useEffect(() => {
    checkSession().catch((err) => {
      setSession({ loading: false, authenticated: false, username: "" });
      setError(err.message);
    });
  }, [publicView]);

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
      syncAuctionMember(data.member);
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
      title: "Lock-in GL/WoE list",
      body: `Freeze ${auction.name || "this GL/WoE auction"} so League Prize can start from the next incomplete member using these reserved bids?`,
      confirmLabel: "Lock list",
      tone: "default",
      run: async () => {
        const data = await api("/api/auctions/active/lock", {
          method: "POST",
          body: JSON.stringify({ auctionId: auction.id })
        });
        setAuctionState(data.auctionState);
        setToast("GL/WoE list locked");
      }
    });
  }

  function requestDoneAuction(auction) {
    const activeAuction = auction || auctionState?.activeAuction;
    setConfirmAction({
      title: "Finish auction",
      body: `Finalize ${activeAuction?.name || "this auction"}? This will update member progress and cannot be undone.`,
      confirmLabel: "Finalize auction",
      tone: "default",
      run: async () => {
        const data = await api("/api/auctions/active/done", {
          method: "POST",
          body: JSON.stringify({ auctionId: activeAuction?.id })
        });
        setAuctionState(data.auctionState);
        setToast("Auction finalized");
      }
    });
  }

  function requestDoneEvent(auctions) {
    const eventAuctions = (auctions || []).filter(Boolean);
    if (!eventAuctions.length) return;
    const orderedAuctions = [
      ...eventAuctions.filter((auction) => auction.type === "gl_woe"),
      ...eventAuctions.filter((auction) => auction.type !== "gl_woe")
    ];

    setConfirmAction({
      title: "Finish event auctions",
      body: "Finalize GL/WoE and League Prize together? GL/WoE progress will be applied first, then League Prize. This cannot be undone.",
      confirmLabel: "Finalize event",
      tone: "default",
      run: async () => {
        const data = await api("/api/auctions/active/done-event", {
          method: "POST",
          body: JSON.stringify({ auctionIds: orderedAuctions.map((auction) => auction.id) })
        });
        setAuctionState(data.auctionState);
        setToast("Event auctions finalized");
      }
    });
  }

  async function copyAuctionList(auction, bidRows) {
    try {
      await navigator.clipboard.writeText(formatDiscordBidList(auction, bidRows));
      setToast("Auction list copied for Discord");
    } catch (err) {
      setError("Could not copy the auction list.");
    }
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

  if (session.loading) {
    return <main className="loading-page"><Loader2 className="spin" size={28} /></main>;
  }

  if (!publicView && !session.authenticated) {
    return <LoginScreen onLogin={checkSession} />;
  }

  return (
    <>
      <NoiseLayer />
      <Header username={session.username} onLogout={logout} publicView={publicView} />
      <main className="dashboard">
        <Stats
          members={members}
          memberLimit={effectiveMemberLimit}
          activeClass={classFilter}
          onClassFilter={setClassFilter}
          onEditLimit={() => !publicView && setLimitModalOpen(true)}
          readOnly={publicView}
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
              readOnly={publicView}
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
              readOnly={publicView}
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
              onLockAuction={requestLockAuction}
              onCantPay={requestCantPay}
              onDoneAuction={requestDoneAuction}
              onDoneEvent={requestDoneEvent}
              onCopyAuctionList={copyAuctionList}
              readOnly={publicView}
            />
          </>
        )}
      </main>
      <FooterStrip memberCount={members.length} partyCount={groups.length} publicView={publicView} />

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

function FooterStrip({ memberCount, partyCount, publicView = false }) {
  return (
    <footer className="footer-strip">
      <span>encore · {publicView ? "public dashboard" : "admin console"} · v0.1.0</span>
      <span>{memberCount} members · {partyCount} groups · auctions pending</span>
    </footer>
  );
}
