"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type Profile = { user_id: string; role: string | null; is_admin: boolean | null; username?: string | null; nickname?: string | null };
type OfflineUnit = {
  id: string;
  course: string;
  title: string;
  max_score: number | null;
  created_at: string;
  publish_at?: string | null;
};
type OfflineGrade = {
  id: string;
  unit: string;
  student: string;
  score: number | null;
  feedback: string | null;
  graded_at: string;
};
type Student = { user_id: string; username: string | null; nickname: string | null };

const API_BASE = process.env.NEXT_PUBLIC_API_BASE;

function isStaff(p: Profile | null) {
  if (!p) return false;
  const r = (p.role ?? "").toLowerCase();
  return r === "teacher" || r === "admin" || !!p.is_admin;
}

export default function OfflineGradePage() {
  const params = useParams<{ courseId: string; unitId: string }>();
  const courseId = params.courseId;
  const unitId = params.unitId;
  const router = useRouter();

  const [token, setToken] = useState<string | null>(null);
  const [courseSlug, setCourseSlug] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [unit, setUnit] = useState<OfflineUnit | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [grades, setGrades] = useState<OfflineGrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [unitTitle, setUnitTitle] = useState("");
  const [unitMax, setUnitMax] = useState<string>("");
  const [unitPublish, setUnitPublish] = useState<string>("");

  // drafts
  const [scoreDraft, setScoreDraft] = useState<Record<string, string>>({});
  const [feedbackDraft, setFeedbackDraft] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const tok = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
      if (!tok) {
        router.replace("/login");
        return;
      }
      setToken(tok);

      // profile
      const meRes = await fetch(`${API_BASE}/api/auth/me/`, { headers: { Authorization: `Bearer ${tok}` } }).catch(() => null);
      if (!meRes || !meRes.ok) {
        router.replace("/login");
        return;
      }
      const me = await meRes.json().catch(() => null);
      if (!me || cancelled) return;
      const prof: Profile = {
        user_id: me.user?.id,
        role: me.role ?? null,
        is_admin: me.is_admin ?? false,
        username: me.user?.username ?? null,
        nickname: me.nickname ?? null,
      };
      setProfile(prof);

      await loadData(tok);
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [courseId, unitId, router]);

  useEffect(() => {
    let cancelled = false;
    async function loadCourseSlug() {
      if (!token || !courseId) return;
      const res = await fetch(`${API_BASE}/api/courses/`, {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => null);
      if (!res || !res.ok || cancelled) return;
      const list = await res.json().catch(() => []);
      const match = (Array.isArray(list) ? list : []).find((c: any) => c.id === courseId);
      if (match?.slug) setCourseSlug(match.slug);
    }
    loadCourseSlug();
    return () => {
      cancelled = true;
    };
  }, [token, courseId]);

  async function loadData(tok: string) {
    const safeJson = async (res: Response | null) => {
      if (!res) return null;
      try {
        return await res.json();
      } catch {
        return null;
      }
    };

    setError(null);
    // units and grades
    const unitsRes = await fetch(`${API_BASE}/api/offline/units/list/?course_id=${courseId}`, {
      headers: { Authorization: `Bearer ${tok}` },
    }).catch(() => null);
    const unitsJson = await safeJson(unitsRes);
    if (!unitsRes || !unitsRes.ok) {
      setError(unitsJson?.error || `Failed to load offline unit (status ${unitsRes?.status ?? "??"})`);
      return;
    }
    const found = (unitsJson?.units ?? []).find((u: any) => u.id === unitId) as OfflineUnit | undefined;
    if (!found) {
      setError("Offline grade not found");
      return;
    }
    setUnit(found);
    setUnitTitle(found.title);
    setUnitMax(found.max_score != null ? String(found.max_score) : "");
      setUnitPublish(found.publish_at ? new Date(found.publish_at).toISOString().slice(0, 16) : "");

    // students (people endpoint)
    const peopleRes = await fetch(`${API_BASE}/api/courses/people/?course_id=${courseId}`, {
      headers: { Authorization: `Bearer ${tok}` },
    }).catch(() => null);
    const peopleJson = await safeJson(peopleRes);
    if (peopleRes && peopleRes.ok) {
      setStudents((peopleJson?.students ?? []).map((s: any) => ({ user_id: s.user_id, username: s.username ?? null, nickname: s.nickname ?? null })));
    }

    // grades
    const gradesRes = await fetch(`${API_BASE}/api/offline/grades/list/?unit_id=${unitId}`, {
      headers: { Authorization: `Bearer ${tok}` },
    }).catch(() => null);
    const gradesJson = await safeJson(gradesRes);
    if (gradesRes && gradesRes.ok) {
      const gs: OfflineGrade[] = (gradesJson?.grades ?? []).map((g: any) => ({
        id: g.id,
        unit: g.unit,
        student: g.student,
        score: g.score,
        feedback: g.feedback,
        graded_at: g.graded_at,
      }));
      setGrades(gs);
      const sDraft: Record<string, string> = {};
      const fDraft: Record<string, string> = {};
      gs.forEach((g) => {
        sDraft[g.student] = g.score != null ? String(g.score) : "";
        fDraft[g.student] = g.feedback ?? "";
      });
      setScoreDraft(sDraft);
      setFeedbackDraft(fDraft);
    } else if (gradesRes && !gradesRes.ok) {
      setError(gradesJson?.error || `Failed to load grades (status ${gradesRes.status})`);
    }
  }

  const gradeMap = useMemo(() => {
    const m = new Map<string, OfflineGrade>();
    grades.forEach((g) => m.set(g.student, g));
    return m;
  }, [grades]);

  const gradedCount = useMemo(
    () => grades.filter((g) => g.score !== null && typeof g.score !== "undefined").length,
    [grades]
  );

  async function saveUnit() {
    if (!token || !unit) return;
    const title = unitTitle.trim();
    if (!title) return alert("Title required");
    const max = unitMax.trim() === "" ? null : Number(unitMax);
    const publish_at = unitPublish ? new Date(unitPublish).toISOString() : null;
    const res = await fetch(`${API_BASE}/api/offline/units/update/`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ unit_id: unit.id, title, max_score: max, publish_at }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      alert(j?.error || "Update failed");
      return;
    }
    setUnit((u) => (u ? { ...u, title, max_score: max, publish_at } : u));
    alert("Saved");
  }

  async function saveGrade(studentId: string) {
    if (!token || !unit) return;
    setSaving((p) => ({ ...p, [studentId]: true }));
    try {
      const scoreRaw = scoreDraft[studentId] ?? "";
      const feedbackRaw = feedbackDraft[studentId] ?? "";
      const score = scoreRaw === "" ? null : Number(scoreRaw);
      const feedback = feedbackRaw.trim() ? feedbackRaw.trim() : null;
      const res = await fetch(`${API_BASE}/api/offline/grades/upsert/`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ unit_id: unit.id, student_id: studentId, score, feedback }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "Save failed");
      const g = json.grade as OfflineGrade;
      setGrades((prev) => {
        const filtered = prev.filter((x) => x.student !== studentId);
        return [...filtered, g];
      });
    } catch (e: any) {
      alert(e?.message ?? "Save failed");
    } finally {
      setSaving((p) => ({ ...p, [studentId]: false }));
    }
  }

  const staff = isStaff(profile);
  if (loading) return <div className="p-4 text-sm text-neutral-600">Loading...</div>;
  if (error) return <div className="p-4 text-sm text-red-600">Error: {error}</div>;
  if (!unit) return <div className="p-4 text-sm text-neutral-600">Offline grade not found.</div>;

  if (!staff) {
    const g = gradeMap.get(profile?.user_id ?? "");
    const notReleased = unit.publish_at && Date.parse(unit.publish_at) > Date.now();
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-4xl p-4 sm:p-6 space-y-4">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-xs uppercase tracking-[0.25em] text-slate-400">Offline Grade</div>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900">{unit.title}</h1>
            <div className="mt-1 text-sm text-slate-600">Max score: {unit.max_score ?? "-"}</div>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            {notReleased ? (
              <div className="text-sm text-slate-500">
                Grade will be visible on {new Date(unit.publish_at!).toLocaleString()}.
              </div>
            ) : g ? (
              <div className="space-y-2">
                <div className="text-lg font-semibold text-slate-900">
                  {g.score ?? "-"}
                  {unit.max_score ? ` / ${unit.max_score}` : ""}
                </div>
                {g.feedback ? <div className="text-sm text-slate-600">{g.feedback}</div> : null}
              </div>
            ) : (
              <div className="text-sm text-slate-500">No grade yet.</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl p-4 sm:p-6 space-y-5">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-xs uppercase tracking-[0.25em] text-slate-400">Offline Grade</div>
              <h1 className="mt-2 text-2xl font-semibold text-slate-900">{unit.title}</h1>
              <div className="mt-1 text-sm text-slate-600">
                Max score: {unit.max_score ?? "-"} - Release: {unit.publish_at ? new Date(unit.publish_at).toLocaleString() : "Immediately"}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-300"
                type="button"
                onClick={() => router.push(courseSlug ? `/courses/${courseSlug}` : "/courses")}
              >
                Back to course
              </button>
              <button
                className="rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-100"
                type="button"
                onClick={async () => {
                  if (!token || !unit) return;
                  if (!confirm("Delete this offline grade item and all its grades?")) return;
                  try {
                    const res = await fetch(`${API_BASE}/api/offline/units/delete/`, {
                      method: "POST",
                      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                      body: JSON.stringify({ unit_id: unit.id, course_id: courseId }),
                    });
                    const json = await res.json().catch(() => null);
                    if (!res.ok) throw new Error(json?.error || "Delete failed");
                    router.push(courseSlug ? `/courses/${courseSlug}` : "/courses");
                  } catch (e: any) {
                    alert(e?.message ?? "Delete failed");
                  }
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm">
            <div className="text-sm font-semibold text-slate-900">Offline grade settings</div>
            <div className="text-xs text-slate-500">Update title, max score, or release time.</div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="space-y-2 text-xs font-semibold text-slate-600">
                Title
                <input
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-900/10"
                  value={unitTitle}
                  onChange={(e) => setUnitTitle(e.target.value)}
                  placeholder="Title"
                />
              </label>
              <label className="space-y-2 text-xs font-semibold text-slate-600">
                Max score
                <input
                  type="number"
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-900/10"
                  value={unitMax}
                  onChange={(e) => setUnitMax(e.target.value)}
                  placeholder="Max score"
                />
              </label>
              <label className="space-y-2 text-xs font-semibold text-slate-600 sm:col-span-2">
                Release date & time
                <input
                  type="datetime-local"
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-900/10"
                  value={unitPublish}
                  onChange={(e) => setUnitPublish(e.target.value)}
                />
              </label>
            </div>
            <div className="mt-4 flex items-center justify-end">
              <button
                className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                type="button"
                onClick={saveUnit}
              >
                Save settings
              </button>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm">
            <div className="text-sm font-semibold text-slate-900">Progress</div>
            <div className="text-xs text-slate-500">Quick snapshot for this offline grade.</div>
            <div className="mt-4 space-y-3 text-sm text-slate-600">
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <span>Total students</span>
                <span className="font-semibold text-slate-900">{students.length}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <span>Graded</span>
                <span className="font-semibold text-slate-900">{gradedCount}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <span>Pending</span>
                <span className="font-semibold text-slate-900">{Math.max(0, students.length - gradedCount)}</span>
              </div>
            </div>
          </div>
        </div>

        {students.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm">
            No students enrolled.
          </div>
        ) : (
          <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="flex flex-col gap-2 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-900">Students</div>
                <div className="text-xs text-slate-500">Enter scores and feedback. Save per student.</div>
              </div>
              <div className="text-xs text-slate-500">{gradedCount}/{students.length} graded</div>
            </div>
            <div className="divide-y divide-slate-100">
              {students.map((s) => {
                const g = gradeMap.get(s.user_id);
                return (
                  <div key={s.user_id} className="p-4 grid gap-3 lg:grid-cols-[1.2fr_0.6fr_1fr_auto] items-start">
                    <div>
                      <div className="font-semibold text-slate-900">{s.nickname || s.username || s.user_id}</div>
                      <div className="text-xs text-slate-500">{s.username ? `@${s.username}` : s.user_id}</div>
                      <div className="text-xs text-slate-500">Graded: {g?.graded_at ? new Date(g.graded_at).toLocaleString() : "-"}</div>
                    </div>
                    <input
                      type="number"
                      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-900/10"
                      value={scoreDraft[s.user_id] ?? ""}
                      placeholder="Score"
                      onChange={(e) => setScoreDraft((p) => ({ ...p, [s.user_id]: e.target.value }))}
                    />
                    <input
                      type="text"
                      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-900/10"
                      value={feedbackDraft[s.user_id] ?? ""}
                      placeholder="Feedback (optional)"
                      onChange={(e) => setFeedbackDraft((p) => ({ ...p, [s.user_id]: e.target.value }))}
                    />
                    <button
                      className="h-11 rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:border-slate-300"
                      type="button"
                      disabled={saving[s.user_id]}
                      onClick={() => saveGrade(s.user_id)}
                    >
                      {saving[s.user_id] ? "Saving..." : "Save"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
