"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { typesetMath } from "@/lib/mathjax";

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
  const search = useSearchParams();
  const router = useRouter();
  const subject = (search.get("subject") || "").toLowerCase() as "math" | "verbal";
  const topic = search.get("topic") || "";
  const subtopic = search.get("subtopic") || "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<null | { passed: boolean; score: number; correct: number; total: number }>(null);
  const [timeLeft, setTimeLeft] = useState(20 * 60);
  const [showNavigator, setShowNavigator] = useState(false);
  const submittedRef = useRef(false);

  useEffect(() => {
    if (!subject || !topic) {
      setError("Missing subject or topic");
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const access = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
        const url = new URL(`${process.env.NEXT_PUBLIC_API_BASE}/api/questions/quiz/`);
        url.searchParams.set("subject", subject);
        url.searchParams.set("topic", topic);
        if (subtopic) url.searchParams.set("subtopic", subtopic);
        const res = await fetch(url.toString(), {
          headers: access ? { Authorization: `Bearer ${access}` } : {},
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "Failed to load quiz");
        setQuestions(json.questions ?? []);
      } catch (e: any) {
        setError(e?.message ?? "Failed to load quiz");
      } finally {
        setLoading(false);
      }
    })();
  }, [subject, topic, subtopic]);

  useEffect(() => {
    if (loading || result) return;
    const id = window.setInterval(() => {
      setTimeLeft((t) => (t > 0 ? t - 1 : 0));
    }, 1000);
    return () => window.clearInterval(id);
  }, [loading, result]);

  useEffect(() => {
    if (timeLeft !== 0) return;
    if (submittedRef.current) return;
    submittedRef.current = true;
    submitQuiz();
  }, [timeLeft]);

  const currentQ = questions[current];
  const isMath = subject === "math";
  const imageUrl = currentQ?.image_url;
  const resolvedImageUrl =
    imageUrl && imageUrl.startsWith("/") ? `${process.env.NEXT_PUBLIC_API_BASE}${imageUrl}` : imageUrl;

  const stemHtml = useMemo(() => {
    if (!currentQ) return "";
    const raw = currentQ.stem || "";
    return (isMath ? wrapLatexIfNeeded(raw) : raw).replace(/\n/g, "<br/>");
  }, [currentQ, isMath]);

  const passageHtml = useMemo(() => {
    if (!currentQ?.passage) return "";
    return currentQ.passage.replace(/\n/g, "<br/>");
  }, [currentQ]);

  function setAnswer(val: string) {
    if (!currentQ) return;
    setAnswers((p) => ({ ...p, [currentQ.id]: val }));
  }

  async function submitQuiz() {
    if (!questions.length) return;
    const access = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    const payload = {
      subject,
      topic,
      subtopic: subtopic || null,
      answers: questions.map((q) => ({
        question_id: q.id,
        answer: answers[q.id] ?? "",
      })),
    };
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/api/questions/quiz/submit/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(access ? { Authorization: `Bearer ${access}` } : {}),
      },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json?.error || "Failed to submit quiz");
      return;
    }
    setResult({ passed: json.passed, score: json.score, correct: json.correct, total: json.total });
  }

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <div className="mx-auto max-w-none px-4 pt-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <button className="text-slate-700 hover:text-slate-900" onClick={() => router.back()}>
            &larr; Go back
          </button>
          <div className="flex items-center gap-2">
            <div className="rounded-full border border-slate-200 bg-white px-3 py-1.5 font-semibold tracking-[0.08em]">
              {formatTime(timeLeft)}
            </div>
            <div className="text-xs text-slate-500">20 min</div>
          </div>
          <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
            {subject} {subtopic ? "subtopic quiz" : "topic quiz"}
          </div>
        </div>
      </div>

      {loading ? <div className="px-6 py-4 text-sm text-slate-500">Loading...</div> : null}
      {error ? <div className="px-6 py-3 text-sm text-red-600">{error}</div> : null}

      {currentQ ? (
        <div className="mt-3 border-t border-slate-200">
          <div className="border-b border-slate-200 px-4 sm:px-6 py-3 text-xs uppercase tracking-[0.18em] text-slate-500">
            {decodeURIComponent(topic)}
            {subtopic ? ` · ${decodeURIComponent(subtopic)}` : ""}
          </div>

          {isMath ? (
            <div className="px-4 sm:px-6 py-6">
              <div className="mx-auto max-w-3xl space-y-6">
                {resolvedImageUrl ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={resolvedImageUrl} alt="question" className="w-full max-h-[320px] object-contain" />
                  </div>
                ) : null}

                <div className="text-lg font-semibold text-slate-900">
                  <MathContent html={stemHtml} />
                </div>

                {currentQ.is_open_ended ? (
                  <textarea
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm min-h-[100px]"
                    placeholder="Type your answer"
                    value={answers[currentQ.id] ?? ""}
                    onChange={(e) => setAnswer(e.target.value)}
                  />
                ) : (
                  <div className="space-y-2">
                    {(currentQ.choices || []).map((c) => (
                      <button
                        key={c.label}
                        className={`w-full rounded-xl border px-4 py-3 text-left text-sm transition ${
                          answers[currentQ.id] === c.label ? "border-slate-900 bg-slate-50" : "border-slate-200"
                        }`}
                        onClick={() => setAnswer(c.label)}
                      >
                        <span className="inline-flex items-center justify-center h-6 w-6 rounded-full border border-slate-300 text-xs font-semibold mr-2">
                          {c.label}
                        </span>
                        <MathContent html={wrapLatexIfNeeded(c.content || "").replace(/\n/g, "<br/>")} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="grid lg:grid-cols-[1fr_1fr] min-h-[calc(100vh-180px)]">
              <div className="border-r border-slate-200 bg-white px-4 sm:px-6 py-5">
                <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Reading passages</div>
                <div className="mt-3 rounded-xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-700">
                  {resolvedImageUrl ? (
                    <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={resolvedImageUrl} alt="question" className="w-full max-h-[240px] object-contain" />
                    </div>
                  ) : null}
                  {currentQ.passage ? <span dangerouslySetInnerHTML={{ __html: passageHtml }} /> : "No passage."}
                </div>
              </div>
              <div className="bg-white px-4 sm:px-6 py-5">
                <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Question</div>
                <div className="mt-3 text-sm font-semibold text-slate-900">
                  <span dangerouslySetInnerHTML={{ __html: stemHtml }} />
                </div>

                <div className="mt-4 space-y-3">
                  {(currentQ.choices || []).map((c) => (
                    <button
                      key={c.label}
                      className={`w-full rounded-xl border px-4 py-3 text-left text-sm transition ${
                        answers[currentQ.id] === c.label ? "border-slate-900 bg-slate-50" : "border-slate-200"
                      }`}
                      onClick={() => setAnswer(c.label)}
                    >
                      <span className="inline-flex items-center justify-center h-6 w-6 rounded-full border border-slate-300 text-xs font-semibold mr-2">
                        {c.label}
                      </span>
                      {c.content}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="fixed bottom-0 left-0 right-0 border-t border-slate-200 bg-white/95 backdrop-blur px-4 py-3">
            <div className="mx-auto max-w-6xl flex items-center justify-between">
              <button
                className="rounded-full border border-slate-200 px-4 py-2 text-sm"
                onClick={() => setCurrent((i) => Math.max(0, i - 1))}
                disabled={current === 0}
              >
                Previous
              </button>
              <button
                className="text-sm text-slate-600 hover:text-slate-900 inline-flex items-center gap-2"
                onClick={() => setShowNavigator((v) => !v)}
              >
                {current + 1} of {questions.length}
                <span className={`text-xs transition ${showNavigator ? "rotate-180" : ""}`}>▾</span>
              </button>
              {current + 1 < questions.length ? (
                <button
                  className="rounded-full border border-slate-200 px-4 py-2 text-sm"
                  onClick={() => setCurrent((i) => Math.min(questions.length - 1, i + 1))}
                >
                  Next
                </button>
              ) : (
                <button className="rounded-full bg-slate-900 text-white px-4 py-2 text-sm" onClick={submitQuiz}>
                  Submit quiz
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {showNavigator ? (
        <div className="fixed bottom-16 left-1/2 -translate-x-1/2 z-50 w-[320px] rounded-2xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
            <div className="text-sm font-semibold text-slate-900">Question Set</div>
            <button className="text-slate-500 hover:text-slate-700" onClick={() => setShowNavigator(false)}>
              ✕
            </button>
          </div>
          <div className="px-4 py-3 grid grid-cols-6 gap-2 max-h-[240px] overflow-auto">
            {questions.map((q, idx) => {
              const answered = (answers[q.id] ?? "").trim().length > 0;
              return (
                <button
                  key={q.id}
                  className={`h-9 w-9 rounded-lg text-xs font-semibold border ${
                    answered ? "bg-emerald-50 border-emerald-300 text-emerald-700" : "bg-white border-slate-200 text-slate-500"
                  }`}
                  onClick={() => {
                    setCurrent(idx);
                    setShowNavigator(false);
                  }}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>
          <div className="px-4 py-2 text-xs text-slate-500 border-t border-slate-200">
            Green = answered
          </div>
        </div>
      ) : null}

      {result ? (
        <div className="fixed bottom-20 right-6 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-lg">
          <div className="font-semibold text-slate-900">{result.passed ? "Passed" : "Not passed"}</div>
          <div className="text-slate-700 mt-1">
            Score: {Math.round(result.score * 100)}% ({result.correct}/{result.total})
          </div>
          <div className="text-slate-500 mt-1">Minimum required: 80%</div>
        </div>
      ) : null}
    </div>
  );
}
