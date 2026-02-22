"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE;

type Profile = {
  role: string | null;
  is_admin: boolean | null;
};

type MockExam = {
  id: string;
  title: string;
  description: string | null;
  course_id?: string | null;
  course_title?: string | null;
  course_slug?: string | null;
  verbal_question_count: number;
  math_question_count: number;
  total_time_minutes: number;
  shuffle_questions: boolean;
  shuffle_choices: boolean;
  allow_retakes: boolean;
  retake_limit?: number | null;
  attempts_count?: number | null;
  access_limit?: number | null;
  is_active: boolean;
  results_published: boolean;
  locked?: boolean;
  question_count: number;
  question_ids?: string[] | null;
  allowed_student_ids?: string[] | null;
  allowed_student_count?: number | null;
  attempt?: {
    id: string;
    status: string;
    score_verbal: number;
    score_math: number;
    total_score: number;
    submitted_at: string | null;
  } | null;
};

type Student = {
  user_id: string;
  username: string;
  first_name?: string | null;
  last_name?: string | null;
  nickname?: string | null;
  student_id?: string | null;
  avatar?: string | null;
  attempts_count?: number | null;
  access_limit?: number | null;
};

type AttemptReport = {
  attempt_id: string;
  student_profile: {
    user_id: string;
    username?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    nickname?: string | null;
    student_id?: string | null;
  };
  attempts_count: number;
  score_verbal: number;
  score_math: number;
  total_score: number;
  submitted_at: string | null;
  time_spent: number;
  mistakes: {
    index: number;
    question_id: string;
    subject: string;
    topic?: string | null;
    subtopic?: string | null;
    stem: string;
    status: "incorrect" | "unanswered";
    correct?: string | null;
    correct_label?: string | null;
    correct_text?: string | null;
    answer?: string | null;
    answer_text?: string | null;
    is_open_ended?: boolean | null;
  }[];
  unanswered: number;
};

