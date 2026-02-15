"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Bookmark } from "lucide-react";
import { typesetMath } from "@/lib/mathjax";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE;

type MockExam = {
  id: string;
  title: string;
  description: string | null;
  verbal_question_count: number;
  math_question_count: number;
  total_time_minutes: number;
};

type ExamQuestion = {
  id: string;
  subject: "verbal" | "math";
  topic: string;
  subtopic?: string | null;
  stem: string;
  passage?: string | null;
  choices?: { label: string; content: string }[];
  is_open_ended?: boolean | null;
  image_url?: string | null;
  difficulty?: string | null;
};

type MockResult = {
  results_released: boolean;
  score_verbal?: number;
  score_math?: number;
  total_score?: number;
  analytics?: {
    topic_accuracy?: Record<string, { correct: number; total: number }>;
    difficulty_accuracy?: Record<string, { correct: number; total: number }>;
  };
};

function MathContent({ html, className }: { html: string; className?: string }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    ref.current.innerHTML = html || "";
    typesetMath(ref.current);
  }, [html]);
  return <span ref={ref} className={className} />;
}

function wrapLatexIfNeeded(input: string) {
  const trimmed = input.trim();
  if (!trimmed) return "";
  const hasDelims = trimmed.includes("\\(") || trimmed.includes("\\[") || trimmed.includes("$$");
  return hasDelims ? trimmed : `\\(${trimmed}\\)`;
}

function formatTime(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

async function readResponse(res: Response) {
  const text = await res.text();
  if (!text) return { json: null as any, text: "" };
  try {
    return { json: JSON.parse(text), text };
  } catch {
    return { json: null as any, text };
  }
}

function extractHtmlError(text: string) {
  if (!text || !text.includes("exception_value")) return null;
  try {
    const doc = new DOMParser().parseFromString(text, "text/html");
    const pre = doc.querySelector("pre.exception_value");
    if (pre?.textContent) return pre.textContent.trim();
  } catch {
    return null;
  }
  return null;
}

function getAttemptStorageKey(attemptId: string) {
  return `mock_exam_attempt_${attemptId}`;
}

function getExamAttemptKey(examId: string) {
  return `mock_exam_for_${examId}`;
}

function loadAttemptState(attemptId: string) {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(getAttemptStorageKey(attemptId));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveAttemptState(attemptId: string, state: any) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(getAttemptStorageKey(attemptId), JSON.stringify(state));
  } catch {
    return;
  }
}

function clearAttemptState(attemptId: string, examId?: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(getAttemptStorageKey(attemptId));
    if (examId) localStorage.removeItem(getExamAttemptKey(examId));
  } catch {
    return;
  }
}

