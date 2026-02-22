"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { subjects } from "@/lib/questionBank/topics";
import { useRef } from "react";

type Question = {
  id: string;
  subject: string;
  topic: string;
  subtopic?: string | null;
  stem: string;
  published: boolean;
};

export default function ManageQuestionsPage() {
  const [subject, setSubject] = useState<"verbal" | "math">("verbal");
  const [topic, setTopic] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [subtopic, setSubtopic] = useState("");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const token =
    typeof window !== "undefined" ? localStorage.getItem("access_token") : null;

  async function load() {
    if (!token) {
      setErr("Not logged in");
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE}/api/questions/?subject=${subject}${
          topic ? `&topic=${encodeURIComponent(topic)}` : ""
        }${subtopic ? `&subtopic=${encodeURIComponent(subtopic)}` : ""}${
          search ? `&q=${encodeURIComponent(search)}` : ""
        }`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to load");
      setQuestions(json.questions ?? []);
      setSelectedIds(new Set());
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  async function importCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!token) {
      setErr("Not logged in");
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/api/questions/import/`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const text = await res.text();
      let json: any = null;
      try {
        json = text ? JSON.parse(text) : {};
      } catch {
        throw new Error(text || "Import failed (non-JSON response)");
      }
      if (!res.ok) throw new Error(json?.error || "Import failed");
      setErr(
        json.errors?.length
          ? `Imported ${json.created}, some rows skipped: ${json.errors.slice(0, 3).join("; ")}`
          : `Imported ${json.created} questions`
      );
      await load();
    } catch (e: any) {
      setErr(e?.message ?? "Import failed");
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function deleteQuestion(id: string) {
    if (!token) {
      setErr("Not logged in");
      return;
    }
    const ok = confirm("Delete this question?");
    if (!ok) return;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/api/questions/${id}/`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "Delete failed");
      setQuestions((q) => q.filter((x) => x.id !== id));
    } catch (e: any) {
      setErr(e?.message ?? "Delete failed");
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((prev) => {
      if (questions.length === 0) return new Set();
      const allSelected = questions.every((q) => prev.has(q.id));
      if (allSelected) return new Set();
      return new Set(questions.map((q) => q.id));
    });
  }

  async function deleteSelected() {
    if (!token) {
      setErr("Not logged in");
      return;
    }
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    const ok = confirm(`Delete ${ids.length} question(s)?`);
    if (!ok) return;
    setBulkDeleting(true);
    setErr(null);
    const deleted: string[] = [];
    const failed: string[] = [];
    await Promise.all(
      ids.map(async (id) => {
        try {
          const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/api/questions/${id}/`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          });
          const json = await res.json().catch(() => null);
          if (!res.ok) throw new Error(json?.error || "Delete failed");
          deleted.push(id);
        } catch {
          failed.push(id);
        }
      })
    );
    if (deleted.length) {
      setQuestions((q) => q.filter((x) => !deleted.includes(x.id)));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        deleted.forEach((id) => next.delete(id));
        return next;
      });
    }
    if (failed.length) {
      setErr(`Failed to delete ${failed.length} question(s).`);
    }
    setBulkDeleting(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const topicOptions = useMemo(() => subjects[subject]?.map((t) => t.title) ?? [], [subject]);
  const subtopicOptions = useMemo(() => {
    const group = subjects[subject]?.find((t) => t.title === topic);
    return group?.subtopics?.map((s) => s.title) ?? [];
  }, [subject, topic]);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Admin</div>
          <h1 className="text-2xl font-bold text-slate-900">Manage questions</h1>
          <p className="text-sm text-neutral-600">Filter by subject/topic, edit or delete.</p>
        </div>
        <Link className="text-sm underline text-slate-600" href="/practice/questions">
          ← Back to Question Bank
        </Link>
      </div>

      {err ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {err}
        </div>
      ) : null}

      <div className="rounded-2xl border bg-white shadow-sm p-4 space-y-3">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-800">Subject</label>
            <select
              value={subject}
              onChange={(e) => setSubject(e.target.value as "verbal" | "math")}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-slate-400 focus:outline-none"
            >
              <option value="verbal">Verbal</option>
              <option value="math">Math</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-800">Topic (optional)</label>
            <select
              value={topic}
              onChange={(e) => {
                setTopic(e.target.value);
                setSubtopic("");
              }}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-slate-400 focus:outline-none"
            >
              <option value="">All topics</option>
              {topicOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-800">Subtopic (optional)</label>
            <select
              value={subtopic}
              onChange={(e) => setSubtopic(e.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-slate-400 focus:outline-none"
            >
              <option value="">All subtopics</option>
              {subtopicOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-800">Search keywords</label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-slate-400 focus:outline-none"
              placeholder="stem, passage, etc."
            />
          </div>
        </div>
        <button
          onClick={load}
          className="rounded-xl bg-slate-900 text-white px-4 py-2 text-sm font-semibold shadow hover:bg-slate-800"
        >
          {loading ? "Loading…" : "Apply filter"}
        </button>
      </div>

      <div className="rounded-2xl border bg-white shadow-sm p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-800">Results</div>
          <div className="flex items-center gap-3 text-xs text-neutral-500">
            <span>{questions.length} found</span>
            <span>{selectedIds.size} selected</span>
            <label className="inline-flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="text-xs"
                onChange={importCsv}
              />
              <span className="text-indigo-600 font-semibold cursor-pointer">Import CSV</span>
            </label>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-100"
            onClick={toggleSelectAll}
            disabled={questions.length === 0}
          >
            {questions.length > 0 && questions.every((q) => selectedIds.has(q.id))
              ? "Clear all"
              : "Select all"}
          </button>
          <button
            type="button"
            className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 shadow-sm hover:bg-red-50 disabled:opacity-60"
            onClick={deleteSelected}
            disabled={selectedIds.size === 0 || bulkDeleting}
          >
            {bulkDeleting ? "Deleting…" : "Delete selected"}
          </button>
        </div>
        {questions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-sm text-neutral-600">
            No questions.
          </div>
        ) : (
          <div className="space-y-2 max-h-[600px] overflow-auto">
            {questions.map((q) => (
              <div
                key={q.id}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 shadow-sm flex flex-col gap-2"
              >
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={selectedIds.has(q.id)}
                    onChange={() => toggleSelect(q.id)}
                    aria-label={`Select question ${q.id}`}
                  />
                  <div className="text-xs text-neutral-500 uppercase tracking-[0.12em]">
                    {q.subject} • {q.topic}
                    {q.subtopic ? ` • ${q.subtopic}` : ""}
                  </div>
                </div>
                <div className="text-sm text-neutral-900 line-clamp-2" dangerouslySetInnerHTML={{ __html: q.stem }} />
                <div className="flex gap-2 pt-1">
                  <Link
                    href={`/practice/questions/edit/${q.id}`}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-100"
                  >
                    Edit
                  </Link>
                  <button
                    onClick={() => deleteQuestion(q.id)}
                    className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 shadow-sm hover:bg-red-50"
                  >
                    Delete
                  </button>
                  <span className="ml-auto text-xs rounded-full px-2 py-1 border border-slate-200 bg-white text-slate-600">
                    {q.published ? "Published" : "Draft"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
