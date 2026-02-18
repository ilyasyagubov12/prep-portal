"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Manrope } from "next/font/google";
import happy from "@/sss/happy(ilyas).png";
import vic from "@/sss/vic(ilyas).png";

const uiFont = Manrope({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"] });

type ExamDate = {
  id: number;
  date: string; // YYYY-MM-DD
};

type PracticeTest = {
  id: string;
  title: string;
  description?: string | null;
  locked?: boolean;
  modules?: { subject: string; module_index: number }[];
  attempt?: {
    status: string;
    module_scores?: Record<string, { correct: number; total: number }>;
  } | null;
};

type CourseSummary = {
  id: string;
  slug: string;
  title: string;
  description?: string | null;
  cover_url?: string | null;
};

type GradePreviewItem = {
  id: string;
  title: string;
  score: number;
  max_score?: number | null;
  kind: "assignment" | "quiz" | "offline";
  graded_at?: string | null;
};

export default function HomePage() {
  const router = useRouter();
  const [examDates, setExamDates] = useState<ExamDate[]>([]);
  const [selectedExam, setSelectedExam] = useState<ExamDate | null>(null);
  const [showExamPicker, setShowExamPicker] = useState(false);
  const [newExamDate, setNewExamDate] = useState("");
  const [isStaff, setIsStaff] = useState(false);
  const [loadingDates, setLoadingDates] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(new Date());
  const [mathGoal, setMathGoal] = useState(600);
  const [verbalGoal, setVerbalGoal] = useState(600);
  const [showGoalPicker, setShowGoalPicker] = useState(false);
  const [draftMath, setDraftMath] = useState(600);
  const [draftVerbal, setDraftVerbal] = useState(600);
  const [showUniPicker, setShowUniPicker] = useState(false);
  const [uniPreview, setUniPreview] = useState<string | null>(null);
  const [uniFile, setUniFile] = useState<File | null>(null);
  const [uniUploading, setUniUploading] = useState(false);
  const [displayName, setDisplayName] = useState("there");
  const [mathLevel, setMathLevel] = useState(0);
  const [verbalLevel, setVerbalLevel] = useState(0);
  const [streakCount, setStreakCount] = useState(0);
  const [streakMath, setStreakMath] = useState(0);
  const [streakVerbal, setStreakVerbal] = useState(0);
  const [streakDone, setStreakDone] = useState(false);
  const [streakTimeLeft, setStreakTimeLeft] = useState(0);
  const [streakLoaded, setStreakLoaded] = useState(false);
  const [practiceTests, setPracticeTests] = useState<PracticeTest[]>([]);
  const [loadingPractices, setLoadingPractices] = useState(false);
  const [practiceError, setPracticeError] = useState<string | null>(null);
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [courseGrades, setCourseGrades] = useState<Record<string, GradePreviewItem[]>>({});
  const [coursesLoading, setCoursesLoading] = useState(false);
  const [coursesError, setCoursesError] = useState<string | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      setStreakTimeLeft((t) => (t > 0 ? t - 1 : 0));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);


  useEffect(() => {
    (async () => {
      try {
        setLoadingDates(true);
        const access = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;

        if (access) {
          const me = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/api/auth/me/`, {
            headers: { Authorization: `Bearer ${access}` },
          }).catch(() => null);
          if (me && me.ok) {
            const prof = await me.json().catch(() => null);
            const role = (prof?.role ?? "").toLowerCase();
            setIsStaff(!!prof?.is_admin || role === "admin" || role === "teacher");
            const first = (prof?.user?.first_name || "").trim();
            const last = (prof?.user?.last_name || "").trim();
            setDisplayName(first || last ? `${first} ${last}`.trim() : "there");
            const sel = prof?.selected_exam_date;
            if (sel?.id && sel?.date) {
              setSelectedExam({ id: Number(sel.id), date: sel.date });
            }
            if (typeof prof?.goal_math === "number") setMathGoal(prof.goal_math);
            if (typeof prof?.goal_verbal === "number") setVerbalGoal(prof.goal_verbal);
            const mLvl = parseInt(prof?.math_level ?? "0", 10);
            const vLvl = parseInt(prof?.verbal_level ?? "0", 10);
            setMathLevel(Number.isFinite(mLvl) ? mLvl : 0);
            setVerbalLevel(Number.isFinite(vLvl) ? vLvl : 0);
            if (prof?.university_icon) setUniPreview(prof.university_icon);
          }

          const streakRes = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/api/streak/status/`, {
            headers: {
              Authorization: `Bearer ${access}`,
              "X-TZ-Offset": String(new Date().getTimezoneOffset()),
            },
          }).catch(() => null);
          if (streakRes && streakRes.ok) {
            const streakJson = await streakRes.json().catch(() => null);
            setStreakCount(streakJson?.streak_count ?? 0);
            setStreakMath(streakJson?.today?.math_count ?? 0);
            setStreakVerbal(streakJson?.today?.verbal_count ?? 0);
            setStreakDone(!!streakJson?.today?.completed);
            setStreakTimeLeft(streakJson?.time_left_seconds ?? 0);
            setStreakLoaded(true);
          }
        }

        const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/api/exam-dates/`, {
          headers: {
            ...(access ? { Authorization: `Bearer ${access}` } : {}),
          },
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "Failed to load dates");
        const upcoming = (json.dates ?? []).map((d: any) => ({ id: Number(d.id), date: d.date }));
        setExamDates(upcoming);
        if (selectedExam && !upcoming.find((d: ExamDate) => d.id === selectedExam.id)) {
          setSelectedExam(null);
        }
        setError(null);
      } catch (e: any) {
        setError(e?.message ?? "Failed to load dates");
      } finally {
        setLoadingDates(false);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      const access = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
      if (!access) return;
      setLoadingPractices(true);
      setPracticeError(null);
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/api/module-practice/list/`, {
          headers: { Authorization: `Bearer ${access}` },
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "Failed to load practice tests");
        setPracticeTests(json.practices ?? []);
      } catch (e: any) {
        setPracticeError(e?.message ?? "Failed to load practice tests");
      } finally {
        setLoadingPractices(false);
      }
    })();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const access = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
      if (!access) return;
      setCoursesLoading(true);
      setCoursesError(null);
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/api/courses/`, {
          headers: { Authorization: `Bearer ${access}` },
        });
        const list = await res.json().catch(() => []);
        if (!res.ok) throw new Error(list?.error || "Failed to load courses");
        if (cancelled) return;
        setCourses(list ?? []);

        const gradesMap: Record<string, GradePreviewItem[]> = {};
        await Promise.all(
          (list ?? []).map(async (course: CourseSummary) => {
            const gradeRes = await fetch(
              `${process.env.NEXT_PUBLIC_API_BASE}/api/grades/me/?course_id=${course.id}`,
              { headers: { Authorization: `Bearer ${access}` } }
            );
            const gradeJson = await gradeRes.json().catch(() => null);
            if (!gradeRes.ok || !gradeJson) {
              gradesMap[course.id] = [];
              return;
            }

            const items: GradePreviewItem[] = [];
            const assignments = gradeJson.assignments ?? [];
            for (const row of assignments) {
              const grade = row?.submission?.grade;
              if (!grade || typeof grade.score !== "number") continue;
              items.push({
                id: row.id,
                title: row.title,
                score: grade.score,
                max_score: row.max_score,
                kind: row.kind === "quiz" ? "quiz" : "assignment",
                graded_at: grade.graded_at ?? row?.submission?.created_at ?? null,
              });
            }

            const offline = gradeJson.offline_units ?? [];
            for (const unit of offline) {
              const g = unit?.grade;
              if (!g || typeof g.score !== "number") continue;
              items.push({
                id: unit.id,
                title: unit.title,
                score: g.score,
                max_score: unit.max_score,
                kind: "offline",
                graded_at: g.graded_at ?? null,
              });
            }

            items.sort((a, b) => {
              const aTime = a.graded_at ? new Date(a.graded_at).getTime() : 0;
              const bTime = b.graded_at ? new Date(b.graded_at).getTime() : 0;
              return bTime - aTime;
            });

            gradesMap[course.id] = items.slice(0, 5);
          })
        );

        if (!cancelled) setCourseGrades(gradesMap);
      } catch (e: any) {
        if (!cancelled) setCoursesError(e?.message ?? "Failed to load grades");
      } finally {
        if (!cancelled) setCoursesLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const formattedDates = useMemo(() => {
    const fmt = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" });
    return examDates.map((d) => ({ ...d, label: fmt.format(new Date(d.date + "T00:00:00")) }));
  }, [examDates]);

  const countdownText = useMemo(() => {
    if (!selectedExam) return null;
    const target = new Date(selectedExam.date + "T00:00:00");
    const diffMs = target.getTime() - now.getTime();
    const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    if (days < 0) return "Date passed";
    if (days === 0) return "Today";
    return `${days} days left`;
  }, [selectedExam, now]);

  function formatCountdown(seconds: number) {
    const safe = Math.max(0, Math.floor(seconds));
    const h = Math.floor(safe / 3600);
    const m = Math.floor((safe % 3600) / 60);
    const s = safe % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  function gradeBadge(score: number | null | undefined, max: number | null | undefined) {
    if (score === null || typeof score === "undefined") return null;
    const nScore = typeof score === "string" ? Number(score) : score;
    const nMax = typeof max === "string" ? Number(max) : max;
    const pct = nMax ? (nScore / nMax) * 100 : nScore;

    let bg = "#ef4444";
    let fg = "#ffffff";
    if (pct >= 90) {
      bg = "#166534";
      fg = "#f8fafc";
    } else if (pct >= 80) {
      bg = "#22c55e";
      fg = "#0f172a";
    } else if (pct >= 70) {
      bg = "#facc15";
      fg = "#0f172a";
    } else if (pct >= 60) {
      bg = "#f97316";
      fg = "#0f172a";
    }

    return (
      <span
        style={{
          backgroundColor: bg,
          color: fg,
          padding: "6px 10px",
          borderRadius: "999px",
          display: "inline-block",
          fontSize: "11px",
          fontWeight: 700,
          minWidth: "72px",
          textAlign: "center",
          boxShadow: "0 0 0 1px rgba(0,0,0,0.15)",
        }}
      >
        {nScore}
        {nMax ? ` / ${nMax}` : ""}
      </span>
    );
  }

  const mathProgress = Math.min(1, streakMath / 5);
  const verbalProgress = Math.min(1, streakVerbal / 5);
  const ringSize = 112;
  const ringStroke = 10;
  const ringRadius = (ringSize - ringStroke) / 2;
  const ringCirc = 2 * Math.PI * ringRadius;
  const semiCirc = ringCirc / 2;
  const mathOffset = semiCirc * (1 - mathProgress);
  const verbalOffset = semiCirc * (1 - verbalProgress);
  const auraRatio = Math.min(1, streakCount / 20);
  const auraHue = 120 + (280 - 120) * auraRatio;
  const auraGlow = `radial-gradient(closest-side, hsla(${auraHue}, 85%, 65%, 0.75), hsla(${auraHue}, 85%, 55%, 0.35) 55%, transparent 70%)`;

  async function selectExamDate(dateId: number) {
    const access = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/api/exam-dates/select/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(access ? { Authorization: `Bearer ${access}` } : {}),
        },
        body: JSON.stringify({ date_id: dateId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to select date");
      setSelectedExam({ id: Number(json.selected.id), date: json.selected.date });
      setShowExamPicker(false);
    } catch (e: any) {
      setError(e?.message ?? "Failed to select date");
    }
  }

  async function addExamDate() {
    if (!newExamDate) return;
    const access = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/api/exam-dates/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(access ? { Authorization: `Bearer ${access}` } : {}),
        },
        body: JSON.stringify({ date: newExamDate }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to add date");
      const added = { id: Number(json.date.id), date: json.date.date };
      setExamDates((prev) => [...prev, added].sort((a, b) => a.date.localeCompare(b.date)));
      setNewExamDate("");
    } catch (e: any) {
      setError(e?.message ?? "Failed to add date");
    }
  }

  async function uploadUniversityIcon(file: File) {
    const access = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    try {
      setUniUploading(true);
      const form = new FormData();
      form.append("icon", file);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/api/auth/university-icon/`, {
        method: "POST",
        headers: {
          ...(access ? { Authorization: `Bearer ${access}` } : {}),
        },
        body: form,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to upload icon");
      setUniPreview(json.icon ?? null);
      setUniFile(null);
      setShowUniPicker(false);
    } catch (e: any) {
      setError(e?.message ?? "Failed to upload icon");
    } finally {
      setUniUploading(false);
    }
  }
  async function saveGoalScores() {
    const access = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/api/auth/goal-score/`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(access ? { Authorization: `Bearer ${access}` } : {}),
        },
        body: JSON.stringify({ goal_math: draftMath, goal_verbal: draftVerbal }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to save goal score");
      setMathGoal(json.goal_math ?? draftMath);
      setVerbalGoal(json.goal_verbal ?? draftVerbal);
      setShowGoalPicker(false);
    } catch (e: any) {
      setError(e?.message ?? "Failed to save goal score");
    }
  }

  return (
    <div className={`${uiFont.className} min-h-screen bg-[#f6f7fb] text-slate-900`}>
      <div className="mx-auto max-w-none px-4 py-6 sm:px-6 sm:py-8">
        {/* Greeting */}
        <div className="mt-2 flex items-center gap-2 text-lg font-semibold">
          <span>👋</span>
          <span>Hi {displayName}</span>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {[
            { label: "Math", value: mathLevel, accent: "from-emerald-400 via-teal-400 to-indigo-500" },
            { label: "Verbal", value: verbalLevel, accent: "from-amber-400 via-rose-400 to-purple-500" },
          ].map((item) => {
            const cap = 20;
            const pct = Math.min(1, item.value / cap);
            return (
              <div
                key={item.label}
                className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
              >
                <div className="absolute right-0 top-0 h-16 w-16 -translate-y-6 translate-x-6 rounded-full bg-slate-100/70 blur-2xl" />
                <div className="flex items-center justify-between">
                  <div className="text-xs uppercase tracking-[0.2em] text-slate-400">{item.label} level</div>
                  <div className="text-lg font-extrabold text-slate-900">{item.value}</div>
                </div>
                <div className="mt-2 h-2 w-full rounded-full bg-slate-100">
                  <div
                    className={`h-2 rounded-full bg-gradient-to-r ${item.accent}`}
                    style={{ width: `${Math.round(pct * 100)}%` }}
                  />
                </div>
                <div className="mt-1 text-[11px] text-slate-500">Progress to 20</div>
              </div>
            );
          })}
        </div>

        {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}

        {/* Main grid */}
        <div className="mt-4 grid gap-4 lg:grid-cols-[2fr_1fr]">
          {/* Left column */}
          <div className="grid gap-4">
            <div className="relative overflow-hidden rounded-3xl border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-sky-50 p-5 sm:p-6 shadow-sm">
              <div className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full bg-blue-200/40 blur-2xl" />
              <div className="pointer-events-none absolute -left-10 -bottom-12 h-32 w-32 rounded-full bg-sky-200/40 blur-2xl" />
              <div className="relative">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.2em] text-blue-500">Daily streak</div>
                    <div className="mt-1 text-lg font-semibold text-slate-900">SAT Streak</div>
                    <div className="text-xs text-slate-500">Complete 5 Math + 5 Verbal daily</div>
                  </div>
                  <div className="rounded-full border border-blue-200 bg-white/80 px-3 py-1 text-xs font-semibold text-blue-600 shadow-sm">
                    {streakCount} day{streakCount === 1 ? "" : "s"}
                  </div>
                </div>

                <div className="mt-6 grid gap-4 lg:grid-cols-[1.1fr_1.6fr]">
                  <div className="flex flex-col items-center justify-center rounded-2xl border border-blue-100 bg-white/80 p-5 text-center shadow-sm">
                    <div className="relative h-20 w-20">
                      <span
                        className={`absolute inset-0 flex items-center justify-center text-6xl ${
                          streakDone ? "opacity-100" : "opacity-40 grayscale"
                        }`}
                      >
                        🔥
                      </span>
                      <span
                        className="absolute left-1/2 top-[58%] -translate-x-1/2 -translate-y-1/2 text-2xl font-extrabold text-white"
                        style={{ textShadow: "0 1px 8px rgba(0,0,0,0.35)" }}
                      >
                        {streakCount}
                      </span>
                    </div>
                    <div className="mt-2 text-xs font-semibold uppercase tracking-[0.2em] text-blue-500">
                      Day Streak
                    </div>
                    <div className={`mt-2 text-xs font-semibold ${streakDone ? "text-emerald-600" : "text-slate-500"}`}>
                      {streakDone ? "Completed today" : "Not completed yet"}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>Time left</span>
                      <span className="font-semibold text-slate-700">Resets at midnight</span>
                    </div>
                    <div className="mt-2 text-2xl font-semibold tracking-[0.08em] text-slate-900">
                      {streakLoaded
                        ? streakDone
                          ? "DONE TODAY"
                          : formatCountdown(streakTimeLeft)
                        : "Loading..."}
                    </div>

                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <div className="flex flex-col items-center">
                        <div className="text-xs font-semibold text-slate-700">Math</div>
                        <div className="relative mt-3 h-20 w-28">
                          <div className="absolute -inset-1 rounded-full bg-blue-100/60 blur-md" />
                          <div className="absolute inset-x-0 bottom-0 h-10 overflow-hidden">
                            <div className="absolute bottom-0 left-1/2 h-20 w-20 -translate-x-1/2 rounded-full bg-white shadow-inner" />
                          </div>
                          <svg
                            width={ringSize}
                            height={ringSize}
                            className="absolute left-1/2 top-0 -translate-x-1/2"
                            viewBox={`0 0 ${ringSize} ${ringSize}`}
                          >
                            <circle
                              cx={ringSize / 2}
                              cy={ringSize / 2}
                              r={ringRadius}
                              stroke="#e2e8f0"
                              strokeWidth={ringStroke}
                              fill="none"
                              strokeDasharray={`${semiCirc} ${ringCirc}`}
                              strokeDashoffset={0}
                              strokeLinecap="round"
                              transform={`rotate(-180 ${ringSize / 2} ${ringSize / 2})`}
                            />
                            <circle
                              cx={ringSize / 2}
                              cy={ringSize / 2}
                              r={ringRadius}
                              stroke="#2563eb"
                              strokeWidth={ringStroke}
                              fill="none"
                              strokeDasharray={`${semiCirc} ${ringCirc}`}
                              strokeDashoffset={mathOffset}
                              strokeLinecap="round"
                              transform={`rotate(-180 ${ringSize / 2} ${ringSize / 2})`}
                            />
                          </svg>
                          <div className="absolute inset-0 flex flex-col items-center justify-end pb-1">
                            <div className="text-base font-semibold text-slate-900">
                              {Math.min(streakMath, 5)}/5
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col items-center">
                        <div className="text-xs font-semibold text-slate-700">Verbal</div>
                        <div className="relative mt-3 h-20 w-28">
                          <div className="absolute -inset-1 rounded-full bg-emerald-100/60 blur-md" />
                          <div className="absolute inset-x-0 bottom-0 h-10 overflow-hidden">
                            <div className="absolute bottom-0 left-1/2 h-20 w-20 -translate-x-1/2 rounded-full bg-white shadow-inner" />
                          </div>
                          <svg
                            width={ringSize}
                            height={ringSize}
                            className="absolute left-1/2 top-0 -translate-x-1/2"
                            viewBox={`0 0 ${ringSize} ${ringSize}`}
                          >
                            <circle
                              cx={ringSize / 2}
                              cy={ringSize / 2}
                              r={ringRadius}
                              stroke="#e2e8f0"
                              strokeWidth={ringStroke}
                              fill="none"
                              strokeDasharray={`${semiCirc} ${ringCirc}`}
                              strokeDashoffset={0}
                              strokeLinecap="round"
                              transform={`rotate(-180 ${ringSize / 2} ${ringSize / 2})`}
                            />
                            <circle
                              cx={ringSize / 2}
                              cy={ringSize / 2}
                              r={ringRadius}
                              stroke="#22c55e"
                              strokeWidth={ringStroke}
                              fill="none"
                              strokeDasharray={`${semiCirc} ${ringCirc}`}
                              strokeDashoffset={verbalOffset}
                              strokeLinecap="round"
                              transform={`rotate(-180 ${ringSize / 2} ${ringSize / 2})`}
                            />
                          </svg>
                          <div className="absolute inset-0 flex flex-col items-center justify-end pb-1">
                            <div className="text-base font-semibold text-slate-900">
                              {Math.min(streakVerbal, 5)}/5
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="relative rounded-3xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm text-slate-600">Course Gradebook</div>
                  <div className="text-xs text-slate-500">Latest scores from your classes.</div>
                </div>
                <button
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
                  onClick={() => router.push("/courses")}
                >
                  View all
                </button>
              </div>

              <div className="mt-5 space-y-4 max-h-[22rem] overflow-auto pr-1">
                {coursesLoading ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                    Loading course grades...
                  </div>
                ) : coursesError ? (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-6 text-sm text-red-600">
                    {coursesError}
                  </div>
                ) : courses.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                    No courses assigned yet.
                  </div>
                ) : (
                  courses.map((course) => {
                    const grades = courseGrades[course.id] ?? [];
                    return (
                      <div
                        key={course.id}
                        className="rounded-2xl border border-slate-200 bg-slate-50/60 px-4 py-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-slate-900">{course.title}</div>
                            {course.description ? (
                              <div className="mt-1 text-xs text-slate-500 line-clamp-2">
                                {course.description}
                              </div>
                            ) : null}
                          </div>
                          {course.slug ? (
                            <button
                              className="text-xs font-semibold text-blue-600"
                              onClick={() => router.push(`/courses/${course.slug}`)}
                            >
                              Open →
                            </button>
                          ) : null}
                        </div>

                        <div className="mt-3 grid gap-2">
                          {grades.length === 0 ? (
                            <div className="rounded-lg border border-dashed border-slate-200 bg-white px-3 py-3 text-xs text-slate-500">
                              No graded work yet.
                            </div>
                          ) : (
                            grades.map((item) => {
                              const label =
                                item.kind === "quiz"
                                  ? "Quiz"
                                  : item.kind === "offline"
                                  ? "Offline grade"
                                  : "Assignment";
                              const dateLabel = item.graded_at
                                ? new Date(item.graded_at).toLocaleDateString("en-US", {
                                    month: "short",
                                    day: "numeric",
                                  })
                                : null;
                              return (
                                <div
                                  key={`${course.id}-${item.id}`}
                                  className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2"
                                >
                                  <div>
                                    <div className="text-xs font-semibold text-slate-700">{item.title}</div>
                                    <div className="text-[11px] text-slate-500">
                                      {label}
                                      {dateLabel ? ` • ${dateLabel}` : ""}
                                    </div>
                                  </div>
                                  <div className="text-xs font-semibold text-slate-900">
                                    {gradeBadge(item.score, item.max_score) ?? (
                                      item.max_score != null ? `${item.score}/${item.max_score}` : item.score
                                    )}
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Right column */}
          <div className="grid gap-4">
            <div className="relative rounded-3xl border border-blue-700 bg-gradient-to-br from-blue-700 to-blue-600 p-5 sm:p-6 text-white shadow-sm">
              <div className="text-4xl sm:text-5xl font-bold text-white">
                {selectedExam ? countdownText ?? "" : "Set your exam"}
              </div>
              <div className="mt-6">
                {selectedExam ? (
                  <>
                    <div className="text-sm font-semibold">{formattedDates.find((d) => d.id === selectedExam.id)?.label}</div>
                    <button
                      className="mt-3 text-sm font-semibold underline underline-offset-2"
                      onClick={() => setShowExamPicker((v) => !v)}
                    >
                      Change date
                    </button>
                  </>
                ) : (
                  <button
                    className="text-sm font-semibold"
                    onClick={() => setShowExamPicker((v) => !v)}
                  >
                    Set your exam date →
                  </button>
                )}
              </div>
              <button
                className="absolute right-4 bottom-4 h-10 w-10 rounded-full bg-white/15 text-white"
                onClick={() => setShowExamPicker((v) => !v)}
              >
                ✎
              </button>
              <div className="pointer-events-none absolute right-0 top-0 h-16 w-16 rounded-bl-full bg-white/20" />

              {showExamPicker ? (
                <div className="mt-4 rounded-2xl border border-white/20 bg-white/10 p-4">
                  {loadingDates ? (
                    <div className="text-sm text-white/80">Loading dates...</div>
                  ) : formattedDates.length === 0 ? (
                    <div className="text-sm text-white/80">No upcoming dates.</div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                      {formattedDates.map((d) => (
                        <div key={d.id} className="flex items-center justify-between gap-2">
                          <button
                            className="flex items-center gap-2 text-left text-white/90 hover:text-white"
                            onClick={() => selectExamDate(d.id)}
                          >
                            <span className="w-4">{selectedExam?.id === d.id ? "✓" : ""}</span>
                            <span>{d.label}</span>
                          </button>
                          {isStaff ? (
                            <button
                              className="h-6 w-6 rounded-full border border-white/30 text-white/80 hover:text-white"
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (!confirm("Delete this exam date?")) return;
                                const access =
                                  typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
                                try {
                                  const res = await fetch(
                                    `${process.env.NEXT_PUBLIC_API_BASE}/api/exam-dates/${d.id}/`,
                                    {
                                      method: "DELETE",
                                      headers: {
                                        ...(access ? { Authorization: `Bearer ${access}` } : {}),
                                      },
                                    }
                                  );
                                  if (!res.ok) {
                                    const json = await res.json().catch(() => ({}));
                                    throw new Error(json?.error || "Failed to delete date");
                                  }
                                  setExamDates((prev) => prev.filter((x) => x.id !== d.id));
                                  if (selectedExam?.id === d.id) setSelectedExam(null);
                                } catch (err: any) {
                                  setError(err?.message ?? "Failed to delete date");
                                }
                              }}
                              aria-label="Delete exam date"
                            >
                              ×
                            </button>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}

                  {isStaff ? (
                    <div className="mt-3 flex items-center gap-2">
                      <input
                        type="date"
                        className="h-9 rounded-lg border border-white/30 bg-white/10 px-3 text-sm text-white outline-none"
                        value={newExamDate}
                        onChange={(e) => setNewExamDate(e.target.value)}
                      />
                      <button
                        className="h-9 rounded-lg bg-white/20 px-3 text-sm font-semibold"
                        onClick={addExamDate}
                      >
                        Add
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
              <div className="relative rounded-3xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-slate-600">My Goal</div>
                    <div className="text-base font-semibold">Score</div>
                  </div>
                  <button
                    className="h-9 w-9 rounded-full bg-slate-100 text-slate-600"
                    onClick={() => {
                      setDraftMath(mathGoal);
                      setDraftVerbal(verbalGoal);
                      setShowGoalPicker(true);
                    }}
                    aria-label="Set goal score"
                  >
                    ✎
                  </button>
                </div>
                <div className="mt-6 text-3xl font-semibold text-slate-900">
                  {mathGoal + verbalGoal}
                </div>
                <div className="mt-1 text-xs text-slate-500">Math {mathGoal} + Verbal {verbalGoal}</div>
                <div className="pointer-events-none absolute right-0 bottom-0 h-20 w-20 sm:h-24 sm:w-24 lg:h-28 lg:w-28">
                  <Image src={vic} alt="Victory mascot" fill className="object-contain" />
                </div>
              </div>

              <div className="relative rounded-3xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-slate-600">My Goal</div>
                    <div className="text-base font-semibold">University</div>
                  </div>
                  <div />
                </div>
                {uniPreview ? (
                  <button
                    className="mt-5 flex w-full items-center justify-center"
                    onClick={() => setShowUniPicker(true)}
                    aria-label="Change university icon"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={uniPreview}
                      alt="University"
                      className="h-24 w-24 sm:h-36 sm:w-36 lg:h-44 lg:w-44 object-contain"
                    />
                  </button>
                ) : (
                  <button
                    className="mt-6 rounded-full bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white"
                    onClick={() => setShowUniPicker(true)}
                  >
                    + Choose University →
                  </button>
                )}
                <div className="pointer-events-none absolute right-0 top-0 h-24 w-24 sm:h-32 sm:w-32 lg:h-36 lg:w-36">
                  <Image src={happy} alt="Happy mascot" fill className="object-contain" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {showGoalPicker ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl border border-slate-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <div className="text-sm font-semibold text-slate-900">Set dream score</div>
              <button
                className="h-8 w-8 rounded-full border border-slate-200 text-slate-600"
                onClick={() => setShowGoalPicker(false)}
              >
                ×
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span>Math</span>
                  <span className="font-semibold text-slate-900">{draftMath}</span>
                </div>
                <input
                  type="range"
                  min={200}
                  max={800}
                  step={10}
                  value={draftMath}
                  onChange={(e) => setDraftMath(Number(e.target.value))}
                  className="mt-2 w-full"
                />
              </div>
              <div>
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span>Verbal</span>
                  <span className="font-semibold text-slate-900">{draftVerbal}</span>
                </div>
                <input
                  type="range"
                  min={200}
                  max={800}
                  step={10}
                  value={draftVerbal}
                  onChange={(e) => setDraftVerbal(Number(e.target.value))}
                  className="mt-2 w-full"
                />
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
                Total: {draftMath + draftVerbal}
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold"
                  onClick={() => setShowGoalPicker(false)}
                >
                  Cancel
                </button>
                <button
                  className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                  onClick={saveGoalScores}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showUniPicker ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl border border-slate-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <div className="text-sm font-semibold text-slate-900">Choose University</div>
              <button
                className="h-8 w-8 rounded-full border border-slate-200 text-slate-600"
                onClick={() => setShowUniPicker(false)}
              >
                ×
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="text-sm text-slate-600">Upload your university icon.</div>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  setUniFile(file);
                  if (file) {
                    const url = URL.createObjectURL(file);
                    setUniPreview(url);
                  }
                }}
              />
              {uniPreview ? (
                <div className="rounded-xl border border-slate-200 p-3 inline-flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={uniPreview} alt="Preview" className="h-16 w-16 rounded-lg object-cover" />
                  <div className="text-sm text-slate-600">Preview</div>
                </div>
              ) : null}
              <div className="flex items-center justify-end gap-2">
                <button
                  className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold"
                  onClick={() => setShowUniPicker(false)}
                >
                  Cancel
                </button>
                <button
                  className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
                  onClick={() => (uniFile ? uploadUniversityIcon(uniFile) : setShowUniPicker(false))}
                  disabled={!uniFile || uniUploading}
                >
                  {uniUploading ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
