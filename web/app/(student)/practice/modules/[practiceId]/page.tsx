"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Bookmark, Calculator, PenLine } from "lucide-react";
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

function hasLatexDelims(input: string) {
  return input.includes("\\(") || input.includes("\\[") || input.includes("$$");
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
  return `mock_attempt_${attemptId}`;
}

function getPracticeAttemptKey(practiceId: string) {
  return `mock_practice_attempt_${practiceId}`;
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

function clearAttemptState(attemptId: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(getAttemptStorageKey(attemptId));
  } catch {
    return;
  }
}

export default function Page() {
  const params = useParams<{ practiceId: string }>();
  const router = useRouter();
  const search = useSearchParams();
  const practiceId = params.practiceId;

  const examParam = (search.get("exam") || "").toLowerCase();
  const examLabel = examParam === "act" ? "ACT" : "SAT";

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modules, setModules] = useState<PracticeModule[]>([]);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [currentModule, setCurrentModule] = useState(0);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [timeExpired, setTimeExpired] = useState(false);
  const [result, setResult] = useState<any>(null);
  const submittedRef = useRef(false);
  const [introMode, setIntroMode] = useState(true);
  const [mapOpen, setMapOpen] = useState(false);
  const [reviewMode, setReviewMode] = useState(false);
  const [reviewFlags, setReviewFlags] = useState<Record<string, boolean>>({});
  const [breakMode, setBreakMode] = useState(false);
  const [breakSeconds, setBreakSeconds] = useState(0);
  const [eliminateMode, setEliminateMode] = useState(false);
  const [eliminations, setEliminations] = useState<Record<string, Record<string, boolean>>>({});
  const [highlightedPassages, setHighlightedPassages] = useState<Record<string, string>>({});
  const [highlightedStems, setHighlightedStems] = useState<Record<string, string>>({});
  const passageBoxRef = useRef<HTMLDivElement | null>(null);
  const stemBoxRef = useRef<HTMLDivElement | null>(null);
  const [highlightMode, setHighlightMode] = useState(false);
  const [autoResumeChecked, setAutoResumeChecked] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const openDesmosPopup = () => {
    if (typeof window === "undefined") return;
    const width = 900;
    const height = 600;
    const left = Math.max(0, window.screenX + (window.outerWidth - width) / 2);
    const top = Math.max(0, window.screenY + (window.outerHeight - height) / 2);
    window.open(
      "https://www.desmos.com/calculator",
      "desmosCalculator",
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
    );
  };


  async function startAttempt() {
    if (!practiceId) return;
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
      const { json, text } = await readResponse(res);
      if (!res.ok) {
        const htmlError = extractHtmlError(text);
        const fallback = text ? text.slice(0, 200) : "Failed to start practice";
        throw new Error(json?.error || htmlError || fallback);
      }
      const modulesPayload = json?.modules ?? [];
      const attempt = json?.attempt_id ?? null;
      setModules(modulesPayload);
      setAttemptId(attempt);
      if (attempt && typeof window !== "undefined") {
        localStorage.setItem(getPracticeAttemptKey(practiceId), attempt);
      }
      const saved = attempt ? loadAttemptState(attempt) : null;
      if (saved && modulesPayload.length) {
        const savedModule = Math.min(saved.currentModule ?? 0, modulesPayload.length - 1);
        const savedQuestions = modulesPayload[savedModule]?.questions ?? [];
        const savedQuestion = Math.min(saved.currentQuestion ?? 0, Math.max(0, savedQuestions.length - 1));
        setCurrentModule(savedModule);
        setCurrentQuestion(savedQuestion);
        setAnswers(saved.answers ?? {});
        setReviewFlags(saved.reviewFlags ?? {});
        setReviewMode(Boolean(saved.reviewMode));
        setBreakMode(Boolean(saved.breakMode));
        setBreakSeconds(saved.breakSeconds ?? 0);
        setEliminateMode(Boolean(saved.eliminateMode));
        setEliminations(saved.eliminations ?? {});
        setHighlightedPassages(saved.highlightedPassages ?? {});
        setHighlightedStems(saved.highlightedStems ?? {});
        setTimeExpired(Boolean(saved.timeExpired));
        if (typeof saved.timeLeft === "number") {
          setTimeLeft(saved.timeLeft);
        } else if (modulesPayload[savedModule]) {
          setTimeLeft((modulesPayload[savedModule].time_limit_minutes || 0) * 60);
        }
      } else if (modulesPayload.length) {
        setTimeLeft((modulesPayload[0].time_limit_minutes || 0) * 60);
      }
      setIntroMode(false);
    } catch (e: any) {
      setError(e?.message ?? "Failed to start practice");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!practiceId || autoResumeChecked) return;
    if (typeof window === "undefined") return;
    const lastAttempt = localStorage.getItem(getPracticeAttemptKey(practiceId));
    if (lastAttempt) {
      startAttempt();
    }
    setAutoResumeChecked(true);
  }, [practiceId, autoResumeChecked]);

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
    setTimeExpired(true);
    finishModule();
  }, [timeLeft]);

  useEffect(() => {
    if (!breakMode) return;
    const id = window.setInterval(() => {
      setBreakSeconds((t) => (t > 0 ? t - 1 : 0));
    }, 1000);
    return () => window.clearInterval(id);
  }, [breakMode]);

  useEffect(() => {
    const current = modules[currentModule];
    if (current?.subject !== "verbal") {
      setHighlightMode(false);
    }
  }, [modules, currentModule]);

  // Calculator opens in a popup window (no API key required).

  useEffect(() => {
    if (!attemptId || introMode) return;
    saveAttemptState(attemptId, {
      currentModule,
      currentQuestion,
      answers,
      timeLeft,
      reviewFlags,
      reviewMode,
      breakMode,
      breakSeconds,
      eliminateMode,
      eliminations,
      highlightedPassages,
      highlightedStems,
      timeExpired,
    });
  }, [
    attemptId,
    introMode,
    currentModule,
    currentQuestion,
    answers,
    timeLeft,
    reviewFlags,
    reviewMode,
    breakMode,
    breakSeconds,
    eliminations,
    highlightedPassages,
    highlightedStems,
    timeExpired,
  ]);

  useEffect(() => {
    const handleDocClick = (event: MouseEvent) => {
      const rawTarget = event.target as HTMLElement | null;
      if (!rawTarget) return;
      const target = rawTarget instanceof Element ? rawTarget : rawTarget.parentElement;
      if (!target) return;
      if (target.closest("mark[data-hl]") || target.closest("[data-hl-remove]")) return;
      clearActiveHighlights(passageBoxRef.current);
      clearActiveHighlights(stemBoxRef.current);
      persistHighlightHtml("passage");
      persistHighlightHtml("stem");
    };
    document.addEventListener("click", handleDocClick);
    return () => document.removeEventListener("click", handleDocClick);
  }, []);

  function finishModule() {
    const next = currentModule + 1;
    if (next < modules.length) {
      setReviewMode(true);
      return;
    }
    submitPractice();
  }

  function goToNextModule() {
    const next = currentModule + 1;
    if (next < modules.length) {
      if (module?.subject === "verbal" && modules[next]?.subject === "math") {
        setReviewMode(false);
        setTimeExpired(false);
        setBreakMode(true);
        setBreakSeconds(10 * 60);
        return;
      }
      setCurrentModule(next);
      setCurrentQuestion(0);
      setTimeLeft((modules[next].time_limit_minutes || 0) * 60);
      setReviewMode(false);
      setTimeExpired(false);
      return;
    }
    submitPractice();
  }

  function resumeAfterBreak() {
    const next = currentModule + 1;
    if (next < modules.length) {
      setBreakMode(false);
      setCurrentModule(next);
      setCurrentQuestion(0);
      setTimeLeft((modules[next].time_limit_minutes || 0) * 60);
      return;
    }
    setBreakMode(false);
  }

  function toggleReviewFlag(questionId: string) {
    setReviewFlags((prev) => ({ ...prev, [questionId]: !prev[questionId] }));
  }

  function toggleElimination(questionId: string, label: string) {
    setEliminations((prev) => {
      const current = { ...(prev[questionId] || {}) };
      if (current[label]) delete current[label];
      else current[label] = true;
      return { ...prev, [questionId]: current };
    });
  }

  function setAnswer(val: string) {
    const q = currentQ;
    if (!q) return;
    setAnswers((prev) => ({ ...prev, [q.id]: val }));
  }

  function getTrimmedRange(range: Range) {
    const trimmed = range.cloneRange();
    try {
      while (trimmed.toString().length && /^\s/.test(trimmed.toString())) {
        trimmed.setStart(trimmed.startContainer, trimmed.startOffset + 1);
      }
      while (trimmed.toString().length && /\s$/.test(trimmed.toString())) {
        trimmed.setEnd(trimmed.endContainer, trimmed.endOffset - 1);
      }
    } catch {
      return null;
    }
    if (!trimmed.toString().trim()) return null;
    return trimmed;
  }

  function applyHighlight() {
    if (!currentQ) return;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (range.collapsed) return;

    const inPassage =
      passageBoxRef.current &&
      passageBoxRef.current.contains(range.startContainer) &&
      passageBoxRef.current.contains(range.endContainer);
    const inStem =
      stemBoxRef.current &&
      stemBoxRef.current.contains(range.startContainer) &&
      stemBoxRef.current.contains(range.endContainer);

    if (!inPassage && !inStem) return;

    const container = inPassage ? passageBoxRef.current : stemBoxRef.current;
    if (!container) return;

    const trimmedRange = getTrimmedRange(range);
    if (!trimmedRange) return;

    const startEl =
      trimmedRange.startContainer instanceof Element
        ? trimmedRange.startContainer
        : trimmedRange.startContainer.parentElement;
    if (startEl?.closest("mark[data-hl]")) return;

    try {
      const mark = document.createElement("mark");
      mark.setAttribute("data-hl", "1");
      mark.style.backgroundColor = "#fde68a";
      mark.style.padding = "0 2px";
      mark.style.borderRadius = "3px";
      const contents = trimmedRange.extractContents();
      mark.appendChild(contents);

      const removeBtn = document.createElement("button");
      removeBtn.textContent = "S";
      removeBtn.setAttribute("data-hl-remove", "1");
      removeBtn.setAttribute("type", "button");
      removeBtn.style.marginLeft = "6px";
      removeBtn.style.border = "1px solid #cbd5e1";
      removeBtn.style.borderRadius = "9999px";
      removeBtn.style.width = "22px";
      removeBtn.style.height = "22px";
      removeBtn.style.fontSize = "11px";
      removeBtn.style.lineHeight = "22px";
      removeBtn.style.fontWeight = "700";
      removeBtn.style.cursor = "pointer";
      removeBtn.style.background = "#fff";
      removeBtn.style.color = "#111827";
      removeBtn.style.display = "none";
      removeBtn.style.textAlign = "center";
      mark.appendChild(removeBtn);

      trimmedRange.insertNode(mark);
      selection.removeAllRanges();

      if (inPassage && passageBoxRef.current) {
        setHighlightedPassages((prev) => ({ ...prev, [currentQ.id]: passageBoxRef.current!.innerHTML }));
      }
      if (inStem && stemBoxRef.current) {
        setHighlightedStems((prev) => ({ ...prev, [currentQ.id]: stemBoxRef.current!.innerHTML }));
      }
    } catch {
      return;
    }
  }

  function handleHighlightMouseUp() {
    if (!highlightMode) return;
    applyHighlight();
  }

  function removeHighlightFromTarget(target: HTMLElement, type: "passage" | "stem") {
    const mark = target.closest("mark");
    if (!mark) return;
    const btn = mark.querySelector("[data-hl-remove]");
    if (btn) btn.remove();
    const parent = mark.parentNode;
    if (!parent) return;
    while (mark.firstChild) {
      parent.insertBefore(mark.firstChild, mark);
    }
    parent.removeChild(mark);
    if (!currentQ) return;
    if (type === "passage" && passageBoxRef.current) {
      setHighlightedPassages((prev) => ({ ...prev, [currentQ.id]: passageBoxRef.current!.innerHTML }));
    }
    if (type === "stem" && stemBoxRef.current) {
      setHighlightedStems((prev) => ({ ...prev, [currentQ.id]: stemBoxRef.current!.innerHTML }));
    }
  }

  function persistHighlightHtml(type: "passage" | "stem") {
    if (!currentQ) return;
    if (type == "passage" && passageBoxRef.current) {
      setHighlightedPassages((prev) => ({ ...prev, [currentQ.id]: passageBoxRef.current!.innerHTML }));
    }
    if (type == "stem" && stemBoxRef.current) {
      setHighlightedStems((prev) => ({ ...prev, [currentQ.id]: stemBoxRef.current!.innerHTML }));
    }
  }


  function clearActiveHighlights(container: HTMLElement | null) {
    if (!container) return;
    const marks = Array.from(container.querySelectorAll("mark[data-hl]")) as HTMLElement[];
    for (const item of marks) {
      item.removeAttribute("data-hl-active");
      const btn = item.querySelector("[data-hl-remove]") as HTMLElement | null;
      if (btn) btn.style.display = "none";
    }
  }

  function setActiveHighlight(container: HTMLElement | null, mark: HTMLElement) {
    if (!container) return;
    clearActiveHighlights(container);
    mark.setAttribute("data-hl-active", "1");
    const btn = mark.querySelector("[data-hl-remove]") as HTMLElement | null;
    if (btn) btn.style.display = "inline-flex";
  }

  function handleHighlightClick(type: "passage" | "stem", target: HTMLElement) {
    const el = target instanceof Element ? target : target.parentElement;
    if (!el) return;
    const removeTarget = el.closest("[data-hl-remove]") as HTMLElement | null;
    if (removeTarget) {
      removeHighlightFromTarget(removeTarget, type);
      return;
    }
    const mark = el.closest("mark[data-hl]") as HTMLElement | null;
    const container = type == "passage" ? passageBoxRef.current : stemBoxRef.current;
    if (!mark) {
      clearActiveHighlights(container);
      persistHighlightHtml(type);
      return;
    }
    setActiveHighlight(container, mark);
    persistHighlightHtml(type);
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
    const { json, text } = await readResponse(res);
    if (!res.ok) {
      const htmlError = extractHtmlError(text);
      const fallback = text ? text.slice(0, 200) : "Failed to submit";
      setError(json?.error || htmlError || fallback);
      return;
    }
    clearAttemptState(attemptId);
    if (typeof window !== "undefined") {
      localStorage.removeItem(getPracticeAttemptKey(practiceId));
    }
    setResult(json);
  }

  const module = modules[currentModule];
  const questions = module?.questions ?? [];
  const currentQ = questions[currentQuestion];
  const isMath = module?.subject === "math";
  const isVerbal = module?.subject === "verbal";
  const navLocked = timeLeft === 0 || timeExpired;
  const isMarkedForReview = currentQ ? !!reviewFlags[currentQ.id] : false;
  const eliminatedForCurrent = currentQ ? eliminations[currentQ.id] || {} : {};
  const imageUrl = currentQ?.image_url;
  const resolvedImageUrl =
    imageUrl && imageUrl.startsWith("/") ? `${API_BASE}${imageUrl}` : imageUrl;

  function renderChoiceContent(content: string) {
    const safe = content || "";
    const html = safe.replace(/\n/g, "<br/>");
    if (isVerbal && !hasLatexDelims(safe)) {
      return <span dangerouslySetInnerHTML={{ __html: html }} />;
    }
    return <MathContent html={wrapLatexIfNeeded(safe).replace(/\n/g, "<br/>")} />;
  }

  const stemHtml = useMemo(() => {
    if (!currentQ) return "";
    const raw = currentQ.stem || "";
    const base = (isMath ? wrapLatexIfNeeded(raw) : raw).replace(/\n/g, "<br/>");
    if (!isMath && highlightedStems[currentQ.id]) return highlightedStems[currentQ.id];
    return base;
  }, [currentQ, isMath, highlightedStems]);

  const passageHtml = useMemo(() => {
    if (!currentQ?.passage) return "";
    if (highlightedPassages[currentQ.id]) return highlightedPassages[currentQ.id];
    return currentQ.passage.replace(/\n/g, "<br/>");
  }, [currentQ, highlightedPassages]);

  if (introMode) {
    return (
      <div className="min-h-screen bg-[#f7f7fb]">
        <div className="mx-auto flex min-h-screen max-w-4xl flex-col items-center justify-center px-6 py-16 text-center">
          <div className="text-sm uppercase tracking-[0.3em] text-slate-400">Full-Length Practice Test</div>
          <h1 className="mt-3 text-2xl font-semibold text-slate-900">{examLabel} Full-Length Practice Test</h1>
          <p className="mt-2 text-sm text-slate-500">
            Timed modules, saved answers, and review before submission.
          </p>

          <div className="mt-10 w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="space-y-4 text-left text-sm text-slate-600">
              <div className="flex items-start gap-3">
                <div className="mt-1 h-8 w-8 rounded-full bg-slate-100 text-center text-[11px] font-semibold leading-8 text-slate-700">
                  ⏱
                </div>
                <div>
                  <div className="font-semibold text-slate-900">Timing</div>
                  <div className="text-xs text-slate-500">
                    The test is timed by module. You can exit and continue later—answers stay saved.
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="mt-1 h-8 w-8 rounded-full bg-slate-100 text-center text-[11px] font-semibold leading-8 text-slate-700">
                  📊
                </div>
                <div>
                  <div className="font-semibold text-slate-900">Results</div>
                  <div className="text-xs text-slate-500">
                    You’ll see correct counts for each module when results are published.
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="mt-1 h-8 w-8 rounded-full bg-slate-100 text-center text-[11px] font-semibold leading-8 text-slate-700">
                  🔓
                </div>
                <div>
                  <div className="font-semibold text-slate-900">No device lock</div>
                  <div className="text-xs text-slate-500">
                    Practice mode only. We won’t lock your device or block other apps.
                  </div>
                </div>
              </div>
            </div>
          </div>

          {error ? <div className="mt-5 text-sm text-red-600">Error: {error}</div> : null}

          <button
            onClick={startAttempt}
            disabled={loading}
            className="mt-10 rounded-full bg-blue-600 px-6 py-2 text-sm font-semibold text-white shadow hover:bg-blue-700 disabled:opacity-60"
          >
            {loading ? "Starting..." : "Start test"}
          </button>
        </div>
      </div>
    );
  }

  if (loading) return <div className="p-6 text-sm text-slate-500">Loading mock exam...</div>;
  if (error) return <div className="p-6 text-sm text-red-600">Error: {error}</div>;

  if (reviewMode) {
    const title =
      module?.subject === "verbal" ? `Reading and Writing` : `Math`;
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-6 pb-24">
        <div className="mx-auto max-w-5xl space-y-6 text-center">
          <header className="rounded-2xl bg-white p-4 shadow-sm text-left">
            <div className="grid items-center gap-3 md:grid-cols-[1fr_auto_1fr]">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
                {module ? `${module.subject.toUpperCase()} Module ${module.module_index}` : "Mock exam"}
              </div>
              <div className="text-center text-sm font-semibold text-slate-900">{formatTime(timeLeft)}</div>
              <div className="flex items-center justify-end gap-4 text-xs text-slate-600">
                {module?.subject === "verbal" ? (
                  <button className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-semibold text-slate-700">
                    <PenLine size={14} />
                    Highlight
                  </button>
                ) : null}
                <button className="text-slate-500" onClick={() => router.push("/practice/modules")}>
                  Exit
                </button>
              </div>
            </div>
          </header>

          <div className="space-y-2">
            <div className="text-xl font-semibold text-slate-900">Check Your Work</div>
            <p className="text-sm text-slate-500">
              You can go back to any question or move on to the next module.
            </p>
            {timeExpired ? (
              <p className="text-sm font-semibold text-slate-700">Time is up for this module. You can only continue to the next module.</p>
            ) : null}
          </div>

          <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-5 shadow-sm text-left">
                <div className="flex items-center justify-between rounded-xl bg-slate-100 px-3 py-2">
              <div className="text-sm font-semibold text-slate-900">
                Section 1, Module {module?.module_index}: {title}
              </div>
              <div className="flex items-center gap-4 text-xs text-slate-500">
                <div className="flex items-center gap-1">
                  <span className="h-3 w-3 rounded-sm border border-slate-300 bg-white" />
                  Unanswered
                </div>
                <div className="flex items-center gap-1">
                  <span className="h-3 w-3 rounded-sm bg-red-200" />
                  For Review
                </div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-9 gap-2">
              {questions.map((q, idx) => {
                const answered = Boolean(answers[q.id]);
                const flagged = Boolean(reviewFlags[q.id]);
                return (
                  <button
                    key={q.id}
                    className={`h-8 rounded-md text-[11px] font-semibold ${
                      idx === currentQuestion
                        ? "bg-slate-900 text-white"
                        : flagged
                        ? "bg-red-100 text-red-700"
                        : answered
                        ? "bg-emerald-100 text-emerald-700"
                        : "border border-dashed border-slate-300 text-slate-600"
                    }`}
                    onClick={() => {
                      if (timeExpired) return;
                      setCurrentQuestion(idx);
                      setReviewMode(false);
                    }}
                    disabled={timeExpired}
                    type="button"
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="fixed bottom-0 left-0 right-0 border-t bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
            <button
              className={`rounded-lg border px-4 py-2 text-sm ${timeExpired ? "opacity-50 cursor-not-allowed" : ""}`}
              onClick={() => { if (timeExpired) return; setReviewMode(false); }}
              type="button"
              disabled={timeExpired}
            >
              Back
            </button>
            <button
              className="rounded-full border px-5 py-2 text-sm font-semibold text-slate-700"
              type="button"
              onClick={() => { if (navLocked) return; setMapOpen((v) => !v); }}
            >
              {currentQuestion + 1} of {questions.length || 0}
            </button>
            <button
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white"
              onClick={goToNextModule}
              type="button"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (breakMode) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-6">
        <div className="mx-auto flex min-h-screen max-w-4xl flex-col items-center justify-center gap-8 text-center">
          <div className="rounded-2xl bg-white px-8 py-6 shadow-sm">
            <div className="text-xs uppercase tracking-[0.3em] text-slate-400">Break Time</div>
            <div className="mt-2 text-4xl font-semibold text-slate-900">{formatTime(breakSeconds)}</div>
          </div>

          <div className="max-w-lg text-left space-y-2">
            <div className="text-lg font-semibold text-slate-900">Practice Test Break</div>
            <p className="text-sm text-slate-500">
              You can resume this practice test as soon as you're ready to move on. On test day, you'll wait until the
              clock counts down.
            </p>
            <div className="mt-4 text-sm font-semibold text-slate-800">On Test Day...</div>
            <ul className="mt-2 text-xs text-slate-500 space-y-1 list-disc pl-5">
              <li>Do not disturb students who are still testing.</li>
              <li>Do not exit the app or close your laptop.</li>
              <li>Do not access phones, smartwatches, textbooks, notes, or the internet.</li>
              <li>Do not eat or drink near any testing device.</li>
              <li>Do not speak in the testing room; outside the room, do not discuss the exam with anyone.</li>
            </ul>
          </div>

          <button
            onClick={resumeAfterBreak}
            className="rounded-full bg-blue-600 px-6 py-2 text-sm font-semibold text-white shadow hover:bg-blue-700"
          >
            Resume testing
          </button>
        </div>
      </div>
    );
  }

  if (result) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-10">
        <div className="mx-auto max-w-3xl rounded-2xl border bg-white p-6 shadow-sm">
          <div className="text-xl font-semibold">Mock exam submitted</div>
          {result.results_released ? (
            <div className="mt-3 text-sm text-slate-600">
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Module results</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {Object.entries(result.module_scores ?? {}).map(([key, val]: any) => {
                  const [subject, idx] = key.split("-");
                  const label = subject ? `${subject.toUpperCase()} M${idx}` : key;
                  return (
                    <span
                      key={key}
                      className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-700"
                    >
                      {label}: {val.correct}/{val.total}
                    </span>
                  );
                })}
              </div>
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
    <div className="min-h-screen bg-slate-50 px-4 py-6 pb-24">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="grid items-center gap-3 md:grid-cols-[1fr_auto_1fr]">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
              {module ? `${module.subject.toUpperCase()} Module ${module.module_index}` : "Mock exam"}
            </div>
            <div className="text-center text-sm font-semibold text-slate-900">
              {formatTime(timeLeft)}
            </div>
            <div className="flex items-center justify-end gap-4 text-xs text-slate-600">
              {module?.subject === "math" ? (
                <div className="flex items-center gap-2">
                  <button
                    className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-semibold text-slate-700"
                    onClick={() => setSheetOpen(true)}
                  >
                    Reference
                  </button>
                  <button
                    className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-semibold text-slate-700"
                    onClick={openDesmosPopup}
                  >
                    <Calculator size={14} />
                    Calculator
                  </button>
                </div>
              ) : null}
              {module?.subject === "verbal" ? (
                <button
                  className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-semibold ${
                    highlightMode ? "border-slate-900 text-slate-900" : "text-slate-700"
                  }`}
                  onClick={() => setHighlightMode((v) => !v)}
                >
                  <PenLine size={14} />
                  {highlightMode ? "Highlighting" : "Highlight"}
                </button>
              ) : null}
              <button className="text-slate-500" onClick={() => router.push("/practice/modules")}>
                Exit
              </button>
            </div>
          </div>
        </header>

        <div className="relative rounded-2xl bg-white shadow-sm overflow-hidden">
          {navLocked ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/90 text-sm font-semibold text-slate-700">
              Time is up. Moving to the next module...
            </div>
          ) : null}

          {currentQ ? (
            isMath ? (
              <div className="p-6 space-y-6">
                <div className="flex items-center justify-between rounded-xl bg-slate-100 px-3 py-2 text-xs">
                  <div className="flex items-center gap-4">
                    <div className="h-7 w-7 rounded-sm bg-slate-900 text-white text-[11px] font-semibold flex items-center justify-center">
                      {currentQuestion + 1}
                    </div>
                    <button
                      className={`inline-flex items-center gap-2 text-xs ${
                        isMarkedForReview ? "text-slate-900 font-semibold" : "text-slate-600"
                      }`}
                      onClick={() => currentQ && toggleReviewFlag(currentQ.id)}
                    >
                      <Bookmark size={14} fill={isMarkedForReview ? "currentColor" : "none"} />
                      {isMarkedForReview ? "Marked for Review" : "Mark for Review"}
                    </button>
                  </div>
                  <div className="flex items-center gap-4 text-slate-500">
                    <button
                      className={`inline-flex h-8 w-8 items-center justify-center rounded-full border shadow-sm text-[12px] font-bold transition ${
                        eliminateMode ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-900 border-slate-200"
                      }`}
                      onClick={() => {
                        setEliminateMode((v) => {
                          const next = !v;
                          if (next && currentQ) {
                            setEliminations((prev) => ({ ...prev, [currentQ.id]: {} }));
                          }
                          return next;
                        });
                      }}
                      aria-label="Toggle strike mode"
                    >
                      <span className="relative inline-flex h-4 w-4 items-center justify-center">
                        <span className="text-[12px] font-bold leading-none">S</span>
                        <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-current" />
                      </span>
                    </button>
                  </div>
                </div>
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
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm min-h-[110px]"
                    value={answers[currentQ.id] ?? ""}
                    onChange={(e) => setAnswer(e.target.value)}
                    placeholder="Type your answer"
                  />
                ) : (
                  <div className="space-y-2">
                    {(currentQ.choices || []).map((c, idx) => {
                      const choiceLabel = c.label ?? String.fromCharCode(65 + idx);
                      const isEliminated = !!eliminatedForCurrent[choiceLabel];
                      const isSelected = answers[currentQ.id] === choiceLabel;
                      return (
                      <div
                        key={choiceLabel}
                        className={`w-full rounded-xl border px-4 py-3 text-left text-sm transition flex items-center gap-2 ${
                          isSelected ? "border-blue-600 bg-blue-50 shadow-sm" : "border-slate-200"
                        }`}
                        onClick={() => {
                          setAnswer(choiceLabel);
                        }}
                        role="button"
                      >
                        <span
                          className={`inline-flex items-center justify-center h-6 w-6 rounded-full border text-[11px] font-semibold mr-2 ${
                            isSelected ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 text-slate-700"
                          }`}
                        >
                          {choiceLabel}
                        </span>
                        <span className={`relative flex-1 ${isEliminated ? "text-slate-400" : ""}`}>
                          {isEliminated && isMath ? (
                            <span className="pointer-events-none absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-slate-400" />
                          ) : null}
                          <span className={!isMath && isEliminated ? "line-through" : ""}>
                            {renderChoiceContent(c.content || "")}
                          </span>
                        </span>
                        {eliminateMode ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleElimination(currentQ.id, choiceLabel);
                            }}
                            className={`ml-auto relative h-7 w-7 rounded-full border bg-white text-[11px] font-semibold ${
                              isEliminated
                                ? "border-slate-900 text-slate-900"
                                : "border-slate-300 text-slate-500"
                            }`}
                            aria-label={`Eliminate ${choiceLabel}`}
                          >
                            <span className="absolute inset-0 flex items-center justify-center">{choiceLabel}</span>
                            <span className="pointer-events-none absolute inset-x-1.5 top-1/2 h-px -translate-y-1/2 bg-current" />
                          </button>
                        ) : null}
                      </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div className="grid lg:grid-cols-[1fr_1fr]">
                <div className="p-6">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Reading passage</div>
                  <div
                    ref={passageBoxRef}
                    className="mt-4 rounded-xl border border-slate-200 bg-white p-5 text-sm leading-6 text-slate-700 min-h-[340px]"
                    onMouseUp={handleHighlightMouseUp}
                    onClick={(e) => {
                      const target = e.target as HTMLElement;
                      handleHighlightClick("passage", target);
                    }}
                  >
                    {resolvedImageUrl ? (
                      <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 overflow-hidden">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={resolvedImageUrl} alt="question" className="w-full max-h-[240px] object-contain" />
                      </div>
                    ) : null}
                    {currentQ.passage ? <span dangerouslySetInnerHTML={{ __html: passageHtml }} /> : "No passage."}
                  </div>
                </div>
                <div className="border-l border-slate-200 p-6">
                  <div className="flex items-center justify-between rounded-xl bg-slate-100 px-3 py-2 text-xs">
                    <div className="flex items-center gap-4">
                      <div className="h-7 w-7 rounded-sm bg-slate-900 text-white text-[11px] font-semibold flex items-center justify-center">
                        {currentQuestion + 1}
                      </div>
                      <button
                        className={`inline-flex items-center gap-2 text-xs ${
                          isMarkedForReview ? "text-slate-900 font-semibold" : "text-slate-600"
                        }`}
                        onClick={() => currentQ && toggleReviewFlag(currentQ.id)}
                      >
                        <Bookmark size={14} fill={isMarkedForReview ? "currentColor" : "none"} />
                        {isMarkedForReview ? "Marked for Review" : "Mark for Review"}
                      </button>
                    </div>
                    <div className="flex items-center gap-4 text-slate-500">
                      <button
                        className={`inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white shadow-sm text-[12px] font-bold text-slate-900 ${
                          eliminateMode ? "ring-2 ring-slate-400" : ""
                        }`}
                        onClick={() => {
                        setEliminateMode((v) => {
                          const next = !v;
                          if (next && currentQ) {
                            setEliminations((prev) => ({ ...prev, [currentQ.id]: {} }));
                          }
                          return next;
                        });
                      }}
                        aria-label="Toggle strike mode"
                      >
                        <span className="relative inline-flex h-4 w-4 items-center justify-center">
                          <span className="text-[12px] font-bold leading-none">S</span>
                          <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-current" />
                        </span>
                      </button>
                    </div>
                  </div>
                  <div
                    className="mt-4 text-sm font-semibold text-slate-900"
                    onMouseUp={handleHighlightMouseUp}
                    onClick={(e) => {
                      const target = e.target as HTMLElement;
                      handleHighlightClick("stem", target);
                    }}
                  >
                    <span ref={stemBoxRef} dangerouslySetInnerHTML={{ __html: stemHtml }} />
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
                      {(currentQ.choices || []).map((c, idx) => {
                        const choiceLabel = c.label ?? String.fromCharCode(65 + idx);
                        const isEliminated = !!eliminatedForCurrent[choiceLabel];
                        const isSelected = answers[currentQ.id] === choiceLabel;
                        return (
                        <div
                          key={choiceLabel}
                          className={`w-full rounded-xl border px-4 py-3 text-left text-sm transition flex items-center gap-2 ${
                            isSelected ? "border-blue-600 bg-blue-50 shadow-sm" : "border-slate-200"
                          }`}
                          onClick={() => {
                          setAnswer(choiceLabel);
                        }}
                          role="button"
                        >
                          <span
                            className={`inline-flex items-center justify-center h-6 w-6 rounded-full border text-[11px] font-semibold mr-2 ${
                              isSelected ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 text-slate-700"
                            }`}
                          >
                            {choiceLabel}
                          </span>
                          <span className={`relative flex-1 ${isEliminated ? "text-slate-400" : ""}`}>
                            {isEliminated && isMath ? (
                              <span className="pointer-events-none absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-slate-400" />
                            ) : null}
                            <span className={!isMath && isEliminated ? "line-through" : ""}>
                              {renderChoiceContent(c.content || "")}
                            </span>
                          </span>
                          {eliminateMode ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleElimination(currentQ.id, choiceLabel);
                              }}
                              className={`ml-auto relative h-7 w-7 rounded-full border bg-white text-[11px] font-semibold ${
                                isEliminated
                                  ? "border-slate-900 text-slate-900"
                                  : "border-slate-300 text-slate-500"
                              }`}
                              aria-label={`Eliminate ${choiceLabel}`}
                            >
                              <span className="absolute inset-0 flex items-center justify-center">{choiceLabel}</span>
                              <span className="pointer-events-none absolute inset-x-1.5 top-1/2 h-px -translate-y-1/2 bg-current" />
                            </button>
                          ) : null}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )
          ) : (
            <div className="p-6 text-sm text-slate-500">No questions in this module.</div>
          )}
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 border-t bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <button
            className="rounded-lg border px-4 py-2 text-sm"
            onClick={() => setCurrentQuestion((i) => Math.max(0, i - 1))}
            disabled={currentQuestion === 0 || navLocked}
            type="button"
          >
            Previous
          </button>
          <button
            className="rounded-full border px-5 py-2 text-sm font-semibold text-slate-700"
            type="button"
            onClick={() => { if (navLocked) return; setMapOpen((v) => !v); }}
          >
            {currentQuestion + 1} of {questions.length || 0}
          </button>
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

      {/* Desmos opens in a popup window */}

      {sheetOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <button
            className="absolute inset-0"
            onClick={() => setSheetOpen(false)}
            aria-label="Close reference sheet"
            type="button"
          />
          <div className="relative max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-4 py-3 text-sm font-semibold text-slate-700">
              <span>Reference Sheet</span>
              <button className="text-slate-500" onClick={() => setSheetOpen(false)} type="button">
                Close
              </button>
            </div>
            <div className="max-h-[calc(90vh-52px)] overflow-auto p-4">
              {/* Place the image at web/public/reference-sheet.png */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/reference-sheet.png"
                alt="Reference sheet"
                className="w-full h-auto rounded-lg border border-slate-200"
              />
            </div>
          </div>
        </div>
      ) : null}

      {mapOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center pb-24">
          <button
            className="absolute inset-0 bg-black/10"
            onClick={() => setMapOpen(false)}
            type="button"
          />
          <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-900">
                {module ? `${module.subject === "verbal" ? "Reading & Writing" : "Math"} Module ${module.module_index}` : "Module"}
              </div>
              <button className="text-slate-400" onClick={() => setMapOpen(false)} type="button">
                ✕
              </button>
            </div>
            <div className="mt-3 flex items-center gap-4 text-xs text-slate-500">
              <div className="flex items-center gap-1">
                <span className="h-3 w-3 rounded-sm border border-slate-300 bg-white" />
                Unanswered
              </div>
              <div className="flex items-center gap-1">
                <span className="h-3 w-3 rounded-sm bg-red-200" />
                For Review
              </div>
            </div>
            <div className="mt-4 grid grid-cols-9 gap-2">
              {questions.map((q, idx) => {
                const answered = Boolean(answers[q.id]);
                const flagged = Boolean(reviewFlags[q.id]);
                return (
                  <button
                    key={q.id}
                    className={`h-8 rounded-md text-[11px] font-semibold ${
                      idx === currentQuestion
                        ? "bg-slate-900 text-white"
                        : flagged
                        ? "bg-red-100 text-red-700"
                        : answered
                        ? "bg-emerald-100 text-emerald-700"
                        : "border border-dashed border-slate-300 text-slate-600"
                    }`}
                    onClick={() => {
                      setCurrentQuestion(idx);
                      setMapOpen(false);
                    }}
                    type="button"
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
