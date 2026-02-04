"use client";

import { useState } from "react";

type Role = "student" | "teacher" | "admin";

export default function AdminUsersPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [role, setRole] = useState<Role>("student");

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  async function createUser() {
    setLoading(true);
    setResult(null);

    const token =
      typeof window !== "undefined" ? localStorage.getItem("access_token") : null;

    if (!token) {
      setResult({ error: "No session. Please log in again." });
      setLoading(false);
      return;
    }

    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_BASE}/api/admin/users/create/`,
      {
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
  }

  return (
    <div className="p-5 space-y-6 max-w-3xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Admin</div>
          <h1 className="text-2xl font-bold text-slate-900 leading-tight">Users</h1>
          <p className="text-sm text-neutral-600">
            Create students/teachers (admin only). Login will be username + password (no email).
          </p>
        </div>
        {result?.error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 shadow-sm">
            {result.error}
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl border bg-white shadow-sm p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-indigo-100 text-indigo-700 grid place-items-center text-lg font-bold">
            👤
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
    </div>
  );
}
