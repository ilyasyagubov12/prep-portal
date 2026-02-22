"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";

type Course = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  cover_path: string | null;
  cover_url?: string | null;
};

type Profile = {
  user_id: string;
  role: string | null;
  is_admin: boolean | null;
  username?: string | null;
  nickname?: string | null;
};

type NodeKind = "folder" | "file" | "assignment" | "quiz";

type CourseEvent = {
  id: string;
  course_id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  repeat_weekly: boolean;
  repeat_until: string | null; // date "YYYY-MM-DD"
};
type AssignmentDueEvent = CourseEvent;

type CourseNode = {
  id: string;
  course_id: string;
  parent_id: string | null;
  kind: NodeKind;
  name: string;
  description: string | null;
  storage_path: string | null;
  storage_url?: string | null;
  mime_type: string | null;
  size_bytes: number | null;

  published: boolean; // manual
  publish_at: string | null; // scheduled

  created_by: string;
  created_at: string;

  assignment_id?: string | null;
  assignment?: { id: string; status: "draft" | "published"; title: string } | null;
  quiz_id?: string | null;
  quiz?: {
    id: string;
    title: string;
    description?: string | null;
    verbal_question_count?: number;
    math_question_count?: number;
    total_time_minutes?: number;
    is_active?: boolean;
    results_published?: boolean;
  } | null;
};

type Tab = "overview" | "content" | "calendar" | "gradebook";

function isTeacherOrAdmin(p: Profile | null) {
  if (!p) return false;
  const role = (p.role ?? "").toLowerCase();
  return role === "teacher" || role === "admin" || !!p.is_admin;
}

/**
 * Visibility rule:
 * - visible if manual published OR publish_at time has passed
 */
function isVisible(node: CourseNode) {
  if (node.kind === "assignment") {
    return node.assignment?.status === "published";
  }
  if (node.kind === "quiz") {
    if (node.quiz && node.quiz.is_active === false) return false;
  }
  if (node.published) return true;
  if (!node.publish_at) return false;

  const t = Date.parse(node.publish_at);
  if (!Number.isFinite(t)) return false;
  return t <= Date.now();
}

function guessPreviewType(path: string, mimeType?: string | null): "pdf" | "image" | "other" {
  const mime = (mimeType || "").toLowerCase();
  if (mime === "application/pdf") return "pdf";
  if (mime.startsWith("image/")) return "image";
  const p = path.toLowerCase();
  if (p.endsWith(".pdf")) return "pdf";
  if (
    p.endsWith(".png") ||
    p.endsWith(".jpg") ||
    p.endsWith(".jpeg") ||
    p.endsWith(".webp") ||
    p.endsWith(".gif")
  ) {
    return "image";
  }
  return "other";
}

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

