import { Fragment, useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Pencil, Plus, Trash2, Shield, X } from "lucide-react";
import { can, ROLE_LABELS } from "@/lib/permissions";
import { useAuth } from "@/lib/auth";

const ROLES = ["admin", "support", "developer", "qa", "viewer"];

function slug(s) {
  return (s || "").toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-|-$/g, "") || "item";
}

function effectivePerms(role, overrides, matrix) {
  const base = new Set(matrix?.roles?.[role] || []);
  (overrides?.grant || []).forEach((p) => base.add(p));
  (overrides?.deny || []).forEach((p) => base.delete(p));
  return base;
}

function overridesFromSelection(role, selectedSet, matrix) {
  const rolePerms = new Set(matrix?.roles?.[role] || []);
  const grant = [...selectedSet].filter((p) => !rolePerms.has(p));
  const deny = [...rolePerms].filter((p) => !selectedSet.has(p));
  return { grant, deny };
}

export default function Users() {
  const { user: me } = useAuth();
  const [tab, setTab] = useState("members");
  const [users, setUsers] = useState([]);
  const [matrix, setMatrix] = useState(null);
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const canManage = can(me, "team.manage");
  const canEditPerms = can(me, "team.permissions") || canManage || me?.role === "admin";

  const load = () => api.get("/users").then((r) => setUsers(r.data));
  const loadMatrix = () => api.get("/permissions/matrix").then((r) => setMatrix(r.data));

  useEffect(() => {
    load();
    loadMatrix().catch(() => {});
  }, [me?.id]);

  const selected = users.find((u) => u.id === selectedId) || null;

  return (
    <div className="p-8 max-w-7xl mx-auto" data-testid="users-page">
      <div className="flex items-baseline justify-between mb-6">
        <div>
          <div className="label-mono text-[var(--brand-primary)] mb-2">/ Team</div>
          <h1 className="font-display font-black tracking-tighter text-4xl">Members &amp; Roles</h1>
        </div>
        {canManage && tab === "members" && (
          <button onClick={() => setOpen(true)} data-testid="add-user-btn" className="inline-flex items-center gap-2 btn-solid px-4 py-2 text-sm font-semibold">
            <Plus size={14} /> Add member
          </button>
        )}
      </div>

      <div className="flex gap-2 mb-6">
        <button type="button" onClick={() => setTab("members")} className={`px-4 py-2 text-sm border ${tab === "members" ? "tab-active" : "tab-inactive"}`}>
          Members
        </button>
        {can(me, "team.view") && (
          <button type="button" onClick={() => setTab("permissions")} className={`inline-flex items-center gap-2 px-4 py-2 text-sm border ${tab === "permissions" ? "tab-active" : "tab-inactive"}`}>
            <Shield size={14} /> Permission groups
          </button>
        )}
      </div>

      {tab === "members" && (
        <>
          <div className="panel">
            <div className="grid grid-cols-12 gap-4 px-5 py-2 border-b border-[var(--border)] bg-[var(--bg-soft)] label-mono text-[10px]">
              <span className="col-span-3">Member</span>
              <span className="col-span-2">Role</span>
              <span className="col-span-2">Status</span>
              <span className="col-span-5 text-right">Actions</span>
            </div>
            {users.map((u) => (
              <div
                key={u.id}
                className={`grid grid-cols-12 gap-4 px-5 py-3 border-b border-[var(--border)] text-sm items-center ${u.active === false ? "opacity-50" : ""} ${selectedId === u.id ? "bg-[var(--bg-soft)]" : "hover:bg-[var(--bg-soft)]"}`}
              >
                <div className="col-span-3 min-w-0">
                  <div className="font-semibold truncate">{u.name}</div>
                  <div className="font-mono text-[10px] text-[var(--text-muted)] truncate">{u.email}</div>
                </div>
                <div className="col-span-2">
                  {canManage && u.id !== me?.id ? (
                    <select
                      value={u.role}
                      onChange={async (e) => {
                        await api.patch(`/users/${u.id}`, { role: e.target.value });
                        toast.success("Role updated");
                        load();
                      }}
                      className="w-full field-input-sm"
                    >
                      {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                    </select>
                  ) : (
                    <span className="text-xs font-mono">{ROLE_LABELS[u.role] || u.role}</span>
                  )}
                </div>
                <div className="col-span-2">
                  {canManage && u.id !== me?.id ? (
                    <button
                      type="button"
                      onClick={async () => {
                        await api.patch(`/users/${u.id}`, { active: !u.active });
                        toast.success(u.active !== false ? "Disabled" : "Enabled");
                        load();
                      }}
                      className={`text-xs font-mono px-2 py-1 border w-full ${u.active !== false ? "border-green-600 text-green-700" : "border-[var(--border)]"}`}
                    >
                      {u.active !== false ? "Active" : "Disabled"}
                    </button>
                  ) : (
                    <span className="text-xs font-mono">{u.active !== false ? "Active" : "Disabled"}</span>
                  )}
                </div>
                <div className="col-span-5 flex justify-end items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedId(u.id)}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs border border-[var(--border)] hover:border-[var(--brand-primary)] hover:text-[var(--brand-primary)]"
                  >
                    <Pencil size={12} /> Edit
                  </button>
                  {canManage && u.id !== me?.id && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (!window.confirm("Remove member?")) return;
                        await api.delete(`/users/${u.id}`);
                        toast.success("Removed");
                        if (selectedId === u.id) setSelectedId(null);
                        load();
                      }}
                      className="text-[var(--text-muted)] hover:text-[var(--brand-destructive)] p-1"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {selected && (
            <MemberDrawer
              member={selected}
              matrix={matrix}
              me={me}
              canManage={canManage}
              canEditPerms={canEditPerms}
              onClose={() => setSelectedId(null)}
              onSaved={() => { load(); loadMatrix(); }}
            />
          )}
        </>
      )}

      {tab === "permissions" && (
        matrix ? (
          <GroupsEditor matrix={matrix} canEdit={canEditPerms} onSaved={() => { loadMatrix(); load(); }} />
        ) : (
          <div className="p-8 text-sm font-mono text-[var(--text-muted)]">Loading permission groups…</div>
        )
      )}

      {open && <AddUserModal onClose={() => setOpen(false)} onDone={() => { setOpen(false); load(); }} />}
    </div>
  );
}

function MemberDrawer({ member, matrix, me, canManage, canEditPerms, onClose, onSaved }) {
  const [role, setRole] = useState(member.role);
  const [active, setActive] = useState(member.active !== false);
  const [selected, setSelected] = useState(() => effectivePerms(member.role, member.permission_overrides, matrix));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setRole(member.role);
    setActive(member.active !== false);
    setSelected(effectivePerms(member.role, member.permission_overrides, matrix));
  }, [member.id, member.updated_at, member.role, member.permission_overrides, matrix]);

  useEffect(() => {
    if (role === member.role) {
      setSelected(effectivePerms(member.role, member.permission_overrides, matrix));
    } else {
      setSelected(new Set(matrix?.roles?.[role] || []));
    }
  }, [role]);

  const togglePerm = (key) => {
    if (!canEditPerms && member.role === "admin") return;
    if (!canEditPerms) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const body = {};
      if (canManage && member.id !== me?.id) {
        if (role !== member.role) body.role = role;
        if (active !== (member.active !== false)) body.active = active;
      }
      if (canEditPerms && member.role !== "admin") {
        body.permission_overrides = overridesFromSelection(role, selected, matrix);
      }
      if (Object.keys(body).length) {
        await api.patch(`/users/${member.id}`, body);
        toast.success("Member updated");
        onSaved();
      }
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const isAdmin = member.role === "admin";
  const readOnly = !canManage && !canEditPerms;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md bg-[var(--bg)] border-l border-[var(--border)] shadow-xl flex flex-col max-h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] shrink-0">
        <div>
          <div className="font-semibold">Edit member</div>
          <div className="text-[10px] font-mono text-[var(--text-muted)] truncate">{member.email}</div>
        </div>
        <button type="button" onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"><X size={16} /></button>
      </div>
      <div className="p-4 space-y-4 overflow-y-auto flex-1">

        <div>
          <label className="label-mono text-[10px] block mb-1">Role</label>
          <select value={role} disabled={!canManage || member.id === me?.id} onChange={(e) => setRole(e.target.value)} className="w-full border border-[var(--border)] px-2 py-1.5 text-sm disabled:opacity-60">
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
        </div>

        {canManage && member.id !== me?.id && (
          <div>
            <label className="label-mono text-[10px] block mb-1">Status</label>
            <button type="button" onClick={() => setActive((v) => !v)} className={`text-xs font-mono px-2 py-1 border w-full ${active ? "border-green-600 text-green-700" : "border-[var(--border)] text-[var(--text-muted)]"}`}>
              {active ? "Active" : "Disabled"}
            </button>
          </div>
        )}

        <div>
          <div className="label-mono text-[10px] text-[var(--brand-primary)] mb-2">Permissions</div>
          {isAdmin ? (
            <p className="text-xs text-[var(--text-muted)]">Admins have full access.</p>
          ) : !matrix ? (
            <p className="text-xs text-[var(--text-muted)]">Loading permissions…</p>
          ) : (
            <div className="space-y-3">
              {matrix.groups.map((g) => (
                <div key={g.id}>
                  <div className="text-xs font-semibold mb-1">{g.label}</div>
                  <div className="space-y-1">
                    {(g.permissions || []).map((p) => {
                      const inRole = (matrix.roles[role] || []).includes(p.key);
                      const checked = selected.has(p.key);
                      return (
                        <label key={p.key} className={`flex items-center gap-2 text-xs py-0.5 ${!canEditPerms ? "opacity-70" : "cursor-pointer"}`}>
                          <input type="checkbox" checked={checked} disabled={!canEditPerms} onChange={() => togglePerm(p.key)} />
                          <span className="flex-1">{p.label}</span>
                          {inRole && checked && <span className="text-[10px] font-mono text-green-600">role</span>}
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {!readOnly && (
        <div className="px-4 py-3 border-t border-[var(--border)] shrink-0">
          <button type="button" disabled={saving} onClick={save} className="w-full py-2 text-sm btn-primary disabled:opacity-50">
            {saving ? "Saving…" : "Save member"}
          </button>
        </div>
      )}
      </div>
    </div>
  );
}

function GroupsEditor({ matrix, canEdit, onSaved }) {
  const [groups, setGroups] = useState(() => JSON.parse(JSON.stringify(matrix.groups)));
  const [rolePerms, setRolePerms] = useState(() => JSON.parse(JSON.stringify(matrix.role_permissions || {})));
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setGroups(JSON.parse(JSON.stringify(matrix.groups)));
    setRolePerms(JSON.parse(JSON.stringify(matrix.role_permissions || matrix.roles || {})));
    setDirty(false);
  }, [matrix]);

  const allKeys = useMemo(() => groups.flatMap((g) => (g.permissions || []).map((p) => p.key)), [groups]);

  const markDirty = () => setDirty(true);

  const addGroup = () => {
    const id = `group-${Date.now().toString(36)}`;
    setGroups((g) => [...g, { id, label: "New group", permissions: [] }]);
    markDirty();
  };

  const removeGroup = (gid) => {
    if (!window.confirm("Remove this group and its permissions from role defaults?")) return;
    const removed = groups.find((g) => g.id === gid);
    const keys = new Set((removed?.permissions || []).map((p) => p.key));
    setGroups((g) => g.filter((x) => x.id !== gid));
    setRolePerms((rp) => {
      const next = { ...rp };
      for (const role of ROLES) {
        const list = next[role] || [];
        if (list.includes("*")) continue;
        next[role] = list.filter((k) => !keys.has(k));
      }
      return next;
    });
    markDirty();
  };

  const updateGroupLabel = (gid, label) => {
    setGroups((g) => g.map((x) => (x.id === gid ? { ...x, label } : x)));
    markDirty();
  };

  const addPermission = (gid) => {
    const key = `custom.${Date.now().toString(36)}`;
    setGroups((g) => g.map((x) => (x.id === gid ? { ...x, permissions: [...(x.permissions || []), { key, label: "New permission" }] } : x)));
    markDirty();
  };

  const updatePerm = (gid, idx, field, value) => {
    setGroups((g) => g.map((x) => {
      if (x.id !== gid) return x;
      const perms = [...(x.permissions || [])];
      const p = { ...perms[idx] };
      if (field === "key") p.key = slug(value);
      else p.label = value;
      perms[idx] = p;
      return { ...x, permissions: perms };
    }));
    markDirty();
  };

  const removePerm = (gid, idx) => {
    const g = groups.find((x) => x.id === gid);
    const key = g?.permissions?.[idx]?.key;
    setGroups((gs) => gs.map((x) => (x.id === gid ? { ...x, permissions: x.permissions.filter((_, i) => i !== idx) } : x)));
    if (key) {
      setRolePerms((rp) => {
        const next = { ...rp };
        for (const role of ROLES) {
          if ((next[role] || []).includes("*")) continue;
          next[role] = (next[role] || []).filter((k) => k !== key);
        }
        return next;
      });
    }
    markDirty();
  };

  const toggleRolePerm = (role, permKey) => {
    if (!canEdit) return;
    if (role === "admin") return;
    setRolePerms((rp) => {
      const next = { ...rp };
      const list = new Set(next[role] || []);
      if (list.has(permKey)) list.delete(permKey);
      else list.add(permKey);
      next[role] = [...list];
      return next;
    });
    markDirty();
  };

  const save = async () => {
    setSaving(true);
    try {
      const r = await api.put("/permissions/config", { groups, role_permissions: rolePerms });
      toast.success("Permission groups saved");
      setDirty(false);
      onSaved();
      if (r.data) {
        setGroups(r.data.groups);
        setRolePerms(r.data.role_permissions || r.data.roles);
      }
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const roleHas = (role, key) => role === "admin" || (rolePerms[role] || []).includes("*") || (rolePerms[role] || []).includes(key);

  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="flex flex-wrap gap-2 sticky top-0 bg-[var(--bg)] z-10 py-2 border-b border-[var(--border)] mb-4">
          <button type="button" onClick={addGroup} className="inline-flex items-center gap-1 px-3 py-1.5 text-sm border border-[var(--border)] bg-[var(--bg)] text-[var(--text-primary)]">
            <Plus size={14} /> Add group
          </button>
          <button type="button" disabled={!dirty || saving} onClick={save} className="px-4 py-1.5 text-sm btn-primary disabled:opacity-50">
            {saving ? "Saving…" : "Save all groups"}
          </button>
          {dirty && <span className="text-xs font-mono text-amber-600 self-center">Unsaved changes</span>}
        </div>
      )}

      {!canEdit && (
        <p className="text-xs text-[var(--text-muted)] mb-4 border border-[var(--border)] p-3 bg-[var(--bg-soft)]">
          View only — you need <strong>team.manage</strong> or <strong>team.permissions</strong> to edit groups.
        </p>
      )}

      {groups.map((g) => (
        <div key={g.id} className="panel p-4">
          <div className="flex items-center gap-2 mb-3">
            {canEdit ? (
              <input value={g.label} onChange={(e) => updateGroupLabel(g.id, e.target.value)} className="flex-1 font-semibold border border-[var(--border)] px-2 py-1 text-sm" />
            ) : (
              <div className="font-semibold">{g.label}</div>
            )}
            {canEdit && (
              <button type="button" onClick={() => removeGroup(g.id)} className="text-[var(--text-muted)] hover:text-[var(--brand-destructive)]"><Trash2 size={14} /></button>
            )}
          </div>

          <div className="overflow-x-auto mb-3">
            <table className="w-full text-xs border-collapse min-w-[640px]">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="text-left py-2 pr-3 label-mono">Permission</th>
                  {ROLES.map((r) => (
                    <th key={r} className="text-center py-2 px-1 label-mono">{ROLE_LABELS[r]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(g.permissions || []).map((p, idx) => (
                  <tr key={`${g.id}-${idx}`} className="border-b border-[var(--border)]">
                    <td className="py-2 pr-3">
                      {canEdit ? (
                        <div className="flex flex-col gap-1">
                          <input value={p.label} onChange={(e) => updatePerm(g.id, idx, "label", e.target.value)} className="border border-[var(--border)] px-2 py-1 text-xs" placeholder="Label" />
                          <input value={p.key} onChange={(e) => updatePerm(g.id, idx, "key", e.target.value)} className="border border-[var(--border)] px-2 py-1 text-[10px] font-mono" placeholder="permission.key" />
                        </div>
                      ) : (
                        <span>{p.label}</span>
                      )}
                    </td>
                    {ROLES.map((r) => (
                      <td key={r} className="text-center py-2">
                        {r === "admin" ? (
                          <span className="text-green-600">✓</span>
                        ) : canEdit ? (
                          <button type="button" onClick={() => toggleRolePerm(r, p.key)} className={`w-6 h-6 border text-xs ${roleHas(r, p.key) ? "border-green-600 text-green-600 bg-green-50" : "border-[var(--border)] text-[var(--text-muted)]"}`}>
                            {roleHas(r, p.key) ? "✓" : "—"}
                          </button>
                        ) : roleHas(r, p.key) ? (
                          <span className="text-green-600">✓</span>
                        ) : (
                          <span className="text-[var(--text-muted)]">—</span>
                        )}
                      </td>
                    ))}
                    {canEdit && (
                      <td>
                        <button type="button" onClick={() => removePerm(g.id, idx)} className="text-[var(--text-muted)] hover:text-[var(--brand-destructive)]"><Trash2 size={12} /></button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {canEdit && (
            <button type="button" onClick={() => addPermission(g.id)} className="text-xs font-mono text-[var(--brand-primary)] hover:underline">
              + Add permission to {g.label}
            </button>
          )}
        </div>
      ))}

      {groups.length === 0 && (
        <div className="border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--text-muted)]">
          No groups yet. {canEdit && "Click Add group to create one."}
        </div>
      )}
    </div>
  );
}

function AddUserModal({ onClose, onDone }) {
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "support" });
  const [loading, setLoading] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post("/users", form);
      toast.success("Member added");
      onDone();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed");
    } finally { setLoading(false); }
  };
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <form onSubmit={submit} className="modal-shell w-full max-w-md">
        <div className="px-5 py-3 border-b border-[var(--border)] label-mono">Add team member</div>
        <div className="p-5 space-y-4">
          {[["name", "Name", "text"], ["email", "Email", "email"], ["password", "Temp password", "password"]].map(([k, label, type]) => (
            <div key={k}>
              <label className="label-mono block mb-1">{label}</label>
              <input required type={type} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} className="field-input" />
            </div>
          ))}
          <div>
            <label className="label-mono block mb-1">Role</label>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="field-input">
              {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
          </div>
        </div>
        <div className="px-5 py-3 border-t border-[var(--border)] flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm border border-[var(--border)] text-[var(--text-primary)]">Cancel</button>
          <button disabled={loading} className="px-4 py-2 text-sm btn-primary">{loading ? "Adding…" : "Add"}</button>
        </div>
      </form>
    </div>
  );
}
