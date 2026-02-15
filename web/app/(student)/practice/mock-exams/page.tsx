
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE;

type Profile = {
  role: string | null;
  is_admin: boolean | null;
};

type MockExam = {
  id: string;
  title: string;
  description: string | null;
  verbal_question_count: number;
  math_question_count: number;
  total_time_minutes: number;
  shuffle_questions: boolean;
  shuffle_choices: boolean;
  allow_retakes: boolean;
  is_active: boolean;
  results_published: boolean;
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
};

function isTeacherOrAdmin(p: Profile | null) {
  if (!p) return false;
  const role = (p.role ?? "").toLowerCase();
  return role === "teacher" || role === "admin" || !!p.is_admin;
}

export default function Page() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exams, setExams] = useState<MockExam[]>([]);

  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [verbalCount, setVerbalCount] = useState(40);
  const [mathCount, setMathCount] = useState(30);
  const [totalMinutes, setTotalMinutes] = useState(120);
  const [shuffleQuestions, setShuffleQuestions] = useState(true);
  const [shuffleChoices, setShuffleChoices] = useState(false);
  const [allowRetakes, setAllowRetakes] = useState(true);
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
      setProfile({ role: me.role ?? null, is_admin: me.is_admin ?? false });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
          verbal_question_count: verbalCount,
          math_question_count: mathCount,
          total_time_minutes: totalMinutes,
          shuffle_questions: shuffleQuestions,
          shuffle_choices: shuffleChoices,
          allow_retakes: allowRetakes,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to create mock exam");
      setNewTitle("");
      setNewDesc("");
      await loadExams(accessToken);
      setManageId(json.mock_exam_id ?? null);
    } catch (e: any) {
      setError(e?.message ?? "Failed to create mock exam");
    } finally {
      setCreating(false);
    }
  }

  function startExam(examId: string) {
    router.push(`/practice/mock-exams/${examId}`);
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

            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Question counts</div>
                <div className="mt-3 flex flex-wrap gap-3">
                  <label className="grid gap-1 text-xs">
                    <span className="text-[10px] uppercase tracking-wide text-slate-400">Verbal</span>
                    <input
                      type="number"
                      min={0}
                      className="w-24 rounded-lg border px-3 py-2 text-sm"
                      value={verbalCount}
                      onChange={(e) => setVerbalCount(Math.max(0, Number(e.target.value) || 0))}
                    />
                  </label>
                  <label className="grid gap-1 text-xs">
                    <span className="text-[10px] uppercase tracking-wide text-slate-400">Math</span>
                    <input
                      type="number"
                      min={0}
                      className="w-24 rounded-lg border px-3 py-2 text-sm"
                      value={mathCount}
                      onChange={(e) => setMathCount(Math.max(0, Number(e.target.value) || 0))}
                    />
                  </label>
                </div>
              </div>

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
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Settings</div>
                <div className="mt-3 grid gap-2 text-xs text-slate-600">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={shuffleQuestions}
                      onChange={(e) => setShuffleQuestions(e.target.checked)}
                    />
                    Shuffle questions
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={shuffleChoices}
                      onChange={(e) => setShuffleChoices(e.target.checked)}
                    />
                    Shuffle answer choices
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={allowRetakes}
                      onChange={(e) => setAllowRetakes(e.target.checked)}
                    />
                    Allow retakes
                  </label>
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
                  setManageId={setManageId}
                  startExam={startExam}
                  token={accessToken}
                  refresh={() => accessToken && loadExams(accessToken)}
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
  setManageId,
  startExam,
  token,
  refresh,
}: {
  exam: MockExam;
  canManage: boolean;
  manageId: string | null;
  setManageId: (id: string | null) => void;
  startExam: (examId: string) => void;
  token: string | null;
  refresh: () => void;
}) {
  const active = manageId === exam.id;

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
        </div>
        <div className="flex flex-col items-end gap-2">
          {exam.is_active ? (
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

      <div className="mt-4 grid gap-2 text-sm text-slate-600">
        <div className="rounded-xl bg-slate-50 px-3 py-2">Verbal: {exam.verbal_question_count} questions</div>
        <div className="rounded-xl bg-slate-50 px-3 py-2">Math: {exam.math_question_count} questions</div>
        <div className="rounded-xl bg-slate-50 px-3 py-2">Total time: {exam.total_time_minutes} minutes</div>
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
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          onClick={() => startExam(exam.id)}
          type="button"
        >
          Start mock exam
        </button>
        {canManage ? (
          <button
            className="rounded-xl border px-3 py-2 text-sm"
            onClick={() => setManageId(active ? null : exam.id)}
            type="button"
          >
            {active ? "Close" : "Manage"}
          </button>
        ) : null}
      </div>

      {canManage && active ? (
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
            </div>
          </div>

          <MockExamAccessManager exam={exam} token={token} refresh={refresh} />

          <MockExamBuilder exam={exam} token={token} refresh={refresh} />
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
      const res = await fetch(`${API_BASE}/api/mock-exams/students/search/`, {
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
      const res = await fetch(`${API_BASE}/api/mock-exams/access/set/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ mock_exam_id: exam.id, student_ids: selectedIds }),
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

function MockExamBuilder({
  exam,
  token,
  refresh,
}: {
  exam: MockExam;
  token: string | null;
  refresh: () => void;
}) {
  const [mode] = useState<"command">("command");
  const [builderError, setBuilderError] = useState<string | null>(null);
  const [builderMessage, setBuilderMessage] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [topicMap, setTopicMap] = useState<{ verbal: any[]; math: any[] } | null>(null);
  const [loadingTopics, setLoadingTopics] = useState(false);
  const [topicPicks, setTopicPicks] = useState<Record<string, { count: number; difficulty: string }>>({});

  useEffect(() => {
    if (mode !== "command" || !token || topicMap) return;
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
  }, [mode, token, topicMap]);

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
        body: JSON.stringify({ mock_exam_id: exam.id, rules }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Generation failed");
      setBuilderMessage("Questions generated from topic builder.");
      refresh();
    } catch (e: any) {
      setBuilderError(e?.message ?? "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Question builder</div>
      <div className="mt-2 text-xs text-slate-500">Command mode (topic builder)</div>

      {builderError ? <div className="mt-3 text-xs text-red-600">{builderError}</div> : null}
      {builderMessage ? <div className="mt-3 text-xs text-emerald-600">{builderMessage}</div> : null}

      {mode === "command" ? (
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
      ) : null}
    </div>
  );
}
