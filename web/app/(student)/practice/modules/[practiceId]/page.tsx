"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { typesetMath } from "@/lib/mathjax";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE;

type PracticeModule = {
  id: string;
  subject: "math" | "verbal";
  module_index: number;
  time_limit_minutes: number;
  questions: QuizQuestion[];
};

type QuizQuestion = {
  id: string;
  subject: "math" | "verbal";
  topic: string;
  subtopic?: string | null;
  stem: string;
  passage?: string | null;
  choices?: { label: string; content: string }[];
  is_open_ended?: boolean | null;
  image_url?: string | null;
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

export default function Page() {
  const params = useParams<{ practiceId: string }>();
  const router = useRouter();
  const practiceId = params.practiceId;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modules, setModules] = useState<PracticeModule[]>([]);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [currentModule, setCurrentModule] = useState(0);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [result, setResult] = useState<any>(null);
  const submittedRef = useRef(false);

  useEffect(() => {
    if (!practiceId) return;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
        if (!token) throw new Error("Not logged in");
        const res = await fetch(`${API_BASE}/api/module-practice/start/`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ practice_id: practiceId }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "Failed to start practice");
        setModules(json.modules ?? []);
        setAttemptId(json.attempt_id);
        if (json.modules?.length) {
          setTimeLeft((json.modules[0].time_limit_minutes || 0) * 60);
        }
      } catch (e: any) {
        setError(e?.message ?? "Failed to start practice");
      } finally {
        setLoading(false);
      }
    })();
  }, [practiceId]);

  useEffect(() => {
    if (loading || result || !modules.length) return;
    const id = window.setInterval(() => {
      setTimeLeft((t) => (t > 0 ? t - 1 : 0));
    }, 1000);
    return () => window.clearInterval(id);
  }, [loading, result, modules.length]);

  useEffect(() => {
    if (timeLeft !== 0) return;
    if (submittedRef.current) return;
    if (!modules.length) return;
    finishModule();
  }, [timeLeft]);

  function finishModule() {
    const next = currentModule + 1;
    if (next < modules.length) {
      setCurrentModule(next);
      setCurrentQuestion(0);
      setTimeLeft((modules[next].time_limit_minutes || 0) * 60);
      return;
    }
    submitPractice();
  }

  function setAnswer(val: string) {
    const q = currentQ;
    if (!q) return;
    setAnswers((prev) => ({ ...prev, [q.id]: val }));
  }

  async function submitPractice() {
    if (submittedRef.current) return;
    submittedRef.current = true;
    if (!attemptId) return;
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    if (!token) return;
    const res = await fetch(`${API_BASE}/api/module-practice/submit/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ attempt_id: attemptId, answers }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json?.error || "Failed to submit");
      return;
    }
    setResult(json);
  }

  const module = modules[currentModule];
  const questions = module?.questions ?? [];
  const currentQ = questions[currentQuestion];
  const isMath = module?.subject === "math";
  const imageUrl = currentQ?.image_url;
  const resolvedImageUrl =
    imageUrl && imageUrl.startsWith("/") ? `${API_BASE}${imageUrl}` : imageUrl;

  const stemHtml = useMemo(() => {
    if (!currentQ) return "";
    const raw = currentQ.stem || "";
    return (isMath ? wrapLatexIfNeeded(raw) : raw).replace(/\n/g, "<br/>");
  }, [currentQ, isMath]);

  const passageHtml = useMemo(() => {
    if (!currentQ?.passage) return "";
    return currentQ.passage.replace(/\n/g, "<br/>");
  }, [currentQ]);

  if (loading) return <div className="p-6 text-sm text-slate-500">Loading mock exam...</div>;
  if (error) return <div className="p-6 text-sm text-red-600">Error: {error}</div>;

  if (result) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-10">
        <div className="mx-auto max-w-3xl rounded-2xl border bg-white p-6 shadow-sm">
          <div className="text-xl font-semibold">Mock exam submitted</div>
          {result.results_released ? (
            <div className="mt-3 text-sm text-slate-600">
              Score: {Math.round((result.score ?? 0) * 100)}% ({result.correct}/{result.total})
            </div>
          ) : (
            <div className="mt-3 text-sm text-slate-600">Results will be available after the teacher publishes them.</div>
          )}
          <button
            className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
            onClick={() => router.push("/practice/modules")}
            type="button"
          >
            Back to module practice
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="rounded-2xl bg-white p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Module</div>
            <div className="text-lg font-semibold text-slate-900">
              {module ? `${module.subject.toUpperCase()} Module ${module.module_index}` : "Mock exam"}
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <div className="rounded-full border px-3 py-1 font-semibold">{formatTime(timeLeft)}</div>
            <button className="text-slate-500" onClick={() => router.push("/practice/modules")}>
              Exit
            </button>
          </div>
        </header>

        <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            {currentQ ? (
              <div className="space-y-4">
                {resolvedImageUrl ? (
                  <img src={resolvedImageUrl} alt="question" className="max-h-[260px] w-full rounded-xl object-contain" />
                ) : null}

                <div className="text-lg font-semibold text-slate-900">
                  {isMath ? <MathContent html={stemHtml} /> : <span dangerouslySetInnerHTML={{ __html: stemHtml }} />}
                </div>

                {passageHtml ? (
                  <div className="rounded-xl border bg-slate-50 p-4 text-sm" dangerouslySetInnerHTML={{ __html: passageHtml }} />
                ) : null}

                {currentQ.is_open_ended ? (
                  <textarea
                    className="w-full rounded-xl border px-3 py-2 text-sm min-h-[110px]"
                    value={answers[currentQ.id] ?? ""}
                    onChange={(e) => setAnswer(e.target.value)}
                    placeholder="Type your answer"
                  />
                ) : (
                  <div className="grid gap-2">
                    {(currentQ.choices ?? []).map((c) => {
                      const selected = answers[currentQ.id] === c.label;
                      return (
                        <button
                          key={c.label}
                          className={`rounded-xl border px-3 py-2 text-sm text-left ${
                            selected ? "border-blue-500 bg-blue-50" : "border-slate-200"
                          }`}
                          onClick={() => setAnswer(c.label)}
                          type="button"
                        >
                          <span className="mr-2 font-semibold">{c.label}.</span> {c.content}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm text-slate-500">No questions in this module.</div>
            )}

            <div className="mt-6 flex items-center justify-between">
              <button
                className="rounded-lg border px-4 py-2 text-sm"
                onClick={() => setCurrentQuestion((i) => Math.max(0, i - 1))}
                disabled={currentQuestion === 0}
                type="button"
              >
                Previous
              </button>
              <div className="text-xs text-slate-500">
                Question {currentQuestion + 1} of {questions.length || 0}
              </div>
              {currentQuestion < questions.length - 1 ? (
                <button
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white"
                  onClick={() => setCurrentQuestion((i) => Math.min(questions.length - 1, i + 1))}
                  type="button"
                >
                  Next
                </button>
              ) : (
                <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white" onClick={finishModule} type="button">
                  Finish module
                </button>
              )}
            </div>
          </div>

          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="text-sm font-semibold text-slate-900">Question map</div>
            <div className="mt-3 grid grid-cols-6 gap-2">
              {questions.map((q, idx) => {
                const answered = Boolean(answers[q.id]);
                return (
                  <button
                    key={q.id}
                    className={`h-9 rounded-lg text-xs font-semibold ${
                      idx === currentQuestion
                        ? "bg-blue-600 text-white"
                        : answered
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-100 text-slate-600"
                    }`}
                    onClick={() => setCurrentQuestion(idx)}
                    type="button"
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>
            <div className="mt-4 text-xs text-slate-500">Answered questions turn green.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
