"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE;

type ExamQuestion = {
  id: string;
  subject: "verbal" | "math";
  topic?: string | null;
  subtopic?: string | null;
  is_open_ended?: boolean | null;
  correct_answer?: string | null;
  choices?: { label: string; is_correct?: boolean }[];
};

type ReviewPayload = {
  title?: string | null;
  mock_exam?: { title?: string | null } | null;
  practice?: { title?: string | null } | null;
  modules?: { subject: "verbal" | "math"; questions: ExamQuestion[] }[];
  questions?: ExamQuestion[];
  answers?: Record<string, string>;
};

type Category = {
  key: string;
  name: string;
  weightPercent: number;
  questionRange: [number, number];
  scoreRange: [number, number];
  performancePct: number;
};

type SectionReport = {
  title: string;
  categories: Category[];
};

type ExamReport = {
  readingWriting?: SectionReport;
  math?: SectionReport;
};

function getPerformanceBand(pct: number) {
  const normalized = Math.max(0, Math.min(1, pct));
  if (normalized < 0.15) return { filled: 1, range: [200, 360] as [number, number] };
  if (normalized < 0.3) return { filled: 2, range: [370, 410] as [number, number] };
  if (normalized < 0.45) return { filled: 3, range: [420, 480] as [number, number] };
  if (normalized < 0.6) return { filled: 4, range: [490, 540] as [number, number] };
  if (normalized < 0.75) return { filled: 5, range: [550, 600] as [number, number] };
  if (normalized < 0.9) return { filled: 6, range: [610, 670] as [number, number] };
  return { filled: 7, range: [680, 800] as [number, number] };
}

function isCorrect(q: ExamQuestion, answer?: string) {
  if (!answer) return false;
  if (q.is_open_ended) {
    const expected = (q.correct_answer || "").trim().toLowerCase();
    if (!expected) return false;
    return String(answer || "").trim().toLowerCase() === expected;
  }
  const correctLabel = (q.choices || []).find((c) => c.is_correct)?.label;
  return !!correctLabel && answer === correctLabel;
}

function buildReport(questions: ExamQuestion[], answers: Record<string, string>) {
  const sections: Record<"verbal" | "math", Map<string, { correct: number; total: number }>> = {
    verbal: new Map(),
    math: new Map(),
  };

  questions.forEach((q) => {
    const subject = q.subject;
    const label = (q.subtopic || q.topic || "Uncategorized").trim() || "Uncategorized";
    const map = sections[subject];
    const bucket = map.get(label) || { correct: 0, total: 0 };
    bucket.total += 1;
    if (isCorrect(q, answers[q.id])) bucket.correct += 1;
    map.set(label, bucket);
  });

  function buildSection(subject: "verbal" | "math", title: string): SectionReport | undefined {
    const map = sections[subject];
    if (!map.size) return undefined;
    const total = Array.from(map.values()).reduce((acc, val) => acc + val.total, 0);
    const categories: Category[] = Array.from(map.entries())
      .map(([key, val]) => {
        const totalCount = val.total ?? 0;
        const pct = totalCount ? val.correct / totalCount : 0;
        const weight = total ? Math.round((totalCount / total) * 100) : 0;
        const band = getPerformanceBand(pct);
        return {
          key,
          name: key,
          weightPercent: weight,
          questionRange: [totalCount, totalCount] as [number, number],
          scoreRange: band.range,
          performancePct: pct,
        };
      })
      .sort((a, b) => b.weightPercent - a.weightPercent);
    return { title, categories };
  }

  return {
    readingWriting: buildSection("verbal", "Reading and Writing"),
    math: buildSection("math", "Math"),
  } as ExamReport;
}

function SegmentedBar({
  segments = 7,
  performancePct,
  scoreRange,
}: {
  segments?: number;
  performancePct: number;
  scoreRange: [number, number];
}) {
  const filled = getPerformanceBand(performancePct).filled;
  return (
    <div
      className="flex gap-1"
      role="img"
      aria-label={`Performance ${filled} of ${segments} segments. Range ${scoreRange[0]} to ${scoreRange[1]}.`}
    >
      {Array.from({ length: segments }).map((_, idx) => (
        <span
          key={idx}
          className={`h-3 flex-1 rounded-sm ${idx < filled ? "bg-slate-900" : "bg-slate-200"}`}
        />
      ))}
    </div>
  );
}

function CategoryBlock({ category }: { category: Category }) {
  const [minQ, maxQ] = category.questionRange;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-sm font-semibold text-slate-900">{category.name}</div>
      <div className="mt-1 text-xs text-slate-500">
        ({category.weightPercent}% of test section, {minQ}-{maxQ} questions)
      </div>
      <div className="mt-3">
        <SegmentedBar performancePct={category.performancePct} scoreRange={category.scoreRange} />
      </div>
      <div className="mt-2 text-xs text-slate-500">
        Performance: {category.scoreRange[0]}-{category.scoreRange[1]}
      </div>
    </div>
  );
}

function SectionColumn({ section }: { section: SectionReport }) {
  return (
    <div className="space-y-4">
      <div className="text-xl font-semibold text-slate-900">{section.title}</div>
      <div className="space-y-3">
        {section.categories.map((cat) => (
          <CategoryBlock key={cat.key} category={cat} />
        ))}
      </div>
    </div>
  );
}

export default function ScoreReportPage() {
  const router = useRouter();
  const search = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ExamReport | null>(null);
  const [title, setTitle] = useState("Score Report");

  const source = (search.get("source") || "practice").toLowerCase();
  const practiceId = search.get("practice_id");
  const mockId = search.get("mock_id");
  const attemptId = search.get("attempt_id");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
        if (!token) throw new Error("Not logged in");
        const endpoint =
          source === "mock"
            ? `${API_BASE}/api/mock-exams/review/?${attemptId ? `attempt_id=${attemptId}` : `mock_exam_id=${mockId}`}`
            : `${API_BASE}/api/module-practice/review/?${attemptId ? `attempt_id=${attemptId}` : `practice_id=${practiceId}`}`;
        const res = await fetch(endpoint, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const text = await res.text();
        const json = text ? JSON.parse(text) : null;
        if (!res.ok) throw new Error(json?.error || "Failed to load report");
        if (cancelled) return;
        const payload = json as ReviewPayload;
        const questions =
          payload.questions ??
          payload.modules?.flatMap((m) => m.questions.map((q) => ({ ...q, subject: m.subject }))) ??
          [];
        const answers = payload.answers ?? {};
        const nextReport = buildReport(questions, answers);
        setReport(nextReport);
        const label = payload.mock_exam?.title || payload.practice?.title || payload.title || "Score Report";
        setTitle(label);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Failed to load report");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [source, practiceId, mockId, attemptId]);

  if (loading) {
    return <div className="p-6 text-sm text-slate-500">Loading score report...</div>;
  }

  if (error) {
    return (
      <div className="p-6 text-sm text-red-600">
        Error: {error}
      </div>
    );
  }

  if (!report) {
    return <div className="p-6 text-sm text-slate-500">No report data available.</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            className="rounded-full border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-white"
            onClick={() => router.back()}
            type="button"
          >
            Back
          </button>
          <div className="text-lg font-semibold text-slate-900">Score Report</div>
          <div className="text-xs text-slate-500">{title}</div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {report.readingWriting ? <SectionColumn section={report.readingWriting} /> : null}
          {report.math ? <SectionColumn section={report.math} /> : null}
        </div>
      </div>
    </div>
  );
}