function formatStamp(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function isTeacherOrAdmin(p: Profile | null) {
  if (!p) return false;
  const role = (p.role ?? "").toLowerCase();
  return role === "teacher" || role === "admin" || !!p.is_admin;
}

export default function Page() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exams, setExams] = useState<MockExam[]>([]);

  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [totalMinutes, setTotalMinutes] = useState(120);
  const [creating, setCreating] = useState(false);

  const [manageId, setManageId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
      if (!token) {
        setProfileLoaded(true);
        return;
      }
      setAccessToken(token);

      const meRes = await fetch(`${API_BASE}/api/auth/me/`, {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => null);
      if (!meRes || !meRes.ok) {
        if (!cancelled) setProfileLoaded(true);
        return;
      }
      const me = await meRes.json().catch(() => null);
      if (cancelled || !me) return;
      setProfile({ role: me.role ?? null, is_admin: me.is_admin ?? false });
      setProfileLoaded(true);
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

  async function loadExams(token: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/mock-exams/list/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to load mock exams");
      setExams(json.exams ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load mock exams");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!accessToken) return;
    void loadExams(accessToken);
  }, [accessToken]);

  const canManage = isTeacherOrAdmin(profile);

  useEffect(() => {
    if (!profileLoaded) return;
    if (!canManage) {
      router.replace("/home");
    }
  }, [profileLoaded, canManage, router]);

  async function createExam() {
    if (!accessToken || !newTitle.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/mock-exams/create/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: newTitle.trim(),
          description: newDesc || null,
          total_time_minutes: totalMinutes,
          shuffle_questions: true,
          shuffle_choices: false,
          allow_retakes: true,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to create mock exam");
      setNewTitle("");
      setNewDesc("");
      await loadExams(accessToken);
      const nextId = json.mock_exam_id ?? null;
      if (nextId) {
        setManageId(nextId);
        router.push(`/practice/mock-exams?manage=${nextId}`);
      }
    } catch (e: any) {
      setError(e?.message ?? "Failed to create mock exam");
    } finally {
      setCreating(false);
    }
  }

  function openManage(examId: string) {
    setManageId(examId);
    router.push(`/practice/mock-exams?manage=${examId}`);
  }

  function closeManage() {
    setManageId(null);
    router.push("/practice/mock-exams");
  }

  function startExam(examId: string) {
    router.push(`/practice/mock-exams/${examId}`);
  }

  if (!canManage && profileLoaded) {
    return <div className="p-6 text-sm text-slate-500">Redirecting…</div>;
  }

  if (loading) {
    return <div className="p-6 text-sm text-slate-500">Loading mock exams...</div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-900 to-indigo-600 text-white p-6 shadow-xl">
          <div className="text-xs uppercase tracking-[0.3em] text-indigo-200">Mock Exams</div>
          <div className="mt-3 text-3xl font-semibold">Custom Full-Length Mocks</div>
          <div className="mt-2 text-sm text-indigo-100">Build flexible, single-timer SAT-style mock exams.</div>
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
                  placeholder="SAT Mock Exam - March"
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-xs uppercase tracking-wide text-slate-400">Description</span>
                <input
                  className="rounded-xl border px-3 py-2 text-sm"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Single-timer mock with free navigation"
                />
              </label>
              <button
                className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                onClick={createExam}
                disabled={creating}
                type="button"
              >
                {creating ? "Creating..." : "Create"}
              </button>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Total time</div>
                <div className="mt-3">
                  <input
                    type="number"
                    min={1}
                    className="rounded-lg border px-3 py-2 text-sm w-full"
                    value={totalMinutes}
                    onChange={(e) => setTotalMinutes(Math.max(1, Number(e.target.value) || 1))}
                  />
                </div>
                <div className="mt-2 text-[11px] text-slate-500">Single timer for entire mock.</div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Question counts</div>
                <div className="mt-3 text-sm text-slate-600">
                  Counts are calculated automatically from the questions you add later.
                </div>
              </div>
            </div>
          </section>
        ) : null}

        <section className="space-y-6">
          {exams.length === 0 ? (
            <div className="rounded-2xl border border-dashed bg-white px-5 py-6 text-sm text-slate-500">
              No mock exams yet.
            </div>
          ) : (
            <div className="grid gap-5 lg:grid-cols-2">
              {exams.map((exam) => (
                <MockExamCard
                  key={exam.id}
                  exam={exam}
                  canManage={canManage}
                  manageId={manageId}
                  openManage={openManage}
                  closeManage={closeManage}
                  startExam={startExam}
                  token={accessToken}
                  refresh={() => accessToken && loadExams(accessToken)}
                  onReviewAttempt={(examId, attemptId) =>
                    router.push(`/practice/mock-exams/${examId}?review_attempt=${attemptId}`)
                  }
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function MockExamCard({
  exam,
  canManage,
  manageId,
  openManage,
  closeManage,
  startExam,
  token,
  refresh,
  onReviewAttempt,
}: {
  exam: MockExam;
  canManage: boolean;
  manageId: string | null;
  openManage: (examId: string) => void;
  closeManage: () => void;
  startExam: (examId: string) => void;
  token: string | null;
  refresh: () => void;
  onReviewAttempt: (examId: string, attemptId: string) => void;
}) {
  const active = manageId === exam.id;
  const isLocked = !!exam.locked && !canManage;
  const attemptsCount = exam.attempts_count ?? 0;
  const retakeLimit = exam.allow_retakes ? exam.access_limit ?? exam.retake_limit ?? null : 1;
  const retakeReached = !canManage && retakeLimit !== null && attemptsCount >= retakeLimit;
  const startDisabled = isLocked || retakeReached;
  const [retakeDraft, setRetakeDraft] = useState<string>("");
  const [timeDraft, setTimeDraft] = useState<string>("");
  const [activePanel, setActivePanel] = useState<"results" | "access" | "builder" | null>(null);
  const [panelAutoOpened, setPanelAutoOpened] = useState(false);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [resultsError, setResultsError] = useState<string | null>(null);
  const [resultsData, setResultsData] = useState<AttemptReport[]>([]);

  useEffect(() => {
    setRetakeDraft(exam.retake_limit != null ? String(exam.retake_limit) : "");
    setTimeDraft(String(exam.total_time_minutes ?? 0));
  }, [exam.retake_limit, exam.total_time_minutes, exam.id]);

  useEffect(() => {
    if (active && canManage && !panelAutoOpened) {
      setActivePanel("results");
      setPanelAutoOpened(true);
      return;
    }
    if (!active && panelAutoOpened) {
      setPanelAutoOpened(false);
      setActivePanel(null);
    }
  }, [active, canManage, panelAutoOpened]);

  async function loadResults() {
    if (!token) return;
    setResultsLoading(true);
    setResultsError(null);
    try {
      const res = await fetch(`${API_BASE}/api/mock-exams/attempts/report/?mock_exam_id=${exam.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to load results");
      setResultsData(json.attempts ?? []);
    } catch (e: any) {
      setResultsError(e?.message ?? "Failed to load results");
    } finally {
      setResultsLoading(false);
    }
  }

  useEffect(() => {
    if (activePanel !== "results") return;
    void loadResults();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePanel]);

  async function updateExam(payload: Record<string, any>) {
    if (!token) return;
    const res = await fetch(`${API_BASE}/api/mock-exams/update/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ mock_exam_id: exam.id, ...payload }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error || "Failed to update");
    refresh();
  }

  async function deleteExam() {
    if (!token) return;
    const ok = window.confirm("Delete this mock exam? This will remove attempts.");
    if (!ok) return;
    const res = await fetch(`${API_BASE}/api/mock-exams/delete/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ mock_exam_id: exam.id }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error || "Failed to delete");
    refresh();
  }

  function togglePanel(panel: "results" | "access" | "builder") {
    if (activePanel === panel) {
      setActivePanel(null);
      closeManage();
      return;
    }
    setActivePanel(panel);
    if (!active) openManage(exam.id);
  }

  return (
    <div
      className={`rounded-2xl border bg-white p-5 shadow-sm transition-all ${
        active ? "lg:col-span-2" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-slate-400">Mock exam</div>
          <div className="mt-2 text-xl font-semibold text-slate-900">{exam.title}</div>
          <div className="mt-1 text-sm text-slate-600">{exam.description || "No description"}</div>
          {exam.course_title ? (
            <div className="mt-2 text-xs font-semibold uppercase tracking-wide text-indigo-500">
              Course: {exam.course_title}
            </div>
          ) : null}
        </div>
        <div className="flex flex-col items-end gap-2">
          {retakeReached ? (
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
              Limit reached
            </span>
          ) : isLocked ? (
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">Locked</span>
          ) : exam.is_active ? (
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">Active</span>
          ) : (
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">Disabled</span>
          )}
          {exam.results_published ? (
            <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">Results live</span>
          ) : (
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">Results hidden</span>
          )}
        </div>
      </div>

      {exam.attempt ? (
        <div className="mt-4 rounded-xl bg-slate-100 p-3 text-sm text-slate-600">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Latest attempt</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700">
              Verbal: {exam.attempt.score_verbal}
            </span>
            <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700">
              Math: {exam.attempt.score_math}
            </span>
            <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700">
              Total: {exam.attempt.total_score}
            </span>
          </div>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          className={`rounded-xl px-4 py-2 text-sm font-semibold text-white ${
            startDisabled ? "cursor-not-allowed bg-slate-300" : "bg-slate-900 hover:bg-slate-800"
          }`}
          onClick={() => {
            if (startDisabled) return;
            startExam(exam.id);
          }}
          type="button"
          disabled={startDisabled}
        >
          {retakeReached ? "Limit reached" : isLocked ? "Locked" : "Start mock exam"}
        </button>
        {!canManage && exam.results_published && exam.attempt?.id ? (
          <button
            className="rounded-xl border px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            type="button"
            onClick={() => router.push(`/practice/mock-exams/${exam.id}?review=1`)}
          >
            Review latest attempt
          </button>
        ) : null}
        {canManage ? (
          <div className="flex flex-wrap gap-2">
            <button
              className={`rounded-xl border px-3 py-2 text-sm ${activePanel === "results" ? "bg-slate-100" : ""}`}
              onClick={() => togglePanel("results")}
              type="button"
            >
              Results overview
            </button>
            <button
              className={`rounded-xl border px-3 py-2 text-sm ${activePanel === "access" ? "bg-slate-100" : ""}`}
              onClick={() => togglePanel("access")}
              type="button"
            >
              Access control
            </button>
            <button
              className={`rounded-xl border px-3 py-2 text-sm ${activePanel === "builder" ? "bg-slate-100" : ""}`}
              onClick={() => togglePanel("builder")}
              type="button"
            >
              Question builder
            </button>
          </div>
        ) : null}
      </div>

      {canManage && active && activePanel === "builder" ? (
        <div className="mt-5 space-y-4 border-t pt-4">
          <div className="rounded-xl border bg-white p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Exam setup</div>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <div className="rounded-md border bg-slate-50 px-3 py-2 text-sm">
                <div className="text-[10px] uppercase tracking-wide text-slate-400">Verbal questions</div>
                <div className="text-sm font-semibold text-slate-800">{exam.verbal_question_count}</div>
              </div>
              <div className="rounded-md border bg-slate-50 px-3 py-2 text-sm">
                <div className="text-[10px] uppercase tracking-wide text-slate-400">Math questions</div>
                <div className="text-sm font-semibold text-slate-800">{exam.math_question_count}</div>
              </div>
              <label className="grid gap-1 text-xs">
                <span className="text-[10px] uppercase tracking-wide text-slate-400">Total minutes</span>
                <input
                  type="number"
                  min={1}
                  className="rounded-md border px-2 py-1 text-sm"
                  value={timeDraft}
                  onChange={(e) => setTimeDraft(e.target.value)}
                  onBlur={async () => {
                    const nextVal = Math.max(1, Number(timeDraft) || 1);
                    setTimeDraft(String(nextVal));
                    await updateExam({ total_time_minutes: nextVal });
                  }}
                />
              </label>
            </div>
            <div className="mt-2 text-[11px] text-slate-400">
              Counts update automatically as you add or remove questions.
            </div>
          </div>

          <div className="rounded-xl border bg-slate-50 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Settings</div>
            <div className="mt-2 grid gap-2 text-xs text-slate-600">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={exam.shuffle_questions}
                  onChange={() => updateExam({ shuffle_questions: !exam.shuffle_questions })}
                />
                Shuffle questions
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={exam.shuffle_choices}
                  onChange={() => updateExam({ shuffle_choices: !exam.shuffle_choices })}
                />
                Shuffle answer choices
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={exam.allow_retakes}
                  onChange={() => updateExam({ allow_retakes: !exam.allow_retakes })}
                />
                Allow retakes
              </label>
              <label className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-slate-500">Retake limit</span>
                <input
                  type="number"
                  min={1}
                  placeholder="Unlimited"
                  className="w-28 rounded-md border px-2 py-1 text-xs"
                  value={retakeDraft}
                  onChange={(e) => setRetakeDraft(e.target.value)}
                  onBlur={async () => {
                    if (!retakeDraft) {
                      await updateExam({ retake_limit: null });
                      return;
                    }
                    const nextVal = Number(retakeDraft);
                    if (!Number.isNaN(nextVal)) {
                      await updateExam({ retake_limit: Math.max(1, nextVal) });
                    }
                  }}
                  disabled={exam.allow_retakes === false}
                />
                <span className="text-[10px] text-slate-400">Total attempts allowed</span>
              </label>
            </div>
          </div>

          <MockExamBuilder exam={exam} token={token} refresh={refresh} />
        </div>
      ) : null}

      {canManage && active && activePanel === "access" ? (
        <div className="mt-5 space-y-4 border-t pt-4">
          <div className="flex flex-wrap gap-3">
            <button
              className="rounded-lg border px-3 py-2 text-xs font-semibold"
              type="button"
              onClick={() => updateExam({ results_published: !exam.results_published })}
            >
              {exam.results_published ? "Hide results" : "Publish results"}
            </button>
            <button
              className="rounded-lg border px-3 py-2 text-xs font-semibold"
              type="button"
              onClick={() => updateExam({ is_active: !exam.is_active })}
            >
              {exam.is_active ? "Disable access" : "Enable access"}
            </button>
            <button
              className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700"
              type="button"
              onClick={deleteExam}
            >
              Delete mock
            </button>
          </div>

          <MockExamAccessManager exam={exam} token={token} refresh={refresh} />
        </div>
      ) : null}

      {canManage && active && activePanel === "results" ? (
        <div className="mt-5 space-y-3 border-t pt-4">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Results overview</div>
          {resultsLoading ? <div className="text-sm text-slate-500">Loading results...</div> : null}
          {resultsError ? <div className="text-sm text-red-600">{resultsError}</div> : null}
          {!resultsLoading && resultsData.length === 0 ? (
            <div className="text-sm text-slate-500">No submitted attempts yet.</div>
          ) : null}
          <div className="space-y-3">
            {resultsData.map((attempt) => {
              const profile = attempt.student_profile || {};
              const name =
                profile.nickname ||
                `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() ||
                profile.username ||
                profile.student_id ||
                "Student";
              return (
                <div key={attempt.attempt_id} className="rounded-xl border bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-800">{name}</div>
                      <div className="text-xs text-slate-500">{profile.username || profile.student_id}</div>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-slate-600">
                      <span className="rounded-full bg-slate-100 px-3 py-1">Attempts: {attempt.attempts_count}</span>
                      <span className="rounded-full bg-slate-100 px-3 py-1">Verbal: {attempt.score_verbal}</span>
                      <span className="rounded-full bg-slate-100 px-3 py-1">Math: {attempt.score_math}</span>
                      <span className="rounded-full bg-slate-100 px-3 py-1">Total: {attempt.total_score}</span>
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-slate-500">
                    Submitted: {formatStamp(attempt.submitted_at)} | Time spent: {Math.round(attempt.time_spent / 60)}m
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-600">
                    <span className="rounded-full bg-slate-100 px-3 py-1">
                      Correct: {(attempt.score_verbal || 0) + (attempt.score_math || 0)}
                    </span>
                    <span className="rounded-full bg-slate-100 px-3 py-1">
                      Wrong: {Math.max(0, (exam.question_count || 0) - (attempt.score_verbal || 0) - (attempt.score_math || 0) - (attempt.unanswered || 0))}
                    </span>
                    <span className="rounded-full bg-slate-100 px-3 py-1">Unanswered: {attempt.unanswered || 0}</span>
                  </div>
                  <button
                    className="mt-3 rounded-lg border border-slate-900 px-3 py-1 text-xs font-semibold text-slate-900"
                    type="button"
                    onClick={() => onReviewAttempt(exam.id, attempt.attempt_id)}
                  >
                    Review attempt
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

    </div>
  );
}

function MockExamAccessManager({
  exam,
  token,
  refresh,
}: {
  exam: MockExam;
  token: string | null;
  refresh: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Student[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedDetails, setSelectedDetails] = useState<Student[]>([]);
  const [limitOverrides, setLimitOverrides] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSelectedIds(exam.allowed_student_ids ?? []);
  }, [exam.allowed_student_ids]);

  useEffect(() => {
    if (!token) return;
    if (!selectedIds.length) {
      setSelectedDetails([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/mock-exams/students/lookup/`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ student_ids: selectedIds, mock_exam_id: exam.id }),
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
      Object.keys(next).forEach((id) => {
        if (!selectedIds.includes(id)) delete next[id];
      });
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
      const res = await fetch(`${API_BASE}/api/mock-exams/students/search/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          q: showAll ? "" : query.trim(),
          limit: 100,
          mock_exam_id: exam.id,
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
      const res = await fetch(`${API_BASE}/api/mock-exams/access/set/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ mock_exam_id: exam.id, student_ids: selectedIds, student_limits }),
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
        Choose which students can take this mock. If none are selected, all students can access it.
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
          className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white"
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
                const attempts = s.attempts_count ?? 0;
                const accessLimit = s.access_limit;
                return (
                  <button
                    key={s.user_id}
                    className={`rounded-lg border px-3 py-2 text-left text-xs ${
                      picked ? "border-indigo-500 bg-indigo-50" : "border-slate-200"
                    }`}
                    onClick={() => toggleSelect(s.user_id)}
                    type="button"
                  >
                    <div className="font-semibold text-slate-700">{name}</div>
                    <div className="text-[10px] text-slate-400">
                      {s.username} {s.student_id ? `· ${s.student_id}` : ""}
                    </div>
                    <div className="text-[10px] text-slate-500">Attempts: {attempts}</div>
                    <div className="text-[10px] text-slate-500">Limit: {accessLimit != null ? accessLimit : "Default"}</div>
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
                const attempts = s?.attempts_count ?? 0;
                return (
                  <div key={id} className="rounded-lg border border-slate-200 px-3 py-2 text-xs">
                    <div className="font-semibold text-slate-700">
                      {s?.nickname || `${s?.first_name ?? ""} ${s?.last_name ?? ""}`.trim() || s?.username || id}
                    </div>
                    <div className="text-[10px] text-slate-500">Attempts: {attempts}</div>
                    <div className="mt-2 flex items-center gap-2 text-[10px] text-slate-500">
                      <span>Limit</span>
                      <input
                        type="number"
                        min={1}
                        placeholder="Default"
                        className="w-20 rounded border px-2 py-1 text-[10px]"
                        value={limitOverrides[id] ?? ""}
                        onChange={(e) => setLimitOverrides((prev) => ({ ...prev, [id]: e.target.value }))}
                      />
                      <span className="text-slate-400">blank = default</span>
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

function MockExamBuilder({
  exam,
  token,
  refresh,
}: {
  exam: MockExam;
  token: string | null;
  refresh: () => void;
}) {
  const [mode, setMode] = useState<"generate" | "manual">("generate");
  const [builderError, setBuilderError] = useState<string | null>(null);
  const [builderMessage, setBuilderMessage] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [topicMap, setTopicMap] = useState<{ verbal: any[]; math: any[] } | null>(null);
  const [loadingTopics, setLoadingTopics] = useState(false);
  const [topicPicks, setTopicPicks] = useState<Record<string, { count: number; difficulty: string }>>({});
  const [questionList, setQuestionList] = useState<any[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);
  const [replaceTarget, setReplaceTarget] = useState<string | null>(null);
  const [searchSubject, setSearchSubject] = useState<"verbal" | "math">("verbal");
  const [searchTopic, setSearchTopic] = useState("");
  const [searchSubtopic, setSearchSubtopic] = useState("");
  const [searchDifficulty, setSearchDifficulty] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!token || topicMap) return;
    let cancelled = false;
    (async () => {
      setLoadingTopics(true);
      try {
        const res = await fetch(`${API_BASE}/api/mock-exams/topics/`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "Failed to load topics");
        if (!cancelled) setTopicMap(json.subjects || { verbal: [], math: [] });
      } catch (e: any) {
        if (!cancelled) setBuilderError(e?.message ?? "Failed to load topics");
      } finally {
        if (!cancelled) setLoadingTopics(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, topicMap]);

  async function loadQuestionList() {
    if (!token) return;
    const ids = exam.question_ids ?? [];
    if (!ids.length) {
      setQuestionList([]);
      setPreviewId(null);
      return;
    }
    setLoadingQuestions(true);
    try {
      const res = await fetch(`${API_BASE}/api/mock-exams/questions/lookup/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ mock_exam_id: exam.id, question_ids: ids, full: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to load questions");
      setQuestionList(json.questions ?? []);
      if (json.questions?.length && !previewId) setPreviewId(json.questions[0].id);
      const validIds = new Set((json.questions ?? []).map((q: any) => q.id));
      setSelectedQuestionIds((prev) => prev.filter((id) => validIds.has(id)));
    } catch (e: any) {
      setBuilderError(e?.message ?? "Failed to load questions");
    } finally {
      setLoadingQuestions(false);
    }
  }

  useEffect(() => {
    if (!token) return;
    void loadQuestionList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, exam.question_ids?.join("|")]);

  function updateTopicPick(key: string, patch: Partial<{ count: number; difficulty: string }>) {
    setTopicPicks((prev) => {
      const next = { ...prev };
      const current = next[key] || { count: 0, difficulty: "" };
      const merged = { ...current, ...patch };
      if (!merged.count || merged.count <= 0) {
        delete next[key];
      } else {
        next[key] = merged;
      }
      return next;
    });
  }

  function buildRulesFromPicks() {
    const rules = [];
    for (const [key, val] of Object.entries(topicPicks)) {
      const [subject, topic, subtopic] = key.split("::");
      if (!val.count || val.count <= 0) continue;
      rules.push({
        subject,
        topics: topic ? [topic] : [],
        subtopics: subtopic ? [subtopic] : [],
        difficulty: val.difficulty || null,
        count: val.count,
      });
    }
    return rules;
  }

  async function generateFromTopicBuilder() {
    if (!token) return;
    const rules = buildRulesFromPicks();
    if (!rules.length) {
      setBuilderError("Add at least one topic/subtopic count.");
      return;
    }
    setBuilderError(null);
    setBuilderMessage(null);
    setGenerating(true);
    try {
      const res = await fetch(`${API_BASE}/api/mock-exams/questions/generate/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ mock_exam_id: exam.id, rules, append: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Generation failed");
      setBuilderMessage("Questions generated from topic builder.");
      refresh();
      await loadQuestionList();
    } catch (e: any) {
      setBuilderError(e?.message ?? "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  async function searchBank() {
    if (!token) return;
    setSearching(true);
    setBuilderError(null);
    try {
      const params = new URLSearchParams();
      params.set("subject", searchSubject);
      if (searchTopic) params.set("topic", searchTopic);
      if (searchSubtopic) params.set("subtopic", searchSubtopic);
      if (searchDifficulty) params.set("difficulty", searchDifficulty);
      if (searchQuery) params.set("q", searchQuery);
      const res = await fetch(`${API_BASE}/api/mock-exams/questions/search/?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Search failed");
      setSearchResults(json.questions ?? []);
    } catch (e: any) {
      setBuilderError(e?.message ?? "Search failed");
    } finally {
      setSearching(false);
    }
  }

  async function addQuestionToMock(questionId: string) {
    if (!token) return;
    setBuilderError(null);
    try {
      const res = await fetch(`${API_BASE}/api/mock-exams/questions/add/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ mock_exam_id: exam.id, question_id: questionId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to add");
      refresh();
      await loadQuestionList();
    } catch (e: any) {
      setBuilderError(e?.message ?? "Failed to add");
    }
  }

  async function removeQuestionFromMock(questionId: string) {
    if (!token) return;
    setBuilderError(null);
    try {
      const res = await fetch(`${API_BASE}/api/mock-exams/questions/remove/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ mock_exam_id: exam.id, question_id: questionId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to remove");
      refresh();
      await loadQuestionList();
    } catch (e: any) {
      setBuilderError(e?.message ?? "Failed to remove");
    }
  }

  async function removeSelectedQuestions() {
    if (!token || selectedQuestionIds.length === 0) return;
    const ok = window.confirm(`Remove ${selectedQuestionIds.length} question(s) from this mock?`);
    if (!ok) return;
    setBuilderError(null);
    try {
      await Promise.all(
        selectedQuestionIds.map((qid) =>
          fetch(`${API_BASE}/api/mock-exams/questions/remove/`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ mock_exam_id: exam.id, question_id: qid }),
          }).then(async (res) => {
            const json = await res.json();
            if (!res.ok) throw new Error(json?.error || "Failed to remove");
          })
        )
      );
      setSelectedQuestionIds([]);
      refresh();
      await loadQuestionList();
    } catch (e: any) {
      setBuilderError(e?.message ?? "Failed to remove selected questions");
    }
  }

  function toggleSelectQuestion(id: string) {
    setSelectedQuestionIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function selectAllQuestions() {
    setSelectedQuestionIds(questionList.map((q: any) => q.id));
  }

  function clearSelectedQuestions() {
    setSelectedQuestionIds([]);
  }

  async function replaceQuestionInMock(newQuestionId: string) {
    if (!token || !replaceTarget) return;
    setBuilderError(null);
    try {
      const res = await fetch(`${API_BASE}/api/mock-exams/questions/replace/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mock_exam_id: exam.id,
          old_question_id: replaceTarget,
          new_question_id: newQuestionId,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to replace");
      setReplaceTarget(null);
      refresh();
      await loadQuestionList();
    } catch (e: any) {
      setBuilderError(e?.message ?? "Failed to replace");
    }
  }

  const subjectTopics = topicMap?.[searchSubject] || [];
  const subjectTopicOptions = subjectTopics.map((t: any) => t.topic);
  const subjectSubtopicOptions =
    subjectTopics.find((t: any) => t.topic === searchTopic)?.subtopics?.map((s: any) => s.subtopic) ?? [];

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Question builder</div>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setMode("generate")}
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            mode === "generate" ? "bg-slate-900 text-white" : "border bg-white text-slate-600"
          }`}
        >
          Generate from selection
        </button>
        <button
          type="button"
          onClick={() => setMode("manual")}
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            mode === "manual" ? "bg-slate-900 text-white" : "border bg-white text-slate-600"
          }`}
        >
          Create yourself
        </button>
      </div>

      {builderError ? <div className="mt-3 text-xs text-red-600">{builderError}</div> : null}
      {builderMessage ? <div className="mt-3 text-xs text-emerald-600">{builderMessage}</div> : null}

      {mode === "generate" ? (
        <div className="mt-4 space-y-4">
          <div className="text-xs text-slate-500">
            Choose topics/subtopics and enter how many questions you want from each.
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white"
              type="button"
              onClick={generateFromTopicBuilder}
              disabled={generating}
            >
              {generating ? "Generating..." : "Generate from selections"}
            </button>
            <button
              className="rounded-lg border px-3 py-2 text-xs font-semibold"
              type="button"
              onClick={() => setTopicPicks({})}
            >
              Clear selections
            </button>
          </div>

          {loadingTopics ? (
            <div className="text-xs text-slate-500">Loading topics...</div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {(["verbal", "math"] as const).map((subject) => (
                <div key={subject} className="rounded-xl border bg-white p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                    {subject === "verbal" ? "Verbal" : "Math"}
                  </div>
                  <div className="mt-3 space-y-3">
                    {(topicMap?.[subject] || []).map((topic: any) => {
                      const topicKey = `${subject}::${topic.topic}::`;
                      const topicPick = topicPicks[topicKey];
                      return (
                        <div key={topic.topic} className="rounded-lg border border-slate-200 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-sm font-semibold text-slate-800">{topic.topic}</div>
                            <div className="flex flex-wrap items-center gap-2">
                              <input
                                type="number"
                                min={0}
                                className="w-20 rounded-md border px-2 py-1 text-xs"
                                placeholder="Count"
                                value={topicPick?.count ?? ""}
                                onChange={(e) =>
                                  updateTopicPick(topicKey, { count: Math.max(0, Number(e.target.value) || 0) })
                                }
                              />
                              <select
                                className="rounded-md border px-2 py-1 text-xs"
                                value={topicPick?.difficulty ?? ""}
                                onChange={(e) => updateTopicPick(topicKey, { difficulty: e.target.value })}
                              >
                                <option value="">Any</option>
                                <option value="easy">Easy</option>
                                <option value="medium">Medium</option>
                                <option value="hard">Hard</option>
                              </select>
                              <span className="text-[10px] text-slate-400">Avail {topic.count}</span>
                            </div>
                          </div>
                          {topic.subtopics?.length ? (
                            <div className="mt-3 space-y-2">
                              {topic.subtopics.map((sub: any) => {
                                const subKey = `${subject}::${topic.topic}::${sub.subtopic}`;
                                const subPick = topicPicks[subKey];
                                return (
                                  <div key={sub.subtopic} className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="text-xs text-slate-600">{sub.subtopic}</div>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <input
                                        type="number"
                                        min={0}
                                        className="w-20 rounded-md border px-2 py-1 text-xs"
                                        placeholder="Count"
                                        value={subPick?.count ?? ""}
                                        onChange={(e) =>
                                          updateTopicPick(subKey, {
                                            count: Math.max(0, Number(e.target.value) || 0),
                                          })
                                        }
                                      />
                                      <select
                                        className="rounded-md border px-2 py-1 text-xs"
                                        value={subPick?.difficulty ?? ""}
                                        onChange={(e) => updateTopicPick(subKey, { difficulty: e.target.value })}
                                      >
                                        <option value="">Any</option>
                                        <option value="easy">Easy</option>
                                        <option value="medium">Medium</option>
                                        <option value="hard">Hard</option>
                                      </select>
                                      <span className="text-[10px] text-slate-400">Avail {sub.count}</span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                    {(topicMap?.[subject] || []).length === 0 ? (
                      <div className="text-xs text-slate-500">No topics found.</div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-2">
            <button
              className="rounded-lg border bg-white px-3 py-2 text-xs font-semibold"
              type="button"
              onClick={() => window.open(`/practice/mock-exams/${exam.id}/questions/new/verbal`, "_blank")}
            >
              Add verbal question
            </button>
            <button
              className="rounded-lg border bg-white px-3 py-2 text-xs font-semibold"
              type="button"
              onClick={() => window.open(`/practice/mock-exams/${exam.id}/questions/new/math`, "_blank")}
            >
              Add math question
            </button>
            <span className="text-[10px] text-slate-500 self-center">
              Custom questions are saved to the question bank and added to this mock.
            </span>
          </div>

          <div className="rounded-xl border bg-white p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Add from question bank</div>
            <div className="mt-3 grid gap-3 md:grid-cols-4">
              <label className="grid gap-1 text-xs">
                <span className="text-[10px] uppercase tracking-wide text-slate-400">Subject</span>
                <select
                  className="rounded-md border px-2 py-1 text-xs"
                  value={searchSubject}
                  onChange={(e) => {
                    setSearchSubject(e.target.value as "verbal" | "math");
                    setSearchTopic("");
                    setSearchSubtopic("");
                  }}
                >
                  <option value="verbal">Verbal</option>
                  <option value="math">Math</option>
                </select>
              </label>
              <label className="grid gap-1 text-xs">
                <span className="text-[10px] uppercase tracking-wide text-slate-400">Topic</span>
                <select
                  className="rounded-md border px-2 py-1 text-xs"
                  value={searchTopic}
                  onChange={(e) => {
                    setSearchTopic(e.target.value);
                    setSearchSubtopic("");
                  }}
                >
                  <option value="">All topics</option>
                  {subjectTopicOptions.map((t: string) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs">
                <span className="text-[10px] uppercase tracking-wide text-slate-400">Subtopic</span>
                <select
                  className="rounded-md border px-2 py-1 text-xs"
                  value={searchSubtopic}
                  onChange={(e) => setSearchSubtopic(e.target.value)}
                >
                  <option value="">All subtopics</option>
                  {subjectSubtopicOptions.map((s: string) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs">
                <span className="text-[10px] uppercase tracking-wide text-slate-400">Difficulty</span>
                <select
                  className="rounded-md border px-2 py-1 text-xs"
                  value={searchDifficulty}
                  onChange={(e) => setSearchDifficulty(e.target.value)}
                >
                  <option value="">Any</option>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </label>
              <label className="grid gap-1 text-xs md:col-span-3">
                <span className="text-[10px] uppercase tracking-wide text-slate-400">Search</span>
                <input
                  className="rounded-md border px-2 py-1 text-xs"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Stem, passage, etc."
                />
              </label>
              <div className="flex items-end gap-2">
                <button
                  className="rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white"
                  type="button"
                  onClick={searchBank}
                  disabled={searching}
                >
                  {searching ? "Searching..." : "Search"}
                </button>
                {replaceTarget ? (
                  <button
                    className="rounded-md border px-3 py-2 text-xs font-semibold text-slate-600"
                    type="button"
                    onClick={() => setReplaceTarget(null)}
                  >
                    Cancel replace
                  </button>
                ) : null}
              </div>
            </div>

            <div className="mt-3 max-h-56 overflow-auto rounded-lg border">
              {searchResults.length === 0 ? (
                <div className="p-3 text-xs text-slate-500">No search results yet.</div>
              ) : (
                <div className="divide-y">
                  {searchResults.map((q) => (
                    <div key={q.id} className="flex items-start justify-between gap-3 p-3 text-xs">
                      <div>
                        <div className="font-semibold text-slate-800">
                          {q.topic} {q.subtopic ? `• ${q.subtopic}` : ""}
                        </div>
                        <div className="mt-1 text-slate-500 line-clamp-2">{q.stem}</div>
                        <div className="mt-1 text-[10px] text-slate-400">{q.difficulty || "unknown"}</div>
                      </div>
                      <button
                        className="rounded-md border px-3 py-1 text-[11px] font-semibold"
                        type="button"
                        onClick={() =>
                          replaceTarget ? replaceQuestionInMock(q.id) : addQuestionToMock(q.id)
                        }
                      >
                        {replaceTarget ? "Replace" : "Add"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="mt-6 rounded-xl border bg-white p-4">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Questions in this mock</div>
          {replaceTarget ? (
            <div className="text-xs text-amber-600">Replacing question… pick a new one below.</div>
          ) : null}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <button
            className="rounded-md border px-2 py-1 text-[11px] font-semibold"
            type="button"
            onClick={selectAllQuestions}
            disabled={questionList.length === 0}
          >
            Select all
          </button>
          <button
            className="rounded-md border px-2 py-1 text-[11px] font-semibold"
            type="button"
            onClick={clearSelectedQuestions}
            disabled={selectedQuestionIds.length === 0}
          >
            Clear
          </button>
          <button
            className="rounded-md border border-red-300 bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-700"
            type="button"
            onClick={removeSelectedQuestions}
            disabled={selectedQuestionIds.length === 0}
          >
            Delete selected ({selectedQuestionIds.length})
          </button>
        </div>
        {loadingQuestions ? (
          <div className="mt-3 text-xs text-slate-500">Loading questions...</div>
        ) : questionList.length === 0 ? (
          <div className="mt-3 text-xs text-slate-500">No questions selected yet.</div>
        ) : (
          <div className="mt-3 grid gap-4 lg:grid-cols-[1.1fr_1fr]">
            <div className="space-y-2">
              {questionList.map((q: any, idx: number) => (
                <div
                  key={q.id}
                  className={`rounded-lg border px-3 py-2 text-xs ${
                    previewId === q.id ? "border-indigo-400 bg-indigo-50" : "border-slate-200"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <label className="flex items-center gap-2 text-[11px] text-slate-500">
                        <input
                          type="checkbox"
                          checked={selectedQuestionIds.includes(q.id)}
                          onChange={() => toggleSelectQuestion(q.id)}
                        />
                        Select
                      </label>
                      <div className="font-semibold text-slate-800">
                        {idx + 1}. {q.topic} {q.subtopic ? `• ${q.subtopic}` : ""}
                      </div>
                      <div className="mt-1 text-slate-500 line-clamp-2">{q.stem}</div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <button
                        className="text-[10px] text-slate-600 underline"
                        type="button"
                        onClick={() => setPreviewId(q.id)}
                      >
                        Preview
                      </button>
                      <button
                        className="text-[10px] text-indigo-600 underline"
                        type="button"
                        onClick={() =>
                          window.open(`/practice/mock-exams/${exam.id}/questions/${q.id}/edit`, "_blank")
                        }
                      >
                        Edit (override)
                      </button>
                      <button
                        className="text-[10px] text-amber-600 underline"
                        type="button"
                        onClick={() => setReplaceTarget(q.id)}
                      >
                        Replace
                      </button>
                      <button
                        className="text-[10px] text-red-600 underline"
                        type="button"
                        onClick={() => removeQuestionFromMock(q.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="rounded-lg border bg-slate-50 p-3 text-xs text-slate-600">
              {previewId ? (
                (() => {
                  const q = questionList.find((item: any) => item.id === previewId);
                  if (!q) return <div>Select a question to preview.</div>;
                  return (
                    <div className="space-y-2">
                      <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                        {q.subject} question
                      </div>
                      {q.passage ? (
                        <div className="rounded-md border bg-white p-2 text-[11px] text-slate-600">
                          {q.passage}
                        </div>
                      ) : null}
                      <div className="font-semibold text-slate-800">{q.stem}</div>
                      {q.is_open_ended ? (
                        <div className="text-[11px] text-slate-500">Open ended</div>
                      ) : (
                        <div className="space-y-1">
                          {(q.choices || []).map((c: any) => (
                            <div key={c.label} className="rounded border bg-white px-2 py-1">
                              <span className="font-semibold">{c.label}.</span> {c.content}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()
              ) : (
                <div>Select a question to preview.</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
