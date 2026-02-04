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
  if (loading) return <div className="p-4 text-sm text-neutral-600">Loading…</div>;
  if (error) return <div className="p-4 text-sm text-red-600">Error: {error}</div>;
  if (!unit) return <div className="p-4 text-sm text-neutral-600">Offline grade not found.</div>;

  if (!staff) {
    const g = gradeMap.get(profile?.user_id ?? "");
    const notReleased = unit.publish_at && Date.parse(unit.publish_at) > Date.now();
    return (
      <div className="p-4 space-y-3">
        <h1 className="text-xl font-semibold">{unit.title}</h1>
        <div className="text-sm text-neutral-600">Max score: {unit.max_score ?? "—"}</div>
        {notReleased ? (
          <div className="text-sm text-neutral-500">
            Grade will be visible on {new Date(unit.publish_at!).toLocaleString()}.
          </div>
        ) : g ? (
          <div className="border rounded p-4 space-y-2">
            <div className="text-lg font-semibold">
              {g.score ?? "—"}
              {unit.max_score ? ` / ${unit.max_score}` : ""}
            </div>
            {g.feedback ? <div className="text-sm text-neutral-600">{g.feedback}</div> : null}
          </div>
        ) : (
          <div className="text-sm text-neutral-500">No grade yet.</div>
        )}
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">{unit.title}</h1>
          <div className="text-sm text-neutral-600">
            Max score: {unit.max_score ?? "—"} · Releases: {unit.publish_at ? new Date(unit.publish_at).toLocaleString() : "immediately"}
          </div>
        </div>
        <div className="flex gap-2">
          <button className="underline text-sm" type="button" onClick={() => router.push(`/courses/${courseId}`)}>
            Back to course
          </button>
          <button
            className="border rounded px-3 py-2 text-sm text-red-600"
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
                router.push(`/courses/${courseId}`);
              } catch (e: any) {
                alert(e?.message ?? "Delete failed");
              }
            }}
          >
            Delete
          </button>
        </div>
      </div>

      <div className="border rounded-lg p-4 space-y-3">
        <div className="font-medium text-sm">Offline grade settings</div>
        <div className="flex flex-wrap gap-2 items-center text-sm">
          <input className="border rounded px-3 py-2" value={unitTitle} onChange={(e) => setUnitTitle(e.target.value)} placeholder="Title" />
          <input
            type="number"
            className="border rounded px-3 py-2 w-32"
            value={unitMax}
            onChange={(e) => setUnitMax(e.target.value)}
            placeholder="Max score"
          />
          <input
            type="datetime-local"
            className="border rounded px-3 py-2"
            value={unitPublish}
            onChange={(e) => setUnitPublish(e.target.value)}
          />
          <button className="border rounded px-3 py-2 text-sm" type="button" onClick={saveUnit}>
            Save settings
          </button>
        </div>
      </div>

      {students.length === 0 ? (
        <div className="text-sm text-neutral-500">No students enrolled.</div>
      ) : (
        <div className="border rounded-lg divide-y">
          {students.map((s) => {
            const g = gradeMap.get(s.user_id);
            return (
              <div key={s.user_id} className="p-3 grid md:grid-cols-4 gap-3 items-center">
                <div>
                  <div className="font-medium">{s.username || s.nickname || s.user_id}</div>
                  <div className="text-xs text-neutral-500">{s.user_id}</div>
                  <div className="text-xs text-neutral-500">
                    Graded: {g?.graded_at ? new Date(g.graded_at).toLocaleString() : "—"}
                  </div>
                </div>
                <input
                  type="number"
                  className="border rounded px-2 py-2 text-sm w-full"
                  value={scoreDraft[s.user_id] ?? ""}
                  placeholder="Score"
                  onChange={(e) => setScoreDraft((p) => ({ ...p, [s.user_id]: e.target.value }))}
                />
                <input
                  type="text"
                  className="border rounded px-2 py-2 text-sm w-full"
                  value={feedbackDraft[s.user_id] ?? ""}
                  placeholder="Feedback"
                  onChange={(e) => setFeedbackDraft((p) => ({ ...p, [s.user_id]: e.target.value }))}
                />
                <button
                  className="border rounded px-3 py-2 text-sm"
                  type="button"
                  disabled={saving[s.user_id]}
                  onClick={() => saveGrade(s.user_id)}
                >
                  {saving[s.user_id] ? "Saving…" : "Save grade"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
