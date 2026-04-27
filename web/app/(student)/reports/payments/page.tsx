"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type CourseOption = {
  id: string;
  slug: string;
  title: string;
};

type PaymentEntry = {
  payment_number: number;
  is_paid: boolean;
  paid_date: string;
};

type PaymentStudent = {
  user_id: string;
  username: string;
  first_name: string;
  last_name: string;
  nickname?: string | null;
  student_id?: string | null;
  tag?: string | null;
  parent_name?: string | null;
  parent_phone?: string | null;
  classes_per_payment: number | null;
  attended_classes: number;
  classes_remaining: number | null;
  payments: PaymentEntry[];
};

type PaymentsResponse = {
  ok: boolean;
  courses: CourseOption[];
  selected_course_id: string | null;
  students: PaymentStudent[];
  payment_slot_count: number;
};

function displayName(student: PaymentStudent) {
  const fullName = `${student.first_name || ""} ${student.last_name || ""}`.trim();
  return fullName || student.nickname || student.username;
}

export default function PaymentsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [students, setStudents] = useState<PaymentStudent[]>([]);
  const [searchText, setSearchText] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [slotCount, setSlotCount] = useState(3);

  async function loadPayments(opts?: { courseId?: string; query?: string }) {
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
    const nextQuery = opts?.query ?? searchText;
    if (nextCourse) params.set("course_id", nextCourse);
    if (nextQuery.trim()) params.set("q", nextQuery.trim());

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/api/reports/payments/overview/?${params.toString()}`, {
        headers: { Authorization: `Bearer ${access}` },
      });
      if (res.status === 403) {
        throw new Error("Only admins can open Payments.");
      }
      if (!res.ok) {
        throw new Error("Failed to load payments.");
      }
      const data = (await res.json()) as PaymentsResponse;
      setCourses(data.courses || []);
      setSelectedCourseId(data.selected_course_id || "");
      setStudents(data.students || []);
      setSlotCount(data.payment_slot_count || 3);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load payments.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPayments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visibleStudents = useMemo(() => students, [students]);

  function updateCycle(userId: string, value: number | null) {
    setStudents((prev) =>
      prev.map((student) =>
        student.user_id !== userId
          ? student
          : {
              ...student,
              classes_per_payment: value,
            },
      ),
    );
  }

  function updatePayment(userId: string, paymentNumber: number, field: "is_paid" | "paid_date", value: boolean | string) {
    setStudents((prev) =>
      prev.map((student) =>
        student.user_id !== userId
          ? student
          : {
              ...student,
              payments: student.payments.map((payment) =>
                payment.payment_number !== paymentNumber
                  ? payment
                  : {
                      ...payment,
                      [field]: value,
                    },
              ),
            },
      ),
    );
  }

  function addPaymentColumn() {
    setSlotCount((prev) => prev + 1);
    setStudents((prev) =>
      prev.map((student) => ({
        ...student,
        payments: [
          ...student.payments,
          { payment_number: student.payments.length + 1, is_paid: false, paid_date: "" },
        ],
      })),
    );
  }

  async function savePayments() {
    if (!selectedCourseId) return;
    const access = localStorage.getItem("access_token");
    if (!access) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/api/reports/payments/save/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${access}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          course_id: selectedCourseId,
          updates: students.map((student) => ({
            user_id: student.user_id,
            classes_per_payment: student.classes_per_payment,
            payments: student.payments,
          })),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Failed to save payments.");
      }
      setSuccess("Payments saved.");
      await loadPayments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save payments.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-3 py-4 sm:px-6">
      <section className="rounded-[28px] border border-[#101828] bg-[radial-gradient(circle_at_top_left,_rgba(196,181,253,0.35),_transparent_34%),radial-gradient(circle_at_bottom_right,_rgba(56,189,248,0.28),_transparent_38%),linear-gradient(135deg,_rgba(255,255,255,0.96),_rgba(248,250,252,0.98))] p-6 shadow-[0_24px_80px_rgba(15,23,42,0.12)]">
        <div className="mb-2 text-xs uppercase tracking-[0.35em] text-[#6b7aa6]">Reports</div>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-4xl font-black tracking-[-0.03em] text-[#0f172a]">Payments</h1>
            <p className="mt-3 max-w-3xl text-sm text-[#475467]">
              Admin-only payment tracking by class. Set the cycle manually, see how many classes remain before the next payment is due, and record payment dates.
            </p>
          </div>
          <Link
            href="/reports"
            className="rounded-2xl border border-[#c9d7ff] bg-white px-5 py-3 text-sm font-semibold text-[#2251c4]"
          >
            Back to Reporting
          </Link>
        </div>
      </section>

      <section className="grid gap-4 rounded-[24px] border border-[#d7def0] bg-white/95 p-4 shadow-[0_12px_40px_rgba(15,23,42,0.08)] sm:grid-cols-2 xl:grid-cols-4">
        <label className="grid gap-2 text-sm font-semibold text-[#1d2939] xl:col-span-2">
          Class
          <select
            className="rounded-2xl border border-[#d0d5dd] bg-white px-4 py-3 font-medium text-[#101828]"
            value={selectedCourseId}
            onChange={(e) => {
              const next = e.target.value;
              setSelectedCourseId(next);
              void loadPayments({ courseId: next });
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
          Search
          <input
            type="text"
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setSearchText(searchDraft);
                void loadPayments({ query: searchDraft });
              }
            }}
            placeholder="Name, username, student ID, parent"
            className="rounded-2xl border border-[#d0d5dd] bg-white px-4 py-3 font-medium text-[#101828] placeholder:text-[#98a2b3]"
          />
        </label>
        <div className="flex flex-wrap items-end gap-2">
          <button
            type="button"
            onClick={() => {
              setSearchText(searchDraft);
              void loadPayments({ query: searchDraft });
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
              void loadPayments({ query: "" });
            }}
            className="rounded-2xl border border-[#c9d7ff] bg-white px-5 py-3 text-sm font-semibold text-[#2251c4]"
          >
            Reset
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

      <section className="overflow-hidden rounded-[28px] border border-[#d7def0] bg-white/95 shadow-[0_16px_50px_rgba(15,23,42,0.08)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e4e7ec] px-5 py-4">
          <div>
            <h2 className="text-lg font-black text-[#101828]">Class payments</h2>
            <p className="mt-1 text-sm text-[#667085]">
              Set the classes-per-payment value manually for each student. If it is empty, payment tracking is not active for that student.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={addPaymentColumn}
              className="rounded-2xl border border-[#c9d7ff] bg-white px-5 py-3 text-sm font-semibold text-[#2251c4]"
            >
              Add payment column
            </button>
            <button
              type="button"
              onClick={() => void savePayments()}
              disabled={!selectedCourseId || saving}
              className="rounded-2xl bg-[#047857] px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save payments"}
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[1300px] w-full border-collapse">
            <thead>
              <tr className="bg-[#f8fafc] text-left text-xs uppercase tracking-[0.22em] text-[#6b7280]">
                <th className="px-4 py-3 font-semibold">Student name</th>
                <th className="px-4 py-3 font-semibold">Parent</th>
                <th className="px-4 py-3 font-semibold">Classes per payment</th>
                <th className="px-4 py-3 font-semibold">Classes attended</th>
                <th className="px-4 py-3 font-semibold">Classes remaining</th>
                {Array.from({ length: slotCount }).map((_, index) => (
                  <th key={index} className="px-4 py-3 font-semibold">
                    {index + 1}
                    {index === 0 ? "st" : index === 1 ? "nd" : index === 2 ? "rd" : "th"} Payment
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="px-4 py-8 text-sm text-[#667085]" colSpan={5 + slotCount}>
                    Loading payments...
                  </td>
                </tr>
              ) : visibleStudents.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-sm text-[#667085]" colSpan={5 + slotCount}>
                    No students matched the current filters.
                  </td>
                </tr>
              ) : (
                visibleStudents.map((student) => (
                  <tr key={student.user_id} className="border-t border-[#eef2f6] align-top">
                    <td className="px-4 py-4">
                      <div className="font-bold text-[#101828]">{displayName(student)}</div>
                      <div className="mt-1 text-xs text-[#667085]">
                        {student.username}
                        {student.student_id ? ` · ${student.student_id}` : ""}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm text-[#101828]">
                      <div>{student.parent_name || "-"}</div>
                      <div className="mt-1 text-[#667085]">{student.parent_phone || "-"}</div>
                    </td>
                    <td className="px-4 py-4">
                      <input
                        type="number"
                        min="1"
                        value={student.classes_per_payment ?? ""}
                        onChange={(e) =>
                          updateCycle(
                            student.user_id,
                            e.target.value === "" ? null : Math.max(1, Number(e.target.value) || 1),
                          )
                        }
                        className="w-full rounded-xl border border-[#d0d5dd] bg-white px-3 py-2 text-sm font-medium text-[#101828]"
                        placeholder="Enter classes per payment"
                      />
                    </td>
                    <td className="px-4 py-4 text-sm font-semibold text-[#101828]">{student.attended_classes}</td>
                    <td className="px-4 py-4 text-sm font-semibold text-[#101828]">{student.classes_per_payment ? student.classes_remaining ?? 0 : ""}</td>
                    {Array.from({ length: slotCount }).map((_, index) => {
                      const paymentNumber = index + 1;
                      const payment =
                        student.payments.find((item) => item.payment_number === paymentNumber) || {
                          payment_number: paymentNumber,
                          is_paid: false,
                          paid_date: "",
                        };
                      return (
                        <td key={paymentNumber} className="px-4 py-4">
                          <label className="flex items-center gap-2 text-sm font-medium text-[#101828]">
                            <input
                              type="checkbox"
                              checked={payment.is_paid}
                              onChange={(e) => updatePayment(student.user_id, paymentNumber, "is_paid", e.target.checked)}
                            />
                            Paid
                          </label>
                          <input
                            type="date"
                            value={payment.paid_date}
                            onChange={(e) => updatePayment(student.user_id, paymentNumber, "paid_date", e.target.value)}
                            className="mt-2 w-full rounded-xl border border-[#d0d5dd] bg-white px-3 py-2 text-sm font-medium text-[#101828]"
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
