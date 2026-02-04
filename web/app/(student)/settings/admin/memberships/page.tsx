"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type CourseMini = { id: string; slug: string; title: string };

type ProfileMini = {
  user_id: string;
  username?: string | null;
  nickname: string | null;
  role: string | null;
  is_admin: boolean | null;
  avatar_url: string | null;
};

type TeacherRow = {
  teacher_id: string;
  created_at: string;
  profile: ProfileMini | null;
};

type StudentRow = {
  user_id: string;
  enrolled_at: string;
  profile: ProfileMini | null;
};

async function apiPOST<T>(path: string, token: string, body: any): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `Request failed: ${res.status}`);
  return json as T;
}

async function apiGET<T>(path: string, token: string): Promise<T> {
  const res = await fetch(path, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `Request failed: ${res.status}`);
  return json as T;
}

export default function AdminMembershipsPage() {
  const [token, setToken] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [courses, setCourses] = useState<CourseMini[]>([]);
  const [courseId, setCourseId] = useState<string>("");

  const [teachers, setTeachers] = useState<TeacherRow[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);

  const [busy, setBusy] = useState(false);

  // ✅ Search state
  const [teacherQ, setTeacherQ] = useState("");
  const [studentQ, setStudentQ] = useState("");
  const [teacherResults, setTeacherResults] = useState<ProfileMini[]>([]);
  const [studentResults, setStudentResults] = useState<ProfileMini[]>([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const [teacherOpen, setTeacherOpen] = useState(false);
  const [studentOpen, setStudentOpen] = useState(false);


  async function loadCourses(t: string) {
    const json = await apiGET<{ ok: boolean; courses: CourseMini[] }>(
      `${process.env.NEXT_PUBLIC_API_BASE}/api/admin/courses/list/`,
      t
    );
    const list = json.courses ?? [];
    setCourses(list);
    if (!courseId && list[0]?.id) setCourseId(list[0].id);
  }

  async function loadMembers(t: string, cid: string) {
    const json = await apiPOST<{ ok: boolean; teachers: TeacherRow[]; students: StudentRow[] }>(
      `${process.env.NEXT_PUBLIC_API_BASE}/api/admin/memberships/list/`,
      t,
      { course_id: cid }
    );
    setTeachers(json.teachers ?? []);
    setStudents(json.students ?? []);
  }

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setErr(null);

      const t = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;

      if (!t) {
        if (!cancelled) {
          setErr("Not logged in.");
          setLoading(false);
        }
        return;
      }

      if (!cancelled) setToken(t);

      try {
        await loadCourses(t);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message ?? "Failed to load courses");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!token || !courseId) return;
    setErr(null);
    loadMembers(token, courseId).catch((e) => setErr(e?.message ?? "Failed to load members"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, courseId]);

  async function setMember(kind: "teacher" | "student", action: "add" | "remove", user_id: string) {
    if (!token || !courseId) return;
    setBusy(true);
    setErr(null);

    try {
      await apiPOST(`${process.env.NEXT_PUBLIC_API_BASE}/api/admin/memberships/set/`, token, {
        course_id: courseId,
        kind,
        action,
        user_id,
      });

      await loadMembers(token, courseId);

      // clear result lists after add/remove
      if (kind === "teacher") setTeacherResults([]);
      if (kind === "student") setStudentResults([]);
    } catch (e: any) {
      setErr(e?.message ?? "Action failed");
    } finally {
      setBusy(false);
    }
  }
async function showAllTeachers() {
  if (!token) return;
  setTeacherOpen(true);
  setSearchBusy(true);
  setErr(null);
  try {
    const json = await apiPOST<{ ok: boolean; users: ProfileMini[] }>(
      `${process.env.NEXT_PUBLIC_API_BASE}/api/admin/users/search/`,
      token,
      {
        q: "",
        role: "teacher",
        limit: 50,
      }
    );
    setTeacherResults(json.users ?? []);
  } catch (e: any) {
    setErr(e?.message ?? "Failed to load teachers");
  } finally {
    setSearchBusy(false);
  }
}

async function showAllStudents() {
  if (!token) return;
  setStudentOpen(true);
  setSearchBusy(true);
  setErr(null);
  try {
    const json = await apiPOST<{ ok: boolean; users: ProfileMini[] }>(
      `${process.env.NEXT_PUBLIC_API_BASE}/api/admin/users/search/`,
      token,
      {
        q: "",
        role: "student",
        limit: 50,
      }
    );
    setStudentResults(json.users ?? []);
  } catch (e: any) {
    setErr(e?.message ?? "Failed to load students");
  } finally {
    setSearchBusy(false);
  }
}

  // ✅ search helper with small debounce
  useEffect(() => {
    if (!token) return;
    const q = teacherQ.trim();
    if (q.length < 2) {
      setTeacherResults([]);
      return;
    }

    const t = setTimeout(async () => {
      setSearchBusy(true);
      try {
        const json = await apiPOST<{ ok: boolean; users: ProfileMini[] }>(
          `${process.env.NEXT_PUBLIC_API_BASE}/api/admin/users/search/`,
          token,
          {
            q,
            role: "teacher",
            limit: 20,
          }
        );
        setTeacherResults(json.users ?? []);
      } catch (e: any) {
        setErr(e?.message ?? "Teacher search failed");
      } finally {
        setSearchBusy(false);
      }
    }, 250);

    return () => clearTimeout(t);
  }, [teacherQ, token]);

  useEffect(() => {
    if (!token) return;
    const q = studentQ.trim();
    if (q.length < 2) {
      setStudentResults([]);
      return;
    }

    const t = setTimeout(async () => {
      setSearchBusy(true);
      try {
        const json = await apiPOST<{ ok: boolean; users: ProfileMini[] }>(
          `${process.env.NEXT_PUBLIC_API_BASE}/api/admin/users/search/`,
          token,
          {
            q,
            role: "student",
            limit: 20,
          }
        );
        setStudentResults(json.users ?? []);
      } catch (e: any) {
        setErr(e?.message ?? "Student search failed");
      } finally {
        setSearchBusy(false);
      }
    }, 250);

    return () => clearTimeout(t);
  }, [studentQ, token]);

  const teacherIds = new Set(teachers.map((t) => t.teacher_id));
  const studentIds = new Set(students.map((s) => s.user_id));

  if (loading) return <div style={{ padding: 16 }}>Loading…</div>;

  return (
    <div className="p-5 space-y-6 max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Admin</div>
          <h1 className="text-2xl font-bold text-slate-900 leading-tight">Assign users to courses</h1>
          <p className="text-sm text-neutral-600">
            Manage course teachers and student enrollments. Search by nickname (2+ chars).
          </p>
        </div>
        <Link href="/settings" className="text-sm text-slate-600 underline">
          ← Back to Settings
        </Link>
      </div>

      {err ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 shadow-sm">
          {err}
        </div>
      ) : null}

      {/* Course selector */}
      <div className="rounded-2xl border bg-white shadow-sm p-4 space-y-3">
        <div className="text-sm font-semibold text-slate-800">Course</div>
        <select
          value={courseId}
          onChange={(e) => setCourseId(e.target.value)}
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-slate-400 focus:outline-none"
        >
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title} ({c.slug})
            </option>
          ))}
        </select>
      </div>

      {/* Lists */}
      <div className="grid gap-4 lg:grid-cols-2">
        <MemberColumn
          title="Teachers"
          placeholder="Search teacher by nickname..."
          q={teacherQ}
          setQ={setTeacherQ}
          results={teacherResults}
          open={teacherOpen}
          setOpen={setTeacherOpen}
          showAll={showAllTeachers}
          ids={teacherIds}
          kind="teacher"
          role="teacher"
          busy={busy}
          searchBusy={searchBusy}
          onAdd={(id) => setMember("teacher", "add", id)}
          onRemove={(id) => setMember("teacher", "remove", id)}
          members={teachers.map((t) => ({
            id: t.teacher_id,
            profile: t.profile,
          }))}
        />

        <MemberColumn
          title="Students"
          placeholder="Search student by nickname..."
          q={studentQ}
          setQ={setStudentQ}
          results={studentResults}
          open={studentOpen}
          setOpen={setStudentOpen}
          showAll={showAllStudents}
          ids={studentIds}
          kind="student"
          role="student"
          busy={busy}
          searchBusy={searchBusy}
          onAdd={(id) => setMember("student", "add", id)}
          onRemove={(id) => setMember("student", "remove", id)}
          members={students.map((s) => ({
            id: s.user_id,
            profile: s.profile,
          }))}
        />
      </div>
    </div>
  );
}

