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

  if (loading) return <div className="p-4">Loading assignment...</div>;
  if (error) return <div className="p-4 text-red-600">Error: {error}</div>;
  if (!assignment) return null;

  return (
    <div className="assignment-shell">
      <div className="assignment-orb" />
      <div className="assignment-orb assignment-orb--alt" />
      <div className="assignment-wrap">
        <header className="assignment-hero" style={{ animationDelay: "0ms" }}>
          <div className="hero-kicker">Assignment</div>
          <div className="hero-row">
            <h1 className="hero-title">{assignment.title}</h1>
            <button
              className="hero-back"
              type="button"
              onClick={() => router.push(`/courses/${courseId}`)}
            >
              Back to course
            </button>
          </div>
          <div className="hero-meta">
            <span
              className={`status-pill ${
                assignment.status === "published" ? "status-pill--live" : "status-pill--draft"
              }`}
            >
              {statusLabel}
            </span>
            <span className="meta-dot" />
            <span className="meta-item">
              {assignment.due_at ? `Due ${new Date(assignment.due_at).toLocaleString()}` : "No deadline"}
            </span>
            {assignment.max_score != null ? (
              <>
                <span className="meta-dot" />
                <span className="meta-item">Max score {assignment.max_score}</span>
              </>
            ) : null}
            {assignment.max_submissions != null ? (
              <>
                <span className="meta-dot" />
                <span className="meta-item">{submissionsLeft ?? 0} submissions left</span>
              </>
            ) : null}
          </div>
        </header>

        <div className="assignment-grid">
          <main className="assignment-main">
            {canManage ? (
              <section className="card card-animate" style={{ animationDelay: "80ms" }}>
                <div className="card-title">Teacher controls</div>

                <label className="field">
                  <span>Title</span>
                  <input
                    className="input"
                    value={assignment.title}
                    onChange={(e) => setAssignment((a) => (a ? { ...a, title: e.target.value } : a))}
                  />
                </label>

                <label className="field">
                  <span>Description / Body</span>
                  <textarea
                    className="textarea"
                    value={bodyText}
                    onChange={(e) => setBodyText(e.target.value)}
                  />
                </label>

                <div className="field-grid">
                  <label className="field">
                    <span>Due date</span>
                    <input
                      type="datetime-local"
                      className="input"
                      value={dueAt}
                      onChange={(e) => setDueAt(e.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>Max score</span>
                    <input
                      type="number"
                      className="input"
                      value={maxScore}
                      onChange={(e) => setMaxScore(e.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>Max submissions</span>
                    <input
                      type="number"
                      className="input"
                      value={maxSubs}
                      onChange={(e) => setMaxSubs(e.target.value)}
                    />
                  </label>
                </div>

                <div className="button-row">
                  <button className="btn btn-ghost" type="button" onClick={saveAssignment} disabled={saveBusy}>
                    {saveBusy ? "Saving..." : "Save draft"}
                  </button>
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={() => publishAssignment(assignment.status !== "published")}
                    disabled={publishBusy}
                  >
                    {publishBusy ? "Working..." : assignment.status === "published" ? "Unpublish" : "Publish"}
                  </button>
                  <button
                    className="btn btn-danger"
                    type="button"
                    onClick={deleteAssignment}
                    disabled={deleteBusy}
                  >
                    {deleteBusy ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </section>
            ) : null}

            {!canManage ? (
              <section className="card card-animate" style={{ animationDelay: "120ms" }}>
                <div className="card-title">Assignment details</div>
                <div className="detail-grid">
                  <div>
                    <div className="detail-label">Due date</div>
                    <div className="detail-value">{assignment.due_at ? new Date(assignment.due_at).toLocaleString() : "None"}</div>
                  </div>
                  <div>
                    <div className="detail-label">Max score</div>
                    <div className="detail-value">{assignment.max_score ?? "Not set"}</div>
                  </div>
                  <div>
                    <div className="detail-label">Max submissions</div>
                    <div className="detail-value">{assignment.max_submissions ?? "Unlimited"}</div>
                  </div>
                </div>
                <div className="body-card">{bodyText || "No description"}</div>
              </section>
            ) : null}

            <section className="card card-animate" style={{ animationDelay: "160ms" }}>
              <div className="card-row">
                <div>
                  <div className="card-title">Attachments</div>
                  <div className="card-subtitle">Reference files attached by the teacher.</div>
                </div>
                {attachmentBusy ? <div className="mini-muted">Working...</div> : null}
              </div>

              {canManage ? (
                <input
                  type="file"
                  className="file-input"
                  disabled={attachmentBusy}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void uploadAttachment(f);
                  }}
                />
              ) : null}

              {attachments.length === 0 ? (
                <div className="empty-state">No attachments.</div>
              ) : (
                <div className="list">
                  {attachments.map((f) => (
                    <div key={f.id} className="list-row">
                      <div>
                        <div className="list-title">{f.name}</div>
                        <div className="list-meta">{f.size_bytes ?? 0} bytes - {f.mime_type ?? "file"}</div>
                      </div>
                      <div className="list-actions">
                        <button
                          className="btn-link"
                          type="button"
                          onClick={() => window.open(mediaUrl((f as any).url || f.storage_path), "_blank")}
                        >
                          Open
                        </button>
                        {canManage ? (
                          <button className="btn-link danger" type="button" onClick={() => deleteAttachment(f.storage_path)}>
                            Delete
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="card card-animate" style={{ animationDelay: "200ms" }}>
              <div className="card-row">
                <div>
                  <div className="card-title">Submissions</div>
                  <div className="card-subtitle">Your latest upload is the one we grade.</div>
                </div>
                {!canManage ? <div className="mini-muted">Student view</div> : null}
              </div>

              {!canManage ? (
                <div className="rounded-xl border bg-gradient-to-br from-slate-50 via-white to-blue-50 p-4 md:p-5 space-y-4">
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="badge">Student upload</span>
                    {assignment.due_at ? (
                      <span className="badge muted">Due {new Date(assignment.due_at).toLocaleString()}</span>
                    ) : null}
                    {assignment.max_submissions ? (
                      <span className="badge muted">{submissionsLeft ?? 0} left</span>
                    ) : (
                      <span className="badge muted">Unlimited</span>
                    )}
                  </div>

                  <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr] items-stretch">
                    <label className="upload-box">
                      <input
                        type="file"
                        className="hidden"
                        onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                        disabled={submitBusy}
                      />
                      <div className="upload-title">Choose a file to submit</div>
                      <div className="upload-meta">
                        {selectedFile ? selectedFile.name : "PDF, DOCX, PPTX, CSV, images"}
                      </div>
                      <div className="upload-cta">Click to browse</div>
                    </label>

                    <div className="upload-panel">
                      <div className="upload-label">Ready to submit</div>
                      <div className="upload-file">
                        {selectedFile ? selectedFile.name : "No file selected"}
                      </div>
                      <div className="upload-size">
                        {selectedFile ? `${(selectedFile.size / 1024).toFixed(1)} KB` : "Attach your work before submitting"}
                      </div>
                      <button
                        className="btn btn-primary"
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
                <div className="empty-state">No submissions yet.</div>
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
                                  className="btn-link"
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
                            className="btn-link"
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
            </section>
          </main>

          <aside className="assignment-side">
            <div className="side-card card-animate" style={{ animationDelay: "120ms" }}>
              <div className="side-title">Summary</div>
              <div className="side-row">
                <span>Due date</span>
                <strong>{assignment.due_at ? new Date(assignment.due_at).toLocaleString() : "None"}</strong>
              </div>
              <div className="side-row">
                <span>Status</span>
                <strong>{statusLabel}</strong>
              </div>
              <div className="side-row">
                <span>Max score</span>
                <strong>{assignment.max_score ?? "Not set"}</strong>
              </div>
              <div className="side-row">
                <span>Submissions left</span>
                <strong>{assignment.max_submissions != null ? submissionsLeft ?? 0 : "Unlimited"}</strong>
              </div>
            </div>

            {canManage ? (
              <div className="side-card card-animate" style={{ animationDelay: "180ms" }}>
                <div className="side-title">Quick actions</div>
                <button className="btn btn-primary" type="button" onClick={saveAssignment} disabled={saveBusy}>
                  {saveBusy ? "Saving..." : "Save changes"}
                </button>
                <button
                  className="btn btn-ghost"
                  type="button"
                  onClick={() => publishAssignment(assignment.status !== "published")}
                  disabled={publishBusy}
                >
                  {publishBusy ? "Working..." : assignment.status === "published" ? "Unpublish" : "Publish"}
                </button>
                <button className="btn btn-danger" type="button" onClick={deleteAssignment} disabled={deleteBusy}>
                  {deleteBusy ? "Deleting..." : "Delete"}
                </button>
              </div>
            ) : null}
          </aside>
        </div>
      </div>

      <style jsx global>{`
        @import url("https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Space+Grotesk:wght@500;600;700&display=swap");
      `}</style>
      <style jsx>{`
        .assignment-shell {
          min-height: 100vh;
          background: radial-gradient(circle at 10% 20%, rgba(59, 130, 246, 0.14), transparent 55%),
            radial-gradient(circle at 90% 10%, rgba(16, 185, 129, 0.12), transparent 40%),
            #f6f8fb;
          position: relative;
          overflow: hidden;
        }

        .assignment-orb {
          position: absolute;
          width: 340px;
          height: 340px;
          border-radius: 999px;
          background: radial-gradient(circle, rgba(37, 99, 235, 0.22), transparent 60%);
          top: -120px;
          left: -120px;
          filter: blur(2px);
        }

        .assignment-orb--alt {
          width: 260px;
          height: 260px;
          background: radial-gradient(circle, rgba(14, 165, 233, 0.2), transparent 65%);
          top: 120px;
          right: -80px;
          left: auto;
        }

        .assignment-wrap {
          max-width: 1180px;
          margin: 0 auto;
          padding: 28px 20px 60px;
          position: relative;
          z-index: 1;
          font-family: "Plus Jakarta Sans", sans-serif;
          color: #0f172a;
        }

        .assignment-hero {
          background: linear-gradient(135deg, #0f172a, #1d4ed8 55%, #38bdf8);
          color: #f8fafc;
          border-radius: 28px;
          padding: 28px 28px 32px;
          box-shadow: 0 24px 60px rgba(15, 23, 42, 0.25);
          animation: rise 0.45s ease forwards;
          opacity: 0;
        }

        .hero-kicker {
          font-size: 12px;
          letter-spacing: 0.26em;
          text-transform: uppercase;
          color: rgba(248, 250, 252, 0.7);
        }

        .hero-row {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-top: 12px;
        }

        .hero-title {
          font-family: "Space Grotesk", sans-serif;
          font-size: 28px;
          font-weight: 700;
          margin: 0;
        }

        .hero-back {
          border: 1px solid rgba(248, 250, 252, 0.4);
          color: #f8fafc;
          background: rgba(15, 23, 42, 0.2);
          padding: 8px 14px;
          border-radius: 999px;
          font-size: 13px;
          transition: all 0.2s ease;
        }

        .hero-back:hover {
          background: rgba(248, 250, 252, 0.14);
        }

        .hero-meta {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 10px;
          margin-top: 12px;
          font-size: 12px;
          color: rgba(248, 250, 252, 0.85);
        }

        .meta-dot {
          width: 4px;
          height: 4px;
          background: rgba(248, 250, 252, 0.6);
          border-radius: 999px;
        }

        .status-pill {
          padding: 6px 12px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        .status-pill--live {
          background: rgba(34, 197, 94, 0.2);
          color: #bbf7d0;
          border: 1px solid rgba(34, 197, 94, 0.35);
        }

        .status-pill--draft {
          background: rgba(248, 113, 113, 0.2);
          color: #fecaca;
          border: 1px solid rgba(248, 113, 113, 0.35);
        }

        .assignment-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr);
          gap: 24px;
          margin-top: 26px;
        }

        @media (min-width: 1024px) {
          .assignment-grid {
            grid-template-columns: minmax(0, 1fr) 300px;
            align-items: start;
          }
        }

        .card {
          background: #fff;
          border-radius: 20px;
          border: 1px solid rgba(15, 23, 42, 0.08);
          padding: 20px;
          box-shadow: 0 20px 40px rgba(15, 23, 42, 0.08);
        }

        .card-animate {
          animation: rise 0.45s ease forwards;
          opacity: 0;
        }

        .card-title {
          font-family: "Space Grotesk", sans-serif;
          font-size: 18px;
          margin-bottom: 12px;
        }

        .card-subtitle {
          font-size: 12px;
          color: #64748b;
        }

        .card-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 16px;
        }

        .field {
          display: grid;
          gap: 6px;
          font-size: 13px;
        }

        .field span {
          font-size: 12px;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .field-grid {
          display: grid;
          gap: 12px;
        }

        @media (min-width: 768px) {
          .field-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
        }

        .input,
        .textarea {
          border: 1px solid rgba(148, 163, 184, 0.6);
          border-radius: 12px;
          padding: 10px 12px;
          font-size: 14px;
          background: #f8fafc;
        }

        .textarea {
          min-height: 120px;
          resize: vertical;
        }

        .button-row {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 12px;
        }

        .btn {
          border-radius: 12px;
          padding: 10px 16px;
          font-size: 13px;
          font-weight: 600;
          border: 1px solid transparent;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .btn-primary {
          background: #2563eb;
          color: #fff;
        }

        .btn-primary:hover {
          background: #1d4ed8;
        }

        .btn-ghost {
          border-color: rgba(15, 23, 42, 0.15);
          background: #fff;
          color: #0f172a;
        }

        .btn-ghost:hover {
          border-color: rgba(37, 99, 235, 0.4);
          color: #1d4ed8;
        }

        .btn-danger {
          border-color: rgba(239, 68, 68, 0.3);
          color: #dc2626;
          background: #fff5f5;
        }

        .btn-danger:hover {
          background: #fee2e2;
        }

        .detail-grid {
          display: grid;
          gap: 12px;
          margin-bottom: 16px;
        }

        @media (min-width: 768px) {
          .detail-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
        }

        .detail-label {
          font-size: 12px;
          color: #94a3b8;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .detail-value {
          font-size: 14px;
          font-weight: 600;
          color: #0f172a;
        }

        .body-card {
          background: #f8fafc;
          border-radius: 14px;
          padding: 14px;
          font-size: 14px;
          line-height: 1.6;
          color: #1f2937;
          white-space: pre-wrap;
        }

        .file-input {
          font-size: 13px;
        }

        .list {
          display: grid;
          gap: 12px;
        }

        .list-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 12px 0;
          border-bottom: 1px dashed rgba(148, 163, 184, 0.35);
        }

        .list-row:last-child {
          border-bottom: none;
        }

        .list-title {
          font-weight: 600;
          font-size: 14px;
        }

        .list-meta {
          font-size: 12px;
          color: #64748b;
        }

        .list-actions {
          display: flex;
          gap: 12px;
          align-items: center;
        }

        .btn-link {
          font-size: 13px;
          color: #2563eb;
          text-decoration: underline;
        }

        .btn-link.danger {
          color: #dc2626;
        }

        .empty-state {
          font-size: 13px;
          color: #94a3b8;
          padding: 12px 0;
        }

        .mini-muted {
          font-size: 12px;
          color: #94a3b8;
        }

        .badge {
          padding: 6px 10px;
          border-radius: 999px;
          background: rgba(37, 99, 235, 0.12);
          color: #1d4ed8;
          font-weight: 600;
        }

        .badge.muted {
          background: rgba(148, 163, 184, 0.2);
          color: #475569;
        }

        .upload-box {
          border: 2px dashed rgba(37, 99, 235, 0.3);
          border-radius: 16px;
          padding: 18px;
          cursor: pointer;
          transition: all 0.2s ease;
          background: #fff;
        }

        .upload-box:hover {
          border-color: rgba(37, 99, 235, 0.6);
          background: rgba(37, 99, 235, 0.03);
        }

        .upload-title {
          font-weight: 600;
          font-size: 14px;
        }

        .upload-meta {
          font-size: 12px;
          color: #64748b;
          margin-top: 4px;
        }

        .upload-cta {
          font-size: 12px;
          color: #2563eb;
          margin-top: 12px;
          font-weight: 600;
        }

        .upload-panel {
          border-radius: 16px;
          border: 1px solid rgba(148, 163, 184, 0.3);
          padding: 18px;
          background: #fff;
          display: grid;
          gap: 10px;
        }

        .upload-label {
          font-size: 12px;
          color: #94a3b8;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .upload-file {
          font-size: 14px;
          font-weight: 600;
        }

        .upload-size {
          font-size: 12px;
          color: #64748b;
        }

        .assignment-side {
          display: grid;
          gap: 16px;
        }

        .side-card {
          background: #fff;
          border-radius: 18px;
          border: 1px solid rgba(148, 163, 184, 0.25);
          padding: 18px;
          box-shadow: 0 16px 32px rgba(15, 23, 42, 0.08);
          display: grid;
          gap: 10px;
        }

        .side-title {
          font-family: "Space Grotesk", sans-serif;
          font-size: 16px;
        }

        .side-row {
          display: flex;
          justify-content: space-between;
          font-size: 13px;
          color: #475569;
        }

        @keyframes rise {
          from {
            opacity: 0;
            transform: translateY(14px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
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
        {busy ? "Saving..." : "Save grade"}
      </button>
    </div>
  );
}
