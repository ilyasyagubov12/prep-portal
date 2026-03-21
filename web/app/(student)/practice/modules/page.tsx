"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock, Unlock } from "lucide-react";
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
  status?: string;
  module_scores?: Record<string, { correct: number; total: number }>;
  completed_at: string | null;
  correct?: number | null;
  total?: number | null;
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
  const latexFlag = "$LATEX$";
  const hasDelims = (val: string) =>
    val.includes("\\(") || val.includes("\\[") || val.includes("$$") || /\$[^$]+\$/.test(val);
  if (trimmed.startsWith(latexFlag)) {
    const content = trimmed.slice(latexFlag.length).trim();
    if (!content) return "";
    return hasDelims(content) ? content : `\\(${content}\\)`;
  }
  if (hasDelims(trimmed)) return trimmed;
  return trimmed;
}

type Practice = {
  id: string;
  title: string;
  description: string | null;
  is_active: boolean;
  results_published: boolean;
  result_visibility_mode?: "hidden" | "all" | "selected" | null;
  can_view_results?: boolean;
  shuffle_questions?: boolean;
  shuffle_choices?: boolean;
  allow_retakes?: boolean;
  retake_limit?: number | null;
  locked: boolean;
  access_expires_at: string | null;
  allowed_student_ids?: string[] | null;
  allowed_student_count?: number | null;
  allowed_course_ids?: string[] | null;
  allowed_course_count?: number | null;
  result_visible_student_ids?: string[] | null;
  modules: PracticeModule[];
  attempt?: PracticeAttempt | null;
  attempts_count?: number | null;
};

type Student = {
  user_id: string;
  username: string;
  first_name?: string | null;
  last_name?: string | null;
  nickname?: string | null;
  student_id?: string | null;
  tag?: string | null;
  avatar?: string | null;
  attempts_count?: number | null;
  access_limit?: number | null;
  can_view_results?: boolean | null;
  courses?: { id: string; title: string }[] | null;
};

type Course = {
  id: string;
  title: string;
  slug?: string | null;
};