type MemberProfile = { id: string; profile: ProfileMini | null };

function MemberColumn({
  title,
  placeholder,
  q,
  setQ,
  results,
  open,
  setOpen,
  showAll,
  ids,
  kind,
  role,
  busy,
  searchBusy,
  onAdd,
  onRemove,
  members,
}: {
  title: string;
  placeholder: string;
  q: string;
  setQ: (v: string) => void;
  results: ProfileMini[];
  open: boolean;
  setOpen: (v: boolean) => void;
  showAll: () => void;
  ids: Set<string>;
  kind: "teacher" | "student";
  role: string;
  busy: boolean;
  searchBusy: boolean;
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
  members: MemberProfile[];
}) {
  return (
    <div className="rounded-2xl border bg-white shadow-sm p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm uppercase tracking-[0.15em] text-slate-500">{title}</div>
          <div className="text-xs text-neutral-500">Search by nickname or list all.</div>
        </div>
        <div className="text-xs rounded-full px-2 py-1 bg-slate-100 text-slate-600">{members.length} assigned</div>
      </div>

      <div className="flex gap-2">
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          placeholder={placeholder}
          className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-slate-400 focus:outline-none"
          disabled={busy}
        />
        <button
          type="button"
          onClick={showAll}
          disabled={busy}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-60"
        >
          Show all
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setQ("");
          }}
          disabled={busy}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-60"
        >
          Close
        </button>
      </div>

      {open ? (
        results.length > 0 ? (
          <div className="rounded-xl border border-slate-200 overflow-hidden bg-slate-50">
            {results.map((u) => {
              const already = ids.has(u.user_id);
              return (
                <div
                  key={u.user_id}
                  className="flex items-center justify-between gap-3 border-t border-slate-200 px-3 py-2 first:border-t-0"
                >
                  <div>
                    <div className="text-sm font-semibold text-slate-900">
                      {u.username ?? u.nickname ?? "Unknown"}
                      {u.nickname ? (
                        <span className="text-xs text-neutral-500 font-normal"> ({u.nickname})</span>
                      ) : null}
                    </div>
                    <div className="text-xs text-neutral-500">
                      role: {u.role ?? "—"} {u.is_admin ? "• admin" : ""}
                    </div>
                  </div>
                  <button
                    onClick={() => onAdd(u.user_id)}
                    disabled={busy || already}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-100 disabled:opacity-60"
                  >
                    {already ? "Added" : "Add"}
                  </button>
                </div>
              );
            })}
          </div>
        ) : q.trim().length >= 2 ? (
          <div className="text-xs text-neutral-500">{searchBusy ? "Searching..." : "No results"}</div>
        ) : (
          <div className="text-xs text-neutral-500">Type 2+ characters or click “Show all”.</div>
        )
      ) : null}

      <div className="space-y-2 pt-2">
        {members.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-sm text-neutral-500">
            No {title.toLowerCase()} assigned.
          </div>
        ) : (
          members.map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 shadow-sm"
            >
              <div>
                <div className="text-sm font-semibold text-slate-900">
                  {m.profile?.username ?? m.profile?.nickname ?? "Unknown"}
                  {m.profile?.nickname ? (
                    <span className="text-xs text-neutral-500 font-normal"> ({m.profile.nickname})</span>
                  ) : null}
                </div>
                <div className="text-xs text-neutral-500">
                  role: {m.profile?.role ?? "—"} {m.profile?.is_admin ? "• admin" : ""}
                </div>
              </div>
              <button
                onClick={() => onRemove(m.id)}
                disabled={busy}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-100 disabled:opacity-60"
              >
                Remove
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
