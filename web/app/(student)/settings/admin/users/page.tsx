"use client";

import { useEffect, useMemo, useState } from "react";

type Role = "student" | "teacher" | "admin";

type AdminUser = {
  user_id: string;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  nickname: string | null;
  student_id: string | null;
  role: Role;
  is_admin: boolean;
  math_level: string | null;
  verbal_level: string | null;
  phone_number: string | null;
  parent_name: string | null;
  parent_phone: string | null;
  streak_count?: number;
};

export default function AdminUsersPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [role, setRole] = useState<Role>("student");

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [saveId, setSaveId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [passwordDrafts, setPasswordDrafts] = useState<Record<string, string>>({});

  const token = useMemo(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("access_token");
  }, []);

  async function createUser() {
    setLoading(true);
    setResult(null);

    if (!token) {
      setResult({ error: "No session. Please log in again." });
      setLoading(false);
      return;
    }

    const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/api/admin/users/create/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        username: username.trim(),
        password,
        nickname: nickname.trim() ? nickname.trim() : null,
        role,
      }),
    });

    const json = await res.json();
    setResult(json);
    setLoading(false);
    if (json?.ok) {
      setUsername("");
      setPassword("");
      setNickname("");
      setRole("student");
      await loadUsers();
    }
  }

  async function loadUsers() {
    if (!token) {
      setError("No session. Please log in again.");
      return;
    }
    setListLoading(true);
    setError(null);
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/api/admin/users/search/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        q: query.trim(),
        role: roleFilter || undefined,
        limit: 200,
      }),
    });
    const json = await res.json();
    if (!res.ok || json?.error) {
      setError(json?.error || "Failed to load users");
      setListLoading(false);
      return;
    }
    setUsers(json.users || []);
    setListLoading(false);
  }

  useEffect(() => {
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateUserField(userId: string, key: keyof AdminUser, value: any) {
    setUsers((prev) => prev.map((u) => (u.user_id === userId ? { ...u, [key]: value } : u)));
  }

  async function saveUser(user: AdminUser) {
    if (!token) {
      setError("No session. Please log in again.");
      return;
    }
    setSaveId(user.user_id);
    setNotice(null);
    setError(null);

    const payload: Record<string, any> = {
      username: user.username,
      first_name: user.first_name,
      last_name: user.last_name,
      nickname: user.nickname,
      student_id: user.student_id,
      role: user.role,
      math_level: user.math_level,
      verbal_level: user.verbal_level,
      phone_number: user.phone_number,
      parent_name: user.parent_name,
      parent_phone: user.parent_phone,
      streak_count: typeof user.streak_count === "number" ? user.streak_count : undefined,
    };

    const draftPassword = passwordDrafts[user.user_id];
    if (draftPassword && draftPassword.trim().length > 0) {
      payload.password = draftPassword;
    }

    const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/api/admin/users/${user.user_id}/`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    const json = await res.json();
    if (!res.ok || json?.error) {
      setError(json?.error || "Failed to update user");
      setSaveId(null);
      return;
    }
    setPasswordDrafts((prev) => ({ ...prev, [user.user_id]: "" }));
    setNotice("Changes saved.");
    setSaveId(null);
    await loadUsers();
  }

  async function deleteUser(user: AdminUser) {
    if (!token) {
      setError("No session. Please log in again.");
      return;
    }

    const confirmText = window.prompt(
      `Type DELETE to confirm removing ${user.username}. This cannot be undone.`
    );
    if (confirmText !== "DELETE") {
      return;
    }

    let adminDeletePassword: string | null = null;
    if (user.role === "admin") {
      adminDeletePassword = window.prompt("Admin delete password required.");
      if (!adminDeletePassword) {
        return;
      }
    }

    setDeleteId(user.user_id);
    setError(null);
    setNotice(null);

    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_BASE}/api/admin/users/${user.user_id}/delete/`,
      {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          admin_delete_password: adminDeletePassword || undefined,
        }),
      }
    );

    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.error) {
      setError(json?.error || "Failed to delete user");
      setDeleteId(null);
      return;
    }
    setNotice("User deleted.");
    setDeleteId(null);
    await loadUsers();
  }

  return (
    <div className="p-5 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Admin</div>
          <h1 className="text-2xl font-bold text-slate-900 leading-tight">Users</h1>
          <p className="text-sm text-neutral-600">
            Manage student/teacher/admin accounts. Login is username + password (no email).
          </p>
        </div>
        {result?.error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 shadow-sm">
            {result.error}
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl border bg-white shadow-sm p-5 space-y-4 max-w-3xl">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-indigo-100 text-indigo-700 grid place-items-center text-lg font-bold">
            U
          </div>
          <div>
            <div className="text-sm uppercase tracking-[0.15em] text-slate-500">Create</div>
            <div className="text-lg font-semibold text-slate-900">New user</div>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-800">Username</label>
          <input
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-slate-400 focus:outline-none"
            placeholder="student1"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <div className="text-xs text-neutral-500">Must be unique. Use letters/numbers (no spaces).</div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-800">Password</label>
          <input
            type="password"
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-slate-400 focus:outline-none"
            placeholder="min 6 chars"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-800">Display nickname (optional)</label>
          <input
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-slate-400 focus:outline-none"
            placeholder="e.g. Ali"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
          />
          <div className="text-xs text-neutral-500">
            This is what appears in the sidebar/profile. If empty, it will default to the username.
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-800">Role</label>
          <select
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-slate-400 focus:outline-none"
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
          >
            <option value="student">student</option>
            <option value="teacher">teacher</option>
            <option value="admin">admin</option>
          </select>
        </div>

        <button
          onClick={createUser}
          disabled={loading}
          className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-slate-800 disabled:opacity-60"
        >
          {loading ? "Creating..." : "Create user"}
        </button>

        {result && !result.error ? (
          <pre className="text-xs bg-slate-50 border border-slate-200 rounded-lg p-3 overflow-auto">
            {JSON.stringify(result, null, 2)}
          </pre>
        ) : null}
      </div>

      <div className="rounded-2xl border bg-white shadow-sm p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm uppercase tracking-[0.15em] text-slate-500">Directory</div>
            <div className="text-lg font-semibold text-slate-900">All users</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-slate-400 focus:outline-none"
              placeholder="Search name, username, ID..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <select
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-slate-400 focus:outline-none"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
            >
              <option value="">All roles</option>
              <option value="student">student</option>
              <option value="teacher">teacher</option>
              <option value="admin">admin</option>
            </select>
            <button
              onClick={loadUsers}
              className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white shadow hover:bg-slate-800"
            >
              {listLoading ? "Loading..." : "Search"}
            </button>
          </div>
        </div>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}
        {notice ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {notice}
          </div>
        ) : null}

        <div className="space-y-4">
          {users.map((user) => (
            <div key={user.user_id} className="rounded-2xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-900">
                    {user.first_name || user.last_name
                      ? `${user.first_name} ${user.last_name}`.trim()
                      : user.username}
                  </div>
                  <div className="text-xs text-slate-500">User ID: {user.user_id}</div>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
                    value={user.role}
                    onChange={(e) => updateUserField(user.user_id, "role", e.target.value as Role)}
                  >
                    <option value="student">student</option>
                    <option value="teacher">teacher</option>
                    <option value="admin">admin</option>
                  </select>
                  <button
                    onClick={() => saveUser(user)}
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                  >
                    {saveId === user.user_id ? "Saving..." : "Save"}
                  </button>
                  <button
                    onClick={() => deleteUser(user)}
                    className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
                  >
                    {deleteId === user.user_id ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600">Username</label>
                  <input
                    className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                    value={user.username}
                    onChange={(e) => updateUserField(user.user_id, "username", e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600">First name</label>
                  <input
                    className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                    value={user.first_name || ""}
                    onChange={(e) => updateUserField(user.user_id, "first_name", e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600">Last name</label>
                  <input
                    className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                    value={user.last_name || ""}
                    onChange={(e) => updateUserField(user.user_id, "last_name", e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600">Student ID</label>
                  <input
                    className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                    value={user.student_id || ""}
                    onChange={(e) => updateUserField(user.user_id, "student_id", e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600">Nickname</label>
                  <input
                    className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                    value={user.nickname || ""}
                    onChange={(e) => updateUserField(user.user_id, "nickname", e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600">Password</label>
                  <input
                    type="password"
                    className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                    placeholder="Leave blank to keep"
                    value={passwordDrafts[user.user_id] || ""}
                    onChange={(e) =>
                      setPasswordDrafts((prev) => ({ ...prev, [user.user_id]: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600">Math level</label>
                  <input
                    className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                    value={user.math_level || ""}
                    onChange={(e) => updateUserField(user.user_id, "math_level", e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600">Verbal level</label>
                  <input
                    className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                    value={user.verbal_level || ""}
                    onChange={(e) => updateUserField(user.user_id, "verbal_level", e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600">Phone number</label>
                  <input
                    className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                    value={user.phone_number || ""}
                    onChange={(e) => updateUserField(user.user_id, "phone_number", e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600">Parent name</label>
                  <input
                    className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                    value={user.parent_name || ""}
                    onChange={(e) => updateUserField(user.user_id, "parent_name", e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600">Parent phone</label>
                  <input
                    className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                    value={user.parent_phone || ""}
                    onChange={(e) => updateUserField(user.user_id, "parent_phone", e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600">Streak count</label>
                  <input
                    type="number"
                    min={0}
                    className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                    value={user.streak_count ?? 0}
                    onChange={(e) =>
                      updateUserField(
                        user.user_id,
                        "streak_count",
                        Number.isNaN(Number(e.target.value)) ? 0 : Number(e.target.value)
                      )
                    }
                  />
                </div>
              </div>
            </div>
          ))}
          {users.length === 0 && !listLoading ? (
            <div className="text-sm text-slate-500">No users found.</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
