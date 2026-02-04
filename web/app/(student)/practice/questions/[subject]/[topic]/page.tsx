"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { typesetMath } from "@/lib/mathjax";

type Question = {
  id: string;
  stem: string;
  passage?: string | null;
  choices: { label: string; content: string; is_correct: boolean }[];
  explanation?: string | null;
  image_url?: string | null;
};

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
  const [evaluation, setEvaluation] = useState<Record<string, "correct" | "incorrect" | undefined>>({});
  const [eliminated, setEliminated] = useState<Record<string, Set<string>>>({});
  const [passageHtml, setPassageHtml] = useState<Record<string, string>>({});
  const [passageOriginal, setPassageOriginal] = useState<Record<string, string>>({});
  const [crossMode, setCrossMode] = useState(false);
  const passageRef = useRef<HTMLDivElement | null>(null);
  const stemRef = useRef<HTMLDivElement | null>(null);

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
        setQuestions(json.questions ?? []);
        const ph: Record<string, string> = {};
        const orig: Record<string, string> = {};
        (json.questions ?? []).forEach((q: Question) => {
          const val = q.passage ?? "";
          ph[q.id] = val;
          orig[q.id] = val;
        });
        setPassageHtml(ph);
        setPassageOriginal(orig);
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

  function wrapLatexIfNeeded(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return "";
    const hasDelims = trimmed.startsWith("\\(") || trimmed.startsWith("\\[") || trimmed.startsWith("$");
    return hasDelims ? trimmed : `\\(${trimmed}\\)`;
  }

  const currentQ = questions[current];
  const passage = currentQ?.passage;
  const total = questions.length;

  function selectChoice(qid: string, label: string) {
    setSelected((p) => ({ ...p, [qid]: label }));
    setEvaluation((p) => ({ ...p, [qid]: undefined }));
  }

  function checkAnswer(qid: string) {
    const q = questions.find((qq) => qq.id === qid);
    if (!q) return;
    const pick = selected[qid];
    if (!pick) return;
    const correct = q.choices.find((c) => c.is_correct)?.label;
    setEvaluation((p) => ({ ...p, [qid]: pick === correct ? "correct" : "incorrect" }));
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

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <div className="max-w-6xl mx-auto p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">{subject}</div>
              <h1 className="text-2xl font-bold text-slate-900">{topic}</h1>
              {subtopic ? <div className="text-sm text-neutral-600">Subtopic: {subtopic}</div> : null}
            </div>
            <div className="flex items-center gap-3 text-sm text-neutral-600">
              <button className="underline hover:text-neutral-800" onClick={() => router.back()}>
                Back
              </button>
            </div>
          </div>

        {loading ? <div className="text-sm text-neutral-600">Loading…</div> : null}
        {error ? <div className="text-sm text-red-600">{error}</div> : null}
        {!loading && !error && !currentQ ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white p-4 text-sm text-neutral-600">
            No questions yet.
          </div>
        ) : null}

        {currentQ ? (
          <div className="border border-slate-200 rounded-2xl bg-white shadow-sm overflow-hidden">
            <div className="p-4 flex justify-between items-center gap-3">
              <div className="space-y-1">
                <div className="text-xs uppercase tracking-[0.18em] text-slate-600">{subject}</div>
                <div className="text-sm font-semibold text-slate-800">
                  {decodeURIComponent(topic)}
                  {subtopic ? ` · ${decodeURIComponent(subtopic)}` : ""}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className={`h-8 w-8 rounded-full border flex items-center justify-center text-sm ${
                    crossMode ? "border-slate-900 text-slate-900" : "border-slate-300 text-neutral-600"
                  }`}
                  onClick={() => setCrossMode((v) => !v)}
                  title="Toggle cross-out mode"
                >
                  ✕
                </button>
                <button
                  className="h-8 w-8 rounded-full border border-slate-200 text-xs text-neutral-600"
                  onClick={() => go(-1)}
                  disabled={current === 0}
                >
                  ‹
                </button>
                <button
                  className="h-8 w-8 rounded-full border border-slate-200 text-xs text-neutral-600"
                  onClick={() => go(1)}
                  disabled={current === total - 1}
                >
                  ›
                </button>
              </div>
            </div>

            {/* Vertical stack: image -> stem -> answers */}
            <div className="px-4 pb-4 space-y-4">
              {currentQ.image_url ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={currentQ.image_url}
                    alt="question illustration"
                    className="w-full max-h-[360px] object-contain"
                  />
                </div>
              ) : null}

              <div
                ref={stemRef}
                className="text-base font-semibold text-neutral-900 whitespace-pre-wrap leading-relaxed"
                dangerouslySetInnerHTML={{
                  __html: wrapLatexIfNeeded(currentQ.stem || "").replace(/\n/g, "<br/>") || "<span class='text-neutral-400'>No question text</span>",
                }}
              />

              {/* Answers */}
              <div className="space-y-2">
                {currentQ.choices && currentQ.choices.length > 0 ? (
                  currentQ.choices.map((c) => {
                    const picked = selected[currentQ.id] === c.label;
                    const status = evaluation[currentQ.id];
                    const showCorrect = status === "correct" && c.is_correct;
                    const showWrong = status === "incorrect" && picked;
                    const isEliminated = eliminated[currentQ.id]?.has(c.label);
                    const isCross = crossMode;
                    return (
                      <div
                        key={c.label}
                        className={`rounded-xl border px-3 py-2 text-sm transition ${
                          picked ? "border-slate-900 shadow" : "border-slate-200"
                        } ${showCorrect ? "bg-emerald-50 border-emerald-300" : ""} ${
                          showWrong ? "bg-red-50 border-red-300" : ""
                        } ${isEliminated ? "opacity-60 line-through" : ""}`}
                      >
                        <div className="flex items-start gap-2">
                          <button
                            className="font-semibold text-neutral-800 mt-0.5"
                            onClick={() => (isCross ? toggleEliminate(currentQ.id, c.label) : selectChoice(currentQ.id, c.label))}
                          >
                            {c.label}.
                          </button>
                          <button
                            className="text-neutral-800 text-left flex-1"
                            onClick={() => (isCross ? toggleEliminate(currentQ.id, c.label) : selectChoice(currentQ.id, c.label))}
                          >
                            {c.content}
                          </button>
                          {isCross ? (
                            <button
                              className="text-xs text-neutral-500 underline"
                              onClick={() => toggleEliminate(currentQ.id, c.label)}
                            >
                              {isEliminated ? "Uncross" : "Cross out"}
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
                  </div>
                )}
              </div>

              {evaluation[currentQ.id] === "correct" && currentQ.explanation ? (
                <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-sm text-neutral-700">
                  Explanation: {currentQ.explanation}
                </div>
              ) : null}

              <div className="flex items-center justify-between pt-2">
                <div className="flex gap-2">
                  <button
                    onClick={() => go(-1)}
                    disabled={current === 0}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-60"
                  >
                    Prev
                  </button>
                  <button
                    onClick={() => go(1)}
                    disabled={current === total - 1}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-60"
                  >
                    Next
                  </button>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => checkAnswer(currentQ.id)}
                    disabled={!selected[currentQ.id]}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-60"
                  >
                    Check answer
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
