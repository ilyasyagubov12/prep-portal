"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE;

type Profile = {
  user_id: string;
  role: string | null;
  is_admin: boolean | null;
  username?: string | null;
  nickname?: string | null;
  email?: string | null;
};

type PracticeModule = {
  id: string;
  subject: "math" | "verbal";
  module_index: number;
  time_limit_minutes: number;
  question_count: number;
  question_ids?: string[] | null;
};

type PracticeAttempt = {
  id: string;
  status: string;
  score: number;
  correct: number;
  total: number;
  completed_at: string | null;
};

type Practice = {
  id: string;
  title: string;
  description: string | null;
  is_active: boolean;
  results_published: boolean;
  locked: boolean;
  access_expires_at: string | null;
  modules: PracticeModule[];
  attempt?: PracticeAttempt | null;
};

function isTeacherOrAdmin(p: Profile | null) {
  if (!p) return false;
  const role = (p.role ?? "").toLowerCase();
  return role === "teacher" || role === "admin" || !!p.is_admin;
}

function formatModuleLabel(m: PracticeModule) {
  const label = m.subject === "math" ? "Math" : "Verbal";
  return `${label} Module ${m.module_index}`;
}

export default function Page() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [practices, setPractices] = useState<Practice[]>([]);

  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);

  const [manageId, setManageId] = useState<string | null>(null);
  const [accessUser, setAccessUser] = useState("");
  const [accessExpiry, setAccessExpiry] = useState("");
  const [grantBusy, setGrantBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
      if (!token) return;
      setAccessToken(token);

      const meRes = await fetch(`${API_BASE}/api/auth/me/`, {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => null);
      if (!meRes || !meRes.ok) return;
      const me = await meRes.json().catch(() => null);
      if (cancelled || !me) return;
      setProfile({
        user_id: me.user?.id,
        role: me.role ?? null,
        is_admin: me.is_admin ?? false,
        username: me.user?.username ?? null,
        nickname: me.nickname ?? null,
        email: me.user?.email ?? null,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function loadPractices(token: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/module-practice/list/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to load practices");
      setPractices(json.practices ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load practices");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!accessToken) return;
    void loadPractices(accessToken);
  }, [accessToken]);

  const canManage = isTeacherOrAdmin(profile);

  async function createPractice() {
    if (!accessToken || !newTitle.trim()) return;
    setCreating(true);
    try {
      const res = await fetch(`${API_BASE}/api/module-practice/create/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: newTitle.trim(), description: newDesc || null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to create practice");
      setNewTitle("");
      setNewDesc("");
      await loadPractices(accessToken);
      setManageId(json.practice_id ?? null);
    } catch (e: any) {
      setError(e?.message ?? "Failed to create practice");
    } finally {
      setCreating(false);
    }
  }

  async function saveModuleQuestions(practiceId: string, module: PracticeModule, raw: string) {
    if (!accessToken) return;
    const ids = raw
      .split(/[\n,]+/)
      .map((id) => id.trim())
      .filter(Boolean);
    const res = await fetch(`${API_BASE}/api/module-practice/modules/set/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        practice_id: practiceId,
        subject: module.subject,
        module_index: module.module_index,
        question_ids: ids,
        question_count: ids.length,
      }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error || "Failed to save module");
    await loadPractices(accessToken);
  }

  async function togglePractice(practiceId: string, payload: Record<string, any>) {
    if (!accessToken) return;
    const res = await fetch(`${API_BASE}/api/module-practice/update/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ practice_id: practiceId, ...payload }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error || "Failed to update practice");
    await loadPractices(accessToken);
  }

  async function grantAccess(practiceId: string) {
    if (!accessToken || !accessUser.trim()) return;
    setGrantBusy(true);
    try {
      const payload: any = { practice_id: practiceId };
      if (accessUser.includes("@")) payload.email = accessUser.trim();
      else payload.username = accessUser.trim();
      if (accessExpiry) payload.expires_at = new Date(accessExpiry).toISOString();

      const res = await fetch(`${API_BASE}/api/module-practice/access/grant/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to grant access");
      setAccessUser("");
      setAccessExpiry("");
      await loadPractices(accessToken);
    } catch (e: any) {
      setError(e?.message ?? "Failed to grant access");
    } finally {
      setGrantBusy(false);
    }
  }

  function startPractice(practiceId: string, locked: boolean) {
    if (locked) return;
    router.push(`/practice/modules/${practiceId}`);
  }

  if (loading) {
    return <div className="p-6 text-sm text-slate-500">Loading module practice...</div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-3xl bg-gradient-to-r from-slate-900 via-blue-900 to-blue-600 text-white p-6 shadow-xl">
          <div className="text-xs uppercase tracking-[0.3em] text-blue-200">Module Practice</div>
          <div className="mt-3 text-3xl font-semibold">SAT Mock Exams</div>
          <div className="mt-2 text-sm text-blue-100">Practice full-length modules with timed sections.</div>
        </header>

        {error ? <div className="text-sm text-red-600">{error}</div> : null}

        {canManage ? (
          <section className="rounded-2xl border bg-white p-5 shadow-sm">
            <div className="text-lg font-semibold">Create new mock exam</div>
            <div className="mt-3 grid gap-3 md:grid-cols-[2fr_3fr_auto] items-end">
              <label className="grid gap-1 text-sm">
                <span className="text-xs uppercase tracking-wide text-slate-400">Title</span>
                <input
                  className="rounded-xl border px-3 py-2 text-sm"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="SAT Mock Exam - February"
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-xs uppercase tracking-wide text-slate-400">Description</span>
                <input
                  className="rounded-xl border px-3 py-2 text-sm"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Timed practice across all modules"
                />
              </label>
              <button
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                onClick={createPractice}
                disabled={creating}
                type="button"
              >
                {creating ? "Creating..." : "Create"}
              </button>
            </div>
          </section>
        ) : null}

        <section className="grid gap-5 lg:grid-cols-2">
          {practices.map((p) => (
            <div key={p.id} className="rounded-2xl border bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs uppercase tracking-[0.3em] text-slate-400">Mock exam</div>
                  <div className="mt-2 text-xl font-semibold text-slate-900">{p.title}</div>
                  <div className="mt-1 text-sm text-slate-600">{p.description || "No description"}</div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  {p.locked ? (
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">Locked</span>
                  ) : (
                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">Unlocked</span>
                  )}
                  {p.results_published ? (
                    <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">Results live</span>
                  ) : (
                    <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">Results hidden</span>
                  )}
                </div>
              </div>

              <div className="mt-4 grid gap-2">
                {p.modules.map((m) => (
                  <div key={m.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm">
                    <div className="font-medium">{formatModuleLabel(m)}</div>
                    <div className="text-slate-500">
                      {m.question_count || 0} Q - {m.time_limit_minutes} min
                    </div>
                  </div>
                ))}
              </div>

              {p.attempt ? (
                <div className="mt-4 rounded-xl bg-slate-100 p-3 text-sm text-slate-600">
                  Latest attempt: {Math.round((p.attempt.score ?? 0) * 100)}% ({p.attempt.correct}/
                  {p.attempt.total})
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                  onClick={() => startPractice(p.id, p.locked)}
                  disabled={p.locked}
                  type="button"
                >
                  Start mock exam
                </button>
                {canManage ? (
                  <button
                    className="rounded-xl border px-3 py-2 text-sm"
                    onClick={() => setManageId(manageId === p.id ? null : p.id)}
                    type="button"
                  >
                    {manageId === p.id ? "Close" : "Manage"}
                  </button>
                ) : null}
              </div>

              {canManage && manageId === p.id ? (
                <div className="mt-5 space-y-4 border-t pt-4">
                  <div className="flex flex-wrap gap-3">
                    <button
                      className="rounded-lg border px-3 py-2 text-xs font-semibold"
                      type="button"
                      onClick={() => togglePractice(p.id, { results_published: !p.results_published })}
                    >
                      {p.results_published ? "Hide results" : "Publish results"}
                    </button>
                    <button
                      className="rounded-lg border px-3 py-2 text-xs font-semibold"
                      type="button"
                      onClick={() => togglePractice(p.id, { is_active: !p.is_active })}
                    >
                      {p.is_active ? "Disable access" : "Enable access"}
                    </button>
                  </div>

                  <div className="space-y-3">
                    {p.modules.map((m) => (
                      <ModuleEditor
                        key={m.id}
                        practiceId={p.id}
                        module={m}
                        onSave={saveModuleQuestions}
                      />
                    ))}
                  </div>

                  <div className="rounded-xl border bg-slate-50 p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Grant access
                    </div>
                    <div className="mt-2 grid gap-2 md:grid-cols-[1.2fr_1fr_auto]">
                      <input
                        className="rounded-lg border px-3 py-2 text-sm"
                        value={accessUser}
                        onChange={(e) => setAccessUser(e.target.value)}
                        placeholder="Student email or username"
                      />
                      <input
                        type="date"
                        className="rounded-lg border px-3 py-2 text-sm"
                        value={accessExpiry}
                        onChange={(e) => setAccessExpiry(e.target.value)}
                      />
                      <button
                        className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                        onClick={() => grantAccess(p.id)}
                        disabled={grantBusy}
                        type="button"
                      >
                        {grantBusy ? "Granting..." : "Grant"}
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}

function ModuleEditor({
  practiceId,
  module,
  onSave,
}: {
  practiceId: string;
  module: PracticeModule;
  onSave: (practiceId: string, module: PracticeModule, raw: string) => Promise<void>;
}) {
  const [value, setValue] = useState((module.question_ids || []).join("\n"));
  const [busy, setBusy] = useState(false);

  async function handleSave() {
    setBusy(true);
    try {
      await onSave(practiceId, module, value);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border p-3">
      <div className="text-sm font-semibold">{module.subject.toUpperCase()} module {module.module_index}</div>
      <div className="text-xs text-slate-500">
        {module.question_count} questions - {module.time_limit_minutes} minutes
      </div>
      <textarea
        className="mt-2 w-full rounded-lg border px-3 py-2 text-xs min-h-[120px]"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Paste question IDs, one per line"
      />
      <button
        className="mt-2 rounded-lg border px-3 py-2 text-xs font-semibold"
        onClick={handleSave}
        type="button"
        disabled={busy}
      >
        {busy ? "Saving..." : "Save module"}
      </button>
    </div>
  );
}
