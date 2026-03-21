"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Bookmark, Calculator, ChevronDown, Clock3, FileText, PenLine } from "lucide-react";
import { typesetMath } from "@/lib/mathjax";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE;

type PracticeModule = {
  id: string;
  subject: "math" | "verbal";
  module_index: number;
  time_limit_minutes: number;
  questions: QuizQuestion[];
};

type Profile = {
  role: string | null;
  is_admin?: boolean | null;
  user?: {
    is_staff?: boolean | null;
    is_superuser?: boolean | null;
    username?: string | null;
  } | null;
};

type QuizQuestion = {
  id: string;
  subject: "math" | "verbal";
  topic: string;
  subtopic?: string | null;
  stem: string;
  passage?: string | null;
  choices?: { label: string; content: string; is_correct?: boolean; image_url?: string | null }[];
  is_open_ended?: boolean | null;
  correct_answer?: string | null;
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
  const latexFlag = "$LATEX$";
  const hasDelims = (val: string) =>
    val.includes("\\(") || val.includes("\\[") || val.includes("$$") || /\$[^$]+\$/.test(val);
  if (trimmed.startsWith(latexFlag)) {
    const content = trimmed.slice(latexFlag.length).trim();
    if (!content) return "";
    return hasDelims(content) ? content : `\\(${content}\\)`;
  }
  if (hasDelims(trimmed)) return trimmed;
  return trimmed;
}

