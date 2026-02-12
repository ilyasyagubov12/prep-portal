"use client";

import { useEffect, useMemo, useState, useRef, memo } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Image from "next/image";
import { Crimson_Text, Space_Grotesk, Source_Serif_4 } from "next/font/google";
import { typesetMath } from "@/lib/mathjax";
import eliminateIcon from "@/sss/d2.png";

type Question = {
  id: string;
  stem: string;
  passage?: string | null;
  choices: { label: string; content: string; is_correct: boolean }[];
  explanation?: string | null;
  image_url?: string | null;
  is_open_ended?: boolean | null;
  correct_answer?: string | null;
};

const uiFont = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const passageFont = Source_Serif_4({ subsets: ["latin"], weight: ["400", "600"], style: ["normal"] });

const TimerDisplay = memo(function TimerDisplay({
  paused,
  hidden,
  resetKey,
}: {
  paused: boolean;
  hidden: boolean;
  resetKey: string;
}) {
  const [timeElapsed, setTimeElapsed] = useState(0);

  useEffect(() => {
    setTimeElapsed(0);
  }, [resetKey]);

  useEffect(() => {
    if (paused) return;
    const id = window.setInterval(() => {
      setTimeElapsed((t) => t + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [paused]);

  function formatTime(seconds: number) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  return (
    <div className="rounded-full border border-slate-200 bg-white px-3 py-1.5 font-semibold tracking-[0.08em]">
      {hidden ? "--:--" : formatTime(timeElapsed)}
    </div>
  );
});

const MathContent = memo(function MathContent({
  html,
  className,
}: {
  html: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.innerHTML = html || "";
    typesetMath(ref.current);
  }, [html]);

  return <span ref={ref} className={className} />;
});

export default function TopicQuestionsPage() {
  const params = useParams<{ subject: string; topic: string }>();
  const router = useRouter();
  const search = useSearchParams();
  const subtopic = search.get("subtopic") || "";

  const subject = (params.subject || "").toLowerCase();
  const topic = decodeURIComponent(params.topic || "");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isStaff, setIsStaff] = useState(false);
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [evaluation, setEvaluation] = useState<Record<string, Record<string, "correct" | "incorrect">>>({});
  const [statusMap, setStatusMap] = useState<Record<string, "correct" | "incorrect">>({});
  const [eliminated, setEliminated] = useState<Record<string, Set<string>>>({});
  const [passageHtml, setPassageHtml] = useState<Record<string, string>>({});
  const [passageOriginal, setPassageOriginal] = useState<Record<string, string>>({});
  const [crossMode, setCrossMode] = useState(false);
  const [showExplanation, setShowExplanation] = useState<Record<string, boolean>>({});
  const [explanationNotice, setExplanationNotice] = useState<Record<string, string>>({});
  const [isPaused, setIsPaused] = useState(false);
  const [timerHidden, setTimerHidden] = useState(false);
  const [showNavigator, setShowNavigator] = useState(false);
  const passageRef = useRef<HTMLDivElement | null>(null);
  const stemRef = useRef<HTMLDivElement | null>(null);
  const choicesRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    (async () => {
      const access = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
      if (access) {
        const me = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/api/auth/me/`, {
          headers: { Authorization: `Bearer ${access}` },
        }).catch(() => null);
        if (me && me.ok) {
          const prof = await me.json().catch(() => null);
          const role = (prof?.role ?? "").toLowerCase();
          setIsStaff(!!prof?.is_admin || role === "admin" || role === "teacher");
        }
      }

      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_BASE}/api/questions/?subject=${subject}&topic=${encodeURIComponent(
            topic
          )}${subtopic ? `&subtopic=${encodeURIComponent(subtopic)}` : ""}`,
          {
            headers: access ? { Authorization: `Bearer ${access}` } : {},
          }
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "Failed to load questions");
        const qs = json.questions ?? [];
        setQuestions(qs);
        const ph: Record<string, string> = {};
        const orig: Record<string, string> = {};
        qs.forEach((q: Question) => {
          const val = q.passage ?? "";
          ph[q.id] = val;
          orig[q.id] = val;
        });
        setPassageHtml(ph);
        setPassageOriginal(orig);
        if (access && qs.length) {
          fetch(`${process.env.NEXT_PUBLIC_API_BASE}/api/streak/attempts/`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${access}`,
            },
            body: JSON.stringify({ question_ids: qs.map((q: Question) => q.id) }),
          })
            .then((r) => r.json())
            .then((j) => {
              if (j?.statuses) setStatusMap(j.statuses);
            })
            .catch(() => null);
        }
      } catch (e: any) {
        setError(e?.message ?? "Failed to load questions");
      } finally {
        setLoading(false);
      }
    })();
  }, [subject, topic, subtopic]);

  useEffect(() => {
    const q = questions[current];
    if (q && stemRef.current) typesetMath(stemRef.current);
  }, [questions, current]);

  useEffect(() => {
    const q = questions[current];
    if (q && stemRef.current) typesetMath(stemRef.current);
  }, [selected, evaluation]);

  useEffect(() => {
    typesetMath(passageRef.current);
  }, [passageHtml, current]);


  function wrapLatexIfNeeded(input: string) {
    const trimmed = input.trim();
    if (!trimmed) return "";
    const hasDelims = trimmed.includes("\\(") || trimmed.includes("\\[") || trimmed.includes("$$");
    return hasDelims ? trimmed : `\\(${trimmed}\\)`;
  }

  const currentQ = questions[current];
  const isOpenEnded = !!(currentQ as any)?.is_open_ended;
  const imageUrl = (currentQ as any)?.image_url || (currentQ as any)?.imageUrl || (currentQ as any)?.image || null;
  const resolvedImageUrl = imageUrl && imageUrl.startsWith('/')
    ? `${process.env.NEXT_PUBLIC_API_BASE}${imageUrl}`
    : imageUrl;
  const passage = currentQ?.passage;
  const total = questions.length;

  function selectChoice(qid: string, label: string) {
    setSelected((p) => ({ ...p, [qid]: label }));
  }

  function checkAnswer(qid: string) {
    const q = questions.find((qq) => qq.id === qid);
    if (!q) return;
    const pick = selected[qid];
    if (!pick) return;
    let isCorrect = false;
    if (q.is_open_ended) {
      const expected = (q.correct_answer ?? "").trim().toLowerCase();
      const actual = String(pick).trim().toLowerCase();
      isCorrect = expected.length > 0 && actual === expected;
      setStatusMap((p) => ({ ...p, [qid]: isCorrect ? "correct" : "incorrect" }));
      setEvaluation((p) => ({
        ...p,
        [qid]: {
          ...(p[qid] ?? {}),
          __open__: isCorrect ? "correct" : "incorrect",
        },
      }));
    } else {
      const correct = q.choices.find((c) => c.is_correct)?.label;
      isCorrect = pick === correct;
      setStatusMap((p) => ({ ...p, [qid]: isCorrect ? "correct" : "incorrect" }));
      setEvaluation((p) => ({
        ...p,
        [qid]: {
          ...(p[qid] ?? {}),
          [pick]: isCorrect ? "correct" : "incorrect",
        },
      }));
    }

    const access = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    if (access) {
      fetch(`${process.env.NEXT_PUBLIC_API_BASE}/api/streak/attempt/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${access}`,
        },
        body: JSON.stringify({
          question_id: qid,
          subject,
          selected_label: q.is_open_ended ? null : pick,
          is_correct: isCorrect,
        }),
      }).catch(() => null);
    }
  }

  function toggleEliminate(qid: string, label: string) {
    setEliminated((p) => {
      const cur = new Set(p[qid] ?? []);
      if (cur.has(label)) cur.delete(label);
      else cur.add(label);
      return { ...p, [qid]: cur };
    });
  }

  function handleHighlight() {
    const q = currentQ;
    if (!q) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (range.collapsed) return;
    const container = passageRef.current;
    if (!container || !container.contains(range.commonAncestorContainer)) return;

    const mark = document.createElement("mark");
    mark.className = "bg-yellow-200";
    mark.appendChild(range.extractContents());
    range.insertNode(mark);
    sel.removeAllRanges();
    setPassageHtml((p) => ({ ...p, [q.id]: container.innerHTML }));
  }

  function clearHighlights() {
    const q = currentQ;
    if (!q) return;
    const original = passageOriginal[q.id] ?? q.passage ?? "";
    setPassageHtml((p) => ({ ...p, [q.id]: original }));
  }

  function go(delta: number) {
    setCurrent((i) => {
      const next = i + delta;
      if (next < 0 || next >= total) return i;
      return next;
    });
  }

  const isMath = subject === "math";
  const stemHtmlValue = useMemo(() => {
    if (!currentQ) return "";
    const raw = currentQ.stem || "";
    const html = isMath ? wrapLatexIfNeeded(raw) : raw;
    return html.replace(/\n/g, "<br/>");
  }, [currentQ, isMath]);
  const explanationHtml = useMemo(() => {
    if (!currentQ?.explanation) return "";
    return currentQ.explanation.replace(/\n/g, "<br/>");
  }, [currentQ]);
  useEffect(() => {
    if (!isMath) return;
    typesetMath();
    if (stemRef.current) typesetMath(stemRef.current);
  }, [currentQ, isMath]);
  useEffect(() => {
    if (!stemRef.current) return;
    stemRef.current.innerHTML = stemHtmlValue || "<span class='text-neutral-400'>No question text</span>";
    if (isMath) typesetMath(stemRef.current);
  }, [stemHtmlValue, isMath]);
  useEffect(() => {
    if (!isMath) return;
    if (choicesRef.current) typesetMath(choicesRef.current);
  }, [currentQ, selected, evaluation, showExplanation, explanationNotice, isMath]);

  useEffect(() => {
    if (!isMath) return;
    if (stemRef.current) typesetMath(stemRef.current);
  }, [currentQ, showExplanation, explanationNotice, isMath]);
  const passageSections = useMemo(() => {
    const html = currentQ ? passageHtml[currentQ.id] ?? "" : "";
    if (!html.trim()) return [];
    const parts = html.split(/\n\s*\n\s*\n|<hr\s*\/?>/gi).filter((p) => p.trim());
    return parts.length > 0 ? parts : [html];
  }, [currentQ, passageHtml]);

  function toggleFullscreen() {
    if (typeof document === "undefined") return;
    if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => null);
    else document.exitFullscreen?.().catch?.(() => null);
  }

  function handleExplanationClick() {
    if (!currentQ) return;
    if (currentQ.explanation && currentQ.explanation.trim()) {
      setShowExplanation((p) => ({ ...p, [currentQ.id]: !p[currentQ.id] }));
      setExplanationNotice((p) => ({ ...p, [currentQ.id]: "" }));
      return;
    }
    setExplanationNotice((p) => ({ ...p, [currentQ.id]: "No explanation available yet." }));
    window.setTimeout(() => {
      setExplanationNotice((p) => ({ ...p, [currentQ.id]: "" }));
    }, 2500);
  }

  function getDifficultyTone(q: Question, qid: string) {
    const raw = (q as Question & { difficulty?: string | number }).difficulty;
    if (typeof raw === "string") {
      const d = raw.toLowerCase();
      if (d.includes("hard")) return "bg-red-100 border-red-200 text-red-800";
      if (d.includes("med")) return "bg-amber-100 border-amber-200 text-amber-900";
      if (d.includes("easy")) return "bg-emerald-100 border-emerald-200 text-emerald-900";
    }
    if (typeof raw === "number") {
      if (raw >= 3) return "bg-red-100 border-red-200 text-red-800";
      if (raw === 2) return "bg-amber-100 border-amber-200 text-amber-900";
      if (raw <= 1) return "bg-emerald-100 border-emerald-200 text-emerald-900";
    }

    const marks = evaluation[qid] ?? {};
    const hasCorrect = Object.values(marks).includes("correct");
    const hasWrong = Object.values(marks).includes("incorrect");
    if (hasCorrect) return "bg-emerald-100 border-emerald-200 text-emerald-900";
    if (hasWrong) return "bg-red-100 border-red-200 text-red-800";
    return "bg-slate-100 border-slate-200 text-slate-700";
  }

  return (
    <div className={`${uiFont.className} min-h-screen bg-white text-slate-900`}>
      <div className="mx-auto max-w-none px-0 pb-[96px] pt-0 space-y-3">
        <div className="flex flex-col gap-3 text-sm px-4 pt-4 sm:px-6 sm:pt-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <button className="text-slate-700 hover:text-slate-900" onClick={() => router.back()}>
              ← Go back
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <TimerDisplay
              paused={isPaused}
              hidden={timerHidden}
              resetKey={currentQ?.id ?? ""}
            />
            <button
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5"
              onClick={() => setIsPaused((v) => !v)}
            >
              {isPaused ? "Resume" : "Pause"}
            </button>
            <button
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5"
              onClick={() => setTimerHidden((v) => !v)}
            >
              {timerHidden ? "Show" : "Hide"}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5"
              onClick={handleHighlight}
              disabled={!passage}
              title="Highlight selected text"
            >
              Highlight
            </button>
            <button className="rounded-full border border-slate-200 bg-white px-3 py-1.5" onClick={toggleFullscreen}>
              Fullscreen
            </button>
          </div>
        </div>

        {loading ? <div className="text-sm text-neutral-600">Loading...</div> : null}
        {error ? <div className="text-sm text-red-600">{error}</div> : null}
        {!loading && !error && !currentQ ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white p-4 text-sm text-neutral-600">
            No questions yet.
          </div>
        ) : null}

        {currentQ ? (
          <div className="rounded-none border border-slate-200 bg-white shadow-sm min-h-[calc(100vh-92px)]">
            <div className="border-b border-slate-200 px-4 sm:px-6 py-3 flex items-center justify-between text-xs uppercase tracking-[0.18em] text-slate-500">
              <div>
                {decodeURIComponent(topic)}
                {subtopic ? ` · ${decodeURIComponent(subtopic)}` : ""}
              </div>
              <button
                className={`rounded-full border px-3 py-1 text-[11px] tracking-normal ${
                  crossMode ? "border-slate-900 text-slate-900" : "border-slate-200 text-slate-500"
                }`}
                onClick={() => setCrossMode((v) => !v)}
                aria-label="Toggle eliminate mode"
              >
                <Image src={eliminateIcon} alt="" width={18} height={18} />
              </button>
            </div>

            {isMath ? (
              <div className="px-4 sm:px-6 py-6 sm:py-8 min-h-0">
                <div className="mx-auto max-w-3xl space-y-6 min-h-0">
                  {imageUrl ? (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={resolvedImageUrl}
                        alt="question illustration"
                        className="w-full max-h-[360px] object-contain"
                      />
                    </div>
                  ) : null}

                  <div
                    ref={stemRef}
                    className="text-lg font-semibold text-neutral-900 whitespace-pre-wrap leading-relaxed break-words break-all"

                  />

                  <div ref={choicesRef} className="space-y-3">
                    {!isOpenEnded && currentQ.choices && currentQ.choices.length > 0 ? (
                      currentQ.choices.map((c) => {
                        const picked = selected[currentQ.id] === c.label;
                        const status = evaluation[currentQ.id]?.[c.label];
                        const showCorrect = status === "correct";
                        const showWrong = status === "incorrect";
                        const isEliminated = eliminated[currentQ.id]?.has(c.label);
                        const isCross = crossMode;
                        return (
                          <div
                            key={c.label}
                            className={`rounded-xl border px-4 py-3 text-sm transition ${
                              picked ? "border-slate-900 shadow-sm" : "border-slate-200"
                            } ${showCorrect ? "bg-emerald-50 border-emerald-300" : ""} ${
                              showWrong ? "bg-red-50 border-red-300" : ""
                            } ${isEliminated ? "opacity-60 line-through" : ""}`}
                          >
                            <div className="flex items-start gap-3 min-w-0">
                              <button
                                className="h-7 w-7 rounded-full border border-slate-300 text-xs font-semibold text-slate-700"
                                onClick={() =>
                                  isCross ? toggleEliminate(currentQ.id, c.label) : selectChoice(currentQ.id, c.label)
                                }
                              >
                                {c.label}
                              </button>
                              <button
                                className="text-neutral-900 text-left flex-1 min-w-0 break-words break-all"
                                onClick={() => (isCross ? null : selectChoice(currentQ.id, c.label))}
                              >
                              {isMath ? (
                                <MathContent html={wrapLatexIfNeeded(c.content || "").replace(/\n/g, "<br/>")} />
                              ) : (
                                c.content
                              )}
                              </button>
                              {isCross ? (
                                <button
                                  className="ml-2 rounded-full border border-slate-200 bg-white p-1"
                                  onClick={() => toggleEliminate(currentQ.id, c.label)}
                                  aria-label="Eliminate answer"
                                >
                                  <Image src={eliminateIcon} alt="" width={16} height={16} />
                                </button>
                              ) : null}
                              {!isCross && picked ? (
                                <button
                                  className="ml-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
                                  onClick={() => checkAnswer(currentQ.id)}
                                >
                                  Check
                                </button>
                              ) : null}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="rounded-xl border border-slate-200 p-3 bg-slate-50">
                        <label className="text-sm text-neutral-700">Your answer</label>
                        <textarea
                          className="mt-2 w-full border rounded-lg px-3 py-2 text-sm min-h-[80px]"
                          placeholder="Type your answer"
                          value={selected[currentQ.id] ?? ""}
                          onChange={(e) =>
                            setSelected((prev) => ({
                              ...prev,
                              [currentQ.id]: e.target.value,
                            }))
                          }
                        />
                        <div className="mt-2 flex items-center gap-2">
                          <button
                            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
                            onClick={() => checkAnswer(currentQ.id)}
                          >
                            Check
                          </button>
                          {evaluation[currentQ.id]?.__open__ ? (
                            <span
                              className={`text-xs font-semibold ${
                                evaluation[currentQ.id]?.__open__ === "correct"
                                  ? "text-emerald-700"
                                  : "text-red-700"
                              }`}
                            >
                              {evaluation[currentQ.id]?.__open__ === "correct" ? "Correct" : "Incorrect"}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    )}
                  </div>
                  {showExplanation[currentQ.id] && currentQ.explanation ? (
                    <div className="mt-4 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-sm text-neutral-700">
                      <span className="font-semibold">Explanation:</span>{" "}
                      {isMath ? (
                        <MathContent html={explanationHtml} />
                      ) : (
                        <span dangerouslySetInnerHTML={{ __html: explanationHtml }} />
                      )}
                    </div>
                  ) : null}
                  {explanationNotice[currentQ.id] ? (
                    <div className="mt-3 text-sm text-slate-500">{explanationNotice[currentQ.id]}</div>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 min-h-0">
                <div className="md:border-r border-slate-200 bg-white px-4 sm:px-6 py-6 min-h-0">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Reading passages</div>
                  {imageUrl ? (
                    <div className="mt-4 rounded-xl border border-slate-200 bg-white overflow-hidden">
                      <img
                        src={resolvedImageUrl}
                        alt="question illustration"
                        className="w-full max-h-[260px] object-contain"
                      />
                    </div>
                  ) : null}
                  <div
                    ref={passageRef}
                    className={`${passageFont.className} mt-4 max-h-none overflow-y-auto min-h-0 pr-3 text-[15px] leading-[1.7] text-slate-800`}
                  >
                    {passageSections.length === 0 ? (
                      <div className="text-sm text-slate-500">No passage.</div>
                    ) : (
                      passageSections.map((section, idx) => (
                        <div key={idx} className="mb-6">
                          <div className="font-semibold text-slate-900 mb-2">Text {idx + 1}</div>
                          <div dangerouslySetInnerHTML={{ __html: section.replace(/\n/g, "<br/>") }} />
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="px-4 sm:px-6 py-6 min-h-0">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Question</div>
                  <div
                    ref={stemRef}
                    className="mt-3 text-base font-semibold text-neutral-900 whitespace-pre-wrap leading-relaxed break-words break-all"

                  />

                  <div ref={choicesRef} className="mt-5 space-y-3 overflow-y-auto min-h-0 max-h-[calc(100vh-340px)] pr-1">
                    {!isOpenEnded && currentQ.choices && currentQ.choices.length > 0 ? (
                      currentQ.choices.map((c) => {
                        const picked = selected[currentQ.id] === c.label;
                        const status = evaluation[currentQ.id]?.[c.label];
                        const showCorrect = status === "correct";
                        const showWrong = status === "incorrect";
                        const isEliminated = eliminated[currentQ.id]?.has(c.label);
                        const isCross = crossMode;
                        return (
                          <div
                            key={c.label}
                            className={`rounded-xl border px-4 py-3 text-sm transition ${
                              picked ? "border-slate-900 shadow-sm" : "border-slate-200"
                            } ${showCorrect ? "bg-emerald-50 border-emerald-300" : ""} ${
                              showWrong ? "bg-red-50 border-red-300" : ""
                            } ${isEliminated ? "opacity-60 line-through" : ""}`}
                          >
                            <div className="flex items-start gap-3 min-w-0">
                              <button
                                className="h-7 w-7 rounded-full border border-slate-300 text-xs font-semibold text-slate-700"
                                onClick={() =>
                                  isCross ? toggleEliminate(currentQ.id, c.label) : selectChoice(currentQ.id, c.label)
                                }
                              >
                                {c.label}
                              </button>
                              <button
                                className="text-neutral-900 text-left flex-1 min-w-0 break-words break-all"
                                onClick={() => (isCross ? null : selectChoice(currentQ.id, c.label))}
                              >
                                {isMath ? (
                                  <span
                                    dangerouslySetInnerHTML={{
                                      __html: wrapLatexIfNeeded(c.content || "").replace(/\n/g, "<br/>"),
                                    }}
                                  />
                                ) : (
                                  c.content
                                )}
                              </button>
                              {isCross ? (
                                <button
                                  className="ml-2 rounded-full border border-slate-200 bg-white p-1"
                                  onClick={() => toggleEliminate(currentQ.id, c.label)}
                                  aria-label="Eliminate answer"
                                >
                                  <Image src={eliminateIcon} alt="" width={16} height={16} />
                                </button>
                              ) : null}
                              {!isCross && picked ? (
                                <button
                                  className="ml-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
                                  onClick={() => checkAnswer(currentQ.id)}
                                >
                                  Check
                                </button>
                              ) : null}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="rounded-xl border border-slate-200 p-3 bg-slate-50">
                        <label className="text-sm text-neutral-700">Your answer</label>
                        <textarea
                          className="mt-2 w-full border rounded-lg px-3 py-2 text-sm min-h-[80px]"
                          placeholder="Type your answer"
                          value={selected[currentQ.id] ?? ""}
                          onChange={(e) =>
                            setSelected((prev) => ({
                              ...prev,
                              [currentQ.id]: e.target.value,
                            }))
                          }
                        />
                        <div className="mt-2 flex items-center gap-2">
                          <button
                            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
                            onClick={() => checkAnswer(currentQ.id)}
                          >
                            Check
                          </button>
                          {evaluation[currentQ.id]?.__open__ ? (
                            <span
                              className={`text-xs font-semibold ${
                                evaluation[currentQ.id]?.__open__ === "correct"
                                  ? "text-emerald-700"
                                  : "text-red-700"
                              }`}
                            >
                              {evaluation[currentQ.id]?.__open__ === "correct" ? "Correct" : "Incorrect"}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    )}
                  </div>

                  {showExplanation[currentQ.id] && currentQ.explanation ? (
                    <div className="mt-4 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-sm text-neutral-700">
                      Explanation: {currentQ.explanation}
                    </div>
                  ) : null}
                  {explanationNotice[currentQ.id] ? (
                    <div className="mt-3 text-sm text-slate-500">{explanationNotice[currentQ.id]}</div>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        ) : null}

        <div className="text-xs text-slate-400 px-4 sm:px-6 pb-6">
          SAT is a registered trademark of the College Board. This product is not endorsed or sponsored by the College
          Board.
        </div>
      </div>

      {currentQ ? (
        <div
          className="fixed bottom-0 left-0 right-0 border-t border-slate-200 bg-white/95 backdrop-blur md:left-[270px] md:w-[calc(100%-270px)]"
        >
          <div className="px-4 sm:px-6 py-3 sm:py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-sm">
            <button
              className="text-slate-700 hover:text-slate-900 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-semibold"
              onClick={() => setShowNavigator(true)}
            >
              {current + 1} of {total} <span className="ml-1 text-xs">▾</span>
            </button>
            <div className="flex flex-wrap items-center gap-2">
              <button
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold"
                onClick={handleExplanationClick}
              >
                Explanation
              </button>
              <button
                onClick={() => checkAnswer(currentQ.id)}
                disabled={!selected[currentQ.id]}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-60"
              >
                Check
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => go(-1)}
                disabled={current === 0}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-60"
              >
                Previous
              </button>
              <button
                onClick={() => go(1)}
                disabled={current === total - 1}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-60"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showNavigator ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center md:left-[270px] md:w-[calc(100%-270px)]"
        >
          <div
            className="absolute inset-0 bg-black/20"
            onClick={() => setShowNavigator(false)}
          />
          <div className="relative w-[420px] max-w-[90vw] rounded-2xl bg-white shadow-xl border border-slate-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <div className="text-sm font-semibold text-slate-900">Question Set</div>
              <button
                className="h-8 w-8 rounded-full border border-slate-200 text-slate-600 hover:text-slate-900"
                onClick={() => setShowNavigator(false)}
              >
                ×
              </button>
            </div>
            <div className="px-5 py-4 text-xs text-slate-600 flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded bg-emerald-100 border border-emerald-200" />
                Easy
              </div>
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded bg-amber-100 border border-amber-200" />
                Medium
              </div>
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded bg-red-100 border border-red-200" />
                Hard
              </div>
            </div>
            <div className="px-5 pb-5">
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 max-h-[320px] overflow-y-auto pr-1">
                {questions.map((q, idx) => {
                  const status = statusMap[q.id];
                  const statusIcon = status === "correct" ? "✓" : status === "incorrect" ? "✕" : "";
                  const statusClass =
                    status === "correct"
                      ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                      : status === "incorrect"
                        ? "bg-red-100 text-red-700 border-red-200"
                        : "bg-white text-slate-400 border-slate-200";
                  return (
                    <button
                      key={q.id}
                      onClick={() => {
                        setCurrent(idx);
                        setShowNavigator(false);
                      }}
                      className={`relative h-9 w-9 rounded-lg border text-xs font-semibold ${getDifficultyTone(q, q.id)} ${
                        idx === current ? "ring-2 ring-slate-900/30" : ""
                      }`}
                    >
                      {idx + 1}
                      {statusIcon ? (
                        <span
                          className={`absolute -top-1 -right-1 h-4 w-4 rounded-full border text-[10px] inline-flex items-center justify-center ${statusClass}`}
                        >
                          {statusIcon}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}







