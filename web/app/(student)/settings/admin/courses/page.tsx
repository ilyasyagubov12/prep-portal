"use client";

import { useEffect, useState } from "react";

type Course = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
};

export default function AdminCoursesPage() {
  // create form
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  // list + edit
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");

  const getToken = () =>
    typeof window !== "undefined" ? localStorage.getItem("access_token") : null;

  async function loadCourses() {
    setMsg(null);
    const token = getToken();
    if (!token) {
      setMsg("No session. Please log in again.");
      return;
    }

    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_BASE}/api/admin/courses/list/`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    const json = await res.json();
    if (!res.ok) {
      setMsg(json?.error ?? "Failed to load courses");
      return;
    }

    setCourses(json.courses ?? []);
  }

  useEffect(() => {
    loadCourses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createCourse() {
    setLoading(true);
    setMsg(null);

    const token = getToken();
    if (!token) {
      setMsg("No session. Please log in again.");
      setLoading(false);
      return;
    }

    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_BASE}/api/admin/courses/create/`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          slug: slug.trim(),
          title: title.trim(),
          description: description.trim() ? description.trim() : null,
        }),
      }
    );

    const json = await res.json();
    setLoading(false);

    if (!res.ok) {
      setMsg(json?.error ?? "Failed to create course");
      return;
    }

    setMsg("Course created ✅");
    setSlug("");
    setTitle("");
    setDescription("");
    await loadCourses();
  }

  function startEdit(c: Course) {
    setEditingId(c.id);
    setEditTitle(c.title ?? "");
    setEditDescription(c.description ?? "");
    setMsg(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditTitle("");
    setEditDescription("");
  }

  async function saveEdit(id: string) {
    setLoading(true);
    setMsg(null);

    const token = getToken();
    if (!token) {
      setMsg("No session. Please log in again.");
      setLoading(false);
      return;
    }

    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_BASE}/api/admin/courses/update/`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          id,
          title: editTitle.trim(),
          description: editDescription.trim() ? editDescription.trim() : null,
        }),
      }
    );

    const json = await res.json();
    setLoading(false);

    if (!res.ok) {
      setMsg(json?.error ?? "Failed to update course");
      return;
    }

    setMsg("Course updated ✅");
    cancelEdit();
    await loadCourses();
  }

  async function deleteCourse(id: string) {
    const ok = confirm("Delete this course? This cannot be undone.");
    if (!ok) return;

    setLoading(true);
    setMsg(null);

    const token = getToken();
    if (!token) {
      setMsg("No session. Please log in again.");
      setLoading(false);
      return;
    }

    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_BASE}/api/admin/courses/delete/`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id }),
      }
    );

    const json = await res.json();
    setLoading(false);

    if (!res.ok) {
      setMsg(json?.error ?? "Failed to delete course");
      return;
    }

    setMsg("Course deleted ✅");
    await loadCourses();
  }

  const disabledCreate = loading || !slug.trim() || !title.trim();

  return (
    <div className="p-5 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Admin</div>
          <h1 className="text-2xl font-bold text-slate-900 leading-tight">Courses</h1>
          <p className="text-sm text-neutral-600">Create, edit, and delete courses.</p>
        </div>
        {msg ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 shadow-sm">
            {msg}
          </div>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Create */}
        <div className="rounded-2xl border bg-white shadow-sm p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-sky-100 text-sky-700 grid place-items-center text-lg font-bold">
              +
            </div>
            <div>
              <div className="text-sm uppercase tracking-[0.15em] text-slate-500">Create</div>
              <div className="text-lg font-semibold text-slate-900">New course</div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-800">Slug</label>
            <input
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-slate-400 focus:outline-none"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="sat-writing"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-800">Title</label>
            <input
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-slate-400 focus:outline-none"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="SAT Writing"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-800">Description</label>
            <textarea
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-slate-400 focus:outline-none"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Grammar + transitions + punctuation"
              rows={3}
            />
          </div>

          <button
            onClick={createCourse}
            disabled={disabledCreate}
            className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-slate-800 disabled:opacity-60"
          >
            {loading ? "Working..." : "Create course"}
          </button>
        </div>

        {/* List + edit */}
        <div className="rounded-2xl border bg-white shadow-sm p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-indigo-100 text-indigo-700 grid place-items-center text-lg font-bold">
              📚
            </div>
            <div>
              <div className="text-sm uppercase tracking-[0.15em] text-slate-500">Existing</div>
              <div className="text-lg font-semibold text-slate-900">Courses</div>
            </div>
          </div>

          {courses.length === 0 ? (
            <div className="text-sm text-neutral-600">No courses yet.</div>
          ) : (
            <div className="space-y-3">
              {courses.map((c) => (
                <div key={c.id} className="rounded-xl border border-slate-200 p-4 shadow-sm bg-slate-50">
                  <div className="text-xs text-neutral-500">slug: {c.slug}</div>

                  {editingId === c.id ? (
                    <div className="mt-2 space-y-2">
                      <input
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-slate-400 focus:outline-none"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                      />
                      <textarea
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-slate-400 focus:outline-none"
                        rows={3}
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => saveEdit(c.id)}
                          disabled={loading || !editTitle.trim()}
                          className="rounded-lg px-4 py-2 bg-slate-900 text-white text-sm font-semibold shadow hover:bg-slate-800 disabled:opacity-60"
                        >
                          Save
                        </button>
                        <button
                          onClick={cancelEdit}
                          disabled={loading}
                          className="rounded-lg px-4 py-2 border text-sm"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="mt-1 text-lg font-semibold text-slate-900">{c.title}</div>
                      <div className="text-sm text-neutral-600">{c.description}</div>

                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={() => startEdit(c)}
                          disabled={loading}
                          className="rounded-lg px-4 py-2 border text-sm font-semibold"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deleteCourse(c.id)}
                          disabled={loading}
                          className="rounded-lg px-4 py-2 border text-sm font-semibold text-red-600"
                        >
                          Delete
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
