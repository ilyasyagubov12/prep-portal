"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { typesetMath } from "@/lib/mathjax";

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
  required_count: number;
};

type PracticeAttempt = {
  id: string;
  status: string;
  module_scores?: Record<string, { correct: number; total: number }>;
  completed_at: string | null;
};

type ModuleQuestion = {
  id: string;
  subject: "math" | "verbal";
  topic_tag: string;
  question_text: string;
  passage?: string | null;
  choices?: { label: string; content: string; is_correct?: boolean }[];
  is_open_ended?: boolean | null;
  image_url?: string | null;
  difficulty?: string | null;
};

function MathContent({ html, className }: { html: string; className?: string }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    ref.current.innerHTML = html || "";
    typesetMath(ref.current);
  }, [html]);
  return <span ref={ref} className={className} />;
}

function wrapLatexIfNeeded(input: string) {
  const trimmed = input.trim();
  if (!trimmed) return "";
  const hasDelims = trimmed.includes("\\(") || trimmed.includes("\\[") || trimmed.includes("$$");
  return hasDelims ? trimmed : `\\(${trimmed}\\)`;
}

type Practice = {
  id: string;
  title: string;
  description: string | null;
  is_active: boolean;
  results_published: boolean;
  shuffle_questions?: boolean;
  shuffle_choices?: boolean;
  allow_retakes?: boolean;
  locked: boolean;
  access_expires_at: string | null;
  allowed_student_ids?: string[] | null;
  allowed_student_count?: number | null;
  modules: PracticeModule[];
  attempt?: PracticeAttempt | null;
};

