"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { Assignment, Submission, Grade, AssignmentFile } from "@/lib/types/assignment";

type Profile = {
  user_id: string;
  role: string | null;
  is_admin: boolean | null;
  username?: string | null;
  nickname?: string | null;
};

type SubmissionRow = Submission & {
  grade?: Grade | null;
  student?: { user_id: string; username?: string | null; nickname?: string | null };
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE;

function isTeacherOrAdmin(p: Profile | null) {
  if (!p) return false;
  const role = (p.role ?? "").toLowerCase();
  return role === "teacher" || role === "admin" || !!p.is_admin;
}

async function apiPOST<T>(url: string, token: string, body: any): Promise<T> {
  const res = await fetch(url, {
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

function toDatetimeLocal(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AssignmentPage() {
  const params = useParams<{ courseId: string; assignmentId: string }>();
  const router = useRouter();
  const courseId = params.courseId;
  const assignmentId = params.assignmentId;

  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [bodyText, setBodyText] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [maxScore, setMaxScore] = useState("");
  const [maxSubs, setMaxSubs] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [attachments, setAttachments] = useState<AssignmentFile[]>([]);
  const [attachmentBusy, setAttachmentBusy] = useState(false);

  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [saveBusy, setSaveBusy] = useState(false);
  const [publishBusy, setPublishBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const canManage = isTeacherOrAdmin(profile);
  const mediaUrl = (path: string | null | undefined) => {
    if (!path) return "";
    if (path.startsWith("http://") || path.startsWith("https://")) return path;
    return `${API_BASE}/media/${path}`;
  };

  // auth + profile
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
      if (!token) {
        router.replace("/login");
        return;
      }
      setAccessToken(token);

      const meRes = await fetch(`${API_BASE}/api/auth/me/`, {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => null);
      if (!meRes || !meRes.ok) {
        router.replace("/login");
        return;
      }
      const me = await meRes.json().catch(() => null);
      if (cancelled || !me) return;
      setProfile({
        user_id: me.user?.id,
        role: me.role ?? null,
        is_admin: me.is_admin ?? false,
        username: me.user?.username ?? null,
        nickname: me.nickname ?? null,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  // load assignment
  useEffect(() => {
    let cancelled = false;
    async function loadAll() {
      if (!assignmentId || !accessToken || !profile) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_BASE}/api/assignments/detail/?assignment_id=${assignmentId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "Assignment not found");
        const a = json.assignment as Assignment;
        if (!isTeacherOrAdmin(profile) && a.status !== "published") {
          throw new Error("This assignment is not published yet.");
        }
        setAssignment(a);
        setBodyText(typeof a.body === "string" ? a.body : JSON.stringify(a.body ?? "", null, 2));
        setDueAt(a.due_at ? toDatetimeLocal(a.due_at) : "");
        setMaxScore(a.max_score != null ? String(a.max_score) : "");
        setMaxSubs(a.max_submissions != null ? String(a.max_submissions) : "");
        await Promise.all([loadAttachments(a.id), loadSubmissions(a.id)]);
      } catch (e: any) {
        setError(e?.message ?? "Failed to load assignment");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadAll();
    return () => {
      cancelled = true;
    };
  }, [assignmentId, accessToken, profile]);

  async function loadAttachments(aid: string) {
    if (!accessToken) return;
    const res = await fetch(`${API_BASE}/api/assignments/attachments/list/?assignment_id=${aid}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    }).catch(() => null);
    if (!res || !res.ok) return;
    const json = await res.json().catch(() => null);
    setAttachments(
      (json?.files ?? []).map((f: any) => ({
        ...f,
        assignment_id: f.assignment ?? f.assignment_id ?? aid,
        url: f.url ?? null,
      }))
    );
  }

  async function loadSubmissions(aid: string) {
    if (!accessToken) return;
    const res = await fetch(`${API_BASE}/api/assignments/submissions/list/?assignment_id=${aid}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    }).catch(() => null);
    if (!res || !res.ok) {
      setSubmissions([]);
      return;
    }
    const json = await res.json().catch(() => null);
    let subs: SubmissionRow[] = (json?.submissions ?? []).map((s: any) => ({
      ...s,
      assignment_id: s.assignment ?? s.assignment_id ?? aid,
      student_id: s.student ?? s.student_id ?? "",
      grade: (s as any).grade ?? null,
      student: (s as any).student_obj ?? undefined,
      file_url: (s as any).file_url ?? null,
    }));
    if (!canManage && profile) subs = subs.filter((s) => s.student_id === profile.user_id);
    setSubmissions(subs);
  }

  async function saveAssignment() {
    if (!assignment || !accessToken) return;
    setSaveBusy(true);
    setError(null);
    try {
      const res = await apiPOST<{ ok: boolean; assignment: Assignment }>(`${API_BASE}/api/assignments/update/`, accessToken, {
        assignment_id: assignment.id,
        title: assignment.title,
        body: bodyText || null,
        due_at: dueAt ? new Date(dueAt).toISOString() : null,
        max_score: maxScore === "" ? null : Number(maxScore),
        max_submissions: maxSubs === "" ? null : Number(maxSubs),
      });
      setAssignment(res.assignment);
      setDueAt(res.assignment.due_at ? toDatetimeLocal(res.assignment.due_at) : "");
    } catch (e: any) {
      setError(e?.message ?? "Failed to save");
    } finally {
      setSaveBusy(false);
    }
  }

  async function publishAssignment(publish: boolean) {
    if (!assignment || !accessToken) return;
    setPublishBusy(true);
    setError(null);
    try {
      const res = await apiPOST<{ ok: boolean; assignment: Assignment }>(`${API_BASE}/api/assignments/update/`, accessToken, {
        assignment_id: assignment.id,
        status: publish ? "published" : "draft",
      });
      setAssignment(res.assignment);
    } catch (e: any) {
      setError(e?.message ?? "Failed to update status");
    } finally {
      setPublishBusy(false);
    }
  }

  async function deleteAssignment() {
    if (!assignment || !accessToken) return;
    if (!confirm("Delete this assignment? This will remove its submissions and grades.")) return;
    setDeleteBusy(true);
    setError(null);
    try {
      await apiPOST(`${API_BASE}/api/assignments/delete/`, accessToken, { assignment_id: assignment.id });
      router.push(`/courses/${courseId}`);
    } catch (e: any) {
      setError(e?.message ?? "Failed to delete");
    } finally {
      setDeleteBusy(false);
    }
  }

  async function uploadAttachment(file: File) {
    if (!assignment || !accessToken) return;
    setAttachmentBusy(true);
    try {
      const form = new FormData();
      form.append("assignment_id", assignment.id);
      form.append("file", file);
      const res = await fetch(`${API_BASE}/api/assignments/attachments/upload/`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "Upload failed");
      await loadAttachments(assignment.id);
    } catch (e: any) {
      setError(e?.message ?? "Attachment upload failed");
    } finally {
      setAttachmentBusy(false);
    }
  }

  async function deleteAttachment(storage_path: string) {
    if (!assignment || !accessToken) return;
    await apiPOST(`${API_BASE}/api/assignments/attachments/delete/`, accessToken, {
      assignment_id: assignment.id,
      storage_path,
    });
    await loadAttachments(assignment.id);
  }

  async function uploadSubmission() {
    if (!assignment || !accessToken || !selectedFile) return;
    if (!canManage && pastDue) {
      setError("Deadline passed");
      return;
    }
    if (!canManage && assignment.max_submissions && profile) {
      const count = submissions.filter((s) => s.student_id === profile.user_id).length;
      if (count >= assignment.max_submissions) {
        setError("Submission limit reached");
        return;
      }
    }
    setSubmitBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("assignment_id", assignment.id);
      form.append("file", selectedFile);
      const res = await fetch(`${API_BASE}/api/assignments/submissions/create/`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "Upload failed");
      setSelectedFile(null);
      await loadSubmissions(assignment.id);
    } catch (e: any) {
      setError(e?.message ?? "Upload failed");
    } finally {
      setSubmitBusy(false);
    }
  }

  async function saveGrade(sub: SubmissionRow, score: number | null, feedback: string | null) {
    if (!accessToken) return;
    try {
      const res = await apiPOST<{ ok: boolean; grade: Grade }>(`${API_BASE}/api/assignments/grade/`, accessToken, {
        submission_id: sub.id,
        score,
        feedback,
      });
      setSubmissions((prev) =>
        prev.map((s) => (s.id === sub.id ? { ...s, grade: res.grade } : s))
      );
    } catch (e: any) {
      setError(e?.message ?? "Failed to save grade");
    }
  }

  const statusLabel = useMemo(() => {
    if (!assignment) return "";
    return assignment.status === "published" ? "Published" : "Draft";
  }, [assignment]);

  const pastDue = useMemo(() => {
    if (!assignment?.due_at) return false;
    return Date.now() > Date.parse(assignment.due_at);
  }, [assignment?.due_at]);

  const submissionsUsed = useMemo(() => {
    if (!assignment?.max_submissions || !profile) return 0;
    return submissions.filter((s) => s.student_id === profile.user_id).length;
  }, [assignment?.max_submissions, profile, submissions]);

  const submissionsLeft = useMemo(() => {
    if (!assignment?.max_submissions) return null;
    return Math.max(0, assignment.max_submissions - submissionsUsed);
  }, [assignment?.max_submissions, submissionsUsed]);

  const groupedSubmissions = useMemo(() => {
    if (!canManage) return null;
    const byStudent = new Map<string, { name: string; submissions: SubmissionRow[] }>();
    const sorted = [...submissions].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    for (const s of sorted) {
      const key = s.student_id;
      const name = s.student?.username || s.student?.nickname || key.slice(0, 8);
      const entry = byStudent.get(key) ?? { name, submissions: [] };
      entry.submissions.push(s);
      byStudent.set(key, entry);
    }
    return Array.from(byStudent.entries()).map(([studentId, entry]) => ({
      studentId,
      name: entry.name,
      submissions: entry.submissions,
    }));
  }, [submissions, canManage]);

  if (loading) return <div className="p-4">Loading assignment…</div>;
  if (error) return <div className="p-4 text-red-600">Error: {error}</div>;
  if (!assignment) return null;

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs text-neutral-500">Assignment</div>
          <h1 className="text-xl font-semibold">{assignment.title}</h1>
          <div className="text-sm text-neutral-600">
            Status: {statusLabel}
            {assignment.published_at ? ` · Published at ${new Date(assignment.published_at).toLocaleString()}` : ""}
          </div>
        </div>
        <button className="text-sm underline" type="button" onClick={() => router.push(`/courses/${courseId}`)}>
          Back to course
        </button>
      </div>

      {canManage ? (
        <div className="border rounded-lg p-4 space-y-3">
          <div className="font-medium">Teacher controls</div>

          <label className="grid gap-1 text-sm">
            <span className="text-xs text-neutral-600">Title</span>
            <input
              className="border rounded px-3 py-2 text-sm"
              value={assignment.title}
              onChange={(e) => setAssignment((a) => (a ? { ...a, title: e.target.value } : a))}
            />
          </label>

          <label className="grid gap-1 text-sm">
            <span className="text-xs text-neutral-600">Description / Body</span>
            <textarea
              className="border rounded px-3 py-2 text-sm h-32"
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
            />
          </label>

          <div className="grid md:grid-cols-3 gap-3">
            <label className="grid gap-1 text-sm">
              <span className="text-xs text-neutral-600">Due date</span>
              <input
                type="datetime-local"
                className="border rounded px-3 py-2 text-sm"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-xs text-neutral-600">Max score</span>
              <input
                type="number"
                className="border rounded px-3 py-2 text-sm"
                value={maxScore}
                onChange={(e) => setMaxScore(e.target.value)}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-xs text-neutral-600">Max submissions</span>
              <input
                type="number"
                className="border rounded px-3 py-2 text-sm"
                value={maxSubs}
                onChange={(e) => setMaxSubs(e.target.value)}
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            <button className="border rounded px-3 py-2 text-sm" type="button" onClick={saveAssignment} disabled={saveBusy}>
              {saveBusy ? "Saving…" : "Save draft"}
            </button>
            <button
              className="border rounded px-3 py-2 text-sm"
              type="button"
              onClick={() => publishAssignment(assignment.status !== "published")}
              disabled={publishBusy}
            >
              {publishBusy ? "Working…" : assignment.status === "published" ? "Unpublish" : "Publish"}
            </button>
            <button
              className="border rounded px-3 py-2 text-sm text-red-600"
              type="button"
              onClick={deleteAssignment}
              disabled={deleteBusy}
            >
              {deleteBusy ? "Deleting…" : "Delete"}
            </button>
          </div>
        </div>
      ) : null}

      {!canManage ? (
        <div className="border rounded-lg p-4 space-y-2">
          <div className="font-medium">Assignment details</div>
          {assignment.due_at ? <div className="text-sm">Due: {new Date(assignment.due_at).toLocaleString()}</div> : null}
          {assignment.max_score != null ? <div className="text-sm">Max score: {assignment.max_score}</div> : null}
          {assignment.max_submissions != null ? <div className="text-sm">Max submissions: {assignment.max_submissions}</div> : null}
          <div className="text-sm whitespace-pre-wrap border rounded p-3 bg-neutral-50">{bodyText || "No description"}</div>
        </div>
      ) : null}

      {/* Attachments */}
      <div className="border rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="font-medium">Attachments</div>
          {attachmentBusy ? <div className="text-xs text-neutral-500">Working…</div> : null}
        </div>
        {canManage ? (
          <input
            type="file"
            className="text-sm"
            disabled={attachmentBusy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadAttachment(f);
            }}
          />
        ) : null}

        {attachments.length === 0 ? (
          <div className="text-sm text-neutral-600">No attachments.</div>
        ) : (
          <div className="divide-y">
            {attachments.map((f) => (
              <div key={f.id} className="py-2 flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium text-sm">{f.name}</div>
                  <div className="text-xs text-neutral-500">
                    {f.size_bytes ?? 0} bytes - {f.mime_type ?? "file"}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    className="underline text-sm"
                    type="button"
                    onClick={() => window.open(mediaUrl((f as any).url || f.storage_path), "_blank")}
                  >
                    Open
                  </button>
                  {canManage ? (
                    <button className="underline text-sm text-red-600" type="button" onClick={() => deleteAttachment(f.storage_path)}>
                      Delete
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Submissions */}
      <div className="border rounded-xl p-4 md:p-6 space-y-4 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <div className="font-semibold">Submissions</div>
          {!canManage ? <div className="text-xs text-neutral-500">Latest upload is graded</div> : null}
        </div>

        {!canManage ? (
          <div className="rounded-xl border bg-gradient-to-br from-slate-50 via-white to-blue-50 p-4 md:p-5 space-y-4">
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 font-semibold">Student upload</span>
              {assignment.due_at ? (
                <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">
                  Due {new Date(assignment.due_at).toLocaleString()}
                </span>
              ) : null}
              {assignment.max_submissions ? (
                <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">
                  {submissionsLeft ?? 0} left
                </span>
              ) : (
                <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">Unlimited</span>
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr] items-stretch">
              <label className="group border-2 border-dashed rounded-xl p-4 md:p-5 cursor-pointer hover:border-blue-400 transition">
                <input
                  type="file"
                  className="hidden"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                  disabled={submitBusy}
                />
                <div className="text-sm font-medium">Choose a file to submit</div>
                <div className="mt-1 text-xs text-neutral-500">
                  {selectedFile ? selectedFile.name : "PDF, DOCX, PPTX, CSV, images"}
                </div>
                <div className="mt-3 text-xs text-blue-700 font-semibold">Click to browse</div>
              </label>

              <div className="rounded-xl border p-4 md:p-5 bg-white">
                <div className="text-xs text-neutral-500">Ready to submit</div>
                <div className="mt-1 text-sm font-medium">
                  {selectedFile ? selectedFile.name : "No file selected"}
                </div>
                <div className="mt-3 text-xs text-neutral-500">
                  {selectedFile ? `${(selectedFile.size / 1024).toFixed(1)} KB` : "Attach your work before submitting"}
                </div>
                <button
                  className="mt-4 w-full rounded-lg bg-blue-600 text-white py-2 text-sm font-semibold hover:bg-blue-700 disabled:opacity-60"
                  type="button"
                  onClick={uploadSubmission}
                  disabled={!selectedFile || submitBusy || (assignment.max_submissions ? submissionsUsed >= assignment.max_submissions : false) || pastDue}
                >
                  {submitBusy ? "Uploading..." : "Submit assignment"}
                </button>
              </div>
            </div>

            {!canManage && pastDue ? (
              <div className="text-xs text-red-600">Deadline passed; submissions are closed.</div>
            ) : null}
            {!canManage && assignment.max_submissions && submissionsUsed >= assignment.max_submissions ? (
              <div className="text-xs text-red-600">Submission limit reached.</div>
            ) : null}
          </div>
        ) : null}

        {submissions.length === 0 ? (
          <div className="text-sm text-neutral-600">No submissions yet.</div>
        ) : canManage && groupedSubmissions ? (
          <div className="space-y-4">
            {groupedSubmissions.map((group) => (
              <div key={group.studentId} className="border rounded-lg">
                <div className="px-4 py-2 border-b flex justify-between text-sm">
                  <div className="font-medium">Student: {group.name}</div>
                  <div className="text-neutral-500">{group.submissions.length} submission(s)</div>
                </div>
                <div className="divide-y">
                  {group.submissions.map((s, idx) => {
                    const isLatest = idx === 0;
                    return (
                      <div key={s.id} className={`p-4 ${isLatest ? "bg-amber-50 border-l-4 border-amber-400" : ""}`}>
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="font-medium text-sm">
                              {s.file_name || "Submission"} - {new Date(s.created_at).toLocaleString()}
                              {isLatest ? <span className="ml-2 text-xs text-amber-600">(Latest)</span> : null}
                            </div>
                            <div className="text-xs text-neutral-500">Size: {s.file_size ?? 0} bytes</div>
                          </div>
                          <button
                            className="underline text-sm"
                            type="button"
                            onClick={() => window.open(mediaUrl((s as any).file_url || s.file_path), "_blank")}
                          >
                            Open
                          </button>
                        </div>
                        <GradeEditor submission={s} onSave={saveGrade} maxScore={assignment?.max_score ?? null} />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="divide-y">
            {submissions.map((s, idx) => {
              const isLatest = idx === 0;
              return (
                <div key={s.id} className={`py-3 ${isLatest ? "bg-blue-50 border-l-4 border-blue-500" : ""}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium text-sm">
                        {s.file_name || "Submission"} - {new Date(s.created_at).toLocaleString()}
                        {isLatest ? <span className="ml-2 text-xs text-blue-700">(Latest)</span> : null}
                      </div>
                      <div className="text-xs text-neutral-500">
                        Size: {s.file_size ?? 0} bytes - {s.grade ? `Score: ${s.grade.score ?? "N/A"}` : "Pending review"}
                      </div>
                    </div>
                    <button
                      className="underline text-sm"
                      type="button"
                      onClick={() => window.open(mediaUrl((s as any).file_url || s.file_path), "_blank")}
                    >
                      Open
                    </button>
                  </div>
                  {s.grade ? (
                    <div className="mt-2 text-sm">
                      <div>Score: {s.grade.score ?? "N/A"}</div>
                      {s.grade.feedback ? <div className="text-neutral-600">Feedback: {s.grade.feedback}</div> : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function GradeEditor({
  submission,
  onSave,
  maxScore,
}: {
  submission: SubmissionRow;
  onSave: (sub: SubmissionRow, score: number | null, feedback: string | null) => Promise<void>;
  maxScore: number | null;
}) {
  const [score, setScore] = useState<string | number>(
    submission.grade?.score === null || typeof submission.grade?.score === "undefined" ? "" : Number(submission.grade?.score)
  );
  const [feedback, setFeedback] = useState(submission.grade?.feedback ?? "");
  const [busy, setBusy] = useState(false);

  return (
    <div className="mt-3 border rounded p-3 space-y-2">
      <div className="text-sm font-medium">Grade</div>
      {maxScore != null ? <div className="text-xs text-neutral-500">Max score: {maxScore}</div> : null}
      <div className="grid md:grid-cols-2 gap-2">
        <label className="grid gap-1 text-sm">
          <span className="text-xs text-neutral-600">Score</span>
          <input
            className="border rounded px-3 py-2 text-sm"
            type="number"
            value={score}
            onChange={(e) => setScore(e.target.value === "" ? "" : Number(e.target.value))}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs text-neutral-600">Feedback</span>
          <input className="border rounded px-3 py-2 text-sm" value={feedback} onChange={(e) => setFeedback(e.target.value)} />
        </label>
      </div>
      <button
        className="border rounded px-3 py-2 text-sm"
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await onSave(submission, score === "" ? null : Number(score), feedback.trim() ? feedback.trim() : null);
          setBusy(false);
        }}
      >
        {busy ? "Saving…" : "Save grade"}
      </button>
    </div>
  );
}