// ISO -> datetime-local (for inputs)
function toDatetimeLocal(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

// datetime-local -> ISO
function toISO(v: string) {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function startOfWeek(d: Date) {
  // Monday-start week for Azerbaijan
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // Mon=0 ... Sun=6
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("az-AZ", {
    timeZone: "Asia/Baku",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function fmtDay(d: Date) {
  return new Intl.DateTimeFormat("az-AZ", {
    timeZone: "Asia/Baku",
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  }).format(d);
}

function fmtBaku(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("az-AZ", {
    timeZone: "Asia/Baku",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function expandEventsForWeek(weekStart: Date, raw: CourseEvent[]) {
  const weekEnd = addDays(weekStart, 7).getTime();
  const out: Array<CourseEvent & { occ_start: string; occ_end: string }> = [];

  for (const ev of raw) {
    const start = new Date(ev.starts_at);
    const end = new Date(ev.ends_at);

    // non-repeating
    if (!ev.repeat_weekly) {
      const t = start.getTime();
      if (t >= weekStart.getTime() && t < weekEnd) {
        out.push({ ...ev, occ_start: ev.starts_at, occ_end: ev.ends_at });
      }
      continue;
    }

    // repeating weekly until repeat_until (inclusive)
    const until = ev.repeat_until
      ? new Date(ev.repeat_until + "T23:59:59.999Z").getTime()
      : Infinity;

    let s = new Date(start);
    let e = new Date(end);

    while (s.getTime() <= until) {
      const t = s.getTime();
      if (t >= weekStart.getTime() && t < weekEnd) {
        out.push({ ...ev, occ_start: s.toISOString(), occ_end: e.toISOString() });
      }
      s = new Date(s.getTime() + 7 * 24 * 60 * 60 * 1000);
      e = new Date(e.getTime() + 7 * 24 * 60 * 60 * 1000);
      if (out.length > 2000) break;
    }
  }

  out.sort((a, b) => Date.parse(a.occ_start) - Date.parse(b.occ_start));
  return out;
}

function safeFileName(name: string) {
  return name.replaceAll(" ", "_").replaceAll("/", "_");
}

function gradeBadge(score: number | null | undefined, max: number | null | undefined) {
  if (score === null || typeof score === "undefined") return null;
  const nScore = typeof score === "string" ? Number(score) : score;
  const nMax = typeof max === "string" ? Number(max) : max;
  const pct = nMax ? (nScore / nMax) * 100 : nScore;

  let bg = "#ef4444"; // red  <60
  let fg = "#ffffff";
  if (pct >= 90) {
    bg = "#166534"; // dark green
    fg = "#f8fafc";
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
        padding: "8px 12px",
        borderRadius: "999px",
        display: "inline-block",
        fontSize: "12px",
        fontWeight: 700,
        minWidth: "84px",
        textAlign: "center",
        boxShadow: "0 0 0 1px rgba(0,0,0,0.25)",
      }}
    >
      {nScore}
      {nMax ? ` / ${nMax}` : ""}
    </span>
  );
}

export default function CourseDetailPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const router = useRouter();

  const [course, setCourse] = useState<Course | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Explorer state
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<Array<{ id: string | null; name: string }>>([
    { id: null, name: "Root" },
  ]);
  const [nodes, setNodes] = useState<CourseNode[]>([]);
  const [contentLoading, setContentLoading] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);

  // Create folder
  const [newFolderName, setNewFolderName] = useState("");
  const [folderBusy, setFolderBusy] = useState(false);

  // Create assignment
  const [newAssignmentTitle, setNewAssignmentTitle] = useState("");
  const [assignmentBusy, setAssignmentBusy] = useState(false);
  // Create quiz (mock exam inside course)
  const [newQuizTitle, setNewQuizTitle] = useState("");
  const [newQuizDesc, setNewQuizDesc] = useState("");
  const [quizTotalTime, setQuizTotalTime] = useState("120");
  const [quizShuffleQuestions, setQuizShuffleQuestions] = useState(true);
  const [quizShuffleChoices, setQuizShuffleChoices] = useState(false);
  const [quizAllowRetakes, setQuizAllowRetakes] = useState(true);
  const [quizRetakeLimit, setQuizRetakeLimit] = useState<string>("");
  const [quizBusy, setQuizBusy] = useState(false);

  // Upload file
  const [uploadName, setUploadName] = useState("");
  const [uploadDesc, setUploadDesc] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);

  // Toggles for actions
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [showCreateAssignment, setShowCreateAssignment] = useState(false);
  const [showCreateQuiz, setShowCreateQuiz] = useState(false);
  const [showUpload, setShowUpload] = useState(false);

  // Schedule drafts (publish_at only)
  const [scheduleDraft, setScheduleDraft] = useState<Record<string, { publish_at: string }>>({});

  // Gradebook
  const [gradeRows, setGradeRows] = useState<
    Array<{
      id: string;
      title: string;
      status: string;
      due_at: string | null;
      max_score: number | null;
      kind?: "assignment" | "quiz";
      results_published?: boolean;
      is_active?: boolean;
      submission?: {
        id: string;
        created_at: string;
        file_name?: string | null;
        grade?: { score: number | null; feedback: string | null } | null;
      };
    }>
  >([]);
  const [offlineUnits, setOfflineUnits] = useState<
    Array<{ id: string; title: string; max_score: number | null; created_at: string; grade?: { score: number | null; max_score: number | null; feedback: string | null } | null }>
  >([]);
  const [offlineTitle, setOfflineTitle] = useState("");
  const [offlineMax, setOfflineMax] = useState<string>("");
  const [gradebookLoading, setGradebookLoading] = useState(false);
  const [gradebookError, setGradebookError] = useState<string | null>(null);
  const [gradebookLoaded, setGradebookLoaded] = useState(false);

  // People
  type Person = { user_id: string; username: string | null; nickname: string | null; role: string | null };
  const [students, setStudents] = useState<Person[]>([]);
  const [teachers, setTeachers] = useState<Person[]>([]);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [peopleError, setPeopleError] = useState<string | null>(null);

  // Preview
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<"pdf" | "image" | "other" | null>(null);
  const [previewTitle, setPreviewTitle] = useState<string | null>(null);
  const [previewNodeId, setPreviewNodeId] = useState<string | null>(null);

  // Overview (cover + edit)
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [savingOverview, setSavingOverview] = useState(false);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);

  // Calendar
  const [events, setEvents] = useState<CourseEvent[]>([]);
  const [assignmentEvents, setAssignmentEvents] = useState<AssignmentDueEvent[]>([]);
  const [calendarWeekStart, setCalendarWeekStart] = useState(() => startOfWeek(new Date()));
  const [calendarBusy, setCalendarBusy] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [evTitle, setEvTitle] = useState("");
  const [evDate, setEvDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [evStart, setEvStart] = useState("13:30");
  const [evEnd, setEvEnd] = useState("15:00");
  const [evRepeat, setEvRepeat] = useState(false);
  const [evRepeatUntil, setEvRepeatUntil] = useState("");
  const [creatingEvent, setCreatingEvent] = useState(false);

  const canManage = isTeacherOrAdmin(profile);

  const sortedNodes = useMemo(() => {
    const copy = [...nodes];
    copy.sort((a, b) => {
      if (a.kind !== b.kind) {
        const order: Record<NodeKind, number> = { folder: 0, quiz: 1, assignment: 2, file: 3 };
        return order[a.kind] - order[b.kind];
      }
      return a.name.localeCompare(b.name);
    });
    return copy;
  }, [nodes]);

  // Last graded items for student view
  const lastAssignmentGrade = useMemo(() => {
    const graded = gradeRows
      .map((a: any) => {
        const g = a.submission?.grade;
        const gradedAt = g?.graded_at ? Date.parse(g.graded_at as any) : null;
        return g && gradedAt
          ? { title: a.title, score: g.score, max: a.max_score ?? null, gradedAt }
          : null;
      })
      .filter(Boolean) as { title: string; score: number | null; max: number | null; gradedAt: number }[];
    graded.sort((a, b) => b.gradedAt - a.gradedAt);
    return graded[0] ?? null;
  }, [gradeRows]);

  const lastOfflineGrade = useMemo(() => {
    const graded = (offlineUnits as any[])
      .map((u) => {
        const g = u.grade;
        const gradedAt = g?.graded_at ? Date.parse(g.graded_at as any) : null;
        return g && gradedAt ? { title: u.title, score: g.score, max: u.max_score ?? null, gradedAt } : null;
      })
      .filter(Boolean) as { title: string; score: number | null; max: number | null; gradedAt: number }[];
    graded.sort((a, b) => b.gradedAt - a.gradedAt);
    return graded[0] ?? null;
  }, [offlineUnits]);

  const upcomingDeadline = useMemo(() => {
    const now = Date.now();
    const withDue = gradeRows
      .filter((a: any) => a.due_at)
      .map((a: any) => ({ title: a.title, due: Date.parse(a.due_at), status: a.status }));
    const future = withDue.filter((a) => a.due && a.due > now);
    future.sort((a, b) => a.due - b.due);
    return future[0] ?? null;
  }, [gradeRows]);

  function formatDeadline(due: number | null | undefined) {
    if (!due) return "None";
    const d = new Date(due);
    return `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })} · ${d.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  }

  function timeRemaining(due: number | null | undefined) {
    if (!due) return "";
    const diffMs = due - Date.now();
    if (diffMs <= 0) return "Past due";
    const mins = Math.floor(diffMs / 60000);
    if (mins < 60) return `${mins} min left`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ${mins % 60}m left`;
    const days = Math.floor(hrs / 24);
    return `${days}d ${hrs % 24}h left`;
  }


  // Load session + profile + course
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);

      const token =
        typeof window !== "undefined" ? localStorage.getItem("access_token") : null;

      if (!token) {
        if (!cancelled) {
          setError("Not logged in.");
          setLoading(false);
        }
        return;
      }
      setAccessToken(token);

      const base = process.env.NEXT_PUBLIC_API_BASE;
      const meReq = fetch(`${base}/api/auth/me/`, {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => null);
      const coursesReq = fetch(`${base}/api/courses/?slug=${encodeURIComponent(slug)}`, {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => null);

      const [meRes, coursesRes] = await Promise.all([meReq, coursesReq]);

      if (!meRes || !meRes.ok) {
        if (!cancelled) {
          setError("Session invalid. Please log in again.");
          setLoading(false);
        }
        return;
      }

      const me = await meRes.json().catch(() => null);
      if (!me || !me.user) {
        if (!cancelled) {
          setError("Session invalid. Please log in again.");
          setLoading(false);
        }
        return;
      }

      const profileData: Profile = {
        user_id: me.user.id,
        role: me.role ?? null,
        is_admin: me.is_admin ?? false,
        username: me.user.username ?? null,
        nickname: me.nickname ?? null,
      };

      if (!coursesRes || !coursesRes.ok) {
        if (!cancelled) {
          setError("Could not load course.");
          setLoading(false);
        }
        return;
      }

      const coursesJson = await coursesRes.json().catch(() => []);
      let courseMatch = Array.isArray(coursesJson) ? coursesJson[0] : null;

      if (!courseMatch) {
        const byIdRes = await fetch(
          `${base}/api/courses/?course_id=${encodeURIComponent(slug)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        ).catch(() => null);
        if (byIdRes && byIdRes.ok) {
          const byIdJson = await byIdRes.json().catch(() => []);
          courseMatch = Array.isArray(byIdJson) ? byIdJson[0] : null;
        }
      }

      if (!courseMatch) {
        if (!cancelled) {
          setError("Course not found.");
          setLoading(false);
        }
        return;
      }

      if (!cancelled) {
        setProfile(profileData);
        setCourse(courseMatch as Course);
        setEditTitle(courseMatch.title);
        setEditDesc(courseMatch.description ?? "");
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [slug]);

  // Cover URL: use Django media path
  useEffect(() => {
    if (!course?.cover_path) {
      setCoverUrl(null);
      return;
    }
    const base = process.env.NEXT_PUBLIC_API_BASE?.replace(/\/$/, "") || "";
    if (course.cover_url) {
      setCoverUrl(course.cover_url);
    } else if (course.cover_path) {
      if (course.cover_path.startsWith("http://") || course.cover_path.startsWith("https://")) {
        setCoverUrl(course.cover_path);
      } else {
        setCoverUrl(`${base}/media/${course.cover_path}`);
      }
    }
  }, [course?.cover_path]);

  // ===== Calendar =====
  async function loadEvents(courseId: string) {
    setCalendarBusy(true);
    setCalendarError(null);

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/api/course-events/list/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ course_id: courseId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to load events");
      setEvents(json.events ?? []);
    } catch (e: any) {
      setCalendarError(e?.message ?? "Failed to load events");
      setEvents([]);
    } finally {
      setCalendarBusy(false);
    }
  }

  async function loadAssignmentDueEvents(_courseId: string) {
    setAssignmentEvents([]);
  }

  useEffect(() => {
    if (tab === "calendar" && course?.id) loadEvents(course.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, course?.id]);

  useEffect(() => {
    if (tab === "calendar" && course?.id) loadAssignmentDueEvents(course.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, course?.id]);

  useEffect(() => {
    if (tab === "gradebook" && course?.id && accessToken) {
      void loadGradebook(course.id);
      if (isTeacherOrAdmin(profile)) void loadOffline(course.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, course?.id, accessToken, profile]);

  useEffect(() => {
    if (tab === "overview" && course?.id && accessToken) {
      void loadPeople(course.id);
    }
  }, [tab, course?.id, accessToken]);

  async function createEvent() {
    if (!accessToken || !course?.id) return;
    if (!evTitle.trim()) return alert("Title required");

    if (!accessToken || !course?.id) return;
    if (!evTitle.trim()) return alert("Title required");

    const startsLocal = new Date(`${evDate}T${evStart}`);
    const endsLocal = new Date(`${evDate}T${evEnd}`);

    if (!(startsLocal.getTime() < endsLocal.getTime())) return alert("End must be after start");

    setCreatingEvent(true);
    setCalendarError(null);

    try {
      await apiPOST(`${process.env.NEXT_PUBLIC_API_BASE}/api/course-events/create/`, accessToken, {
        course_id: course.id,
        title: evTitle.trim(),
        description: null,
        starts_at: startsLocal.toISOString(),
        ends_at: endsLocal.toISOString(),
        repeat_weekly: evRepeat,
        repeat_until: evRepeat ? evRepeatUntil || null : null,
      });

      setEvTitle("");
      setEvRepeat(false);
      setEvRepeatUntil("");

      await loadEvents(course.id);
    } catch (e: any) {
      setCalendarError(e?.message ?? "Create event failed");
    } finally {
      setCreatingEvent(false);
    }
  }

  async function deleteEvent(eventId: string) {
    if (!accessToken || !course?.id) return;
    const ok = confirm("Delete this event?");
    if (!ok) return;

    try {
      await apiPOST(`${process.env.NEXT_PUBLIC_API_BASE}/api/course-events/delete/`, accessToken, {
        event_id: eventId,
      });
      await loadEvents(course.id);
    } catch (e: any) {
      setCalendarError(e?.message ?? "Delete failed");
    }
  }

  // ===== Content explorer =====
  async function loadNodes(courseId: string, folderId: string | null) {
    setContentLoading(true);
    setContentError(null);

    if (!accessToken) {
      setContentError("Not logged in.");
      setContentLoading(false);
      return;
    }

    try {
      const params = new URLSearchParams({ course_id: courseId });
      if (folderId) params.append("parent_id", folderId);
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE}/api/course-nodes/list/?${params.toString()}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to load nodes");

      const list = (json.nodes ?? []) as CourseNode[];
      setNodes(list);

      setScheduleDraft((prev) => {
        const next = { ...prev };
        for (const n of list) {
          next[n.id] = { publish_at: toDatetimeLocal(n.publish_at) };
        }
        return next;
      });
      setContentLoading(false);
    } catch (e: any) {
      setContentError(e?.message ?? "Failed to load nodes");
      setNodes([]);
      setContentLoading(false);
    }
  }

  useEffect(() => {
    if (tab === "content" && course?.id) {
      loadNodes(course.id, currentFolderId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, course?.id, currentFolderId]);

  // Ensure gradebook data is available for overview stats even for students
  useEffect(() => {
    if (!course?.id || !accessToken || gradebookLoaded) return;
    void loadGradebook(course.id);
  }, [course?.id, accessToken, gradebookLoaded]);

async function getSignedUrl(storage_path: string, storage_url?: string | null) {
  const base = process.env.NEXT_PUBLIC_API_BASE?.replace(/\/$/, "") || "";
  if (storage_url) {
    if (storage_url.startsWith("http://") || storage_url.startsWith("https://")) return storage_url;
    if (storage_url.startsWith("/")) return `${base}${storage_url}`;
    return `${base}/${storage_url}`;
  }
  if (storage_path.startsWith("http://") || storage_path.startsWith("https://")) return storage_path;
  return `${base}/media/${storage_path}`;
}

  async function loadGradebook(courseId: string) {
    setGradebookLoading(true);
    setGradebookError(null);
    try {
      if (!accessToken) throw new Error("Missing access token");
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/api/grades/me/?course_id=${courseId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      }).catch(() => null);
      if (!res) throw new Error("No response from gradebook API");
      let json: any = null;
      try {
        json = await res.json();
      } catch {
        throw new Error(`Gradebook API returned non-JSON (status ${res.status})`);
      }
      if (!res.ok) throw new Error(json?.error || `Failed to load gradebook (status ${res.status})`);
      setGradeRows(json.assignments ?? []);
      setOfflineUnits(json.offline_units ?? []);
      setGradebookLoaded(true);
    } catch (e: any) {
      setGradebookError(e?.message ?? "Failed to load gradebook");
      setGradeRows([]);
      setOfflineUnits([]);
      setGradebookLoaded(false);
    } finally {
      setGradebookLoading(false);
    }
  }

  async function loadOffline(courseId: string) {
    if (!accessToken) return;
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE}/api/grades/offline/?course_id=${courseId}`,
        {
        headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to load offline grades");
      setOfflineUnits(json.units ?? offlineUnits);
    } catch (e) {
      console.error(e);
    }
  }

  async function loadPeople(courseId: string) {
    if (!accessToken) return;
    setPeopleLoading(true);
    setPeopleError(null);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE}/api/courses/people/?course_id=${courseId}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to load people");
      setStudents(json.students ?? []);
      setTeachers(json.teachers ?? []);
    } catch (e: any) {
      setPeopleError(e?.message ?? "Failed to load people");
      setStudents([]);
      setTeachers([]);
    } finally {
      setPeopleLoading(false);
    }
  }

  async function onPreview(node: CourseNode) {
    if (!node.storage_path) return;
    try {
      const url = await getSignedUrl(node.storage_path, (node as any).storage_url);
      const t = guessPreviewType(node.storage_path, node.mime_type);
      setPreviewType(t);
      setPreviewUrl(url);
      setPreviewTitle(node.name);
      setPreviewNodeId(node.id);
      requestAnimationFrame(() => {
        document.getElementById(`node-${node.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } catch (e: any) {
      alert(e?.message ?? "Preview failed");
    }
  }

  async function onDownload(node: CourseNode) {
    if (!node.storage_path) return;
    try {
      const url = await getSignedUrl(node.storage_path, (node as any).storage_url);
      window.open(url, "_blank");
    } catch (e: any) {
      alert(e?.message ?? "Download failed");
    }
  }

  function closePreview() {
    setPreviewUrl(null);
    setPreviewType(null);
    setPreviewTitle(null);
    setPreviewNodeId(null);
  }

  function enterFolder(node: CourseNode) {
    if (node.kind !== "folder") return;
    setCurrentFolderId(node.id);
    setBreadcrumbs((prev) => [...prev, { id: node.id, name: node.name }]);
    closePreview();
  }

  function openAssignment(node: CourseNode) {
    if (node.kind !== "assignment") return;
    if (!node.assignment_id || !course?.id) return;
    router.push(`/course/${course.id}/assignment/${node.assignment_id}`);
  }

  function openQuiz(node: CourseNode, mode: "open" | "manage" = "open") {
    if (node.kind !== "quiz") return;
    const quizId = node.quiz_id || node.quiz?.id;
    if (!quizId) {
      alert("Quiz ID missing. Refresh the page and try again.");
      return;
    }
    if (mode === "manage") {
      router.push(`/practice/mock-exams?manage=${quizId}`);
      return;
    }
    router.push(`/practice/mock-exams/${quizId}`);
  }

  function goToCrumb(idx: number) {
    const crumb = breadcrumbs[idx];
    setCurrentFolderId(crumb.id);
    setBreadcrumbs((prev) => prev.slice(0, idx + 1));
    closePreview();
  }

  async function createFolder() {
    if (!course?.id || !accessToken) return;
    if (!newFolderName.trim()) return alert("Folder name required");

    setFolderBusy(true);
    setContentError(null);

    try {
      await apiPOST<{ ok: boolean }>(
        `${process.env.NEXT_PUBLIC_API_BASE}/api/course-nodes/create/`,
        accessToken,
        {
          course_id: course.id,
          parent_id: currentFolderId,
          kind: "folder",
          name: newFolderName.trim(),
          description: null,
        }
      );

      setNewFolderName("");
      await loadNodes(course.id, currentFolderId);
    } catch (e: any) {
      setContentError(e?.message ?? "Failed to create folder");
    } finally {
      setFolderBusy(false);
    }
  }

  async function createAssignmentNode() {
    if (!course?.id || !accessToken) return;
    if (!newAssignmentTitle.trim()) return alert("Assignment title required");

    setAssignmentBusy(true);
    setContentError(null);

    try {
      const res = await apiPOST<{ ok: boolean; assignment: { id: string }; node: CourseNode }>(
        `${process.env.NEXT_PUBLIC_API_BASE}/api/assignments/create/`,
        accessToken,
        {
          course_id: course.id,
          parent_id: currentFolderId,
          title: newAssignmentTitle.trim(),
        }
      );

      setNewAssignmentTitle("");
      await loadNodes(course.id, currentFolderId);
      router.push(`/course/${course.id}/assignment/${res.assignment.id}`);
    } catch (e: any) {
      setContentError(e?.message ?? "Failed to create assignment");
    } finally {
      setAssignmentBusy(false);
    }
  }

  async function createQuizNode() {
    if (!course?.id || !accessToken) return;
    const title = newQuizTitle.trim();
    if (!title) return alert("Quiz title required");

    const totalTime = Math.max(1, parseInt(quizTotalTime || "0", 10) || 0);

    setQuizBusy(true);
    setContentError(null);
    try {
      const res = await apiPOST<{ ok: boolean; node: CourseNode; mock_exam_id: string }>(
        `${process.env.NEXT_PUBLIC_API_BASE}/api/course-quizzes/create/`,
        accessToken,
        {
          course_id: course.id,
          parent_id: currentFolderId,
          title,
          description: newQuizDesc.trim() || null,
          total_time_minutes: totalTime,
          shuffle_questions: quizShuffleQuestions,
          shuffle_choices: quizShuffleChoices,
          allow_retakes: quizAllowRetakes,
          retake_limit: quizRetakeLimit.trim(),
        }
      );

      setNewQuizTitle("");
      setNewQuizDesc("");
      await loadNodes(course.id, currentFolderId);
      // Stay on content; quiz can be managed via the new node in the list.
    } catch (e: any) {
      setContentError(e?.message ?? "Failed to create quiz");
    } finally {
      setQuizBusy(false);
    }
  }

  async function handleUploadFile() {
    if (!course?.id || !accessToken) return;
    if (!uploadFile) return alert("Pick a file");

    const displayName = uploadName.trim() || uploadFile.name;

    setUploadBusy(true);
    setContentError(null);

    try {
      const form = new FormData();
      form.append("course_id", course.id);
      if (currentFolderId) form.append("parent_id", currentFolderId);
      form.append("name", displayName);
      if (uploadDesc.trim()) form.append("description", uploadDesc.trim());
      form.append("file", uploadFile);

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/api/course-nodes/upload/`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Upload failed");

      setUploadName("");
      setUploadDesc("");
      setUploadFile(null);

      await loadNodes(course.id, currentFolderId);
    } catch (e: any) {
      setContentError(e?.message ?? "Upload failed");
    } finally {
      setUploadBusy(false);
    }
  }

  // Manual publish/unpublish
  async function togglePublished(node: CourseNode) {
    if (!accessToken) return;

    setContentError(null);
    try {
      await apiPOST<{ ok: boolean }>(
        `${process.env.NEXT_PUBLIC_API_BASE}/api/course-nodes/set-published/`,
        accessToken,
        {
          node_id: node.id,
          published: !node.published,
        }
      );

      if (course?.id) await loadNodes(course.id, currentFolderId);
    } catch (e: any) {
      setContentError(e?.message ?? "Publish toggle failed");
    }
  }

  function getDraft(nodeId: string) {
    return scheduleDraft[nodeId] ?? { publish_at: "" };
  }

  function setDraft(nodeId: string, patch: Partial<{ publish_at: string }>) {
    setScheduleDraft((prev) => ({
      ...prev,
      [nodeId]: { ...getDraft(nodeId), ...patch },
    }));
  }

  async function saveSchedule(node: CourseNode) {
    if (!accessToken) return;

    try {
      await apiPOST(
        `${process.env.NEXT_PUBLIC_API_BASE}/api/course-nodes/set-schedule/`,
        accessToken,
        {
          node_id: node.id,
          publish_at: toISO(getDraft(node.id).publish_at),
          unpublish_at: null,
        }
      );

      if (course?.id) await loadNodes(course.id, currentFolderId);
    } catch (e: any) {
      setContentError(e?.message ?? "Schedule save failed");
    }
  }

  async function clearSchedule(node: CourseNode) {
    if (!accessToken) return;

    try {
      await apiPOST(
        `${process.env.NEXT_PUBLIC_API_BASE}/api/course-nodes/set-schedule/`,
        accessToken,
        {
          node_id: node.id,
          publish_at: null,
          unpublish_at: null,
        }
      );

      setScheduleDraft((prev) => {
        const c = { ...prev };
        delete c[node.id];
        return c;
      });

      if (course?.id) await loadNodes(course.id, currentFolderId);
    } catch (e: any) {
      setContentError(e?.message ?? "Schedule clear failed");
    }
  }

  async function renameNode(node: CourseNode) {
    if (!accessToken) return;

    const newName = prompt(`Rename "${node.name}" to:`, node.name);
    if (newName === null) return;
    if (!newName.trim()) return alert("Name cannot be empty");

    try {
      await apiPOST(
        `${process.env.NEXT_PUBLIC_API_BASE}/api/course-nodes/update/`,
        accessToken,
        {
          node_id: node.id,
          name: newName.trim(),
        }
      );
      if (course?.id) await loadNodes(course.id, currentFolderId);
    } catch (e: any) {
      setContentError(e?.message ?? "Rename failed");
    }
  }

  async function moveNode(node: CourseNode) {
    if (!accessToken) return;

    const dest = prompt(`Move "${node.name}" to folder ID (leave empty for Root):`, "");
    if (dest === null) return;

    try {
      await apiPOST(
        `${process.env.NEXT_PUBLIC_API_BASE}/api/course-nodes/update/`,
        accessToken,
        {
          node_id: node.id,
          parent_id: dest.trim() || null,
        }
      );
      if (course?.id) await loadNodes(course.id, currentFolderId);
    } catch (e: any) {
      setContentError(e?.message ?? "Move failed");
    }
  }

  async function deleteNode(node: CourseNode) {
    if (!accessToken) return;

    const ok = confirm(
      node.kind === "folder"
        ? `Delete folder "${node.name}" and everything inside?`
        : `Delete file "${node.name}"?`
    );
    if (!ok) return;

    try {
      await apiPOST(
        `${process.env.NEXT_PUBLIC_API_BASE}/api/course-nodes/delete/`,
        accessToken,
        { node_id: node.id }
      );
      if (course?.id) await loadNodes(course.id, currentFolderId);
    } catch (e: any) {
      setContentError(e?.message ?? "Delete failed");
    }
  }

  function getNodeStatus(node: CourseNode) {
    if (node.kind === "assignment") {
      const status = node.assignment?.status ?? "draft";
      if (status === "published") return { key: "published", label: "Published", hint: "Visible to students" };
      return { key: "draft", label: "Draft", hint: "Hidden from students until published" };
    }

    const now = Date.now();
    const pubAt = node.publish_at ? Date.parse(node.publish_at) : NaN;

    if (node.published) {
      return { key: "published", label: "Published", hint: "Manually published" };
    }

    if (Number.isFinite(pubAt)) {
      if (pubAt > now) {
        return { key: "scheduled", label: "Scheduled", hint: `Will publish at ${fmtBaku(node.publish_at)}` };
      }
      return { key: "published", label: "Published", hint: "Published automatically by schedule" };
    }

    return { key: "unpublished", label: "Unpublished", hint: "Hidden from students" };
  }

  function ScheduleControls({ node }: { node: CourseNode }) {
    if (!canManage) return null;

    return (
      <div className="w-full mt-2 grid gap-2">
        <div className="text-xs text-neutral-500">Publish at (optional)</div>

        <div className="flex flex-wrap gap-2 items-center">
          <label className="text-xs text-neutral-600">
            Publish at:
            <input
              type="datetime-local"
              className="border rounded px-2 py-1 text-xs ml-2"
              value={getDraft(node.id).publish_at}
              onChange={(e) => setDraft(node.id, { publish_at: e.target.value })}
            />
          </label>

          <button className="border rounded px-3 py-1 text-xs" type="button" onClick={() => saveSchedule(node)}>
            Save
          </button>

          <button className="border rounded px-3 py-1 text-xs" type="button" onClick={() => clearSchedule(node)}>
            Clear
          </button>
        </div>

        {node.publish_at ? <div className="text-xs text-neutral-500">Saved: {fmtBaku(node.publish_at)}</div> : null}
      </div>
    );
  }

  // ===== Overview actions =====
  async function saveOverview() {
    if (!accessToken || !course?.id) return;

    setSavingOverview(true);
    setError(null);

      try {
        const base = (process.env.NEXT_PUBLIC_API_BASE || "").replace(/\/$/, "");
        const updated = await apiPOST<{ ok: boolean; course: Course }>(
          `${base}/api/courses/update/`,
          accessToken,
          {
          course_id: course.id,
          title: editTitle,
          description: editDesc,
          }
        );

      setCourse((prev) => (prev ? { ...prev, ...updated.course } : prev));
    } catch (e: any) {
      setError(e?.message ?? "Failed to save overview");
    } finally {
      setSavingOverview(false);
    }
  }

  async function uploadCover() {
    if (!accessToken || !course?.id) return;
    if (!coverFile) return alert("Choose an image first");

    setUploadingCover(true);
    setError(null);

    try {
      const form = new FormData();
      form.append("course_id", course.id);
      form.append("file", coverFile);

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/api/courses/cover-upload/`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Cover upload failed");

      if (json.cover_url) setCoverUrl(json.cover_url);
      if (json.cover_path) {
        setCourse((prev) => (prev ? { ...prev, cover_path: json.cover_path } : prev));
      }
      setCoverFile(null);
    } catch (e: any) {
      setError(e?.message ?? "Cover upload failed");
    } finally {
      setUploadingCover(false);
    }
  }

  // ===== Render =====
  if (loading) return <div className="p-4">Loading...</div>;
  if (error) return <div className="p-4 text-red-600">Error: {error}</div>;
  if (!course) return <div className="p-4">Course not found.</div>;

  return (
    <div className="p-4 space-y-5">
      <div className="relative overflow-hidden rounded-3xl border bg-white shadow-lg">
        <div className="absolute inset-0 opacity-70">
          <div className="absolute -left-10 -top-12 h-64 w-64 rounded-full bg-gradient-to-br from-sky-500 via-indigo-500 to-purple-500 blur-3xl" />
          <div className="absolute right-0 top-1/2 h-48 w-48 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 blur-3xl" />
        </div>
        <div className="relative p-5 lg:p-7 space-y-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-2">
              <div className="text-[11px] uppercase tracking-[0.24em] text-slate-600">Course</div>
              <h1 className="text-3xl font-bold text-slate-900 leading-tight">{course.title}</h1>
              {course.description ? (
                <p className="text-sm text-slate-700 max-w-2xl">{course.description}</p>
              ) : (
                <p className="text-sm text-slate-500">No description yet.</p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <TabButton active={tab === "overview"} onClick={() => setTab("overview")}>
              Overview
            </TabButton>
            <TabButton active={tab === "content"} onClick={() => setTab("content")}>
              Content
            </TabButton>
            <TabButton active={tab === "calendar"} onClick={() => setTab("calendar")}>
              Calendar
            </TabButton>
            <TabButton active={tab === "gradebook"} onClick={() => setTab("gradebook")}>
              Gradebook
            </TabButton>
          </div>
        </div>
      </div>

      {/* ===== OVERVIEW ===== */}
      {tab === "overview" ? (
        <div className="space-y-5">
          <div className="relative overflow-hidden rounded-3xl border bg-slate-900 text-white shadow-xl">
            {/* floating glows */}
            <div className="absolute -left-10 -top-16 h-60 w-60 bg-sky-500/30 blur-3xl" />
            <div className="absolute right-0 top-0 h-52 w-52 bg-indigo-500/30 blur-3xl" />

            {/* cover */}
            {coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={coverUrl} alt="cover" className="absolute inset-0 w-full h-full object-cover opacity-60" />
            ) : null}
            <div className="absolute inset-0 bg-gradient-to-r from-slate-900 via-slate-900/80 to-slate-900/40" />

            <div className="relative p-6 lg:p-8 space-y-3">
              <div className="inline-flex items-center gap-2 px-3 py-1 text-xs uppercase tracking-[0.2em] bg-white/10 border border-white/15 rounded-full">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                Course overview
              </div>
              <h1 className="text-3xl lg:text-4xl font-bold leading-tight">{course.title}</h1>
              <p className="text-sm text-slate-100/90 max-w-3xl">
                {course.description || "No description added yet."}
              </p>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <StatCard label="Students" value={students.length} accent="from-sky-500 to-blue-500" />
            <StatCard label="Tutors" value={teachers.length} accent="from-emerald-500 to-green-500" />
            <StatCard
              label="Upcoming deadline"
              value={formatDeadline(upcomingDeadline?.due)}
              subtitle={timeRemaining(upcomingDeadline?.due) || upcomingDeadline?.title || "No upcoming due dates"}
              accent="from-amber-500 to-orange-500"
            />
            <StatCard
              label="Last assignment grade"
              value={
                lastAssignmentGrade
                  ? `${lastAssignmentGrade.score ?? "—"}${lastAssignmentGrade.max ? ` / ${lastAssignmentGrade.max}` : ""}`
                  : "—"
              }
              subtitle={lastAssignmentGrade?.title ?? "Not graded yet"}
              accent="from-indigo-500 to-violet-500"
            />
            <StatCard
              label="Last offline grade"
              value={
                lastOfflineGrade
                  ? `${lastOfflineGrade.score ?? "—"}${lastOfflineGrade.max ? ` / ${lastOfflineGrade.max}` : ""}`
                  : "—"
              }
              subtitle={lastOfflineGrade?.title ?? "Not graded yet"}
              accent="from-cyan-500 to-teal-500"
            />
          </div>

          <div className="border rounded-2xl p-5 bg-white shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm uppercase tracking-[0.15em] text-neutral-500">People</div>
                <div className="text-lg font-semibold mt-1">Who’s in this course</div>
              </div>
              {peopleLoading ? <div className="text-xs text-neutral-500">Loading…</div> : null}
            </div>
            {peopleError ? (
              <div className="text-sm text-red-600 mt-2">Error: {peopleError}</div>
            ) : (
              <div className="mt-4 grid md:grid-cols-2 gap-4">
                <ChipList title="Tutors" emptyLabel="No tutors yet" items={teachers} />
                <ChipList title="Students" emptyLabel="No students yet" items={students} limit={16} />
              </div>
            )}
          </div>

          {canManage ? (
            <div className="grid md:grid-cols-2 gap-4">
              <div className="rounded-2xl border p-5 bg-white shadow-sm space-y-3">
                <div className="text-sm uppercase tracking-[0.15em] text-neutral-500">Course info</div>
                <div className="text-lg font-semibold">Edit basics</div>
                <input
                  className="border rounded px-3 py-2 text-sm w-full"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="Course title"
                  disabled={savingOverview || uploadingCover}
                />

                <textarea
                  className="border rounded px-3 py-2 text-sm w-full min-h-[120px]"
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  placeholder="Course description"
                  disabled={savingOverview || uploadingCover}
                />

                <button
                  className="w-full bg-slate-900 text-white rounded px-3 py-2 text-sm hover:bg-slate-800 disabled:opacity-60"
                  type="button"
                  onClick={saveOverview}
                  disabled={savingOverview || uploadingCover}
                >
                  {savingOverview ? "Saving…" : "Save changes"}
                </button>
              </div>

              <div className="rounded-2xl border p-5 bg-white shadow-sm space-y-3">
                <div className="text-sm uppercase tracking-[0.15em] text-neutral-500">Branding</div>
                <div className="text-lg font-semibold">Cover image</div>
                <div className="text-xs text-neutral-500">Recommended 1200×300</div>
                <input
                  type="file"
                  accept="image/*"
                  className="text-sm"
                  onChange={(e) => setCoverFile(e.target.files?.[0] ?? null)}
                  disabled={savingOverview || uploadingCover}
                />

                <button
                  className="w-full bg-sky-600 text-white rounded px-3 py-2 text-sm hover:bg-sky-700 disabled:opacity-60"
                  type="button"
                  onClick={uploadCover}
                  disabled={!coverFile || savingOverview || uploadingCover}
                >
                  {uploadingCover ? "Uploading…" : "Upload cover"}
                </button>

                <div className="text-xs text-neutral-500">Recommended: wide banner (JPG/PNG).</div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ===== CONTENT ===== */}
      {tab === "content" ? (
        <div className="space-y-5">
          {/* Breadcrumbs */}
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {breadcrumbs.map((c, idx) => (
              <div key={`${c.id ?? "root"}-${idx}`} className="flex items-center gap-2">
                <button
                  className="px-3 py-1 rounded-full bg-slate-100 hover:bg-slate-200 text-neutral-700 border"
                  type="button"
                  onClick={() => goToCrumb(idx)}
                >
                  {c.name}
                </button>
                {idx < breadcrumbs.length - 1 ? <span className="text-neutral-400">›</span> : null}
              </div>
            ))}
          </div>

          {canManage ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <ActionIcon
                  label="New folder"
                  emoji="📁"
                  onClick={() => setShowCreateFolder((v) => !v)}
                  active={showCreateFolder}
                />
                <ActionIcon
                  label="New assignment"
                  emoji="📝"
                  onClick={() => setShowCreateAssignment((v) => !v)}
                  active={showCreateAssignment}
                />
                <ActionIcon
                  label="New quiz"
                  emoji="🧪"
                  onClick={() => setShowCreateQuiz((v) => !v)}
                  active={showCreateQuiz}
                />
                <ActionIcon
                  label="Upload file"
                  emoji="📤"
                  onClick={() => setShowUpload((v) => !v)}
                  active={showUpload}
                />
              </div>

              {showCreateFolder ? (
                <div className="rounded-xl border p-4 bg-white shadow-sm space-y-3 max-w-xl">
                  <div className="font-semibold">Create folder</div>
                  <input
                    className="border rounded px-3 py-2 text-sm w-full"
                    placeholder="Folder name"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    disabled={folderBusy || uploadBusy}
                  />
                  <button
                    className="px-3 py-2 text-sm rounded bg-slate-900 text-white w-full hover:bg-slate-800 disabled:opacity-60"
                    onClick={createFolder}
                    disabled={folderBusy || uploadBusy}
                    type="button"
                  >
                    {folderBusy ? "Creating..." : "Create folder"}
                  </button>
                </div>
              ) : null}

              {showCreateAssignment ? (
                <div className="rounded-xl border p-4 bg-white shadow-sm space-y-3 max-w-xl">
                  <div className="font-semibold">Create assignment</div>
                  <input
                    className="border rounded px-3 py-2 text-sm w-full"
                    placeholder="Assignment title"
                    value={newAssignmentTitle}
                    onChange={(e) => setNewAssignmentTitle(e.target.value)}
                    disabled={assignmentBusy || uploadBusy || folderBusy}
                  />
                  <button
                    className="px-3 py-2 text-sm rounded bg-sky-600 text-white w-full hover:bg-sky-700 disabled:opacity-60"
                    onClick={createAssignmentNode}
                    disabled={assignmentBusy || uploadBusy || folderBusy}
                    type="button"
                  >
                    {assignmentBusy ? "Creating..." : "Create & open"}
                  </button>
                </div>
              ) : null}

              {showCreateQuiz ? (
                <div className="rounded-xl border p-4 bg-white shadow-sm space-y-3 max-w-2xl">
                  <div className="font-semibold">Create quiz (mock exam)</div>
                  <input
                    className="border rounded px-3 py-2 text-sm w-full"
                    placeholder="Quiz title"
                    value={newQuizTitle}
                    onChange={(e) => setNewQuizTitle(e.target.value)}
                    disabled={quizBusy}
                  />
                  <input
                    className="border rounded px-3 py-2 text-sm w-full"
                    placeholder="Description (optional)"
                    value={newQuizDesc}
                    onChange={(e) => setNewQuizDesc(e.target.value)}
                    disabled={quizBusy}
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="grid gap-1">
                      <span className="text-xs text-slate-500">Total time (min)</span>
                      <input
                        type="number"
                        min={1}
                        className="border rounded px-3 py-2 text-sm w-full"
                        value={quizTotalTime}
                        onChange={(e) => setQuizTotalTime(e.target.value)}
                        disabled={quizBusy}
                      />
                    </div>
                    <div className="rounded-xl border bg-slate-50 px-3 py-2 text-xs text-slate-600">
                      Question counts are calculated after you add questions to the quiz.
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={quizShuffleQuestions}
                        onChange={(e) => setQuizShuffleQuestions(e.target.checked)}
                        disabled={quizBusy}
                      />
                      Shuffle questions
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={quizShuffleChoices}
                        onChange={(e) => setQuizShuffleChoices(e.target.checked)}
                        disabled={quizBusy}
                      />
                      Shuffle answer choices
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={quizAllowRetakes}
                        onChange={(e) => setQuizAllowRetakes(e.target.checked)}
                        disabled={quizBusy}
                      />
                      Allow retakes
                    </label>
                    <div className="grid gap-1">
                      <span className="text-xs text-slate-500">Retake limit (optional)</span>
                      <input
                        type="number"
                        min={1}
                        className="border rounded px-3 py-2 text-sm w-full"
                        value={quizRetakeLimit}
                        onChange={(e) => setQuizRetakeLimit(e.target.value)}
                        disabled={quizBusy || !quizAllowRetakes}
                      />
                    </div>
                  </div>
                  <button
                    className="px-3 py-2 text-sm rounded bg-indigo-600 text-white w-full hover:bg-indigo-700 disabled:opacity-60"
                    onClick={createQuizNode}
                    disabled={quizBusy || assignmentBusy || uploadBusy || folderBusy}
                    type="button"
                  >
                    {quizBusy ? "Creating..." : "Create & open"}
                  </button>
                </div>
              ) : null}

              {showUpload ? (
                <div className="rounded-xl border p-4 bg-white shadow-sm space-y-3 max-w-xl">
                  <div className="font-semibold">Upload file</div>
                  <input
                    className="border rounded px-3 py-2 text-sm w-full"
                    placeholder="File name (optional)"
                    value={uploadName}
                    onChange={(e) => setUploadName(e.target.value)}
                    disabled={uploadBusy || folderBusy}
                  />
                  <input
                    className="border rounded px-3 py-2 text-sm w-full"
                    placeholder="Description (optional)"
                    value={uploadDesc}
                    onChange={(e) => setUploadDesc(e.target.value)}
                    disabled={uploadBusy || folderBusy}
                  />
                  <input
                    type="file"
                    className="text-sm"
                    onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                    disabled={uploadBusy || folderBusy}
                  />
                  <button
                    className="px-3 py-2 text-sm rounded bg-emerald-600 text-white w-full hover:bg-emerald-700 disabled:opacity-60"
                    onClick={handleUploadFile}
                    disabled={uploadBusy || folderBusy}
                    type="button"
                  >
                    {uploadBusy ? "Uploading..." : "Upload file"}
                  </button>
                </div>
              ) : null}

              {contentError ? <div className="text-sm text-red-600">{contentError}</div> : null}
            </div>
          ) : null}

          <div className="rounded-2xl border border-transparent bg-transparent">

            {contentLoading ? (
              <div className="p-4 text-sm text-neutral-600">Loading...</div>
            ) : sortedNodes.length === 0 ? (
              <div className="p-4 text-sm text-neutral-600">Empty folder.</div>
            ) : (
              <div className="flex flex-col gap-3 p-2">
                {sortedNodes.map((n) => {
                  const visible = isVisible(n);
                  const st = canManage ? getNodeStatus(n) : null;
                  const quizId = n.quiz_id || n.quiz?.id || null;
                  const quizRow = quizId ? gradeRows.find((row) => row.kind === "quiz" && row.id === quizId) : null;
                  const canReviewQuiz =
                    !canManage && !!quizRow?.results_published && !!quizRow?.submission?.id;

                  return (
                    <div key={n.id} id={`node-${n.id}`} className="rounded-xl border p-4 flex flex-col gap-3 bg-transparent">
                      <div className="flex items-start gap-3">
                        <div className="text-xl">
                          {n.kind === "folder"
                            ? "📁"
                            : n.kind === "assignment"
                              ? "📝"
                              : n.kind === "quiz"
                                ? "🧪"
                                : "📄"}
                        </div>
                        <div className="flex-1">
                          <div className="font-semibold leading-tight flex items-center gap-2">
                            <span>{n.name}</span>
                            {canManage && st?.label ? (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-900 text-white" title={st?.hint}>
                                {st.label}
                              </span>
                            ) : null}
                            {!canManage && !visible ? <span className="text-xs text-neutral-400">(not available)</span> : null}
                          </div>
                          {canManage ? <div className="text-xs text-neutral-500 mt-1">ID: {n.id}</div> : null}
                          {n.description ? <div className="text-sm text-neutral-600 mt-1">{n.description}</div> : null}
                          {canManage && n.publish_at && n.kind !== "assignment" ? (
                            <div className="text-xs text-neutral-500 mt-1">Publish at: {fmtBaku(n.publish_at)}</div>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {n.kind === "folder" ? (
                          <>
                            <button className="px-3 py-2 text-sm rounded border bg-white" onClick={() => enterFolder(n)} type="button" disabled={!canManage && !visible}>
                              Open
                            </button>
                            {canManage ? (
                              <>
                                <button className="px-3 py-2 text-sm rounded border bg-white" onClick={() => togglePublished(n)} type="button">
                                  {n.published ? "Unpublish" : "Publish"}
                                </button>
                                <button className="px-3 py-2 text-sm rounded border bg-white" onClick={() => renameNode(n)} type="button">
                                  Rename
                                </button>
                                <button className="px-3 py-2 text-sm rounded border bg-white" onClick={() => moveNode(n)} type="button">
                                  Move
                                </button>
                                <button className="px-3 py-2 text-sm rounded border bg-white text-red-600" onClick={() => deleteNode(n)} type="button">
                                  Delete
                                </button>
                              </>
                            ) : null}
                          </>
                        ) : n.kind === "assignment" ? (
                          <>
                            <button className="px-3 py-2 text-sm rounded border bg-white" onClick={() => openAssignment(n)} type="button" disabled={!canManage && !visible}>
                              Open
                            </button>
                            {canManage ? (
                              <>
                                <button className="px-3 py-2 text-sm rounded border bg-white" onClick={() => moveNode(n)} type="button">
                                  Move
                                </button>
                                <button className="px-3 py-2 text-sm rounded border bg-white text-red-600" onClick={() => deleteNode(n)} type="button">
                                  Remove
                                </button>
                              </>
                            ) : null}
                          </>
                        ) : n.kind === "quiz" ? (
                          <>
                            <button
                              className="px-3 py-2 text-sm rounded border bg-white"
                              onClick={() => {
                                if (canReviewQuiz && quizId) {
                                  router.push(`/practice/mock-exams/${quizId}?review=1`);
                                  return;
                                }
                                openQuiz(n, canManage ? "manage" : "open");
                              }}
                              type="button"
                              disabled={!canManage && !visible}
                            >
                              {canManage ? "Manage" : canReviewQuiz ? "Check latest attempt" : "Open"}
                            </button>
                            {canManage ? (
                              <>
                                <button className="px-3 py-2 text-sm rounded border bg-white" onClick={() => togglePublished(n)} type="button">
                                  {n.published ? "Unpublish" : "Publish"}
                                </button>
                                <button className="px-3 py-2 text-sm rounded border bg-white" onClick={() => renameNode(n)} type="button">
                                  Rename
                                </button>
                                <button className="px-3 py-2 text-sm rounded border bg-white" onClick={() => moveNode(n)} type="button">
                                  Move
                                </button>
                                <button className="px-3 py-2 text-sm rounded border bg-white text-red-600" onClick={() => deleteNode(n)} type="button">
                                  Delete
                                </button>
                              </>
                            ) : null}
                          </>
                        ) : (
                          <>
                            <button className="px-3 py-2 text-sm rounded border bg-white" onClick={() => onPreview(n)} type="button" disabled={!canManage && !visible}>
                              Preview
                            </button>
                            <button className="px-3 py-2 text-sm rounded border bg-white" onClick={() => onDownload(n)} type="button" disabled={!canManage && !visible}>
                              Download
                            </button>
                            {canManage ? (
                              <>
                                <button className="px-3 py-2 text-sm rounded border bg-white" onClick={() => togglePublished(n)} type="button">
                                  {n.published ? "Unpublish" : "Publish"}
                                </button>
                                <button className="px-3 py-2 text-sm rounded border bg-white" onClick={() => renameNode(n)} type="button">
                                  Rename
                                </button>
                                <button className="px-3 py-2 text-sm rounded border bg-white" onClick={() => moveNode(n)} type="button">
                                  Move
                                </button>
                                <button className="px-3 py-2 text-sm rounded border bg-white text-red-600" onClick={() => deleteNode(n)} type="button">
                                  Delete
                                </button>
                              </>
                            ) : null}
                          </>
                        )}
                      </div>

                      {previewNodeId === n.id && previewUrl && previewType ? (
                        <div className="rounded-lg border bg-white p-3 space-y-2">
                          <div className="flex items-center justify-between gap-3">
                            <div className="font-medium">
                              Preview{previewTitle ? `: ${previewTitle}` : ""}
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                className="text-sm text-sky-700 underline"
                                type="button"
                                onClick={() => previewUrl && window.open(previewUrl, "_blank")}
                              >
                                Open in new tab
                              </button>
                              <button className="text-sm text-slate-600 underline" onClick={closePreview} type="button">
                                Close
                              </button>
                            </div>
                          </div>
                          {previewType === "pdf" ? (
                            <iframe src={previewUrl} className="w-full h-[60vh] border rounded" title="PDF Preview" />
                          ) : previewType === "image" ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={previewUrl} alt="preview" className="max-w-full rounded border" />
                          ) : (
                            <div className="text-sm text-slate-600">
                              Preview not available for this file type. Use the buttons above to view or download.
                            </div>
                          )}
                        </div>
                      ) : null}

                      {canManage && n.kind !== "assignment" ? <ScheduleControls node={n} /> : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {contentError && !canManage ? <div className="text-sm text-red-600">{contentError}</div> : null}
        </div>
      ) : null}

      {/* ===== CALENDAR ===== */}
      {tab === "calendar" ? (
  <div className="space-y-5">
    {/* Header */}
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-2xl bg-neutral-100 border border-neutral-200 flex items-center justify-center">
          <span className="text-lg">🗓️</span>
        </div>
        <div>
          <div className="text-base sm:text-lg font-semibold text-neutral-900">Weekly schedule</div>
          <div className="text-xs sm:text-sm text-neutral-500">Plan classes, deadlines, and events</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          className="px-4 py-2.5 rounded-xl border border-neutral-200 bg-white hover:bg-neutral-50 text-sm font-semibold shadow-sm transition active:scale-[0.99]"
          type="button"
          onClick={() => setCalendarWeekStart((d) => addDays(d, -7))}
        >
          ← Prev
        </button>
        <button
          className="px-4 py-2.5 rounded-xl border border-neutral-200 bg-white hover:bg-neutral-50 text-sm font-semibold shadow-sm transition active:scale-[0.99]"
          type="button"
          onClick={() => setCalendarWeekStart(startOfWeek(new Date()))}
        >
          Today
        </button>
        <button
          className="px-4 py-2.5 rounded-xl border border-neutral-200 bg-white hover:bg-neutral-50 text-sm font-semibold shadow-sm transition active:scale-[0.99]"
          type="button"
          onClick={() => setCalendarWeekStart((d) => addDays(d, 7))}
        >
          Next →
        </button>
      </div>
    </div>

    {/* Add event */}
    {canManage ? (
      <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b bg-neutral-50/60">
          <div className="text-base font-semibold text-neutral-900">Add event</div>
          <div className="text-xs text-neutral-500 mt-0.5">Create one-time or weekly repeating events</div>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <div className="text-xs font-medium text-neutral-600">Title</div>
              <input
                className="h-11 border border-neutral-200 rounded-xl px-3.5 text-sm bg-white outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-300 transition"
                placeholder="e.g. Live session"
                value={evTitle}
                onChange={(e) => setEvTitle(e.target.value)}
              />
            </div>

            <div className="grid gap-1.5">
              <div className="text-xs font-medium text-neutral-600">Date</div>
              <input
                type="date"
                className="h-11 border border-neutral-200 rounded-xl px-3.5 text-sm bg-white outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-300 transition"
                value={evDate}
                onChange={(e) => setEvDate(e.target.value)}
              />
            </div>

            <div className="grid gap-1.5">
              <div className="text-xs font-medium text-neutral-600">Start</div>
              <input
                type="time"
                className="h-11 border border-neutral-200 rounded-xl px-3.5 text-sm bg-white outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-300 transition"
                value={evStart}
                onChange={(e) => setEvStart(e.target.value)}
              />
            </div>

            <div className="grid gap-1.5">
              <div className="text-xs font-medium text-neutral-600">End</div>
              <input
                type="time"
                className="h-11 border border-neutral-200 rounded-xl px-3.5 text-sm bg-white outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-300 transition"
                value={evEnd}
                onChange={(e) => setEvEnd(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <label className="flex items-center gap-2 text-sm font-medium text-neutral-700">
              <input
                type="checkbox"
                checked={evRepeat}
                onChange={(e) => setEvRepeat(e.target.checked)}
                className="h-4 w-4 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-900/20"
              />
              Repeat weekly
            </label>

            <button
              className="px-4 py-2.5 rounded-xl bg-neutral-900 text-white hover:bg-neutral-800 text-sm font-semibold shadow-sm transition disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.99]"
              type="button"
              onClick={createEvent}
              disabled={creatingEvent}
            >
              {creatingEvent ? "Adding..." : "Add event"}
            </button>
          </div>

          {evRepeat ? (
            <div className="grid gap-1.5 max-w-xs">
              <div className="text-xs font-medium text-neutral-600">Repeat until</div>
              <input
                type="date"
                className="h-11 border border-neutral-200 rounded-xl px-3.5 text-sm bg-white outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-300 transition"
                value={evRepeatUntil}
                onChange={(e) => setEvRepeatUntil(e.target.value)}
              />
            </div>
          ) : null}
        </div>
      </div>
    ) : null}

    {calendarError ? (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {calendarError}
      </div>
    ) : null}

    {/* Calendar grid */}
    <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
      <div className="hidden sm:grid grid-cols-7 bg-gradient-to-r from-indigo-500 via-blue-500 to-cyan-500 border-b border-blue-600">
        {Array.from({ length: 7 }).map((_, i) => {
          const d = addDays(calendarWeekStart, i);
          return (
            <div
              key={i}
              className="px-3 py-3 text-xs sm:text-sm font-semibold text-white border-r border-white/20 last:border-r-0"
            >
              {fmtDay(d)}
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-7">
        {Array.from({ length: 7 }).map((_, i) => {
          const day = addDays(calendarWeekStart, i);
          const dayStart = new Date(day);
          dayStart.setHours(0, 0, 0, 0);
          const dayEnd = new Date(day);
          dayEnd.setHours(23, 59, 59, 999);

          const weekItems = expandEventsForWeek(calendarWeekStart, [...events, ...assignmentEvents]);
          const items = weekItems.filter((x) => {
            const t = new Date(x.occ_start).getTime();
            return t >= dayStart.getTime() && t <= dayEnd.getTime();
          });

          return (
            <div
              key={i}
              className="min-h-[120px] sm:min-h-[160px] p-3 border-b border-neutral-200 bg-white hover:bg-neutral-50/40 transition sm:border-r sm:last:border-r-0"
            >
              <div className="mb-2 text-xs font-semibold text-neutral-600 sm:hidden">
                {fmtDay(day)}
              </div>
              {calendarBusy ? (
                <div className="text-xs text-neutral-500">Loading...</div>
              ) : items.length === 0 ? (
                <div className="text-xs text-neutral-400">—</div>
              ) : (
                <div className="space-y-2">
                  {items.map((ev) => (
                    <div
                      key={`${ev.id}-${ev.occ_start}`}
                      className={`rounded-xl border px-3 py-2 shadow-sm ${
                        ev.id.startsWith("assign-")
                          ? "bg-amber-50 border-amber-200"
                          : "bg-white border-neutral-200"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-sm font-semibold text-neutral-900 leading-snug">
                          {ev.title}
                        </div>

                        {ev.id.startsWith("assign-") ? (
                          <span className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                            Due
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-1 text-xs text-neutral-600">
                        {fmtTime(ev.occ_start)} – {fmtTime(ev.occ_end)}
                        {ev.repeat_weekly ? (
                          <span className="ml-2 text-neutral-500">(weekly)</span>
                        ) : null}
                      </div>

                      {canManage ? (
                        <button
                          className="mt-2 text-xs font-semibold text-neutral-600 hover:text-red-600 underline underline-offset-2 transition"
                          type="button"
                          onClick={() => deleteEvent(ev.id)}
                        >
                          Delete
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  </div>
) : null}


{/* ===== GRADEBOOK ===== */}
{tab === "gradebook" ? (
  <div className="space-y-5">
    {/* Header */}
    <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-2xl bg-neutral-100 border border-neutral-200 flex items-center justify-center">
          <span className="text-lg">📒</span>
        </div>
        <div>
          <div className="text-base sm:text-lg font-semibold text-neutral-900">Gradebook</div>
          <div className="text-xs sm:text-sm text-neutral-500">
            Your submissions and grades for this course.
          </div>
        </div>
      </div>

      {/* Teacher controls */}
      {isTeacherOrAdmin(profile) ? (
        <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm p-3 sm:p-4">
          <div className="text-xs font-semibold text-neutral-600 mb-2">Teacher tools</div>

          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <input
              type="text"
              placeholder="Offline exam title"
              value={offlineTitle}
              onChange={(e) => setOfflineTitle(e.target.value)}
              className="h-11 w-full sm:w-64 border border-neutral-200 rounded-xl px-3.5 text-sm bg-white outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-300 transition"
            />
            <input
              type="number"
              placeholder="Max score (optional)"
              value={offlineMax}
              onChange={(e) => setOfflineMax(e.target.value)}
              className="h-11 w-full sm:w-40 border border-neutral-200 rounded-xl px-3.5 text-sm bg-white outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-300 transition"
            />
            <button
              className="h-11 px-4 rounded-xl bg-neutral-900 text-white hover:bg-neutral-800 text-sm font-semibold shadow-sm transition active:scale-[0.99]"
              type="button"
              onClick={async () => {
                if (!accessToken || !course?.id) return;
                const title = offlineTitle.trim();
                if (!title) return alert("Title required");
                const maxScore = offlineMax.trim() === "" ? null : Number(offlineMax);
                try {
                  const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/api/offline/units/create/`, {
                    method: "POST",
                    headers: {
                      Authorization: `Bearer ${accessToken}`,
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ course_id: course.id, title, max_score: maxScore }),
                  });
                  const json = await res.json();
                  if (!res.ok) throw new Error(json?.error || "Failed to create offline exam");
                  setOfflineTitle("");
                  setOfflineMax("");
                  await loadGradebook(course.id);
                } catch (e: any) {
                  alert(e?.message ?? "Failed to create offline exam");
                }
              }}
            >
              Add offline exam
            </button>
          </div>
        </div>
      ) : null}
    </div>

    {/* States */}
    {gradebookLoading ? (
      <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm p-5 text-sm text-neutral-600">
        Loading…
      </div>
    ) : gradebookError ? (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
        Error: {gradebookError}
      </div>
    ) : (
      <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-4 gap-3 px-4 py-3 text-sm font-semibold text-white
                        bg-gradient-to-r from-indigo-500 via-blue-500 to-cyan-500">
          <div>Title</div>
          <div>Status</div>
          <div>Due</div>
          <div className="text-right">Grade</div>
        </div>

        {/* Table body */}
        <div className="divide-y divide-neutral-100">
          {gradeRows.length === 0 && offlineUnits.length === 0 ? (
            <div className="px-4 py-4 text-sm text-neutral-600">
              No assignments yet.
            </div>
          ) : (
            <>
              {gradeRows.map((a) => {
                const grade = a.submission?.grade;
                const isQuiz = a.kind === "quiz";
                const openHref = isQuiz
                  ? canManage
                    ? `/practice/mock-exams?manage=${a.id}`
                    : `/practice/mock-exams/${a.id}`
                  : `/course/${course?.id}/assignment/${a.id}`;
                return (
                  <div
                    key={a.id}
                    className="grid grid-cols-4 gap-3 px-4 py-4 text-sm items-start hover:bg-neutral-50/60 transition"
                  >
                    {/* Title */}
                    <div className="space-y-1">
                      <div className="font-semibold text-neutral-900 leading-snug">{a.title}</div>
                      <button
                        className="inline-flex items-center gap-1 text-xs font-semibold text-neutral-600 hover:text-neutral-900 underline underline-offset-2 transition"
                        type="button"
                        onClick={() => router.push(openHref)}
                      >
                        {isQuiz ? "Open quiz" : "Open"} <span aria-hidden>↗</span>
                      </button>
                      {isQuiz && a.submission && a.results_published ? (
                        <button
                          className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-900 underline underline-offset-2 transition"
                          type="button"
                          onClick={() => router.push(`/practice/mock-exams/${a.id}?review=1`)}
                        >
                          Review attempt
                        </button>
                      ) : null}
                    </div>

                    {/* Status */}
                    <div className="text-neutral-600 capitalize">
                      <span className="inline-flex items-center px-2 py-1 rounded-full border border-neutral-200 bg-white text-xs font-semibold">
                        {isQuiz ? (a.is_active === false ? "disabled" : "quiz") : a.status}
                      </span>
                    </div>

                    {/* Due */}
                    <div className="text-neutral-600">
                      {a.due_at && !isQuiz ? (
                        <span className="text-xs sm:text-sm">
                          {new Date(a.due_at).toLocaleString()}
                        </span>
                      ) : (
                        "—"
                      )}
                    </div>

                    {/* Grade */}
                    <div className="text-right">
                      {grade ? (
                        <div className="inline-flex justify-end w-full">
                          {gradeBadge(grade.score as any, a.max_score as any)}
                        </div>
                      ) : a.submission ? (
                        isQuiz && a.results_published === false ? (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                            Results hidden
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                            Pending
                          </span>
                        )
                      ) : (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-neutral-100 text-neutral-700 border border-neutral-200">
                          No submission
                        </span>
                      )}

                      {a.submission && !isQuiz ? (
                        <div className="text-xs text-neutral-500 mt-2 text-right">
                          {a.submission.file_name ? a.submission.file_name : "Unnamed file"}
                          {a.submission.created_at ? ` ? ${new Date(a.submission.created_at).toLocaleString()}` : ""}
                        </div>
                      ) : a.submission && isQuiz && a.submission.created_at ? (
                        <div className="text-xs text-neutral-500 mt-2 text-right">
                          Submitted {new Date(a.submission.created_at).toLocaleString()}
                        </div>
                      ) : null}


                      {grade?.feedback ? (
                        <div className="text-xs text-neutral-500 mt-2">
                          {grade.feedback}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}

              {/* Offline exams */}
              {offlineUnits.map((u) => {
                const g = u.grade;
                return (
                  <div
                    key={`off-${u.id}`}
                    className="grid grid-cols-4 gap-3 px-4 py-4 text-sm items-start bg-neutral-50 hover:bg-neutral-100/60 transition"
                  >
                    <div className="space-y-1">
                      <div className="font-semibold text-neutral-900 leading-snug">{u.title}</div>
                      <button
                        className="inline-flex items-center gap-1 text-xs font-semibold text-neutral-600 hover:text-neutral-900 underline underline-offset-2 transition"
                        type="button"
                        onClick={() => router.push(`/course/${course?.id}/offline-grade/${u.id}`)}
                      >
                        Open <span aria-hidden>↗</span>
                      </button>
                      <div className="inline-flex items-center mt-1 px-2 py-1 rounded-full text-[11px] font-semibold bg-white border border-neutral-200 text-neutral-700">
                        Offline exam
                      </div>
                    </div>

                    <div className="text-neutral-600 capitalize">—</div>
                    <div className="text-neutral-600">—</div>

                    <div className="text-right">
                      {g ? (
                        <div className="inline-flex justify-end w-full">
                          {gradeBadge(g.score as any, (g.max_score ?? u.max_score) as any)}
                        </div>
                      ) : (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                          Pending
                        </span>
                      )}
                      {g?.feedback ? (
                        <div className="text-xs text-neutral-500 mt-2">
                          {g.feedback}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    )}
  </div>
) : null}

    </div>
  );
}

  function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "px-5 py-2.5 text-sm font-semibold rounded-full border transition-all duration-150 shadow-sm",
        active
          ? "bg-gradient-to-r from-sky-500 to-indigo-600 text-white border-transparent shadow-md scale-[1.01]"
          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-800",
      ].join(" ")}
      type="button"
    >
      {children}
    </button>
  );
}

function ActionIcon({
  emoji,
  label,
  onClick,
  active,
}: {
  emoji: string;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "flex items-center gap-2 px-3 py-2 text-sm rounded-full border bg-white shadow-sm hover:shadow",
        active ? "border-slate-900 text-slate-900" : "border-slate-200 text-neutral-700",
      ].join(" ")}
    >
      <span>{emoji}</span>
      <span>{label}</span>
    </button>
  );
}

function StatCard({ label, value, accent, subtitle }: { label: string; value: number | string; accent: string; subtitle?: string }) {
  return (
    <div className="rounded-2xl overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white shadow-lg">
      <div className={`h-1 w-full bg-gradient-to-r ${accent}`} />
      <div className="p-4">
        <div className="text-[11px] uppercase tracking-[0.18em] text-white/70">{label}</div>
        <div className="text-3xl font-semibold mt-1">{value}</div>
        {subtitle ? <div className="text-xs text-white/80 mt-1 line-clamp-1">{subtitle}</div> : null}
      </div>
    </div>
  );
}


function ChipList({
  title,
  items,
  emptyLabel,
  limit = 50,
}: {
  title: string;
  items: { user_id: string; username?: string | null; nickname?: string | null }[];
  emptyLabel: string;
  limit?: number;
}) {
  const subset = items.slice(0, limit);
  return (
    <div className="rounded-xl border p-3 bg-neutral-50">
      <div className="text-sm font-semibold mb-2">{title}</div>
      {subset.length === 0 ? (
        <div className="text-sm text-neutral-500">{emptyLabel}</div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {subset.map((p) => (
            <span
              key={p.user_id}
              className="px-3 py-1 rounded-full bg-white border text-xs text-neutral-800 shadow-sm"
            >
              {p.username || p.nickname || p.user_id.slice(0, 6)}
            </span>
          ))}
          {items.length > limit ? (
            <span className="text-xs text-neutral-500 px-2 py-1">+{items.length - limit} more</span>
          ) : null}
        </div>
      )}
    </div>
  );
}