type Student = {
  user_id: string;
  username: string;
  first_name?: string | null;
  last_name?: string | null;
  nickname?: string | null;
  student_id?: string | null;
  avatar?: string | null;
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

function getRequiredCount(m: PracticeModule) {
  return m.required_count || (m.subject === "math" ? 22 : 27);
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

  async function deletePractice(practiceId: string) {
    if (!accessToken) return;
    const ok = window.confirm("Delete this mock exam? This will remove modules, access, and attempts.");
    if (!ok) return;
    try {
      const res = await fetch(`${API_BASE}/api/module-practice/delete/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ practice_id: practiceId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to delete");
      await loadPractices(accessToken);
    } catch (e: any) {
      setError(e?.message ?? "Failed to delete");
    }
  }

  function startPractice(practiceId: string, locked: boolean) {
    if (locked) return;
    router.push(`/practice/modules/${practiceId}?exam=sat`);
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
          <div className="mt-2 text-sm text-blue-100">Practice full-length SAT modules with timed sections.</div>
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

        <section className="space-y-6">
          <ExamSection
            title="SAT Mock Exams"
            subtitle="Digital SAT-style full length modules."
            practices={practices}
            canManage={canManage}
            manageId={manageId}
            setManageId={setManageId}
            startPractice={startPractice}
            togglePractice={togglePractice}
            deletePractice={deletePractice}
            accessToken={accessToken}
            refresh={() => accessToken && loadPractices(accessToken)}
          />
        </section>
        
      </div>
    </div>
  );
}

function ExamSection({
  title,
  subtitle,
  practices,
  canManage,
  manageId,
  setManageId,
  startPractice,
  togglePractice,
  deletePractice,
  accessToken,
  refresh,
}: {
  title: string;
  subtitle: string;
  practices: Practice[];
  canManage: boolean;
  manageId: string | null;
  setManageId: (id: string | null) => void;
  startPractice: (practiceId: string, locked: boolean) => void;
  togglePractice: (practiceId: string, payload: Record<string, any>) => Promise<void>;
  deletePractice: (practiceId: string) => Promise<void>;
  accessToken: string | null;
  refresh: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-slate-400">{title}</div>
          <div className="mt-2 text-sm text-slate-600">{subtitle}</div>
        </div>
      </div>

      {practices.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-white px-5 py-6 text-sm text-slate-500">
          No mock exams yet.
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
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
                      {m.question_count || 0}/{getRequiredCount(m)} Q - {m.time_limit_minutes} min
                    </div>
                  </div>
                ))}
              </div>

              {p.attempt?.module_scores ? (
                <div className="mt-4 rounded-xl bg-slate-100 p-3 text-sm text-slate-600">
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Latest attempt</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {Object.entries(p.attempt.module_scores).map(([key, val]) => {
                      const [subject, idx] = key.split("-");
                      const label = subject ? `${subject.toUpperCase()} M${idx}` : key;
                      return (
                        <span
                          key={key}
                          className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700"
                        >
                          {label}: {val.correct}/{val.total}
                        </span>
                      );
                    })}
                  </div>
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
                    <button
                      className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700"
                      type="button"
                      onClick={() => deletePractice(p.id)}
                    >
                      Delete mock
                    </button>
                  </div>

                  <div className="rounded-xl border bg-slate-50 p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Settings</div>
                    <div className="mt-2 grid gap-2 text-xs text-slate-600">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={p.shuffle_questions ?? true}
                          onChange={() =>
                            togglePractice(p.id, { shuffle_questions: !(p.shuffle_questions ?? true) })
                          }
                        />
                        Shuffle questions
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={p.shuffle_choices ?? false}
                          onChange={() =>
                            togglePractice(p.id, { shuffle_choices: !(p.shuffle_choices ?? false) })
                          }
                        />
                        Shuffle answer choices
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={p.allow_retakes ?? true}
                          onChange={() => togglePractice(p.id, { allow_retakes: !(p.allow_retakes ?? true) })}
                        />
                        Allow retakes
                      </label>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {p.modules.map((m) => (
                      <ModuleEditor key={m.id} practiceId={p.id} module={m} token={accessToken} />
                    ))}
                  </div>

                  <PracticeAccessManager practice={p} token={accessToken} refresh={refresh} />
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PracticeAccessManager({
  practice,
  token,
  refresh,
}: {
  practice: Practice;
  token: string | null;
  refresh: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Student[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedDetails, setSelectedDetails] = useState<Student[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSelectedIds(practice.allowed_student_ids ?? []);
  }, [practice.allowed_student_ids]);

  useEffect(() => {
    if (!token) return;
    if (!selectedIds.length) {
      setSelectedDetails([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/module-practice/students/lookup/`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ student_ids: selectedIds }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "Failed to load students");
        if (!cancelled) setSelectedDetails(json.students ?? []);
      } catch {
        if (!cancelled) setSelectedDetails([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedIds, token]);

  async function searchStudents(showAll = false) {
    if (!token) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`${API_BASE}/api/module-practice/students/search/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          q: showAll ? "" : query.trim(),
          limit: 100,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to load students");
      setResults(json.students ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load students");
    } finally {
      setLoading(false);
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function saveAccess() {
    if (!token) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`${API_BASE}/api/module-practice/access/set/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ practice_id: practice.id, student_ids: selectedIds }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to save access");
      setMessage("Access saved.");
      refresh();
    } catch (e: any) {
      setError(e?.message ?? "Failed to save access");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Access control</div>
      <div className="mt-2 text-xs text-slate-500">
        Choose which students can take this practice test. If none are selected, all students can access it.
      </div>

      {error ? <div className="mt-2 text-xs text-red-600">{error}</div> : null}
      {message ? <div className="mt-2 text-xs text-emerald-600">{message}</div> : null}

      <div className="mt-3 flex flex-wrap gap-2 items-center">
        <input
          className="min-w-[220px] flex-1 rounded-lg border px-3 py-2 text-xs"
          placeholder="Search by name, username, or student ID"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          className="rounded-lg border px-3 py-2 text-xs font-semibold"
          type="button"
          onClick={() => searchStudents(false)}
          disabled={loading}
        >
          Search
        </button>
        <button
          className="rounded-lg border px-3 py-2 text-xs font-semibold"
          type="button"
          onClick={() => searchStudents(true)}
          disabled={loading}
        >
          Show all
        </button>
        <button
          className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white"
          type="button"
          onClick={saveAccess}
          disabled={loading}
        >
          Save access
        </button>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <div className="rounded-lg border bg-slate-50 p-3">
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Search results</div>
          <div className="mt-2 grid gap-2 max-h-[220px] overflow-y-auto">
            {results.length === 0 ? (
              <div className="text-xs text-slate-500">No students loaded.</div>
            ) : (
              results.map((s) => {
                const picked = selectedIds.includes(s.user_id);
                const name = s.nickname || `${s.first_name ?? ""} ${s.last_name ?? ""}`.trim() || s.username;
                return (
                  <button
                    key={s.user_id}
                    className={`rounded-lg border px-3 py-2 text-left text-xs ${
                      picked ? "border-blue-500 bg-blue-50" : "border-slate-200"
                    }`}
                    onClick={() => toggleSelect(s.user_id)}
                    type="button"
                  >
                    <div className="font-semibold text-slate-700">{name}</div>
                    <div className="text-[10px] text-slate-400">
                      {s.username} {s.student_id ? `· ${s.student_id}` : ""}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="rounded-lg border bg-slate-50 p-3">
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Selected</div>
          <div className="mt-2 grid gap-2 max-h-[220px] overflow-y-auto">
            {selectedIds.length === 0 ? (
              <div className="text-xs text-slate-500">No students selected.</div>
            ) : (
              selectedIds.map((id) => {
                const s = selectedDetails.find((r) => r.user_id === id) || results.find((r) => r.user_id === id);
                return (
                  <div key={id} className="rounded-lg border border-slate-200 px-3 py-2 text-xs">
                    <div className="font-semibold text-slate-700">
                      {s?.nickname || `${s?.first_name ?? ""} ${s?.last_name ?? ""}`.trim() || s?.username || id}
                    </div>
                    <button
                      className="mt-1 text-[10px] text-red-600"
                      type="button"
                      onClick={() => toggleSelect(id)}
                    >
                      Remove
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ModuleEditor({
  practiceId,
  module,
  token,
}: {
  practiceId: string;
  module: PracticeModule;
  token: string | null;
}) {
  const [moduleQuestions, setModuleQuestions] = useState<ModuleQuestion[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [activePreviewId, setActivePreviewId] = useState<string | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);

  const requiredCount = getRequiredCount(module);
  const remaining = Math.max(requiredCount - moduleQuestions.length, 0);
  const canStart = remaining === 0;
  const createQuestionUrl = `/practice/modules/${practiceId}/questions/new/${module.subject}?module=${module.module_index}`;
  const subjectLabel = formatModuleLabel(module);

  async function fetchQuestions(activeToken: string) {
    setLoadingQuestions(true);
    setErr(null);
    try {
      const params = new URLSearchParams();
      params.set("practice_id", practiceId);
      params.set("subject", module.subject);
      params.set("module_index", String(module.module_index));
      const res = await fetch(`${API_BASE}/api/module-practice/questions/list/?${params}`, {
        headers: { Authorization: `Bearer ${activeToken}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to load questions");
      setModuleQuestions(json.questions ?? []);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load questions");
    } finally {
      setLoadingQuestions(false);
    }
  }

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        if (!cancelled) await fetchQuestions(token);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message ?? "Failed to load questions");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [practiceId, module.subject, module.module_index, token]);

  const previewQuestion = useMemo(() => {
    if (!activePreviewId) return null;
    return moduleQuestions.find((q) => q.id === activePreviewId) ?? null;
  }, [activePreviewId, moduleQuestions]);

  function togglePreview(id: string) {
    setActivePreviewId((prev) => (prev === id ? null : id));
  }

  async function importCsv() {
    if (!token || !importFile) return;
    setImporting(true);
    setImportMessage(null);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append("file", importFile);
      fd.append("practice_id", practiceId);
      fd.append("subject", module.subject);
      fd.append("module_index", String(module.module_index));

      const res = await fetch(`${API_BASE}/api/module-practice/questions/import/`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Import failed");
      const created = json.created ?? 0;
      const errorCount = (json.errors || []).length;
      setImportMessage(`Imported ${created} question(s). ${errorCount ? `${errorCount} error(s).` : ""}`);
      setImportFile(null);
      await fetchQuestions(token);
    } catch (e: any) {
      setErr(e?.message ?? "Import failed");
    } finally {
      setImporting(false);
    }
  }

  async function deleteQuestion(questionId: string) {
    if (!token) return;
    const ok = window.confirm("Delete this question from the mock?");
    if (!ok) return;
    try {
      const res = await fetch(`${API_BASE}/api/module-practice/questions/delete/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ question_id: questionId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to delete");
      setModuleQuestions((prev) => prev.filter((q) => q.id !== questionId));
      if (activePreviewId === questionId) setActivePreviewId(null);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to delete");
    }
  }

  function QuestionPreview({ question }: { question: ModuleQuestion }) {
    const isMath = module.subject === "math";
    const imageUrl = question.image_url;
    const resolvedImageUrl =
      imageUrl && imageUrl.startsWith("/") ? `${API_BASE}${imageUrl}` : imageUrl;
    const stemHtml = (isMath ? wrapLatexIfNeeded(question.question_text || "") : question.question_text || "").replace(/\n/g, "<br/>");
    const passageHtml = (question.passage || "").replace(/\n/g, "<br/>");

    if (isMath) {
      return (
        <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <div className="space-y-4">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-sm font-semibold text-slate-900">Question stem</div>
              <div className="text-xs text-slate-500 mt-1">Math format with LaTeX support.</div>
              <div className="mt-3 text-sm font-semibold text-slate-900">
                <MathContent html={stemHtml} />
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-sm font-semibold text-slate-900">Answer choices</div>
              <div className="text-xs text-slate-500 mt-1">Mark one as correct.</div>
              {question.is_open_ended ? (
                <div className="mt-3 rounded-lg border border-dashed border-slate-200 px-3 py-2 text-xs text-slate-500">
                  Open-ended response
                </div>
              ) : (
                <div className="mt-3 space-y-2">
                  {(question.choices || []).map((c) => (
                    <div key={c.label} className="rounded-lg border border-slate-200 px-3 py-2 text-xs">
                      <span className="inline-flex items-center justify-center h-5 w-5 rounded-full border border-slate-300 text-[10px] font-semibold mr-2">
                        {c.label}
                      </span>
                      <MathContent html={wrapLatexIfNeeded(c.content || "").replace(/\n/g, "<br/>")} />
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
          <aside className="space-y-4">
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Question setup</div>
              <div className="mt-3 grid gap-2 text-sm text-slate-700">
                <div>
                  <div className="text-xs font-semibold text-slate-600">Topic</div>
                  <div className="mt-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                    {question.topic_tag || "-"}
                  </div>
                </div>
                {question.difficulty ? (
                  <div>
                    <div className="text-xs font-semibold text-slate-600">Difficulty</div>
                    <div className="mt-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs capitalize">
                      {question.difficulty}
                    </div>
                  </div>
                ) : null}
              </div>
            </section>
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-sm font-semibold text-slate-900">Image (optional)</div>
              <div className="text-xs text-slate-500 mt-1">Used for diagrams or graphs.</div>
              <div className="mt-3">
                {resolvedImageUrl ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={resolvedImageUrl} alt="question" className="w-full max-h-[220px] object-contain" />
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-slate-200 px-3 py-3 text-xs text-slate-500">
                    No image
                  </div>
                )}
              </div>
            </section>
          </aside>
        </div>
      );
    }

    return (
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-slate-900">Passage</div>
                <div className="text-xs text-slate-500">Optional reading text for this question.</div>
              </div>
            </div>
            <div className="mt-3 rounded-lg border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-700">
              {resolvedImageUrl ? (
                <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={resolvedImageUrl} alt="question" className="w-full max-h-[240px] object-contain" />
                </div>
              ) : null}
              {question.passage ? <span dangerouslySetInnerHTML={{ __html: passageHtml }} /> : "No passage."}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-sm font-semibold text-slate-900">Question stem</div>
            <div className="text-xs text-slate-500 mt-1">Required.</div>
            <div className="mt-3 text-sm font-semibold text-slate-900">
              <span dangerouslySetInnerHTML={{ __html: stemHtml }} />
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-sm font-semibold text-slate-900">Answer choices</div>
            <div className="text-xs text-slate-500 mt-1">Mark exactly one as correct.</div>
            {question.is_open_ended ? (
              <div className="mt-3 rounded-lg border border-dashed border-slate-200 px-3 py-2 text-xs text-slate-500">
                Open-ended response
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                {(question.choices || []).map((c) => (
                  <div key={c.label} className="rounded-lg border border-slate-200 px-3 py-2 text-xs">
                    <span className="inline-flex items-center justify-center h-5 w-5 rounded-full border border-slate-300 text-[10px] font-semibold mr-2">
                      {c.label}
                    </span>
                    <span dangerouslySetInnerHTML={{ __html: (c.content || "").replace(/\n/g, "<br/>") }} />
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
        <aside className="space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Question setup</div>
            <div className="mt-3 grid gap-2 text-sm text-slate-700">
              <div>
              <div className="text-xs font-semibold text-slate-600">Topic</div>
              <div className="mt-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                {question.topic_tag || "-"}
              </div>
            </div>
            {question.difficulty ? (
              <div>
                <div className="text-xs font-semibold text-slate-600">Difficulty</div>
                <div className="mt-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs capitalize">
                  {question.difficulty}
                </div>
              </div>
            ) : null}
          </div>
        </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-sm font-semibold text-slate-900">Image (optional)</div>
            <div className="text-xs text-slate-500 mt-1">Used for diagrams or graphs.</div>
            <div className="mt-3">
              {resolvedImageUrl ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={resolvedImageUrl} alt="question" className="w-full max-h-[220px] object-contain" />
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-slate-200 px-3 py-3 text-xs text-slate-500">
                  No image
                </div>
              )}
            </div>
          </section>
        </aside>
      </div>
    );
  }

  const countLabel = canStart ? "Ready" : `${remaining} remaining`;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Module</div>
          <div className="text-sm font-semibold text-slate-900">{subjectLabel}</div>
        </div>
        <div className="text-xs text-slate-500 text-right">
          {moduleQuestions.length}/{requiredCount} questions - {module.time_limit_minutes} min
          <div className={canStart ? "text-emerald-600" : "text-amber-600"}>{countLabel}</div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
          type="button"
          onClick={() => window.open(createQuestionUrl, "_blank")}
        >
          Create new {subjectLabel.toLowerCase()} question
        </button>
        <label className="rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2 text-[11px] font-semibold text-slate-600 cursor-pointer">
          Import CSV
          <input
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <button
          className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
          type="button"
          onClick={importCsv}
          disabled={!importFile || importing}
        >
          {importing ? "Importing..." : "Upload CSV"}
        </button>
        <div className="text-[11px] text-slate-500">
          CSV columns: subject, module, chapter, stem, passage, A, B, C, D, answer.
        </div>
      </div>
      {importFile ? (
        <div className="mt-2 text-[11px] text-slate-500">Selected file: {importFile.name}</div>
      ) : null}
      {importMessage ? <div className="mt-2 text-[11px] text-emerald-600">{importMessage}</div> : null}

      {err ? <div className="mt-3 text-xs text-red-600">{err}</div> : null}

      <div className="mt-4">
        <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Module questions</div>
        <div className="mt-2 grid gap-2">
          {loadingQuestions ? (
            <div className="rounded-lg border border-dashed border-slate-200 px-3 py-3 text-xs text-slate-500">
              Loading questions...
            </div>
          ) : moduleQuestions.length ? (
            moduleQuestions.map((q, idx) => (
              <div key={q.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">{q.topic_tag}</div>
                  <div className="flex items-center gap-2">
                    <button
                      className="text-[11px] font-semibold text-slate-600"
                      onClick={() => togglePreview(q.id)}
                    >
                      {activePreviewId === q.id ? "Hide" : "Preview"}
                    </button>
                    <button
                      className="text-[11px] font-semibold text-slate-600"
                      onClick={() => window.open(`/practice/modules/${practiceId}/questions/${q.id}/edit`, "_blank")}
                    >
                      Edit
                    </button>
                    <button
                      className="text-[11px] font-semibold text-red-600"
                      onClick={() => deleteQuestion(q.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <div className="mt-1 text-xs text-slate-700 line-clamp-2">{q.question_text}</div>
                <div className="mt-1 text-[10px] text-slate-400">#{idx + 1}</div>
              </div>
            ))
          ) : (
            <div className="rounded-lg border border-dashed border-slate-200 px-3 py-3 text-xs text-slate-500">
              No questions added yet.
            </div>
          )}
        </div>
      </div>

      <div className="mt-4">
        <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Preview</div>
        <div className="mt-2 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          {previewQuestion ? (
            <QuestionPreview question={previewQuestion} />
          ) : (
            <div className="text-xs text-slate-500">Select "Preview" on a question to view it here.</div>
          )}
        </div>
      </div>
    </div>
  );
}