function hasLatexDelims(input: string) {
  return (
    input.includes("\\(") ||
    input.includes("\\[") ||
    input.includes("$$") ||
    /\$[^$]+\$/.test(input)
  );
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

function isTeacherOrAdmin(p: Profile | null) {
  if (!p) return false;
  const role = (p.role ?? "").toLowerCase();
  return (
    role === "teacher" ||
    role === "admin" ||
    !!p.is_admin ||
    !!p.user?.is_staff ||
    !!p.user?.is_superuser
  );
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
  const reviewAttemptParam = search.get("review_attempt");

  const examParam = (search.get("exam") || "").toLowerCase();
  const examLabel = examParam === "act" ? "ACT" : "SAT";

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modules, setModules] = useState<PracticeModule[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [hasToken, setHasToken] = useState(false);
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
  const [resultsReview, setResultsReview] = useState(false);
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
  const [showTimer, setShowTimer] = useState(true);
  const [directionsOpen, setDirectionsOpen] = useState(false);
  const lastQuestionRefresh = useRef(0);

  useEffect(() => {
    let cancelled = false;
    async function loadProfile() {
      try {
        const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
        if (!cancelled) setHasToken(!!token);
        if (!token) return;
        const res = await fetch(`${API_BASE}/api/auth/me/`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) {
          const isAdmin =
            json?.is_admin ?? json?.user?.is_staff ?? json?.user?.is_superuser ?? false;
          setProfile({ role: json?.role ?? null, is_admin: isAdmin, user: json?.user ?? null });
        }
      } catch {
        // ignore
      }
    }
    loadProfile();
    return () => {
      cancelled = true;
    };
  }, []);

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
    setResultsReview(false);
    setResult(null);
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

  async function loadReview(attemptOverride?: string | null) {
    if (!practiceId) return;
    setError(null);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
      if (!token) return;
      const query = attemptOverride
        ? `attempt_id=${encodeURIComponent(attemptOverride)}`
        : `practice_id=${encodeURIComponent(practiceId)}`;
      const res = await fetch(`${API_BASE}/api/module-practice/review/?${query}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const { json, text } = await readResponse(res);
      if (!res.ok) {
        const htmlError = extractHtmlError(text);
        const fallback = text ? text.slice(0, 200) : "Failed to load review";
        throw new Error(json?.error || htmlError || fallback);
      }
      const modulesPayload = json?.modules ?? [];
      const attempt = json?.attempt_id ?? null;
      setModules(modulesPayload);
      setAttemptId(attempt);
      setAnswers(json?.answers ?? {});
      setResult(null);
      setCurrentModule(0);
      setCurrentQuestion(0);
      setResultsReview(true);
      setReviewMode(false);
      setBreakMode(false);
      setTimeExpired(false);
      setEliminateMode(false);
      setHighlightMode(false);
      setHighlightedPassages({});
      setHighlightedStems({});
      setTimeLeft(0);
      setIntroMode(false);
      return true;
    } catch {
      // Ignore when no submitted attempt or results not published.
      return false;
    }
  }

  useEffect(() => {
    if (!practiceId || autoResumeChecked) return;
    if (typeof window === "undefined") return;
    const lastAttempt = localStorage.getItem(getPracticeAttemptKey(practiceId));
    if (reviewAttemptParam) {
      void loadReview(reviewAttemptParam).finally(() => setAutoResumeChecked(true));
      return;
    }
    if (lastAttempt) {
      startAttempt();
      setAutoResumeChecked(true);
      return;
    }
    setAutoResumeChecked(true);
  }, [practiceId, autoResumeChecked, reviewAttemptParam]);

  useEffect(() => {
    if (loading || result || resultsReview || !modules.length) return;
    const id = window.setInterval(() => {
      setTimeLeft((t) => (t > 0 ? t - 1 : 0));
    }, 1000);
    return () => window.clearInterval(id);
  }, [loading, result, resultsReview, modules.length]);

  useEffect(() => {
    if (resultsReview) return;
    if (timeLeft !== 0) return;
    if (submittedRef.current) return;
    if (!modules.length) return;
    setTimeExpired(true);
    finishModule();
  }, [timeLeft, resultsReview]);

  useEffect(() => {
    if (!breakMode) return;
    const id = window.setInterval(() => {
      setBreakSeconds((t) => (t > 0 ? t - 1 : 0));
    }, 1000);
    return () => window.clearInterval(id);
  }, [breakMode]);

  useEffect(() => {
    if (!breakMode) return;
    if (breakSeconds !== 0) return;
    resumeAfterBreak();
  }, [breakMode, breakSeconds]);

  useEffect(() => {
    const current = modules[currentModule];
    if (resultsReview || current?.subject !== "verbal") {
      setHighlightMode(false);
    }
  }, [modules, currentModule, resultsReview]);

  // Calculator opens in a popup window (no API key required).

  useEffect(() => {
    if (!attemptId || introMode || resultsReview) return;
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
    resultsReview,
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
      const target = event.target;
      if (!(target instanceof Element)) return;
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
    if (resultsReview) {
      const next = currentModule + 1;
      if (next < modules.length) {
        setCurrentModule(next);
        setCurrentQuestion(0);
        return;
      }
      router.push("/practice/modules");
      return;
    }
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
    if (resultsReview) return;
    setReviewFlags((prev) => ({ ...prev, [questionId]: !prev[questionId] }));
  }

  function toggleElimination(questionId: string, label: string) {
    if (resultsReview) return;
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
    if (resultsReview) return;
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
      removeBtn.textContent = "X";
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
    if (!highlightMode || resultsReview) return;
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

  function handleHighlightClick(type: "passage" | "stem", target: EventTarget | null) {
    if (resultsReview) return;
    if (!(target instanceof Element)) return;
    const el = target;
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
    setResultsReview(false);
    setResult(json);
  }

  const module = modules[currentModule];
  const questions = module?.questions ?? [];
  const currentQ = questions[currentQuestion];
  const isMath = module?.subject === "math";
  const isVerbal = module?.subject === "verbal";
  const navLocked = !resultsReview && (timeLeft === 0 || timeExpired);
  const isMarkedForReview = currentQ ? !!reviewFlags[currentQ.id] : false;
  const eliminatedForCurrent = currentQ ? eliminations[currentQ.id] || {} : {};
  const imageUrl = currentQ?.image_url;
  const canEditQuestions = profile ? isTeacherOrAdmin(profile) : false;
  const showEditButton = canEditQuestions;
  const sectionTitle = module?.subject === "verbal" ? "Reading and Writing" : "Math";
  const sectionLabel = module?.subject === "verbal" ? "Section I" : "Section II";
  const moduleHeading = module ? `${sectionLabel}, Module ${module.module_index}: ${sectionTitle}` : "Practice Test";
  const headerActionButtonClass =
    "inline-flex items-center gap-2 rounded-md border border-slate-400 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50";
  const activeHighlightButtonClass =
    "inline-flex items-center gap-2 rounded-md border border-slate-900 bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition";
  const directionsCopy = isVerbal
    ? "Read each passage and question carefully, then choose the best answer. You may highlight text and mark questions for review."
    : "Solve each problem and choose the best answer or enter your response. Use the reference sheet or calculator only when helpful.";

  function openQuestionEditor() {
    if (!currentQ) return;
    const returnTo =
      typeof window !== "undefined" ? `${window.location.pathname}${window.location.search}` : "";
    const suffix = returnTo ? `?return=${encodeURIComponent(returnTo)}` : "";
    window.open(`/practice/modules/${practiceId}/questions/${currentQ.id}/edit${suffix}`, "_blank");
  }

  function exitPracticeTest() {
    router.push("/practice/modules");
  }

  async function refreshCurrentQuestion() {
    if (!canEditQuestions || !currentQ || resultsReview) return;
    const now = Date.now();
    if (now - lastQuestionRefresh.current < 1500) return;
    lastQuestionRefresh.current = now;
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
      if (!token) return;
      const res = await fetch(`${API_BASE}/api/module-practice/questions/${currentQ.id}/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const json = await res.json();
      const updated = json?.question;
      if (!updated) return;
      setModules((prev) =>
        prev.map((m) => {
          if (m.id !== module?.id) return m;
          const nextQs = (m.questions || []).map((q) =>
            q.id === currentQ.id
              ? {
                  ...q,
                  stem: updated.question_text ?? q.stem,
                  passage: updated.passage ?? q.passage,
                  choices: updated.choices ?? q.choices,
                  is_open_ended:
                    typeof updated.is_open_ended === "boolean"
                      ? updated.is_open_ended
                      : q.is_open_ended,
                  correct_answer: updated.correct_answer ?? q.correct_answer,
                  image_url: updated.image_url ?? q.image_url,
                }
              : q
          );
          return { ...m, questions: nextQs };
        })
      );
      setHighlightedPassages((prev) => {
        if (!prev[currentQ.id]) return prev;
        const next = { ...prev };
        delete next[currentQ.id];
        return next;
      });
      setHighlightedStems((prev) => {
        if (!prev[currentQ.id]) return prev;
        const next = { ...prev };
        delete next[currentQ.id];
        return next;
      });
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    if (!canEditQuestions || resultsReview) return;
    const handleFocus = () => {
      if (document.hidden) return;
      refreshCurrentQuestion();
    };
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleFocus);
    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleFocus);
    };
  }, [canEditQuestions, currentQ?.id, resultsReview]);
  const resolvedImageUrl =
    imageUrl && imageUrl.startsWith("/") ? `${API_BASE}${imageUrl}` : imageUrl;
  const resolveChoiceImage = (url?: string | null) => {
    if (!url) return null;
    return url.startsWith("/") ? `${API_BASE}${url}` : url;
  };

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

  const reviewStatus = useMemo(() => {
    if (!resultsReview || !currentQ) return null;
    const answer = answers[currentQ.id];
    if (!answer) {
      return { label: "Unanswered", className: "text-slate-400" };
    }
    if (currentQ.is_open_ended) {
      const expected = (currentQ.correct_answer || "").trim().toLowerCase();
      const actual = String(answer || "").trim().toLowerCase();
      if (expected && actual === expected) {
        return { label: "Correct", className: "text-emerald-600" };
      }
      return { label: "Wrong", className: "text-red-600" };
    }
    const correctLabel = (currentQ.choices || []).find((c) => c.is_correct)?.label;
    if (correctLabel && answer === correctLabel) {
      return { label: "Correct", className: "text-emerald-600" };
    }
    return { label: "Wrong", className: "text-red-600" };
  }, [resultsReview, currentQ, answers]);

  const reviewOutcomes = useMemo(() => {
    if (!resultsReview) return null;
    const outcomes: Record<string, "correct" | "wrong" | "unanswered"> = {};
    let correct = 0;
    let wrong = 0;
    let unanswered = 0;
    for (const q of questions) {
      const answer = answers[q.id];
      if (!answer) {
        outcomes[q.id] = "unanswered";
        unanswered += 1;
        continue;
      }
      if (q.is_open_ended) {
        const expected = (q.correct_answer || "").trim().toLowerCase();
        const actual = String(answer || "").trim().toLowerCase();
        if (expected && actual === expected) {
          outcomes[q.id] = "correct";
          correct += 1;
        } else {
          outcomes[q.id] = "wrong";
          wrong += 1;
        }
        continue;
      }
      const correctLabel = (q.choices || []).find((c) => c.is_correct)?.label;
      if (correctLabel && answer === correctLabel) {
        outcomes[q.id] = "correct";
        correct += 1;
      } else {
        outcomes[q.id] = "wrong";
        wrong += 1;
      }
    }
    return { outcomes, correct, wrong, unanswered };
  }, [resultsReview, questions, answers]);


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
    return (
      <div className="min-h-screen bg-white pb-24">
        <div className="w-full">
          <header className="w-full border-b-2 border-dashed border-slate-700 bg-[#e9f0ff] px-6 py-5 text-left md:px-10">
            <div className="grid items-end gap-6 md:grid-cols-[1fr_auto_1fr]">
              <div>
                <div className="text-[28px] font-semibold leading-tight tracking-[-0.01em] text-slate-900 md:text-[30px]">
                  {moduleHeading}
                </div>
                <button
                  className="mt-3 inline-flex items-center gap-1 text-[22px] font-medium text-slate-700 hover:text-slate-900"
                  onClick={() => setDirectionsOpen((v) => !v)}
                  type="button"
                >
                  Directions
                  <ChevronDown
                    size={16}
                    className={`transition-transform ${directionsOpen ? "rotate-180" : ""}`}
                  />
                </button>
              </div>
              <div className="flex flex-col items-center gap-2 self-start">
                <div className="flex min-h-5 items-center justify-center text-[22px] font-semibold text-slate-900">
                  {showTimer ? formatTime(timeLeft) : <Clock3 size={18} className="text-slate-500" />}
                </div>
                <button
                  className="rounded-full border border-slate-400 bg-white px-6 py-2 text-base font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                  onClick={() => setShowTimer((v) => !v)}
                  type="button"
                >
                  {showTimer ? "Hide" : "Show"}
                </button>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-3 text-xs text-slate-700">
                {showEditButton && currentQ ? (
                  <button className={headerActionButtonClass} onClick={openQuestionEditor} type="button">
                    <PenLine size={14} />
                    Edit question
                  </button>
                ) : null}
                <button className={headerActionButtonClass} onClick={exitPracticeTest} type="button">
                  <FileText size={14} />
                  Exit
                </button>
              </div>
            </div>
            {directionsOpen ? (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-white/90 p-4 text-sm leading-6 text-slate-700">
                {directionsCopy}
              </div>
            ) : null}
          </header>

          <div className="space-y-6 px-4 py-6 text-center md:px-8">
            <div className="space-y-2">
              <div className="text-xl font-semibold text-slate-900">Check Your Work</div>
              <p className="text-sm text-slate-500">
                You can go back to any question or move on to the next module.
              </p>
              {timeExpired ? (
                <p className="text-sm font-semibold text-slate-700">Time is up for this module. You can only continue to the next module.</p>
              ) : null}
            </div>

            <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm">
                  <div className="flex items-center justify-between rounded-xl bg-slate-100 px-3 py-2">
                <div className="text-sm font-semibold text-slate-900">
                  {moduleHeading}
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
        </div>

        <div className="fixed bottom-0 left-0 right-0 border-t-2 border-dashed border-slate-500 bg-[#e8f0ff]/95 backdrop-blur">
          <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-3 px-6 py-3 md:px-10">
            <div className="flex items-center gap-3 truncate text-left text-sm font-semibold text-slate-800">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/Victory.PNG" alt="Victory College" className="h-9 w-9 rounded-full object-contain" />
              <span className="truncate">Victory College - Ilyas Yagubov</span>
            </div>
            <button
              className="justify-self-center rounded-xl bg-slate-900 px-5 py-2 text-sm font-semibold text-white shadow-sm"
              type="button"
              onClick={() => {
                if (navLocked) return;
                setMapOpen((v) => !v);
              }}
            >
              Question {currentQuestion + 1} of {questions.length || 0}
            </button>
            <div className="justify-self-end">
              <button
                className="rounded-full bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
                onClick={goToNextModule}
                type="button"
              >
                Next
              </button>
            </div>
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
            <div className="text-[24px] font-semibold leading-[1.35] text-slate-900">Practice Test Break</div>
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

  if (result && !resultsReview) {
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
            {result.results_released ? (
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  className="rounded-lg border border-slate-900 px-4 py-2 text-sm font-semibold text-slate-900"
                  onClick={() => loadReview(attemptId)}
                  type="button"
                >
                  Review answers
                </button>
                <button
                  className="rounded-lg border px-4 py-2 text-sm font-semibold text-slate-700"
                  onClick={() => {
                    if (!attemptId) return;
                    router.push(
                      `/score-report?source=practice&practice_id=${encodeURIComponent(
                        practiceId
                      )}&attempt_id=${encodeURIComponent(attemptId)}`
                    );
                  }}
                  type="button"
                >
                  View score report
                </button>
              </div>
            ) : null}
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
      <div className="min-h-screen bg-white pb-24">
      <div className="w-full">
        <header className="w-full border-b-2 border-dashed border-slate-700 bg-[#e9f0ff] px-6 py-5 md:px-10">
          <div className="grid items-end gap-6 md:grid-cols-[1fr_auto_1fr]">
            <div className="text-left">
              <div className="text-[28px] font-semibold leading-tight tracking-[-0.01em] text-slate-900 md:text-[30px]">
                {moduleHeading}
              </div>
              <button
                className="mt-3 inline-flex items-center gap-1 text-[22px] font-medium text-slate-700 hover:text-slate-900"
                onClick={() => setDirectionsOpen((v) => !v)}
                type="button"
              >
                Directions
                <ChevronDown
                  size={16}
                  className={`transition-transform ${directionsOpen ? "rotate-180" : ""}`}
                />
              </button>
            </div>
            <div className="flex flex-col items-center gap-2 self-start">
              <div className="flex min-h-5 items-center justify-center text-[22px] font-semibold text-slate-900">
                {resultsReview ? "Review" : showTimer ? formatTime(timeLeft) : <Clock3 size={18} className="text-slate-500" />}
              </div>
              {!resultsReview ? (
                <button
                  className="rounded-full border border-slate-400 bg-white px-6 py-2 text-base font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                  onClick={() => setShowTimer((v) => !v)}
                  type="button"
                >
                  {showTimer ? "Hide" : "Show"}
                </button>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-3 text-xs text-slate-700">
              {module?.subject === "verbal" && !resultsReview ? (
                <button
                  className={highlightMode ? activeHighlightButtonClass : headerActionButtonClass}
                  onClick={() => setHighlightMode((v) => !v)}
                  type="button"
                >
                  <PenLine size={14} />
                  <span>Highlights</span>
                </button>
              ) : null}
              {module?.subject === "math" && !resultsReview ? (
                <button
                  className={headerActionButtonClass}
                  onClick={() => setSheetOpen(true)}
                  type="button"
                >
                  <FileText size={14} />
                  Reference
                </button>
              ) : null}
              {module?.subject === "math" && !resultsReview ? (
                <button className={headerActionButtonClass} onClick={openDesmosPopup} type="button">
                  <Calculator size={14} />
                  Calculator
                </button>
              ) : null}
              {showEditButton && currentQ ? (
                <button className={headerActionButtonClass} onClick={openQuestionEditor} type="button">
                  <PenLine size={14} />
                  Edit question
                </button>
              ) : null}
              <button className={headerActionButtonClass} onClick={exitPracticeTest} type="button">
                <FileText size={14} />
                Exit
              </button>
            </div>
          </div>
          {directionsOpen ? (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-white/90 p-4 text-left text-sm leading-6 text-slate-700">
              {directionsCopy}
            </div>
          ) : null}
        </header>

        <div className="px-4 py-6 md:px-8">
        <div className="relative w-full overflow-hidden rounded-2xl bg-transparent shadow-none">
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
                      {!resultsReview ? (
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
                    ) : null}
                  </div>
                </div>
                {resolvedImageUrl ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={resolvedImageUrl} alt="question" className="w-full max-h-[420px] object-contain" />
                  </div>
                ) : null}

                <div className="text-[19px] font-semibold leading-[1.35] text-slate-900 md:text-[20px]">
                  <MathContent html={stemHtml} />
                </div>
                {resultsReview && reviewStatus ? (
                  <div className={`text-xs font-semibold ${reviewStatus.className}`}>
                    {reviewStatus.label}
                  </div>
                ) : null}

                {currentQ.is_open_ended ? (
                  <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
                    {!resultsReview ? (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
                        <div className="text-base font-semibold text-slate-900">Student-produced response help</div>
                        <ul className="mt-3 list-disc space-y-2 pl-5 marker:text-slate-500">
                          <li>If there is more than one correct answer, enter only one answer. Use the positive answer or the largest answer.</li>
                          <li>If your answer is a fraction, write it in decimal form.</li>
                          <li>Round to the next non-zero digit when needed.</li>
                        </ul>
                        <div className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Examples</div>
                        <div className="mt-2 space-y-2 text-sm">
                          <div><span className="font-semibold text-slate-900">1/2</span> {"->"} <span className="font-semibold text-slate-900">0.5</span></div>
                          <div><span className="font-semibold text-slate-900">2/3</span> {"->"} <span className="font-semibold text-slate-900">0.67</span></div>
                          <div><span className="font-semibold text-slate-900">5/4</span> {"->"} <span className="font-semibold text-slate-900">1.25</span></div>
                          <div><span className="font-semibold text-slate-900">1/3</span> {"->"} <span className="font-semibold text-slate-900">0.33</span></div>
                          <div><span className="font-semibold text-slate-900">7/222</span> {"->"} <span className="font-semibold text-slate-900">0.032</span></div>
                        </div>
                      </div>
                    ) : null}
                    <div className="space-y-2">
                      <textarea
                        className="w-full rounded-xl border border-slate-200 px-4 py-3 text-xl min-h-[140px]"
                        value={answers[currentQ.id] ?? ""}
                        onChange={(e) => setAnswer(e.target.value)}
                        placeholder="Type your answer"
                        readOnly={resultsReview}
                      />
                      {resultsReview ? (
                        <div className="text-xs text-slate-600">
                          Correct answer:{" "}
                          <span className="font-semibold text-emerald-700">
                            {currentQ.correct_answer || "-"}
                          </span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {(currentQ.choices || []).map((c, idx) => {
                      const choiceLabel = c.label ?? String.fromCharCode(65 + idx);
                      const isEliminated = !resultsReview && !!eliminatedForCurrent[choiceLabel];
                      const isSelected = answers[currentQ.id] === choiceLabel;
                      const isCorrect = resultsReview && !!c.is_correct;
                      const isWrong = resultsReview && isSelected && !c.is_correct;
                      const isChosenCorrect = resultsReview && isSelected && !!c.is_correct;
                      return (
                      <div
                        key={choiceLabel}
                        className={`w-full rounded-xl border px-4 py-3 text-left text-sm transition flex items-center gap-2 ${
                          isCorrect
                            ? "border-emerald-500 bg-emerald-50"
                            : isWrong
                            ? "border-red-500 bg-red-50"
                            : isSelected
                            ? "border-blue-600 bg-blue-50 shadow-sm"
                            : "border-slate-200"
                        }`}
                        onClick={() => {
                          if (resultsReview) return;
                          setAnswer(choiceLabel);
                        }}
                        role="button"
                      >
                        <span
                          className={`inline-flex items-center justify-center h-9 w-9 rounded-full border text-sm font-semibold mr-3 ${
                            isCorrect
                              ? "border-emerald-600 bg-emerald-600 text-white"
                              : isWrong
                              ? "border-red-600 bg-red-600 text-white"
                              : isChosenCorrect
                              ? "border-emerald-600 bg-emerald-600 text-white"
                              : isSelected
                              ? "border-blue-600 bg-blue-600 text-white"
                              : "border-slate-300 text-slate-700"
                          }`}
                        >
                          {choiceLabel}
                        </span>
                        <div className={`relative flex-1 ${isEliminated ? "text-slate-400" : ""}`}>
                          {isEliminated && isMath ? (
                            <span className="pointer-events-none absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-slate-400" />
                          ) : null}
                          <span className={!isMath && isEliminated ? "line-through" : ""}>
                            {renderChoiceContent(c.content || "")}
                          </span>
                          {c.image_url ? (
                            <div className="mt-2">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={resolveChoiceImage(c.image_url) || ""}
                                alt={`Choice ${choiceLabel}`}
                                className="max-h-40 rounded-md border border-slate-200 object-contain"
                              />
                            </div>
                          ) : null}
                        </div>
                        {resultsReview && isCorrect ? (
                          <span className="text-[10px] font-semibold uppercase text-emerald-600">Correct</span>
                        ) : null}
                        {resultsReview && isWrong ? (
                          <span className="text-[10px] font-semibold uppercase text-red-600">Your choice</span>
                        ) : null}
                        {eliminateMode && !resultsReview ? (
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
              <div className="grid gap-0 lg:grid-cols-[1fr_1fr] w-full">
                  <div className="p-6">
                    <div className="mt-4 rounded-xl border border-transparent bg-transparent p-5">
                      {resolvedImageUrl ? (
                        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 overflow-hidden">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={resolvedImageUrl}
                            alt="question"
                            className="w-full max-h-[360px] object-contain"
                          />
                        </div>
                      ) : null}
                      <div
                        ref={passageBoxRef}
                        className="min-h-[340px] w-full text-[25px] leading-[1.65] text-slate-700"
                        style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
                        onMouseUp={handleHighlightMouseUp}
                        onClick={(e) => {
                          const target = e.target as HTMLElement;
                          handleHighlightClick("passage", target);
                        }}
                      >
                        {currentQ.passage ? (
                          <span dangerouslySetInnerHTML={{ __html: passageHtml }} />
                        ) : (
                          "No passage."
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="border-l border-slate-200 p-6 w-full">
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
                        {!resultsReview ? (
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
                      ) : null}
                    </div>
                  </div>
                    <div
                      className="mt-4 text-[19px] font-semibold text-slate-900 font-serif leading-[1.35] md:text-[20px]"
                    onMouseUp={handleHighlightMouseUp}
                    onClick={(e) => {
                      const target = e.target as HTMLElement;
                      handleHighlightClick("stem", target);
                    }}
                  >
                    <span ref={stemBoxRef} dangerouslySetInnerHTML={{ __html: stemHtml }} />
                  </div>
                  {resultsReview && reviewStatus ? (
                    <div className={`mt-2 text-xs font-semibold ${reviewStatus.className}`}>
                      {reviewStatus.label}
                    </div>
                  ) : null}

                  {currentQ.is_open_ended ? (
                    <div className="mt-4 space-y-2">
                      <textarea
                        className="w-full rounded-xl border border-slate-200 px-4 py-3 text-xl min-h-[140px]"
                        value={answers[currentQ.id] ?? ""}
                        onChange={(e) => setAnswer(e.target.value)}
                        placeholder="Type your answer"
                        readOnly={resultsReview}
                      />
                      {resultsReview ? (
                        <div className="text-xs text-slate-600">
                          Correct answer:{" "}
                          <span className="font-semibold text-emerald-700">
                            {currentQ.correct_answer || "—"}
                          </span>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="mt-4 space-y-3">
                      {(currentQ.choices || []).map((c, idx) => {
                        const choiceLabel = c.label ?? String.fromCharCode(65 + idx);
                        const isEliminated = !resultsReview && !!eliminatedForCurrent[choiceLabel];
                        const isSelected = answers[currentQ.id] === choiceLabel;
                        const isCorrect = resultsReview && !!c.is_correct;
                        const isWrong = resultsReview && isSelected && !c.is_correct;
                        const isChosenCorrect = resultsReview && isSelected && !!c.is_correct;
                        return (
                        <div
                          key={choiceLabel}
                          className={`w-full rounded-xl border px-4 py-3 text-left text-sm transition flex items-center gap-2 ${
                            isCorrect
                              ? "border-emerald-500 bg-emerald-50"
                              : isWrong
                              ? "border-red-500 bg-red-50"
                              : isSelected
                              ? "border-blue-600 bg-blue-50 shadow-sm"
                              : "border-slate-200"
                          }`}
                          onClick={() => {
                          if (resultsReview) return;
                          setAnswer(choiceLabel);
                        }}
                          role="button"
                        >
                          <span
                            className={`inline-flex items-center justify-center h-9 w-9 rounded-full border text-sm font-semibold mr-3 ${
                              isCorrect
                                ? "border-emerald-600 bg-emerald-600 text-white"
                                : isWrong
                                ? "border-red-600 bg-red-600 text-white"
                                : isChosenCorrect
                                ? "border-emerald-600 bg-emerald-600 text-white"
                                : isSelected
                                ? "border-blue-600 bg-blue-600 text-white"
                                : "border-slate-300 text-slate-700"
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
                          {resultsReview && isCorrect ? (
                            <span className="text-[10px] font-semibold uppercase text-emerald-600">Correct</span>
                          ) : null}
                          {resultsReview && isWrong ? (
                            <span className="text-[10px] font-semibold uppercase text-red-600">Your choice</span>
                          ) : null}
                          {eliminateMode && !resultsReview ? (
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
      </div>

      <div className="fixed bottom-0 left-0 right-0 border-t-2 border-dashed border-slate-500 bg-[#e8f0ff]/95 backdrop-blur">
        <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-3 px-6 py-3 md:px-10">
          <div className="flex items-center gap-3 truncate text-left text-sm font-semibold text-slate-800">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/Victory.PNG" alt="Victory College" className="h-9 w-9 rounded-full object-contain" />
            <span className="truncate">Victory College - Ilyas Yagubov</span>
          </div>
          <button
            className="justify-self-center rounded-xl bg-slate-900 px-5 py-2 text-sm font-semibold text-white shadow-sm"
            type="button"
            onClick={() => {
              if (navLocked) return;
              setMapOpen((v) => !v);
            }}
          >
            Question {currentQuestion + 1} of {questions.length || 0}
          </button>
          <div className="justify-self-end">
            {currentQuestion < questions.length - 1 ? (
              <button
                className="rounded-full bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
                onClick={() => setCurrentQuestion((i) => Math.min(questions.length - 1, i + 1))}
                type="button"
              >
                Next
              </button>
            ) : (
              <button
                className="rounded-full bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
                onClick={finishModule}
                type="button"
              >
                Finish module
              </button>
            )}
          </div>
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
            {resultsReview ? (
              <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-500">
                <div className="flex items-center gap-1">
                  <span className="h-3 w-3 rounded-sm bg-emerald-200" />
                  Correct
                </div>
                <div className="flex items-center gap-1">
                  <span className="h-3 w-3 rounded-sm bg-red-200" />
                  Wrong
                </div>
                <div className="flex items-center gap-1">
                  <span className="h-3 w-3 rounded-sm border border-slate-300 bg-white" />
                  Unanswered
                </div>
              </div>
            ) : (
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
            )}
            <div className="mt-4 grid grid-cols-9 gap-2">
              {questions.map((q, idx) => {
                const answered = Boolean(answers[q.id]);
                const flagged = Boolean(reviewFlags[q.id]);
                const reviewOutcome = reviewOutcomes?.outcomes?.[q.id] ?? null;
                return (
                  <button
                    key={q.id}
                    className={`h-8 rounded-md text-[11px] font-semibold ${
                      idx === currentQuestion
                        ? "bg-slate-900 text-white"
                        : resultsReview && reviewOutcome === "correct"
                        ? "bg-emerald-200 text-emerald-900"
                        : resultsReview && reviewOutcome === "wrong"
                        ? "bg-red-200 text-red-900"
                        : resultsReview && reviewOutcome === "unanswered"
                        ? "border border-dashed border-slate-300 text-slate-600"
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

