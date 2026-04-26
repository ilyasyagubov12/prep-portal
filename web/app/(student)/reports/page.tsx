"use client";

import { useEffect, useMemo, useState } from "react";

type CourseOption = {
  id: string;
  slug: string;
  title: string;
  description?: string | null;
};

type StudentRow = {
  user_id: string;
  username: string;
  first_name: string;
  last_name: string;
  nickname?: string | null;
  student_id?: string | null;
  tag?: string | null;
  parent_name?: string | null;
  parent_phone?: string | null;
  attendance: {
    status: "present" | "absent" | "late" | "excused";
    behavior: "good" | "warning" | "poor";
    notes: string;
  };
  payment: {
    status: "paid" | "partial" | "unpaid";
    amount_due: string;
    notes: string;
  } | null;
};

type ReportingResponse = {
  ok: boolean;
  can_manage_payments: boolean;
  report_date: string;
  courses: CourseOption[];
  selected_course_id: string | null;
  students: StudentRow[];
  summary: {
    present: number;
    absent: number;
    late: number;
    excused: number;
    good: number;
    warning: number;
    poor: number;
    unpaid_count: number;
    partial_count: number;
    paid_count: number;
    total_due: string;
  };
  available_tags: string[];
};

const ATTENDANCE_OPTIONS = [
  { value: "present", label: "Present" },
  { value: "late", label: "Late" },
  { value: "excused", label: "Excused" },
  { value: "absent", label: "Absent" },
] as const;

const PAYMENT_OPTIONS = [
  { value: "paid", label: "Paid" },
  { value: "partial", label: "Partial" },
  { value: "unpaid", label: "Unpaid" },
] as const;

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function displayName(student: StudentRow) {
  const fullName = `${student.first_name || ""} ${student.last_name || ""}`.trim();
  return fullName || student.nickname || student.username;
}