function isTeacherOrAdmin(p: Profile | null) {
  if (!p) return false;
  const role = (p.role || "").toLowerCase();
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
  const searchParams = useSearchParams();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [practices, setPractices] = useState<Practice[]>([]);
  const [attemptsByPractice, setAttemptsByPractice] = useState<Record<string, PracticeAttempt[]>>({});
  const [attemptsLoading, setAttemptsLoading] = useState<Record<string, boolean>>({});
  const [attemptsError, setAttemptsError] = useState<Record<string, string | null>>({});

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

  useEffect(() => {
    const nextManage = searchParams?.get("manage") || null;
    if (nextManage) {
      setManageId(nextManage);
      return;
    }
    setManageId(null);
  }, [searchParams]);

  async function loadPractices(token: string, opts?: { silent?: boolean }) {
    if (!opts?.silent) setLoading(true);
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
      if (!opts?.silent) setLoading(false);
    }
  }

  async function loadAttempts(practiceId: string) {
    if (!accessToken) return;
    if (attemptsLoading[practiceId] || attemptsByPractice[practiceId]) return;
    setAttemptsLoading((prev) => ({ ...prev, [practiceId]: true }));
    setAttemptsError((prev) => ({ ...prev, [practiceId]: null }));
    try {
      const res = await fetch(`${API_BASE}/api/module-practice/attempts/?practice_id=${practiceId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to load attempts");
      setAttemptsByPractice((prev) => ({ ...prev, [practiceId]: json.attempts ?? [] }));
    } catch (e: any) {
      setAttemptsError((prev) => ({ ...prev, [practiceId]: e?.message ?? "Failed to load attempts" }));
    } finally {
      setAttemptsLoading((prev) => ({ ...prev, [practiceId]: false }));
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
      await loadPractices(accessToken, { silent: true });
      const nextId = json.practice_id ?? null;
      if (nextId) {
        setManageId(nextId);
        router.push(`/practice/modules?manage=${nextId}`);
      }
    } catch (e: any) {
      setError(e?.message ?? "Failed to create practice");
    } finally {
      setCreating(false);
    }
  }

  function openManage(practiceId: string) {
    setManageId(practiceId);
    router.push(`/practice/modules?manage=${practiceId}`);
  }

  function closeManage() {
    setManageId(null);
    router.push("/practice/modules");
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
    await loadPractices(accessToken, { silent: true });
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
    await loadPractices(accessToken, { silent: true });
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
          <section className="rounded-3xl border border-slate-200/70 bg-white p-6 shadow-sm">
            <div className="text-lg font-semibold">Create new mock exam</div>
            <div className="mt-3 grid gap-3 md:grid-cols-[2fr_3fr_auto] items-end">
              <label className="grid gap-1 text-sm">
                <span className="text-xs uppercase tracking-wide text-slate-400">Title</span>
                <input
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="SAT Mock Exam - February"
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-xs uppercase tracking-wide text-slate-400">Description</span>
                <input
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Timed practice across all modules"
                />
              </label>
              <button
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
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
            refresh={() => accessToken && loadPractices(accessToken, { silent: true })}
            attemptsByPractice={attemptsByPractice}
            attemptsLoading={attemptsLoading}
            attemptsError={attemptsError}
            loadAttempts={loadAttempts}
            onReviewAttempt={(practiceId, attemptId, showScoreDetails) => {
              if (showScoreDetails) {
                router.push(`/score-report?source=practice&practice_id=${practiceId}&attempt_id=${attemptId}`);
                return;
              }
              router.push(`/practice/modules/${practiceId}?review_attempt=${attemptId}`);
            }}
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
  attemptsByPractice,
  attemptsLoading,
  attemptsError,
  loadAttempts,
  onReviewAttempt,
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
  attemptsByPractice: Record<string, PracticeAttempt[]>;
  attemptsLoading: Record<string, boolean>;
  attemptsError: Record<string, string | null>;
  loadAttempts: (practiceId: string) => void;
  onReviewAttempt: (practiceId: string, attemptId: string, showScoreDetails?: boolean) => void;
}) {
  const [attemptsOpen, setAttemptsOpen] = useState<Record<string, boolean>>({});
  const [activePanels, setActivePanels] = useState<
    Record<string, "results" | "access" | "builder" | null>
  >({});
  const openManage = (practiceId: string) => setManageId(practiceId);
  const closeManage = () => setManageId(null);

  useEffect(() => {
    if (!canManage || !manageId) return;
    setActivePanels((prev) => {
      if (prev[manageId]) return prev;
      return { ...prev, [manageId]: "results" };
    });
  }, [manageId, canManage]);

  useEffect(() => {
    if (!accessToken || practices.length === 0) return;
    practices.forEach((p) => {
      const canViewResults = canManage || !!p.can_view_results;
      if (!canViewResults) return;
      if (!attemptsByPractice[p.id] && !attemptsLoading[p.id]) {
        loadAttempts(p.id);
      }
    });
  }, [accessToken, practices, attemptsByPractice, attemptsLoading, loadAttempts, canManage]);

  function toggleAttempts(practiceId: string, canViewResults: boolean) {
    if (!canViewResults) return;
    const next = !attemptsOpen[practiceId];
    setAttemptsOpen((prev) => ({ ...prev, [practiceId]: next }));
    if (next && !attemptsByPractice[practiceId] && !attemptsLoading[practiceId]) {
      loadAttempts(practiceId);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-slate-400">{title}</div>
          <div className="mt-2 text-sm text-slate-600">{subtitle}</div>
        </div>
      </div>

      {practices.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-5 py-6 text-sm text-slate-500">
          No mock exams yet.
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {practices.map((p) => {
            const activePanel = activePanels[p.id] ?? null;
            const attemptsCount =
              attemptsByPractice[p.id]?.length ?? (typeof p.attempts_count === "number" ? p.attempts_count : 0);
            const canViewResults = canManage || !!p.can_view_results;
            const resultMode = p.result_visibility_mode ?? (p.results_published ? "all" : "hidden");
            return (
              <div
                key={p.id}
                className={`rounded-3xl border border-slate-200/70 bg-white p-6 shadow-sm transition-shadow hover:shadow-md ${
                  manageId === p.id ? "lg:col-span-2" : ""
                } ${p.locked ? "grayscale opacity-70" : ""}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-xs uppercase tracking-[0.3em] text-slate-400">Mock exam</div>
                    <div className="mt-2 text-xl font-semibold text-slate-900">{p.title}</div>
                    <div className="mt-1 text-sm text-slate-600">{p.description || "No description"}</div>

                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {p.locked ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
                        <Lock size={12} />
                        Locked
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                        <Unlock size={12} />
                        Unlocked
                      </span>
                    )}
                    {resultMode === "all" ? (
                      <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">Results live</span>
                    ) : resultMode === "selected" ? (
                      <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700">Results limited</span>
                    ) : (
                      <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">Results hidden</span>
                    )}
                  </div>
                </div>

              

              <div className="mt-5">
                <button
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${
                    canViewResults
                      ? "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                      : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                  }`}
                  type="button"
                  onClick={() => toggleAttempts(p.id, canViewResults)}
                  disabled={!canViewResults}
                >
                  {attemptsOpen[p.id] ? "Hide attempts" : "View my attempts"}
                  <span className="rounded-full bg-white px-2 py-0.5 text-[10px] text-slate-500">
                    {attemptsLoading[p.id] ? "…" : attemptsCount}
                  </span>
                </button>
                {attemptsOpen[p.id] ? (
                  <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
                    {!canManage && !canViewResults ? (
                      <div className="text-xs text-slate-500">Results are hidden for this test.</div>
                    ) : attemptsLoading[p.id] ? (
                      <div className="text-xs text-slate-500">Loading attempts...</div>
                    ) : attemptsError[p.id] ? (
                      <div className="text-xs text-red-600">{attemptsError[p.id]}</div>
                    ) : (attemptsByPractice[p.id] || []).length === 0 ? (
                      <div className="text-xs text-slate-500">No attempts yet.</div>
                    ) : (
                      <div className="space-y-3">
                        {(attemptsByPractice[p.id] || []).map((attempt, idx) => (
                          <div
                            key={attempt.id}
                            className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-xs font-semibold text-slate-700">
                                Attempt {idx + 1}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                {attempt.completed_at
                                  ? new Date(attempt.completed_at).toLocaleString()
                                  : "—"}
                              </div>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {canViewResults && attempt.module_scores
                                ? Object.entries(attempt.module_scores).map(([key, val]) => {
                                    const [subject, mod] = key.split("-");
                                    const label = subject ? `${subject.toUpperCase()} M${mod}` : key;
                                    const moduleTotal =
                                      p.modules.find(
                                        (m) =>
                                          m.subject === subject &&
                                          String(m.module_index) === String(mod)
                                      ) || null;
                                    const total = moduleTotal ? getRequiredCount(moduleTotal) : val.total;
                                    return (
                                      <span
                                        key={key}
                                        className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-700"
                                      >
                                        {label}: {val.correct}/{total}
                                      </span>
                                    );
                                  })
                                : null}
                              {canViewResults &&
                              typeof attempt.correct === "number" &&
                              typeof attempt.total === "number" ? (
                                <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-700">
                                  Total: {attempt.correct}/{attempt.total}
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <button
                                className="rounded-full border border-slate-900 px-3 py-1 text-[11px] font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-60"
                                type="button"
                                disabled={!canViewResults}
                                onClick={() => onReviewAttempt(p.id, attempt.id)}
                              >
                                {canViewResults ? "Review attempt" : "Results hidden"}
                              </button>
                              <button
                                className="rounded-full border px-3 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                                type="button"
                                disabled={!canViewResults}
                                onClick={() => onReviewAttempt(p.id, attempt.id, true)}
                              >
                                {canViewResults ? "View score report" : "Results hidden"}
                              </button>
                            </div>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>

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
                  <div className="flex flex-wrap gap-2">
                    <button
                      className={`rounded-xl border px-3 py-2 text-sm ${
                        activePanel === "results" ? "bg-slate-100" : ""
                      }`}
                      onClick={() => {
                        if (activePanel === "results") {
                          setActivePanels((prev) => ({ ...prev, [p.id]: null }));
                          closeManage();
                          return;
                        }
                        setActivePanels((prev) => ({ ...prev, [p.id]: "results" }));
                        if (manageId !== p.id) openManage(p.id);
                      }}
                      type="button"
                    >
                      Results overview
                    </button>
                    <button
                      className={`rounded-xl border px-3 py-2 text-sm ${
                        activePanel === "access" ? "bg-slate-100" : ""
                      }`}
                      onClick={() => {
                        if (activePanel === "access") {
                          setActivePanels((prev) => ({ ...prev, [p.id]: null }));
                          closeManage();
                          return;
                        }
                        setActivePanels((prev) => ({ ...prev, [p.id]: "access" }));
                        if (manageId !== p.id) openManage(p.id);
                      }}
                      type="button"
                    >
                      Access control
                    </button>
                    <button
                      className={`rounded-xl border px-3 py-2 text-sm ${
                        activePanel === "builder" ? "bg-slate-100" : ""
                      }`}
                      onClick={() => {
                        if (activePanel === "builder") {
                          setActivePanels((prev) => ({ ...prev, [p.id]: null }));
                          closeManage();
                          return;
                        }
                        setActivePanels((prev) => ({ ...prev, [p.id]: "builder" }));
                        if (manageId !== p.id) openManage(p.id);
                      }}
                      type="button"
                    >
                      Question builder
                    </button>
                  </div>
                ) : null}
              </div>

              {canManage && manageId === p.id && activePanel === "results" ? (
                <div className="mt-5 space-y-4 border-t pt-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                    Results overview
                  </div>
                  <PracticeResultsPanel
                    practice={p}
                    token={accessToken}
                    onReviewAttempt={(attemptId, showScoreDetails) => onReviewAttempt(p.id, attemptId, showScoreDetails)}
                    modules={p.modules}
                    refresh={refresh}
                  />
                </div>
              ) : null}

              {canManage && manageId === p.id && activePanel === "access" ? (
                <div className="mt-5 space-y-4 border-t pt-4">
                  <PracticeResultVisibilityManager practice={p} token={accessToken} refresh={refresh} />
                  <div className="flex flex-wrap items-center gap-6">
                    <ToggleSwitch
                      checked={!!p.is_active}
                      onChange={() => togglePractice(p.id, { is_active: !p.is_active })}
                      label="Access"
                      onLabel="Enabled"
                      offLabel="Disabled"
                    />
                    <button
                      className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700"
                      type="button"
                      onClick={() => deletePractice(p.id)}
                    >
                      Delete mock
                    </button>
                  </div>
                  <PracticeAccessManager
                    practice={p}
                    token={accessToken}
                    refresh={refresh}
                    onUpdatePractice={togglePractice}
                  />
                </div>
              ) : null}

              {canManage && manageId === p.id && activePanel === "builder" ? (
                <div className="mt-5 space-y-4 border-t pt-4">
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
                    </div>
                  </div>

                  <div className="space-y-3">
                    {p.modules.map((m) => (
                      <ModuleEditor key={m.id} practiceId={p.id} module={m} token={accessToken} />
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
        </div>
      )}
    </div>
  );
}

function PracticeAccessManager({
  practice,
  token,
  refresh,
  onUpdatePractice,
}: {
  practice: Practice;
  token: string | null;
  refresh: () => void;
  onUpdatePractice: (practiceId: string, payload: Record<string, any>) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Student[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedDetails, setSelectedDetails] = useState<Student[]>([]);
  const [limitOverrides, setLimitOverrides] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [allowRetakesDraft, setAllowRetakesDraft] = useState(practice.allow_retakes ?? true);
  const [retakeValue, setRetakeValue] = useState((practice.retake_limit ?? "").toString());
  const [savingRetakes, setSavingRetakes] = useState(false);
  const [studentFilterCourseId, setStudentFilterCourseId] = useState("");
  const [studentFilterTag, setStudentFilterTag] = useState("");
  const [selectedFilterCourseId, setSelectedFilterCourseId] = useState("");
  const [selectedFilterTag, setSelectedFilterTag] = useState("");

  useEffect(() => {
    setSelectedIds(practice.allowed_student_ids ?? []);
  }, [practice.allowed_student_ids]);

  useEffect(() => {
    setAllowRetakesDraft(practice.allow_retakes ?? true);
  }, [practice.allow_retakes]);

  useEffect(() => {
    setRetakeValue((practice.retake_limit ?? "").toString());
  }, [practice.retake_limit]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/courses/`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) throw new Error(json?.error || "Failed to load courses");
        const list = Array.isArray(json) ? json : json?.courses || [];
        if (!cancelled) setCourses(list);
      } catch {
        if (!cancelled) setCourses([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

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
          body: JSON.stringify({ student_ids: selectedIds, practice_id: practice.id }),
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

  useEffect(() => {
    setLimitOverrides((prev) => {
      const next: Record<string, string> = { ...prev };
      // remove unselected
      Object.keys(next).forEach((id) => {
        if (!selectedIds.includes(id)) delete next[id];
      });
      // add defaults for newly selected
      for (const id of selectedIds) {
        if (next[id] !== undefined) continue;
        const s = selectedDetails.find((r) => r.user_id === id) || results.find((r) => r.user_id === id);
        if (s?.access_limit != null) {
          next[id] = String(s.access_limit);
        } else {
          next[id] = "";
        }
      }
      return next;
    });
  }, [selectedIds, selectedDetails, results]);

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
          tag: studentFilterTag,
          course_id: studentFilterCourseId,
          limit: 100,
          practice_id: practice.id,
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

  const availableTags = useMemo(() => {
    const tags = new Set<string>();
    [...results, ...selectedDetails].forEach((student) => {
      const tag = (student.tag || "").trim();
      if (tag) tags.add(tag);
    });
    return Array.from(tags).sort((a, b) => a.localeCompare(b));
  }, [results, selectedDetails]);

  const filteredResults = useMemo(() => {
    return results.filter((student) => {
      if (studentFilterTag && (student.tag || "") !== studentFilterTag) return false;
      if (studentFilterCourseId && !(student.courses || []).some((course) => course.id === studentFilterCourseId)) {
        return false;
      }
      return true;
    });
  }, [results, studentFilterCourseId, studentFilterTag]);

  const filteredSelectedIds = useMemo(() => {
    return selectedIds.filter((id) => {
      const student = selectedDetails.find((detail) => detail.user_id === id) || results.find((detail) => detail.user_id === id);
      if (!student) return true;
      if (selectedFilterTag && (student.tag || "") !== selectedFilterTag) return false;
      if (selectedFilterCourseId && !(student.courses || []).some((course) => course.id === selectedFilterCourseId)) {
        return false;
      }
      return true;
    });
  }, [selectedIds, selectedDetails, results, selectedFilterCourseId, selectedFilterTag]);

  const selectedStudentCount = selectedIds.length;
  const accessModeLabel =
    selectedStudentCount === 0 ? "Open to all students" : `Restricted to ${selectedStudentCount} student${selectedStudentCount === 1 ? "" : "s"}`;

  function buildStudentLimits() {
    const student_limits: Record<string, number | null> = {};
    selectedIds.forEach((id) => {
      const raw = limitOverrides[id];
      if (!raw) {
        student_limits[id] = null;
        return;
      }
      const num = Number(raw);
      student_limits[id] = Number.isNaN(num) ? null : Math.max(1, num);
    });
    return student_limits;
  }

  async function saveAccess(successMessage = "Access saved.") {
    if (!token) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const student_limits = buildStudentLimits();
      const res = await fetch(`${API_BASE}/api/module-practice/access/set/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          practice_id: practice.id,
          student_ids: selectedIds,
          student_limits,
          course_ids: [],
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to save access");
      setMessage(successMessage);
      refresh();
    } catch (e: any) {
      setError(e?.message ?? "Failed to save access");
    } finally {
      setLoading(false);
    }
  }

  async function saveSingleStudentLimit(studentId: string) {
    await saveAccess(`Attempt limit updated for ${studentId}.`);
  }

  async function saveRetakeSettings() {
    setSavingRetakes(true);
    setError(null);
    setMessage(null);
    try {
      const payload: Record<string, any> = { allow_retakes: allowRetakesDraft };
      if (allowRetakesDraft) {
        if (!retakeValue) {
          payload.retake_limit = null;
        } else {
          const nextVal = Number(retakeValue);
          payload.retake_limit = Number.isNaN(nextVal) ? null : Math.max(1, nextVal);
        }
      } else {
        payload.retake_limit = null;
      }
      await onUpdatePractice(practice.id, payload);
      setMessage("Retake settings saved.");
    } catch (e: any) {
      setError(e?.message ?? "Failed to save retake settings");
    } finally {
      setSavingRetakes(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px_340px]">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Access control</div>
          <div className="mt-2 text-xs text-slate-500">
            Choose which students can take this practice test. If none are selected, all students can access it.
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-right">
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Current mode</div>
          <div className="mt-1 text-sm font-semibold text-slate-800">{accessModeLabel}</div>
          <div className="mt-2 flex flex-wrap justify-end gap-2 text-[11px]">
            <span className="rounded-full bg-white px-2.5 py-1 text-slate-600">{selectedStudentCount} students</span>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Retake settings</div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
              <input
                type="checkbox"
                checked={allowRetakesDraft}
                onChange={() => setAllowRetakesDraft((prev) => !prev)}
              />
              Allow retakes
            </label>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
              <span>Retake limit</span>
              <input
                type="number"
                min={1}
                placeholder="Unlimited"
                className="w-28 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs"
                value={retakeValue}
                onChange={(e) => setRetakeValue(e.target.value)}
                disabled={!allowRetakesDraft}
              />
              <span className="text-[10px] text-slate-400">Total attempts allowed</span>
            </div>
            <button
              className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              type="button"
              onClick={saveRetakeSettings}
              disabled={savingRetakes}
            >
              Save retake settings
            </button>
          </div>
        </div>
      </div>

      {error ? <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">{error}</div> : null}
      {message ? <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{message}</div> : null}

      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Student access</div>
            <div className="mt-1 text-xs text-slate-500">Search students and add them directly to this exam.</div>
          </div>
          {selectedStudentCount > 0 ? (
            <button
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              type="button"
              onClick={() => setSelectedIds([])}
            >
              Clear students
            </button>
          ) : null}
        </div>

        <div className="mt-3 flex flex-wrap gap-2 items-center">
          <input
            className="min-w-[240px] flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs"
            placeholder="Search by name, username, or student ID"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                searchStudents(false);
              }
            }}
          />
          <select
            className="min-w-[180px] rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs"
            value={studentFilterCourseId}
            onChange={(e) => setStudentFilterCourseId(e.target.value)}
          >
            <option value="">All courses</option>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.title}
              </option>
            ))}
          </select>
          <select
            className="min-w-[160px] rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs"
            value={studentFilterTag}
            onChange={(e) => setStudentFilterTag(e.target.value)}
          >
            <option value="">All tags</option>
            {availableTags.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
          <button
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            type="button"
            onClick={() => searchStudents(false)}
            disabled={loading}
          >
            Search
          </button>
          <button
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            type="button"
            onClick={() => searchStudents(true)}
            disabled={loading}
          >
            Show all
          </button>
          <button
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            type="button"
            onClick={() => {
              setQuery("");
              setStudentFilterCourseId("");
              setStudentFilterTag("");
              searchStudents(true);
            }}
            disabled={loading}
          >
            Reset filters
          </button>
          <button
            className="rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            type="button"
            onClick={() => saveAccess()}
            disabled={loading}
          >
            Save access
          </button>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[1.2fr_1fr]">
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Search results</div>
              <div className="rounded-full bg-slate-100 px-2 py-1 text-[10px] text-slate-500">{filteredResults.length} shown</div>
            </div>
            <div className="mt-2 grid gap-2 max-h-[260px] overflow-y-auto">
              {filteredResults.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-500">
                  No students loaded.
                </div>
              ) : (
                filteredResults.map((s) => {
                  const picked = selectedIds.includes(s.user_id);
                  const name = s.nickname || `${s.first_name ?? ""} ${s.last_name ?? ""}`.trim() || s.username;
                  const attempts = s.attempts_count ?? 0;
                  const accessLimit = s.access_limit;
                  return (
                    <button
                      key={s.user_id}
                      className={`rounded-xl border px-3 py-3 text-left text-xs transition ${
                        picked
                          ? "border-blue-500 bg-blue-50 shadow-sm"
                          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                      }`}
                      onClick={() => toggleSelect(s.user_id)}
                      type="button"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold text-slate-700">{name}</div>
                          <div className="mt-0.5 text-[10px] text-slate-400">
                            {s.username} {s.student_id ? `· ${s.student_id}` : ""}
                          </div>
                        </div>
                        <span
                          className={`rounded-full px-2 py-1 text-[10px] font-semibold ${
                            picked ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {picked ? "Selected" : "Add"}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-slate-500">
                        <span className="rounded-full bg-slate-100 px-2 py-1">Attempts: {attempts}</span>
                        <span className="rounded-full bg-slate-100 px-2 py-1">
                          Limit: {accessLimit != null ? accessLimit : "Default"}
                        </span>
                        {s.tag ? <span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">Tag: {s.tag}</span> : null}
                        {(s.courses || []).slice(0, 1).map((course) => (
                          <span key={`${s.user_id}-${course.id}`} className="rounded-full bg-blue-50 px-2 py-1 text-blue-700">
                            {course.title}
                          </span>
                        ))}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Selected students</div>
              <div className="rounded-full bg-slate-100 px-2 py-1 text-[10px] text-slate-500">{filteredSelectedIds.length} shown</div>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <select
                className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs"
                value={selectedFilterCourseId}
                onChange={(e) => setSelectedFilterCourseId(e.target.value)}
              >
                <option value="">All selected courses</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.title}
                  </option>
                ))}
              </select>
              <select
                className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs"
                value={selectedFilterTag}
                onChange={(e) => setSelectedFilterTag(e.target.value)}
              >
                <option value="">All selected tags</option>
                {availableTags.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-2 grid gap-2 max-h-[260px] overflow-y-auto">
              {filteredSelectedIds.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-500">
                  No selected students match the current filters.
                </div>
              ) : (
                filteredSelectedIds.map((id) => {
                  const s = selectedDetails.find((r) => r.user_id === id) || results.find((r) => r.user_id === id);
                  const attempts = s?.attempts_count ?? 0;
                  return (
                    <div key={id} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold text-slate-700">
                            {s?.nickname || `${s?.first_name ?? ""} ${s?.last_name ?? ""}`.trim() || s?.username || id}
                          </div>
                          <div className="mt-1 text-[10px] text-slate-500">Attempts: {attempts}</div>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {s?.tag ? (
                              <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
                                {s.tag}
                              </span>
                            ) : null}
                            {(s?.courses || []).slice(0, 2).map((course) => (
                              <span
                                key={`${id}-${course.id}`}
                                className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-700 ring-1 ring-blue-200"
                              >
                                {course.title}
                              </span>
                            ))}
                          </div>
                        </div>
                        <button
                          className="rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-[10px] font-semibold text-red-600 hover:bg-red-50"
                          type="button"
                          onClick={() => toggleSelect(id)}
                        >
                          Remove
                        </button>
                      </div>
                      <div className="mt-3 flex items-center gap-2 text-[10px] text-slate-500">
                        <span className="font-semibold text-slate-600">Attempt limit</span>
                        <input
                          type="number"
                          min={1}
                          placeholder="Default"
                          className="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px]"
                          value={limitOverrides[id] ?? ""}
                          onChange={(e) => setLimitOverrides((prev) => ({ ...prev, [id]: e.target.value }))}
                        />
                        <span className="text-slate-400">Leave blank to use default</span>
                      </div>
                      <div className="mt-3 flex justify-end">
                        <button
                          className="rounded-lg bg-blue-600 px-3 py-1.5 text-[10px] font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                          type="button"
                          onClick={() => saveSingleStudentLimit(id)}
                          disabled={loading}
                        >
                          Set limit
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>


    </div>
  );

}

function PracticeResultsPanel({
  practice,
  token,
  onReviewAttempt,
  modules,
  refresh,
}: {
  practice: Practice;
  token: string | null;
  onReviewAttempt: (attemptId: string, showScoreDetails?: boolean) => void;
  modules: PracticeModule[];
  refresh: () => void;
}) {
  const practiceId = practice.id;
  const [query, setQuery] = useState("");
  const [students, setStudents] = useState<Student[]>([]);
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attemptsByStudent, setAttemptsByStudent] = useState<Record<string, PracticeAttempt[]>>({});
  const [attemptsLoading, setAttemptsLoading] = useState<Record<string, boolean>>({});
  const [attemptsError, setAttemptsError] = useState<Record<string, string | null>>({});
  const [openStudentId, setOpenStudentId] = useState<string | null>(null);
  const [courseOptions, setCourseOptions] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [selectedTag, setSelectedTag] = useState("");
  const [savingVisibilityFor, setSavingVisibilityFor] = useState<string | null>(null);
  const [localResultMode, setLocalResultMode] = useState<"hidden" | "all" | "selected">(
    practice.result_visibility_mode ?? (practice.results_published ? "all" : "hidden")
  );
  const [localVisibleIds, setLocalVisibleIds] = useState<string[]>(practice.result_visible_student_ids ?? []);

  const displayName = (s: Student) => {
    if (s.nickname) return s.nickname;
    if (s.first_name || s.last_name) return `${s.first_name ?? ""} ${s.last_name ?? ""}`.trim();
    if (s.username) return s.username;
    return s.student_id || s.user_id;
  };

  useEffect(() => {
    setLocalResultMode(practice.result_visibility_mode ?? (practice.results_published ? "all" : "hidden"));
  }, [practice.result_visibility_mode, practice.results_published]);

  useEffect(() => {
    setLocalVisibleIds(practice.result_visible_student_ids ?? []);
  }, [practice.result_visible_student_ids]);

  async function searchStudents(
    showAll = false,
    captureAll = false,
    overrides?: { query?: string; courseId?: string; tag?: string }
  ) {
    if (!token) return;
    setLoading(true);
    setError(null);
    const activeQuery = overrides?.query ?? query;
    const activeCourseId = overrides?.courseId ?? selectedCourseId;
    const activeTag = overrides?.tag ?? selectedTag;
    try {
      const res = await fetch(`${API_BASE}/api/module-practice/students/search/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          q: showAll ? "" : activeQuery,
          tag: activeTag,
          course_id: activeCourseId,
          limit: captureAll ? 200 : 50,
          practice_id: practiceId,
          accessible_only: true,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to load students");
      const nextStudents = json.students ?? [];
      if (captureAll) {
        setAllStudents(nextStudents);
      } else {
        setStudents(nextStudents);
      }
    } catch (e: any) {
      setError(e?.message ?? "Failed to load students");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!token) return;
    searchStudents(true);
    searchStudents(true, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [practiceId, token]);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/courses/`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "Failed to load courses");
        const list = Array.isArray(json) ? json : json?.courses || [];
        setCourseOptions(list);
      } catch {
        setCourseOptions([]);
      }
    })();
  }, [token]);

  const tagOptions = useMemo(() => {
    const tags = new Set<string>();
    for (const student of allStudents) {
      const tag = (student.tag || "").trim();
      if (tag) tags.add(tag);
    }
    return Array.from(tags).sort((a, b) => a.localeCompare(b));
  }, [allStudents]);

  async function loadStudentAttempts(studentId: string) {
    if (!token) return;
    setAttemptsLoading((prev) => ({ ...prev, [studentId]: true }));
    setAttemptsError((prev) => ({ ...prev, [studentId]: null }));
    try {
      const res = await fetch(
        `${API_BASE}/api/module-practice/attempts/?practice_id=${practiceId}&student_id=${studentId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to load attempts");
      setAttemptsByStudent((prev) => ({ ...prev, [studentId]: json.attempts ?? [] }));
    } catch (e: any) {
      setAttemptsError((prev) => ({ ...prev, [studentId]: e?.message ?? "Failed to load attempts" }));
    } finally {
      setAttemptsLoading((prev) => ({ ...prev, [studentId]: false }));
    }
  }

  function toggleStudent(studentId: string) {
    const next = openStudentId === studentId ? null : studentId;
    setOpenStudentId(next);
    if (next && !attemptsByStudent[studentId] && !attemptsLoading[studentId]) {
      loadStudentAttempts(studentId);
    }
  }

  async function toggleStudentResultVisibility(studentId: string) {
    if (!token || localResultMode === "all") return;
    const currentlyVisible = localVisibleIds.includes(studentId);
    const nextIds = currentlyVisible
      ? localVisibleIds.filter((id) => id !== studentId)
      : [...localVisibleIds, studentId];
    setSavingVisibilityFor(studentId);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/module-practice/results/set/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          practice_id: practiceId,
          result_visibility_mode: "selected",
          student_ids: nextIds,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to update result visibility");
      setLocalResultMode("selected");
      setLocalVisibleIds(nextIds);
      setStudents((prev) =>
        prev.map((student) =>
          student.user_id === studentId ? { ...student, can_view_results: !currentlyVisible } : student
        )
      );
      setAllStudents((prev) =>
        prev.map((student) =>
          student.user_id === studentId ? { ...student, can_view_results: !currentlyVisible } : student
        )
      );
      refresh();
    } catch (e: any) {
      setError(e?.message ?? "Failed to update result visibility");
    } finally {
      setSavingVisibilityFor(null);
    }
  }

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="text-sm font-semibold text-slate-900">Student results</div>
      <p className="mt-1 text-xs text-slate-500">Search students and review their submitted attempts.</p>

      <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
        <div className="grid gap-2 lg:grid-cols-[minmax(0,1.8fr)_220px_220px_auto_auto]">
          <input
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
            placeholder="Search by name, username, or student ID"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
            value={selectedCourseId}
            onChange={(e) => setSelectedCourseId(e.target.value)}
          >
            <option value="">All courses</option>
            {courseOptions.map((course) => (
              <option key={course.id} value={course.id}>
                {course.title}
              </option>
            ))}
          </select>
          <select
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
            value={selectedTag}
            onChange={(e) => setSelectedTag(e.target.value)}
          >
            <option value="">All tags</option>
            {tagOptions.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
          <button
            className="rounded-xl border border-slate-900 bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white"
            type="button"
            onClick={() => searchStudents(false)}
            disabled={loading}
          >
            Search
          </button>
          <button
            className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700"
            type="button"
            onClick={() => {
              setQuery("");
              setSelectedCourseId("");
              setSelectedTag("");
              setOpenStudentId(null);
              searchStudents(true, false, { query: "", courseId: "", tag: "" });
            }}
            disabled={loading}
          >
            Reset
          </button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
          <span className="rounded-full bg-white px-3 py-1 ring-1 ring-slate-200">
            Showing {students.length} student{students.length === 1 ? "" : "s"}
          </span>
          {selectedCourseId ? (
            <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-700 ring-1 ring-blue-200">
              Course: {courseOptions.find((course) => course.id === selectedCourseId)?.title || "Selected"}
            </span>
          ) : null}
          {selectedTag ? (
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700 ring-1 ring-emerald-200">
              Tag: {selectedTag}
            </span>
          ) : null}
        </div>
      </div>

      {error ? <div className="mt-2 text-xs text-red-600">{error}</div> : null}

      <div className="mt-3 space-y-3">
        {loading ? (
          <div className="text-xs text-slate-500">Loading students...</div>
        ) : students.length === 0 ? (
          <div className="rounded-xl border border-dashed px-4 py-4 text-xs text-slate-500">
            No students loaded.
          </div>
        ) : (
          students.map((s) => (
            <div key={s.user_id} className="rounded-xl border border-slate-200 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-slate-900">{displayName(s)}</div>
                  <div className="text-xs text-slate-500">
                    {s.username || s.student_id || s.user_id}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {s.tag ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
                        {s.tag}
                      </span>
                    ) : null}
                    {(s.courses || []).slice(0, 2).map((course) => (
                      <span
                        key={`${s.user_id}-${course.id}`}
                        className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-700 ring-1 ring-blue-200"
                      >
                        {course.title}
                      </span>
                    ))}
                    {(s.courses || []).length > 2 ? (
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600 ring-1 ring-slate-200">
                        +{(s.courses || []).length - 2} more
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <span className="rounded-full bg-slate-100 px-3 py-1">
                    Attempts: {s.attempts_count ?? 0}
                  </span>
                  <button
                    className={`rounded-lg px-3 py-1 text-xs font-semibold disabled:opacity-60 ${
                      localResultMode === "all"
                        ? "cursor-not-allowed border border-emerald-200 bg-emerald-50 text-emerald-700"
                        : localVisibleIds.includes(s.user_id)
                        ? "border border-amber-300 bg-amber-50 text-amber-700"
                        : "border border-emerald-300 bg-emerald-50 text-emerald-700"
                    }`}
                    type="button"
                    disabled={localResultMode === "all" || savingVisibilityFor === s.user_id}
                    onClick={() => toggleStudentResultVisibility(s.user_id)}
                    title={
                      localResultMode === "all"
                        ? "Results are visible to all students"
                        : localVisibleIds.includes(s.user_id)
                        ? "Unpublish this student's result"
                        : "Publish this student's result"
                    }
                  >
                    {localResultMode === "all"
                      ? "Visible to all"
                      : savingVisibilityFor === s.user_id
                      ? "Saving..."
                      : localVisibleIds.includes(s.user_id)
                      ? "Unpublish result"
                      : "Publish result"}
                  </button>
                  <button
                    className="rounded-lg border px-3 py-1 text-xs font-semibold"
                    type="button"
                    onClick={() => toggleStudent(s.user_id)}
                  >
                    {openStudentId === s.user_id ? "Hide attempts" : "View attempts"}
                  </button>
                </div>
              </div>

              {openStudentId === s.user_id ? (
                <div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs">
                  {attemptsLoading[s.user_id] ? (
                    <div className="text-slate-500">Loading attempts...</div>
                  ) : attemptsError[s.user_id] ? (
                    <div className="text-red-600">{attemptsError[s.user_id]}</div>
                  ) : (attemptsByStudent[s.user_id] || []).length === 0 ? (
                    <div className="text-slate-500">No attempts yet.</div>
                  ) : (
                    <div className="space-y-2">
                      {(attemptsByStudent[s.user_id] || []).map((attempt, idx) => (
                        <div key={attempt.id} className="rounded-md border bg-white px-3 py-2">
                          <div className="flex items-center justify-between">
                            <div className="text-[11px] font-semibold text-slate-700">Attempt {idx + 1}</div>
                            <div className="text-[11px] text-slate-500">
                              {attempt.completed_at
                                ? new Date(attempt.completed_at).toLocaleString()
                                : "—"}
                            </div>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {attempt.module_scores
                              ? Object.entries(attempt.module_scores).map(([key, val]) => {
                                  const [subject, mod] = key.split("-");
                                  const label = subject ? `${subject.toUpperCase()} M${mod}` : key;
                                  const moduleTotal =
                                    modules.find(
                                      (m) =>
                                        m.subject === subject &&
                                        String(m.module_index) === String(mod)
                                    ) || null;
                                  const total = moduleTotal ? getRequiredCount(moduleTotal) : val.total;
                                  return (
                                    <span
                                      key={key}
                                      className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-700"
                                    >
                                      {label}: {val.correct}/{total}
                                    </span>
                                  );
                                })
                              : null}
                            {typeof attempt.correct === "number" && typeof attempt.total === "number" ? (
                              <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-700">
                                Total: {attempt.correct}/{attempt.total}
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <button
                              className="rounded-md border border-slate-900 px-3 py-1 text-[11px] font-semibold text-slate-900"
                              type="button"
                              onClick={() => onReviewAttempt(attempt.id)}
                            >
                              Review attempt
                            </button>
                            <button
                              className="rounded-md border border-slate-900 px-3 py-1 text-[11px] font-semibold text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                              type="button"
                              onClick={() => onReviewAttempt(attempt.id, true)}
                            >
                              View score report
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ToggleSwitch({
  checked,
  onChange,
  label,
  onLabel,
  offLabel,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  onLabel?: string;
  offLabel?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="text-xs font-semibold text-slate-700">{label}</div>
      <button
        type="button"
        onClick={onChange}
        aria-pressed={checked}
        className={`flex h-[26px] w-[52px] items-center rounded-full border p-[2px] transition ${
          checked ? "border-sky-500 bg-sky-500 justify-end" : "border-slate-300 bg-slate-400 justify-start"
        }`}
      >
        <span className="h-[22px] w-[22px] rounded-full bg-white shadow-sm transition" />
      </button>
      <div className="text-[12px] font-medium text-slate-500">
        {checked ? onLabel : offLabel}
      </div>
    </div>
  );
}

function PracticeResultVisibilityManager({
  practice,
  token,
  refresh,
}: {
  practice: Practice;
  token: string | null;
  refresh: () => void;
}) {
  const [mode, setMode] = useState<"hidden" | "all" | "selected">(
    practice.result_visibility_mode ?? (practice.results_published ? "all" : "hidden")
  );
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Student[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>(practice.result_visible_student_ids ?? []);
  const [selectedDetails, setSelectedDetails] = useState<Student[]>([]);
  const [courseOptions, setCourseOptions] = useState<Course[]>([]);
  const [searchCourseId, setSearchCourseId] = useState("");
  const [searchTag, setSearchTag] = useState("");
  const [selectedFilterCourseId, setSelectedFilterCourseId] = useState("");
  const [selectedFilterTag, setSelectedFilterTag] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const selectedStudentCount = selectedIds.length;
  const visibilityLabel =
    mode === "all"
      ? "Visible to all students"
      : mode === "selected"
        ? `Visible to ${selectedStudentCount} selected student${selectedStudentCount === 1 ? "" : "s"}`
        : "Hidden from all students";

  useEffect(() => {
    setMode(practice.result_visibility_mode ?? (practice.results_published ? "all" : "hidden"));
  }, [practice.result_visibility_mode, practice.results_published]);

  useEffect(() => {
    setSelectedIds(practice.result_visible_student_ids ?? []);
  }, [practice.result_visible_student_ids]);

  useEffect(() => {
    if (!token || selectedIds.length === 0) {
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
          body: JSON.stringify({ student_ids: selectedIds, practice_id: practice.id }),
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
  }, [practice.id, selectedIds, token]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/courses/`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) throw new Error(json?.error || "Failed to load courses");
        const list = Array.isArray(json) ? json : json?.courses || [];
        if (!cancelled) setCourseOptions(list);
      } catch {
        if (!cancelled) setCourseOptions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

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
          tag: searchTag,
          course_id: searchCourseId,
          limit: 100,
          practice_id: practice.id,
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
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  }

  const availableTags = useMemo(() => {
    const tags = new Set<string>();
    [...results, ...selectedDetails].forEach((student) => {
      const tag = (student.tag || "").trim();
      if (tag) tags.add(tag);
    });
    return Array.from(tags).sort((a, b) => a.localeCompare(b));
  }, [results, selectedDetails]);

  const filteredResults = useMemo(() => {
    return results.filter((student) => {
      if (searchTag && (student.tag || "") !== searchTag) return false;
      if (searchCourseId && !(student.courses || []).some((course) => course.id === searchCourseId)) return false;
      return true;
    });
  }, [results, searchCourseId, searchTag]);

  const filteredSelectedIds = useMemo(() => {
    return selectedIds.filter((id) => {
      const student = selectedDetails.find((entry) => entry.user_id === id) || results.find((entry) => entry.user_id === id);
      if (!student) return true;
      if (selectedFilterTag && (student.tag || "") !== selectedFilterTag) return false;
      if (selectedFilterCourseId && !(student.courses || []).some((course) => course.id === selectedFilterCourseId)) return false;
      return true;
    });
  }, [selectedIds, selectedDetails, results, selectedFilterCourseId, selectedFilterTag]);

  async function saveVisibility() {
    if (!token) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`${API_BASE}/api/module-practice/results/set/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          practice_id: practice.id,
          result_visibility_mode: mode,
          student_ids: selectedIds,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to save result visibility");
      setMessage("Result visibility saved.");
      refresh();
    } catch (e: any) {
      setError(e?.message ?? "Failed to save result visibility");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Result visibility</div>
          <div className="mt-2 text-xs text-slate-500">
            Control which students can open score reports and review submitted attempts.
          </div>
          <div className="mt-4 grid gap-2 text-xs text-slate-600">
            <label className="flex items-center gap-2">
              <input type="radio" checked={mode === "hidden"} onChange={() => setMode("hidden")} />
              <span>Hidden</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" checked={mode === "all"} onChange={() => setMode("all")} />
              <span>Visible to all students</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" checked={mode === "selected"} onChange={() => setMode("selected")} />
              <span>Visible to selected students only</span>
            </label>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-right">
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Current mode</div>
          <div className="mt-1 text-sm font-semibold text-slate-800">{visibilityLabel}</div>
          <div className="mt-2 flex flex-wrap justify-end gap-2 text-[11px]">
            <span className="rounded-full bg-white px-2.5 py-1 text-slate-600">{selectedStudentCount} students</span>
          </div>
        </div>
      </div>

      {error ? <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">{error}</div> : null}
      {message ? <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{message}</div> : null}

      {mode === "selected" ? (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Students who can view results</div>
              <div className="mt-1 text-xs text-slate-500">Search students and grant score-report visibility only to selected students.</div>
            </div>
            {selectedIds.length > 0 ? (
              <button
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                type="button"
                onClick={() => setSelectedIds([])}
              >
                Clear selected
              </button>
            ) : null}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              className="min-w-[220px] flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs"
              placeholder="Search by name, username, or student ID"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  searchStudents(false);
                }
              }}
            />
            <select
              className="min-w-[180px] rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs"
              value={searchCourseId}
              onChange={(e) => setSearchCourseId(e.target.value)}
            >
              <option value="">All courses</option>
              {courseOptions.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.title}
                </option>
              ))}
            </select>
            <select
              className="min-w-[160px] rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs"
              value={searchTag}
              onChange={(e) => setSearchTag(e.target.value)}
            >
              <option value="">All tags</option>
              {availableTags.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
            <button className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50" type="button" onClick={() => searchStudents(false)} disabled={loading}>
              Search
            </button>
            <button className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50" type="button" onClick={() => searchStudents(true)} disabled={loading}>
              Show all
            </button>
            <button
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              type="button"
              onClick={() => {
                setQuery("");
                setSearchCourseId("");
                setSearchTag("");
                searchStudents(true);
              }}
              disabled={loading}
            >
              Reset filters
            </button>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
            <span className="rounded-full bg-white px-3 py-1 ring-1 ring-slate-200">{filteredResults.length} shown</span>
            {searchCourseId ? (
              <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-700 ring-1 ring-blue-200">
                Course: {courseOptions.find((course) => course.id === searchCourseId)?.title || "Selected"}
              </span>
            ) : null}
            {searchTag ? (
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700 ring-1 ring-emerald-200">Tag: {searchTag}</span>
            ) : null}
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-[1.2fr_1fr]">
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Search results</div>
                <div className="rounded-full bg-slate-100 px-2 py-1 text-[10px] text-slate-500">{filteredResults.length} shown</div>
              </div>
              <div className="mt-2 grid max-h-[220px] gap-2 overflow-y-auto">
                {filteredResults.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-500">No students loaded.</div>
                ) : (
                  filteredResults.map((student) => {
                    const picked = selectedIds.includes(student.user_id);
                    const name = student.nickname || `${student.first_name ?? ""} ${student.last_name ?? ""}`.trim() || student.username;
                    return (
                      <button
                        key={student.user_id}
                        className={`rounded-xl border px-3 py-3 text-left text-xs transition ${
                          picked ? "border-blue-500 bg-blue-50 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                        }`}
                        onClick={() => toggleSelect(student.user_id)}
                        type="button"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-semibold text-slate-700">{name}</div>
                            <div className="mt-0.5 text-[10px] text-slate-400">
                              {student.username} {student.student_id ? `? ${student.student_id}` : ""}
                            </div>
                          </div>
                          <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${picked ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"}`}>
                            {picked ? "Selected" : "Add"}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-slate-500">
                          <span className="rounded-full bg-slate-100 px-2 py-1">{student.can_view_results ? "Can currently view results" : "Results hidden"}</span>
                          {student.tag ? <span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">Tag: {student.tag}</span> : null}
                          {(student.courses || []).slice(0, 1).map((course) => (
                            <span key={`${student.user_id}-${course.id}`} className="rounded-full bg-blue-50 px-2 py-1 text-blue-700">
                              {course.title}
                            </span>
                          ))}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Selected students</div>
                <div className="rounded-full bg-slate-100 px-2 py-1 text-[10px] text-slate-500">{filteredSelectedIds.length} shown</div>
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <select
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs"
                  value={selectedFilterCourseId}
                  onChange={(e) => setSelectedFilterCourseId(e.target.value)}
                >
                  <option value="">All selected courses</option>
                  {courseOptions.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.title}
                    </option>
                  ))}
                </select>
                <select
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs"
                  value={selectedFilterTag}
                  onChange={(e) => setSelectedFilterTag(e.target.value)}
                >
                  <option value="">All selected tags</option>
                  {availableTags.map((tag) => (
                    <option key={tag} value={tag}>
                      {tag}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mt-2 grid max-h-[220px] gap-2 overflow-y-auto">
                {filteredSelectedIds.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-500">
                    No selected students match the current filters.
                  </div>
                ) : (
                  filteredSelectedIds.map((id) => {
                    const student = selectedDetails.find((entry) => entry.user_id === id) || results.find((entry) => entry.user_id === id);
                    return (
                      <div key={id} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-semibold text-slate-700">
                              {student?.nickname || `${student?.first_name ?? ""} ${student?.last_name ?? ""}`.trim() || student?.username || id}
                            </div>
                            <div className="mt-1 text-[10px] text-slate-500">{student?.username || id}</div>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {student?.tag ? (
                                <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
                                  {student.tag}
                                </span>
                              ) : null}
                              {(student?.courses || []).slice(0, 2).map((course) => (
                                <span
                                  key={`${id}-${course.id}`}
                                  className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-700 ring-1 ring-blue-200"
                                >
                                  {course.title}
                                </span>
                              ))}
                            </div>
                          </div>
                          <button
                            className="rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-[10px] font-semibold text-red-600 hover:bg-red-50"
                            type="button"
                            onClick={() => toggleSelect(id)}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-3">
        <button
          className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
          type="button"
          onClick={saveVisibility}
          disabled={loading}
        >
          Save result visibility
        </button>
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
  const [exporting, setExporting] = useState(false);

  const requiredCount = getRequiredCount(module);
  const remaining = Math.max(requiredCount - moduleQuestions.length, 0);
  const canStart = remaining === 0;
  const returnTo =
    typeof window !== "undefined" ? `${window.location.pathname}${window.location.search}` : "";
  const createQuestionUrl = `/practice/modules/${practiceId}/questions/new/${module.subject}?module=${
    module.module_index
  }${returnTo ? `&return=${encodeURIComponent(returnTo)}` : ""}`;
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

  async function exportCsv() {
    if (!token) return;
    setExporting(true);
    setErr(null);
    try {
      const params = new URLSearchParams();
      params.set("practice_id", practiceId);
      const res = await fetch(`${API_BASE}/api/module-practice/export/?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        let message = "Export failed";
        try {
          const json = await res.json();
          message = json?.error || message;
        } catch {
          const text = await res.text();
          if (text) message = text;
        }
        throw new Error(message);
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `practice_${practiceId}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e: any) {
      setErr(e?.message ?? "Export failed");
    } finally {
      setExporting(false);
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
        <button
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-60"
          type="button"
          onClick={exportCsv}
          disabled={exporting}
        >
          {exporting ? "Exporting..." : "Export CSV"}
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
                      onClick={() => {
                        const editReturn =
                          typeof window !== "undefined"
                            ? `${window.location.pathname}${window.location.search}`
                            : "";
                        const suffix = editReturn ? `?return=${encodeURIComponent(editReturn)}` : "";
                        window.open(`/practice/modules/${practiceId}/questions/${q.id}/edit${suffix}`, "_blank");
                      }}
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
