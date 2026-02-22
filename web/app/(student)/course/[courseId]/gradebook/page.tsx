"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE;

type Profile = { user_id: string; role: string | null; is_admin: boolean | null };

type AssignmentRow = {
  id: string;
  title: string;
  status: string;
  due_at: string | null;
  max_score: number | null;
  kind?: "assignment" | "quiz";
  results_published?: boolean;
  is_active?: boolean;
};

type SubmissionRow = {
  id: string;
  assignment_id: string;
  file_name?: string | null;
  created_at?: string | null;
  grade: { score: number | null; feedback: string | null } | null;
};

function isTeacherOrAdmin(p: Profile | null) {
  if (!p) return false;
  const role = (p.role ?? "").toLowerCase();
  return role === "teacher" || role === "admin" || !!p.is_admin;
}

function toNullableNumber(raw: string | null | undefined) {
  const v = (raw ?? "").trim();
  if (v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export default function GradebookPage() {
  const params = useParams<{ courseId: string }>();
  const router = useRouter();
  const courseId = params.courseId;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  const [assignments, setAssignments] = useState<Array<AssignmentRow & { submission?: SubmissionRow }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [offlineStudents, setOfflineStudents] = useState<
    Array<{ user_id: string; username: string | null; nickname: string | null }>
  >([]);
  const [offlineGrades, setOfflineGrades] = useState<
    Array<{ id: string; student_id: string; title: string; max_score: number | null; score: number | null; feedback: string | null }>
  >([]);
  const [savingOffline, setSavingOffline] = useState<Record<string, boolean>>({});

  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteMaxScore, setPasteMaxScore] = useState<string>("");

  const staff = useMemo(() => isTeacherOrAdmin(profile), [profile]);

  function gradeBadge(score: number | null, max: number | null) {
    if (score === null || typeof score === "undefined") return null;
    const nScore = typeof score === "string" ? Number(score) : score;
    const nMax = typeof max === "string" ? Number(max) : max;

    const pct = nMax ? (nScore / nMax) * 100 : nScore;
    let bg = "#ef4444"; // red
    let fg = "#ffffff";
    if (pct >= 90) {
      bg = "#15803d"; // dark green
      fg = "#ffffff";
    } else if (pct >= 80) {
      bg = "#22c55e"; // light green
      fg = "#0f172a";
    } else if (pct >= 70) {
      bg = "#facc15"; // yellow
      fg = "#0f172a";
    } else if (pct >= 60) {
      bg = "#f97316"; // orange
      fg = "#0f172a";
    }

    return (
      <span
        style={{
          backgroundColor: bg,
          color: fg,
          padding: "8px 14px",
          borderRadius: "999px",
          display: "inline-block",
          fontSize: "12px",
          fontWeight: 700,
          minWidth: "88px",
          textAlign: "center",
          boxShadow: "0 0 0 1px rgba(0,0,0,0.25)",
        }}
      >
        {nScore}
        {nMax ? ` / ${nMax}` : ""}
      </span>
    );
  }

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);

      try {
        /**
         * Django-backed auth:
         * Expecting GET /api/auth/me/ with Bearer token to return:
         * { "user": { "id": "...", "email": "..." }, "role": "...", "is_admin": false }
         */
        const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
        if (!token) {
          router.replace("/login");
          return;
        }

        const meRes = await fetch(`${API_BASE}/api/auth/me/`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        }).catch(() => null);

        if (!meRes || meRes.status === 401) {
          router.replace("/login");
          return;
        }

        const meJson = await meRes.json().catch(() => ({}));
        if (!meRes.ok) throw new Error(meJson?.error || "Unable to load session");

        const prof: Profile | null = meJson?.user?.id
          ? { user_id: meJson.user.id, role: meJson?.role ?? null, is_admin: meJson?.is_admin ?? false }
          : null;

        if (!prof) throw new Error("Missing profile");

        if (cancelled) return;
        setAccessToken(token);
        setProfile(prof);

        await loadGradebook(courseId, token);

        if (isTeacherOrAdmin(prof)) {
          await loadOffline(courseId, token);
        }

        if (cancelled) return;
        setLoading(false);
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message ?? "Failed to load");
        setAssignments([]);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [courseId, router]);

  async function loadGradebook(courseId: string, token: string) {
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/grades/me/?course_id=${encodeURIComponent(courseId)}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to load gradebook");
      setAssignments(json.assignments ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load gradebook");
      setAssignments([]);
    }
  }

  async function loadOffline(courseId: string, token: string) {
    try {
      const res = await fetch(`${API_BASE}/api/grades/offline/?course_id=${encodeURIComponent(courseId)}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to load offline grades");
      setOfflineStudents(json.students ?? []);
      setOfflineGrades(json.grades ?? []);
    } catch (e) {
      console.error(e);
    }
  }

  async function saveOfflineGrade(
    student_id: string,
    payload: { title: string; score: number | null; max_score: number | null; feedback: string | null }
  ) {
    if (!accessToken) return;

    setSavingOffline((prev) => ({ ...prev, [student_id]: true }));
    try {
      const res = await fetch(`${API_BASE}/api/grades/offline/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ course_id: courseId, student_id, ...payload }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Save failed");

      await loadOffline(courseId, accessToken);
    } catch (e: any) {
      alert(e?.message ?? "Save failed");
    } finally {
      setSavingOffline((prev) => ({ ...prev, [student_id]: false }));
    }
  }

  async function handlePasteUpload() {
    if (!staff) return;

    const maxScoreVal = toNullableNumber(pasteMaxScore);

    const lines = pasteText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    for (const line of lines) {
      // expected: username_or_nickname,score,feedback
      const [nameRaw, scoreRaw, feedbackRaw] = line.split(",").map((x) => (x ?? "").trim());
      if (!nameRaw) continue;

      const student =
        offlineStudents.find(
          (s) =>
            s.username?.toLowerCase() === nameRaw.toLowerCase() ||
            s.nickname?.toLowerCase() === nameRaw.toLowerCase() ||
            s.user_id === nameRaw
        ) ?? null;

      if (!student) continue;

      const scoreVal = toNullableNumber(scoreRaw);

      await saveOfflineGrade(student.user_id, {
        title: "Offline grade",
        score: scoreVal,
        max_score: maxScoreVal,
        feedback: feedbackRaw || null,
      });
    }

    setShowPaste(false);
    setPasteText("");
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Gradebook</h1>
          <p className="text-sm text-neutral-500">Your submissions and grades for this course.</p>
        </div>
        <Link className="text-sm underline" href={`/course/${courseId}/assignment`}>
          Create assignment
        </Link>
      </div>

      {loading ? (
        <div className="text-sm text-neutral-600">Loading…</div>
      ) : error ? (
        <div className="text-sm text-red-600">Error: {error}</div>
      ) : assignments.length === 0 ? (
        <div className="text-sm text-neutral-600">No assignments yet.</div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <div className="grid grid-cols-4 gap-3 bg-neutral-900 text-white text-sm px-4 py-3 font-medium">
            <div>Title</div>
            <div>Status</div>
            <div>Due</div>
            <div className="text-right">Grade</div>
          </div>

          <div className="divide-y">
            {assignments.map((a) => {
              const submission = a.submission;
              const grade = submission?.grade ?? null;
              const isQuiz = a.kind === "quiz";
              const openHref = isQuiz
                ? staff
                  ? `/practice/mock-exams?manage=${a.id}`
                  : `/practice/mock-exams/${a.id}`
                : `/course/${courseId}/assignment/${a.id}`;

              return (
                <div key={a.id} className="grid grid-cols-4 gap-3 px-4 py-3 text-sm items-center">
                  <div className="space-y-1">
                    <div className="font-medium">{a.title}</div>
                    <Link className="underline text-xs" href={openHref}>
                      {isQuiz ? "Open quiz" : "Open"}
                    </Link>
                    {isQuiz && submission && a.results_published ? (
                      <div>
                        <Link
                          className="underline text-xs text-slate-600"
                          href={`/practice/mock-exams/${a.id}?review=1`}
                        >
                          Review attempt
                        </Link>
                      </div>
                    ) : null}
                  </div>

                  <div className="text-neutral-600 capitalize">
                    {isQuiz ? (a.is_active === false ? "disabled" : "quiz") : a.status}
                  </div>

                  <div className="text-neutral-600">
                    {a.due_at && !isQuiz ? new Date(a.due_at).toLocaleString() : "—"}
                  </div>

                  <div className="text-right">
                    {grade ? (
                      <div className="inline-flex justify-end w-full">{gradeBadge(grade.score, a.max_score)}</div>
                    ) : submission ? (
                      isQuiz && a.results_published === false ? (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                          Results hidden
                        </span>
                      ) : (
                        "Pending"
                      )
                    ) : (
                      "No submission"
                    )}

                    {submission && !isQuiz ? (
                      <div className="text-xs text-neutral-500 mt-1 text-right">
                        {submission.file_name ? submission.file_name : "Unnamed file"}
                        {submission.created_at ? ` ? ${new Date(submission.created_at).toLocaleString()}` : ""}
                      </div>
                    ) : submission && isQuiz && submission.created_at ? (
                      <div className="text-xs text-neutral-500 mt-1 text-right">
                        Submitted {new Date(submission.created_at).toLocaleString()}
                      </div>
                    ) : null}


                    {grade?.feedback ? <div className="text-xs text-neutral-500 mt-1">{grade.feedback}</div> : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {staff ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="text-sm font-semibold">Offline grades (manual exams)</div>
            <button type="button" className="border rounded px-2 py-1 text-xs" onClick={() => setShowPaste((v) => !v)}>
              {showPaste ? "Close paste" : "Paste offline scores"}
            </button>
          </div>

          {showPaste ? (
            <div className="border rounded-lg p-3 space-y-2 bg-neutral-50">
              <div className="text-xs text-neutral-600">
                Paste one per line: <code>username, score, feedback</code>. Max score applies to all rows (optional).
              </div>

              <div className="flex gap-2 items-center">
                <input
                  type="number"
                  placeholder="Max score (optional)"
                  value={pasteMaxScore}
                  onChange={(e) => setPasteMaxScore(e.target.value)}
                  className="border rounded px-2 py-1 text-sm w-40"
                />
                <button type="button" className="border rounded px-3 py-1 text-sm" onClick={handlePasteUpload}>
                  Save pasted grades
                </button>
              </div>

              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                rows={6}
                className="w-full border rounded px-2 py-2 text-sm font-mono"
                placeholder={`studentA, 95, Great job\nstudentB, 82, Solid work`}
              />
            </div>
          ) : null}

          <div className="text-sm font-semibold">Offline grades (manual exams)</div>

          {offlineStudents.length === 0 ? (
            <div className="text-sm text-neutral-500">No students enrolled yet.</div>
          ) : (
            <div className="border rounded-lg divide-y">
              {offlineStudents.map((s) => {
                const latest = offlineGrades.find((g) => g.student_id === s.user_id);

                return (
                  <div key={s.user_id} className="p-3 grid md:grid-cols-5 gap-3 items-center">
                    <div className="md:col-span-2">
                      <div className="font-medium">{s.username || s.nickname || s.user_id}</div>
                      <div className="text-xs text-neutral-500">{s.user_id}</div>

                      {latest ? (
                        <div className="text-xs text-neutral-500 mt-1">
                          Last: {latest.title} {latest.score ?? "—"}
                          {latest.max_score ? ` / ${latest.max_score}` : ""}
                        </div>
                      ) : null}
                    </div>

                    <input
                      type="text"
                      placeholder="Title"
                      defaultValue={latest?.title || "Offline grade"}
                      className="border rounded px-2 py-2 text-sm"
                      id={`title-${s.user_id}`}
                    />

                    <div className="flex gap-2">
                      <input
                        type="number"
                        placeholder="Score"
                        defaultValue={latest?.score ?? ""}
                        className="border rounded px-2 py-2 text-sm w-full"
                        id={`score-${s.user_id}`}
                      />
                      <input
                        type="number"
                        placeholder="Max"
                        defaultValue={latest?.max_score ?? ""}
                        className="border rounded px-2 py-2 text-sm w-full"
                        id={`max-${s.user_id}`}
                      />
                    </div>

                    <div className="flex gap-2 md:col-span-1">
                      <input
                        type="text"
                        placeholder="Feedback"
                        defaultValue={latest?.feedback ?? ""}
                        className="border rounded px-2 py-2 text-sm w-full"
                        id={`fb-${s.user_id}`}
                      />

                      <button
                        type="button"
                        className="border rounded px-3 py-2 text-sm whitespace-nowrap"
                        disabled={savingOffline[s.user_id]}
                        onClick={() => {
                          const title =
                            (document.getElementById(`title-${s.user_id}`) as HTMLInputElement)?.value || "Offline grade";
                          const scoreRaw = (document.getElementById(`score-${s.user_id}`) as HTMLInputElement)?.value;
                          const maxRaw = (document.getElementById(`max-${s.user_id}`) as HTMLInputElement)?.value;
                          const feedback =
                            (document.getElementById(`fb-${s.user_id}`) as HTMLInputElement)?.value?.trim() || null;

                          saveOfflineGrade(s.user_id, {
                            title,
                            score: toNullableNumber(scoreRaw),
                            max_score: toNullableNumber(maxRaw),
                            feedback,
                          });
                        }}
                      >
                        {savingOffline[s.user_id] ? "Saving…" : "Save"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