export default function ReportsPage() {
  const [loading, setLoading] = useState(true);
  const [savingAttendance, setSavingAttendance] = useState(false);
  const [savingPayments, setSavingPayments] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [reportDate, setReportDate] = useState(todayIso());
  const [searchText, setSearchText] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [selectedTag, setSelectedTag] = useState("");
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [summary, setSummary] = useState<ReportingResponse["summary"] | null>(null);
  const [canManagePayments, setCanManagePayments] = useState(false);

  async function loadOverview(opts?: {
    courseId?: string;
    date?: string;
    query?: string;
  }) {
    const access = localStorage.getItem("access_token");
    if (!access) {
      setLoading(false);
      setError("You must be logged in.");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    const params = new URLSearchParams();
    const nextCourse = opts?.courseId ?? selectedCourseId;
    const nextDate = opts?.date ?? reportDate;
    const nextQuery = opts?.query ?? searchText;
    if (nextCourse) params.set("course_id", nextCourse);
    if (nextDate) params.set("report_date", nextDate);
    if (nextQuery.trim()) params.set("q", nextQuery.trim());

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/api/reports/overview/?${params.toString()}`, {
        headers: { Authorization: `Bearer ${access}` },
      });
      if (res.status === 403) {
        throw new Error("Only teachers and admins can open Reports.");
      }
      if (!res.ok) {
        throw new Error("Failed to load reports.");
      }
      const data = (await res.json()) as ReportingResponse;
      setCourses(data.courses || []);
      setSelectedCourseId(data.selected_course_id || "");
      setReportDate(data.report_date || nextDate);
      setStudents(data.students || []);
      setSummary(data.summary || null);
      setAvailableTags(data.available_tags || []);
      setCanManagePayments(Boolean(data.can_manage_payments));
      setSelectedTag((prev) => (prev && data.available_tags.includes(prev) ? prev : ""));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load reports.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadOverview({ date: todayIso() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visibleStudents = useMemo(
    () =>
      students.filter((student) => {
        if (!selectedTag) return true;
        return (student.tag || "") === selectedTag;
      }),
    [selectedTag, students],
  );

  function updateAttendance(userId: string, field: "status" | "notes", value: string) {
    setStudents((prev) =>
      prev.map((student) =>
        student.user_id !== userId
          ? student
          : {
              ...student,
              attendance: {
                ...student.attendance,
                [field]: value,
              },
            },
      ),
    );
  }

  function updatePayment(userId: string, field: "status" | "amount_due" | "notes", value: string) {
    setStudents((prev) =>
      prev.map((student) =>
        student.user_id !== userId || !student.payment
          ? student
          : {
              ...student,
              payment: {
                ...student.payment,
                [field]: value,
              },
            },
      ),
    );
  }

  async function saveAttendance() {
    if (!selectedCourseId) return;
    const access = localStorage.getItem("access_token");
    if (!access) return;
    setSavingAttendance(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/api/reports/attendance/save/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${access}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          course_id: selectedCourseId,
          report_date: reportDate,
          updates: students.map((student) => ({
            user_id: student.user_id,
            status: student.attendance.status,
            notes: student.attendance.notes,
          })),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Failed to save reporting.");
      }
      setSuccess("Reporting saved.");
      await loadOverview();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save reporting.");
    } finally {
      setSavingAttendance(false);
    }
  }

  async function savePayments() {
    if (!selectedCourseId || !canManagePayments) return;
    const access = localStorage.getItem("access_token");
    if (!access) return;
    setSavingPayments(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/api/reports/payment/save/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${access}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          course_id: selectedCourseId,
          updates: students
            .filter((student) => student.payment)
            .map((student) => ({
              user_id: student.user_id,
              status: student.payment?.status,
              amount_due: student.payment?.amount_due,
              notes: student.payment?.notes,
            })),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Failed to save payments.");
      }
      setSuccess("Payments saved.");
      await loadOverview();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save payments.");
    } finally {
      setSavingPayments(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-3 py-4 sm:px-6">
      <section className="rounded-[28px] border border-[#101828] bg-[radial-gradient(circle_at_top_left,_rgba(196,181,253,0.35),_transparent_34%),radial-gradient(circle_at_bottom_right,_rgba(56,189,248,0.28),_transparent_38%),linear-gradient(135deg,_rgba(255,255,255,0.96),_rgba(248,250,252,0.98))] p-6 shadow-[0_24px_80px_rgba(15,23,42,0.12)]">
        <div className="mb-2 text-xs uppercase tracking-[0.35em] text-[#6b7aa6]">Reports</div>
        <h1 className="text-4xl font-black tracking-[-0.03em] text-[#0f172a]">Class reporting</h1>
        <p className="mt-3 max-w-3xl text-sm text-[#475467]">
          Teachers and admins can record daily class attendance and comments. Payments are separated and visible only to admins.
        </p>
      </section>

      <section className="grid gap-4 rounded-[24px] border border-[#d7def0] bg-white/95 p-4 shadow-[0_12px_40px_rgba(15,23,42,0.08)] sm:grid-cols-2 xl:grid-cols-5">
        <label className="grid gap-2 text-sm font-semibold text-[#1d2939] xl:col-span-2">
          Class
          <select
            className="rounded-2xl border border-[#d0d5dd] bg-white px-4 py-3 font-medium text-[#101828]"
            value={selectedCourseId}
            onChange={(e) => {
              const next = e.target.value;
              setSelectedCourseId(next);
              void loadOverview({ courseId: next });
            }}
          >
            <option value="">Select class</option>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.title}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-semibold text-[#1d2939]">
          Class date
          <input
            type="date"
            className="rounded-2xl border border-[#d0d5dd] bg-white px-4 py-3 font-medium text-[#101828]"
            value={reportDate}
            onChange={(e) => setReportDate(e.target.value)}
          />
        </label>
        <label className="grid gap-2 text-sm font-semibold text-[#1d2939]">
          Search
          <input
            type="text"
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setSearchText(searchDraft);
                void loadOverview({ query: searchDraft });
              }
            }}
            placeholder="Name, username, student ID, parent"
            className="rounded-2xl border border-[#d0d5dd] bg-white px-4 py-3 font-medium text-[#101828] placeholder:text-[#98a2b3]"
          />
        </label>
        <label className="grid gap-2 text-sm font-semibold text-[#1d2939]">
          Tag
          <select
            className="rounded-2xl border border-[#d0d5dd] bg-white px-4 py-3 font-medium text-[#101828]"
            value={selectedTag}
            onChange={(e) => setSelectedTag(e.target.value)}
          >
            <option value="">All tags</option>
            {availableTags.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap items-end gap-2 xl:col-span-5">
          <button
            type="button"
            onClick={() => {
              setSearchText(searchDraft);
              void loadOverview({ query: searchDraft });
            }}
            className="rounded-2xl bg-[#2563eb] px-5 py-3 text-sm font-bold text-white shadow-[0_12px_24px_rgba(37,99,235,0.28)]"
          >
            Load class
          </button>
          <button
            type="button"
            onClick={() => {
              setSearchDraft("");
              setSearchText("");
              setSelectedTag("");
              void loadOverview({ query: "" });
            }}
            className="rounded-2xl border border-[#c9d7ff] bg-white px-5 py-3 text-sm font-semibold text-[#2251c4]"
          >
            Reset filters
          </button>
        </div>
      </section>

      {error ? (
        <div className="rounded-2xl border border-[#fecdca] bg-[#fef3f2] px-4 py-3 text-sm font-semibold text-[#b42318]">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="rounded-2xl border border-[#abefc6] bg-[#ecfdf3] px-4 py-3 text-sm font-semibold text-[#067647]">
          {success}
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Present" value={summary?.present ?? 0} accent="bg-[#dcfce7] text-[#166534]" />
        <SummaryCard label="Late" value={summary?.late ?? 0} accent="bg-[#fef3c7] text-[#92400e]" />
        <SummaryCard label="Excused" value={summary?.excused ?? 0} accent="bg-[#e0f2fe] text-[#1d4ed8]" />
        <SummaryCard label="Absent" value={summary?.absent ?? 0} accent="bg-[#fee2e2] text-[#b91c1c]" />
      </section>

      <section className="overflow-hidden rounded-[28px] border border-[#d7def0] bg-white/95 shadow-[0_16px_50px_rgba(15,23,42,0.08)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e4e7ec] px-5 py-4">
          <div>
            <h2 className="text-lg font-black text-[#101828]">Reporting</h2>
            <p className="mt-1 text-sm text-[#667085]">
              Record attendance and write what each student did during the class.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void saveAttendance()}
            disabled={!selectedCourseId || savingAttendance}
            className="rounded-2xl bg-[#101828] px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {savingAttendance ? "Saving..." : "Save reporting"}
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full border-collapse">
            <thead>
              <tr className="bg-[#f8fafc] text-left text-xs uppercase tracking-[0.22em] text-[#6b7280]">
                <th className="px-4 py-3 font-semibold">Student name</th>
                <th className="px-4 py-3 font-semibold">Student details</th>
                <th className="px-4 py-3 font-semibold">Parent name</th>
                <th className="px-4 py-3 font-semibold">Parent number</th>
                <th className="px-4 py-3 font-semibold">Attendance</th>
                <th className="px-4 py-3 font-semibold">Comment</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="px-4 py-8 text-sm text-[#667085]" colSpan={6}>
                    Loading class report...
                  </td>
                </tr>
              ) : visibleStudents.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-sm text-[#667085]" colSpan={6}>
                    No students matched the current filters.
                  </td>
                </tr>
              ) : (
                visibleStudents.map((student) => (
                  <tr key={student.user_id} className="border-t border-[#eef2f6] align-top">
                    <td className="px-4 py-4">
                      <div className="font-bold text-[#101828]">{displayName(student)}</div>
                      {student.tag ? (
                        <div className="mt-2 inline-flex rounded-full bg-[#eff6ff] px-2.5 py-1 text-[11px] font-semibold text-[#1d4ed8]">
                          {student.tag}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-4 text-sm text-[#475467]">
                      <div>{student.username}</div>
                      {student.student_id ? <div className="mt-1">{student.student_id}</div> : null}
                    </td>
                    <td className="px-4 py-4 text-sm text-[#101828]">
                      {student.parent_name || "-"}
                    </td>
                    <td className="px-4 py-4 text-sm text-[#101828]">
                      {student.parent_phone || "-"}
                    </td>
                    <td className="px-4 py-4">
                      <select
                        value={student.attendance.status}
                        onChange={(e) => updateAttendance(student.user_id, "status", e.target.value)}
                        className="w-full rounded-xl border border-[#d0d5dd] bg-white px-3 py-2 text-sm font-medium text-[#101828]"
                      >
                        {ATTENDANCE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-4">
                      <textarea
                        value={student.attendance.notes}
                        onChange={(e) => updateAttendance(student.user_id, "notes", e.target.value)}
                        rows={3}
                        className="w-full resize-y rounded-xl border border-[#d0d5dd] bg-white px-3 py-2 text-sm text-[#101828]"
                        placeholder="What happened during the class"
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {canManagePayments ? (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <SummaryCard label="Paid" value={summary?.paid_count ?? 0} accent="bg-[#dcfce7] text-[#166534]" />
            <SummaryCard label="Partial" value={summary?.partial_count ?? 0} accent="bg-[#fef3c7] text-[#92400e]" />
            <SummaryCard label="Unpaid" value={summary?.unpaid_count ?? 0} accent="bg-[#fee2e2] text-[#b91c1c]" />
            <SummaryCard label="Total due" value={`${summary?.total_due ?? "0.00"} AZN`} accent="bg-[#ede9fe] text-[#6d28d9]" />
          </section>

          <section className="overflow-hidden rounded-[28px] border border-[#d7def0] bg-white/95 shadow-[0_16px_50px_rgba(15,23,42,0.08)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e4e7ec] px-5 py-4">
              <div>
                <h2 className="text-lg font-black text-[#101828]">Payments</h2>
                <p className="mt-1 text-sm text-[#667085]">
                  Admin-only. Track who paid, who owes, and how much is still due.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void savePayments()}
                disabled={!selectedCourseId || savingPayments}
                className="rounded-2xl bg-[#047857] px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingPayments ? "Saving..." : "Save payments"}
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-[980px] w-full border-collapse">
                <thead>
                  <tr className="bg-[#f8fafc] text-left text-xs uppercase tracking-[0.22em] text-[#6b7280]">
                    <th className="px-4 py-3 font-semibold">Student</th>
                    <th className="px-4 py-3 font-semibold">Parent</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Amount due</th>
                    <th className="px-4 py-3 font-semibold">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td className="px-4 py-8 text-sm text-[#667085]" colSpan={5}>
                        Loading payments...
                      </td>
                    </tr>
                  ) : visibleStudents.length === 0 ? (
                    <tr>
                      <td className="px-4 py-8 text-sm text-[#667085]" colSpan={5}>
                        No students matched the current filters.
                      </td>
                    </tr>
                  ) : (
                    visibleStudents.map((student) => (
                      <tr key={student.user_id} className="border-t border-[#eef2f6] align-top">
                        <td className="px-4 py-4">
                          <div className="font-bold text-[#101828]">{displayName(student)}</div>
                          <div className="mt-1 text-xs text-[#667085]">{student.username}</div>
                        </td>
                        <td className="px-4 py-4 text-sm text-[#101828]">
                          <div>{student.parent_name || "-"}</div>
                          <div className="mt-1 text-[#667085]">{student.parent_phone || "-"}</div>
                        </td>
                        <td className="px-4 py-4">
                          <select
                            value={student.payment?.status || "unpaid"}
                            onChange={(e) => updatePayment(student.user_id, "status", e.target.value)}
                            className="w-full rounded-xl border border-[#d0d5dd] bg-white px-3 py-2 text-sm font-medium text-[#101828]"
                          >
                            {PAYMENT_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-4">
                          <div className="relative">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={student.payment?.amount_due || "0.00"}
                              onChange={(e) => updatePayment(student.user_id, "amount_due", e.target.value)}
                              className="w-full rounded-xl border border-[#d0d5dd] bg-white px-3 py-2 pr-12 text-sm font-medium text-[#101828]"
                            />
                            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-[#667085]">
                              AZN
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <textarea
                            value={student.payment?.notes || ""}
                            onChange={(e) => updatePayment(student.user_id, "notes", e.target.value)}
                            rows={3}
                            className="w-full resize-y rounded-xl border border-[#d0d5dd] bg-white px-3 py-2 text-sm text-[#101828]"
                            placeholder="Payment notes"
                          />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </main>
  );
}

function SummaryCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent: string;
}) {
  return (
    <div className="rounded-[22px] border border-[#d7def0] bg-white/95 p-4 shadow-[0_10px_28px_rgba(15,23,42,0.06)]">
      <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#667085]">{label}</div>
      <div className="mt-3 flex items-center gap-3">
        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${accent}`}>{value}</span>
      </div>
    </div>
  );
}