export default function Page() {
  const params = useParams<{ mockId: string }>();
  const router = useRouter();
  const mockId = params.mockId;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exam, setExam] = useState<MockExam | null>(null);
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [introMode, setIntroMode] = useState(true);
  const [mapOpen, setMapOpen] = useState(false);
  const [result, setResult] = useState<MockResult | null>(null);
  const [autoResumeChecked, setAutoResumeChecked] = useState(false);
  const [lastSectionIndex, setLastSectionIndex] = useState<{ verbal: number | null; math: number | null }>({
    verbal: null,
    math: null,
  });
  const submittedRef = useRef(false);

  const totalSeconds = useMemo(() => (exam?.total_time_minutes || 0) * 60, [exam]);

  const verbalIndices = useMemo(
    () => questions.map((q, idx) => (q.subject === "verbal" ? idx : -1)).filter((v) => v >= 0),
    [questions]
  );
  const mathIndices = useMemo(
    () => questions.map((q, idx) => (q.subject === "math" ? idx : -1)).filter((v) => v >= 0),
    [questions]
  );

  const currentQ = questions[currentIndex];
  const currentSection = currentQ?.subject || "verbal";
  const sectionIndices = currentSection === "verbal" ? verbalIndices : mathIndices;
  const sectionPosition = currentQ ? Math.max(1, sectionIndices.indexOf(currentIndex) + 1) : 0;
  const sectionTotal = sectionIndices.length;

  const counts = useMemo(() => {
    const base = {
      verbal: { answered: 0, flagged: 0, total: verbalIndices.length },
      math: { answered: 0, flagged: 0, total: mathIndices.length },
    };
    for (const q of questions) {
      if (answers[q.id]) base[q.subject].answered += 1;
      if (flags[q.id]) base[q.subject].flagged += 1;
    }
    return base;
  }, [questions, answers, flags, verbalIndices.length, mathIndices.length]);

  const statuses = useMemo(() => {
    return questions.map((q, idx) => {
      const isAnswered = !!answers[q.id];
      const isFlagged = !!flags[q.id];
      return { idx, isAnswered, isFlagged, subject: q.subject };
    });
  }, [questions, answers, flags]);

  async function startExam() {
    if (!mockId) return;
    setLoading(true);
    setError(null);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
      if (!token) throw new Error("Not logged in");
      const res = await fetch(`${API_BASE}/api/mock-exams/start/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ mock_exam_id: mockId }),
      });
      const { json, text } = await readResponse(res);
      if (!res.ok) {
        const htmlError = extractHtmlError(text);
        const fallback = text ? text.slice(0, 200) : "Failed to start exam";
        throw new Error(json?.error || htmlError || fallback);
      }

      const attempt = json.attempt_id || null;
      const examPayload = json.mock_exam || null;
      const questionPayload = json.questions || [];

      setAttemptId(attempt);
      setExam(examPayload);
      setQuestions(questionPayload);

      if (attempt && typeof window !== "undefined") {
        localStorage.setItem(getExamAttemptKey(mockId), attempt);
      }

      const saved = attempt ? loadAttemptState(attempt) : null;
      const spentFromServer = Number(json.time_spent || 0);
      const computedLeft = Math.max(0, (examPayload?.total_time_minutes || 0) * 60 - spentFromServer);

      if (saved) {
        const maxIndex = Math.max(0, questionPayload.length - 1);
        setCurrentIndex(Math.min(saved.currentIndex ?? 0, maxIndex));
        setAnswers(saved.answers ?? json.answers ?? {});
        setFlags(saved.flags ?? {});
        if (typeof saved.timeLeft === "number") {
          setTimeLeft(Math.min(saved.timeLeft, computedLeft || saved.timeLeft));
        } else {
          setTimeLeft(computedLeft);
        }
      } else {
        setAnswers(json.answers ?? {});
        setTimeLeft(computedLeft);
      }

      setIntroMode(false);
    } catch (e: any) {
      setError(e?.message ?? "Failed to start exam");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!mockId || autoResumeChecked) return;
    if (typeof window === "undefined") return;
    const lastAttempt = localStorage.getItem(getExamAttemptKey(mockId));
    if (lastAttempt) startExam();
    setAutoResumeChecked(true);
  }, [mockId, autoResumeChecked]);

  useEffect(() => {
    if (!attemptId || introMode || result) return;
    saveAttemptState(attemptId, {
      currentIndex,
      answers,
      flags,
      timeLeft,
    });
  }, [attemptId, introMode, result, currentIndex, answers, flags, timeLeft]);

  useEffect(() => {
    if (introMode || result || !attemptId) return;
    const id = window.setInterval(() => {
      setTimeLeft((t) => (t > 0 ? t - 1 : 0));
    }, 1000);
    return () => window.clearInterval(id);
  }, [introMode, result, attemptId]);

  useEffect(() => {
    if (!attemptId || introMode || result) return;
    const id = window.setInterval(() => {
      void saveProgress();
    }, 30000);
    return () => window.clearInterval(id);
  }, [attemptId, introMode, result, answers, timeLeft]);

  useEffect(() => {
    if (timeLeft !== 0) return;
    if (submittedRef.current || result) return;
    if (!attemptId) return;
    submitExam();
  }, [timeLeft, attemptId, result]);

  useEffect(() => {
    if (!currentQ) return;
    setLastSectionIndex((prev) => ({ ...prev, [currentQ.subject]: currentIndex }));
  }, [currentIndex, currentQ]);

  async function saveProgress() {
    if (!attemptId || !exam) return;
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    if (!token) return;
    const spent = Math.max(0, (exam.total_time_minutes || 0) * 60 - timeLeft);
    await fetch(`${API_BASE}/api/mock-exams/save/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ attempt_id: attemptId, answers, time_spent: spent }),
    }).catch(() => null);
  }

  async function submitExam() {
    if (!attemptId || submittedRef.current) return;
    submittedRef.current = true;
    await saveProgress();
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    if (!token) return;
    const res = await fetch(`${API_BASE}/api/mock-exams/submit/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ attempt_id: attemptId, answers }),
    }).catch(() => null);

    if (!res) {
      setError("Failed to submit exam");
      return;
    }
    const { json, text } = await readResponse(res);
    if (!res.ok) {
      const htmlError = extractHtmlError(text);
      const fallback = text ? text.slice(0, 200) : "Failed to submit";
      setError(json?.error || htmlError || fallback);
      return;
    }

    clearAttemptState(attemptId, mockId);
    setResult({
      results_released: Boolean(json?.results_released),
      score_verbal: json?.score_verbal,
      score_math: json?.score_math,
      total_score: json?.total_score,
      analytics: json?.analytics,
    });
  }

  function setAnswer(value: string) {
    const q = currentQ;
    if (!q) return;
    setAnswers((prev) => ({ ...prev, [q.id]: value }));
  }

  function toggleFlag() {
    const q = currentQ;
    if (!q) return;
    setFlags((prev) => ({ ...prev, [q.id]: !prev[q.id] }));
  }

  function goToSection(subject: "verbal" | "math") {
    const indices = subject === "verbal" ? verbalIndices : mathIndices;
    if (!indices.length) return;
    const last = lastSectionIndex[subject];
    const target = last !== null && indices.includes(last) ? last : indices[0];
    setCurrentIndex(target);
  }

  function renderChoiceContent(content: string, isMath: boolean) {
    if (!isMath) return <span>{content}</span>;
    return <MathContent html={wrapLatexIfNeeded(content)} />;
  }

  if (introMode) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-10">
        <div className="mx-auto max-w-xl rounded-2xl border bg-white p-6 text-center shadow-sm">
          <div className="text-lg font-semibold">Mock Exam Ready</div>
          <div className="mt-2 text-sm text-slate-600">Single timer, free navigation between Verbal and Math.</div>
          {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}
          <button
            className="mt-5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
            onClick={startExam}
            disabled={loading}
            type="button"
          >
            {loading ? "Starting..." : "Start Mock"}
          </button>
        </div>
      </div>
    );
  }

  if (result) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-10">
        <div className="mx-auto max-w-3xl space-y-4">
          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <div className="text-xs uppercase tracking-[0.3em] text-slate-400">Mock Results</div>
            <div className="mt-2 text-2xl font-semibold text-slate-900">{exam?.title || "Mock Exam"}</div>
            {result.results_released ? (
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-xl bg-slate-100 px-4 py-3 text-sm">
                  <div className="text-xs uppercase text-slate-500">Verbal</div>
                  <div className="text-xl font-semibold text-slate-900">{result.score_verbal}</div>
                </div>
                <div className="rounded-xl bg-slate-100 px-4 py-3 text-sm">
                  <div className="text-xs uppercase text-slate-500">Math</div>
                  <div className="text-xl font-semibold text-slate-900">{result.score_math}</div>
                </div>
                <div className="rounded-xl bg-slate-100 px-4 py-3 text-sm">
                  <div className="text-xs uppercase text-slate-500">Total</div>
                  <div className="text-xl font-semibold text-slate-900">{result.total_score}</div>
                </div>
              </div>
            ) : (
              <div className="mt-4 text-sm text-slate-600">Your exam was submitted. Results are not published yet.</div>
            )}
          </div>

          {result.results_released ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border bg-white p-5 shadow-sm">
                <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Accuracy by topic</div>
                <div className="mt-3 space-y-2 text-sm">
                  {result.analytics?.topic_accuracy
                    ? Object.entries(result.analytics.topic_accuracy).map(([key, val]) => (
                        <div key={key} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                          <span>{key.replace(":", " ")}</span>
                          <span className="font-semibold">
                            {val.correct}/{val.total}
                          </span>
                        </div>
                      ))
                    : "No data."}
                </div>
              </div>
              <div className="rounded-2xl border bg-white p-5 shadow-sm">
                <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Accuracy by difficulty</div>
                <div className="mt-3 space-y-2 text-sm">
                  {result.analytics?.difficulty_accuracy
                    ? Object.entries(result.analytics.difficulty_accuracy).map(([key, val]) => (
                        <div key={key} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                          <span>{key.replace(":", " ")}</span>
                          <span className="font-semibold">
                            {val.correct}/{val.total}
                          </span>
                        </div>
                      ))
                    : "No data."}
                </div>
              </div>
            </div>
          ) : null}

          <button
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
            onClick={() => router.push("/practice/mock-exams")}
            type="button"
          >
            Back to Mock Exams
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="rounded-2xl border bg-white px-5 py-3 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.3em] text-slate-400">Mock Exam</div>
              <div className="text-lg font-semibold text-slate-900">{exam?.title || "Mock"}</div>
              <div className="text-xs text-slate-500">{exam?.description || "Single timer mock"}</div>
            </div>
            <div className="text-xl font-semibold text-slate-900">{formatTime(timeLeft)}</div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                  currentSection === "verbal" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200"
                }`}
                onClick={() => goToSection("verbal")}
                type="button"
              >
                Verbal ({verbalIndices.length})
              </button>
              <button
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                  currentSection === "math" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200"
                }`}
                onClick={() => goToSection("math")}
                type="button"
              >
                Math ({mathIndices.length})
              </button>
              <button
                className="text-sm text-slate-500"
                onClick={() => router.push("/practice/mock-exams")}
                type="button"
              >
                Exit
              </button>
            </div>
          </div>
        </div>

        {error ? <div className="text-sm text-red-600">{error}</div> : null}

        <div className="relative rounded-2xl border bg-white shadow-sm">
          {timeLeft === 0 ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/90 text-sm font-semibold text-slate-700">
              Time is up. Submitting your exam...
            </div>
          ) : null}

          {currentQ ? (
            currentSection === "verbal" ? (
              <div className="grid lg:grid-cols-[1fr_1fr]">
                <div className="p-6">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Reading passage</div>
                  <div className="mt-4 rounded-xl border border-slate-200 bg-white p-5 text-sm leading-6 text-slate-700 min-h-[320px] whitespace-pre-wrap">
                    {currentQ.image_url ? (
                      <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 overflow-hidden">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={currentQ.image_url} alt="question" className="w-full max-h-[240px] object-contain" />
                      </div>
                    ) : null}
                    {currentQ.passage || "No passage."}
                  </div>
                </div>
                <div className="border-l border-slate-200 p-6">
                  <div className="flex items-center justify-between rounded-xl bg-slate-100 px-3 py-2 text-xs">
                    <div className="flex items-center gap-4">
                      <div className="h-7 w-7 rounded-sm bg-slate-900 text-white text-[11px] font-semibold flex items-center justify-center">
                        {sectionPosition}
                      </div>
                      <div className="text-xs text-slate-600">Verbal Question {sectionPosition} of {sectionTotal}</div>
                    </div>
                    <button
                      className={`inline-flex items-center gap-2 text-xs ${
                        flags[currentQ.id] ? "text-slate-900 font-semibold" : "text-slate-600"
                      }`}
                      onClick={toggleFlag}
                      type="button"
                    >
                      <Bookmark size={14} fill={flags[currentQ.id] ? "currentColor" : "none"} />
                      {flags[currentQ.id] ? "Marked for Review" : "Mark for Review"}
                    </button>
                  </div>

                  <div className="mt-4 text-sm font-semibold text-slate-900 whitespace-pre-wrap">
                    {currentQ.stem}
                  </div>

                  {currentQ.is_open_ended ? (
                    <textarea
                      className="mt-4 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm min-h-[110px]"
                      value={answers[currentQ.id] ?? ""}
                      onChange={(e) => setAnswer(e.target.value)}
                      placeholder="Type your answer"
                    />
                  ) : (
                    <div className="mt-4 space-y-3">
                      {(currentQ.choices || []).map((c) => {
                        const isSelected = answers[currentQ.id] === c.label;
                        return (
                          <button
                            key={c.label}
                            className={`w-full rounded-xl border px-4 py-3 text-left text-sm transition flex items-center gap-2 ${
                              isSelected ? "border-blue-600 bg-blue-50 shadow-sm" : "border-slate-200"
                            }`}
                            onClick={() => setAnswer(c.label)}
                            type="button"
                          >
                            <span
                              className={`inline-flex items-center justify-center h-6 w-6 rounded-full border text-[11px] font-semibold mr-2 ${
                                isSelected ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 text-slate-700"
                              }`}
                            >
                              {c.label}
                            </span>
                            <span className="flex-1">{c.content}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-6 space-y-6">
                <div className="flex items-center justify-between rounded-xl bg-slate-100 px-3 py-2 text-xs">
                  <div className="flex items-center gap-4">
                    <div className="h-7 w-7 rounded-sm bg-slate-900 text-white text-[11px] font-semibold flex items-center justify-center">
                      {sectionPosition}
                    </div>
                    <div className="text-xs text-slate-600">Math Question {sectionPosition} of {sectionTotal}</div>
                  </div>
                  <button
                    className={`inline-flex items-center gap-2 text-xs ${
                      flags[currentQ.id] ? "text-slate-900 font-semibold" : "text-slate-600"
                    }`}
                    onClick={toggleFlag}
                    type="button"
                  >
                    <Bookmark size={14} fill={flags[currentQ.id] ? "currentColor" : "none"} />
                    {flags[currentQ.id] ? "Marked for Review" : "Mark for Review"}
                  </button>
                </div>

                {currentQ.image_url ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={currentQ.image_url} alt="question" className="w-full max-h-[320px] object-contain" />
                  </div>
                ) : null}

                <div className="text-lg font-semibold text-slate-900">
                  <MathContent html={wrapLatexIfNeeded(currentQ.stem)} />
                </div>

                {currentQ.is_open_ended ? (
                  <textarea
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm min-h-[110px]"
                    value={answers[currentQ.id] ?? ""}
                    onChange={(e) => setAnswer(e.target.value)}
                    placeholder="Type your answer"
                  />
                ) : (
                  <div className="space-y-2">
                    {(currentQ.choices || []).map((c) => {
                      const isSelected = answers[currentQ.id] === c.label;
                      return (
                        <button
                          key={c.label}
                          className={`w-full rounded-xl border px-4 py-3 text-left text-sm transition flex items-center gap-2 ${
                            isSelected ? "border-blue-600 bg-blue-50 shadow-sm" : "border-slate-200"
                          }`}
                          onClick={() => setAnswer(c.label)}
                          type="button"
                        >
                          <span
                            className={`inline-flex items-center justify-center h-6 w-6 rounded-full border text-[11px] font-semibold mr-2 ${
                              isSelected ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 text-slate-700"
                            }`}
                          >
                            {c.label}
                          </span>
                          <span className="flex-1">{renderChoiceContent(c.content, true)}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )
          ) : (
            <div className="p-6 text-sm text-slate-500">No questions in this mock exam.</div>
          )}
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 border-t bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <button
            className="rounded-lg border px-4 py-2 text-sm"
            onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
            disabled={currentIndex === 0}
            type="button"
          >
            Previous
          </button>
          <div className="flex items-center gap-2">
            <button
              className="rounded-full border px-5 py-2 text-sm font-semibold text-slate-700"
              type="button"
              onClick={() => setMapOpen(true)}
            >
              Question Map
            </button>
            <button
              className="rounded-lg border border-slate-900 px-4 py-2 text-sm font-semibold text-slate-900"
              onClick={submitExam}
              type="button"
            >
              Submit Exam
            </button>
          </div>
          <button
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white"
            onClick={() => setCurrentIndex((i) => Math.min(questions.length - 1, i + 1))}
            disabled={currentIndex === questions.length - 1}
            type="button"
          >
            Next
          </button>
        </div>
      </div>

      {mapOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center pb-24">
          <button className="absolute inset-0 bg-black/10" onClick={() => setMapOpen(false)} type="button" />
          <div className="relative w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-900">Question Map</div>
              <button className="text-slate-400" onClick={() => setMapOpen(false)} type="button">
                ×
              </button>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-500">
              <div className="flex items-center gap-1">
                <span className="h-3 w-3 rounded-sm border border-slate-300 bg-white" />
                Unanswered
              </div>
              <div className="flex items-center gap-1">
                <span className="h-3 w-3 rounded-sm bg-emerald-200" />
                Answered
              </div>
              <div className="flex items-center gap-1">
                <span className="h-3 w-3 rounded-sm bg-amber-200" />
                Flagged
              </div>
            </div>

            <div className="mt-4 space-y-5">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Verbal</div>
                <div className="mt-3 grid grid-cols-9 gap-2">
                  {verbalIndices.map((idx, i) => {
                    const status = statuses[idx];
                    return (
                      <button
                        key={`verbal-${idx}`}
                        className={`h-8 rounded-md text-[11px] font-semibold ${
                          idx === currentIndex
                            ? "bg-slate-900 text-white"
                            : status.isFlagged
                            ? "bg-amber-200 text-amber-900"
                            : status.isAnswered
                            ? "bg-emerald-200 text-emerald-900"
                            : "border border-dashed border-slate-300 text-slate-600"
                        }`}
                        onClick={() => {
                          setCurrentIndex(idx);
                          setMapOpen(false);
                        }}
                        type="button"
                      >
                        {i + 1}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Math</div>
                <div className="mt-3 grid grid-cols-9 gap-2">
                  {mathIndices.map((idx, i) => {
                    const status = statuses[idx];
                    return (
                      <button
                        key={`math-${idx}`}
                        className={`h-8 rounded-md text-[11px] font-semibold ${
                          idx === currentIndex
                            ? "bg-slate-900 text-white"
                            : status.isFlagged
                            ? "bg-amber-200 text-amber-900"
                            : status.isAnswered
                            ? "bg-emerald-200 text-emerald-900"
                            : "border border-dashed border-slate-300 text-slate-600"
                        }`}
                        onClick={() => {
                          setCurrentIndex(idx);
                          setMapOpen(false);
                        }}
                        type="button"
                      >
                        {i + 1}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="mt-5 rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-600">
              Verbal answered {counts.verbal.answered}/{counts.verbal.total} · flagged {counts.verbal.flagged} | Math answered {counts.math.answered}/{counts.math.total} · flagged {counts.math.flagged}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
