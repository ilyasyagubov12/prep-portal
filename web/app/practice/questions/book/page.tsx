"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useSearchParams } from "next/navigation";
import { typesetMath } from "@/lib/mathjax";

type Choice = {
  label: string;
  content: string;
  is_correct?: boolean;
  image_url?: string | null;
};

type Question = {
  id: string;
  subject: string;
  topic: string;
  subtopic?: string | null;
  stem: string;
  passage?: string | null;
  image_url?: string | null;
  choices: Choice[];
  is_open_ended?: boolean | null;
  correct_answer?: string | null;
  difficulty?: string | null;
  published: boolean;
};

const timesTextStyle: CSSProperties = {
  fontFamily: '"Times New Roman", Times, serif',
  fontSize: "14pt",
  lineHeight: "1.45",
};

const timesBoldStyle: CSSProperties = {
  ...timesTextStyle,
  fontWeight: 700,
  lineHeight: "1.35",
};

function resolveAssetUrl(url?: string | null) {
  if (!url) return null;
  if (/^(https?:)?\/\//i.test(url) || url.startsWith("data:")) return url;
  const normalized = url.startsWith("/") ? url : `/${url}`;
  return `${process.env.NEXT_PUBLIC_API_BASE}${normalized}`;
}

function difficultyFillCount(difficulty?: string | null) {
  const value = (difficulty || "").trim().toLowerCase();
  if (!value) return 1;
  if (value.includes("hard") || value.includes("advanced")) return 3;
  if (value.includes("medium") || value.includes("moderate") || value.includes("mid")) return 2;
  if (value.includes("easy") || value.includes("basic") || value.includes("low")) return 1;
  return 2;
}

function stripHtml(html?: string | null) {
  return (html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function estimateChoiceBlockHeight(choices: Choice[], narrow = false) {
  return choices.reduce((total, choice) => {
    const text = stripHtml(choice.content);
    const charsPerLine = narrow ? 24 : 34;
    const lines = Math.max(1, Math.ceil(text.length / charsPerLine));
    return total + lines * 24 + (choice.image_url ? 120 : 0) + 6;
  }, 0);
}

function estimateVerbalRowHeight(question: Question) {
  const passageLines = Math.max(1, Math.ceil(stripHtml(question.passage).length / 42));
  const stemLines = Math.max(2, Math.ceil(stripHtml(question.stem).length / 34));
  const leftHeight = 92 + passageLines * 22 + (question.image_url ? 180 : 0);
  const rightHeight =
    76 +
    stemLines * 24 +
    (question.is_open_ended ? 96 : estimateChoiceBlockHeight(question.choices, false));
  return Math.max(leftHeight, rightHeight) + 34;
}

function estimateMathCardHeight(question: Question) {
  const stemLines = Math.max(2, Math.ceil(stripHtml(question.stem).length / 24));
  const passageLines = Math.max(0, Math.ceil(stripHtml(question.passage).length / 26));
  return (
    84 +
    stemLines * 23 +
    passageLines * 20 +
    (question.image_url ? 180 : 0) +
    (question.is_open_ended ? 96 : estimateChoiceBlockHeight(question.choices, true)) +
    24
  );
}

function packVerbalPages(items: Question[], heights?: Map<string, number>, maxHeight = 930) {
  const pages: Question[][] = [];
  let current: Question[] = [];
  let used = 0;

  for (const item of items) {
    const itemHeight = heights?.get(item.id) ?? estimateVerbalRowHeight(item);
    const nextHeight = itemHeight + (current.length ? 8 : 0);
    if (current.length && used + nextHeight > maxHeight) {
      pages.push(current);
      current = [item];
      used = Math.min(itemHeight, maxHeight);
    } else {
      current.push(item);
      used += nextHeight;
    }
  }

  if (current.length) pages.push(current);
  return pages;
}

function packMathPages(items: Question[], heights?: Map<string, number>, columnHeight = 930) {
  const pages: { left: Question[]; right: Question[] }[] = [];
  let left: Question[] = [];
  let right: Question[] = [];
  let leftHeight = 0;
  let rightHeight = 0;
  let fillingRight = false;

  const flush = () => {
    if (left.length || right.length) pages.push({ left, right });
    left = [];
    right = [];
    leftHeight = 0;
    rightHeight = 0;
    fillingRight = false;
  };

  for (const item of items) {
    const itemHeight = heights?.get(item.id) ?? estimateMathCardHeight(item);
    if (!fillingRight) {
      if (left.length && leftHeight + itemHeight > columnHeight) {
        fillingRight = true;
      } else {
        left.push(item);
        leftHeight += itemHeight;
        continue;
      }
    }

    if (right.length && rightHeight + itemHeight > columnHeight) {
      flush();
      left.push(item);
      leftHeight += itemHeight;
      continue;
    }

    right.push(item);
    rightHeight += itemHeight;
  }

  flush();
  return pages;
}

function HtmlBlock({
  html,
  className,
  style,
}: {
  html?: string | null;
  className?: string;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.innerHTML = (html || "").replace(/\n/g, "<br/>");
    typesetMath(ref.current);
  }, [html]);

  return <div ref={ref} className={className} style={style} />;
}

function HeaderStrip({ useFallbackHeader, setUseFallbackHeader }: { useFallbackHeader: boolean; setUseFallbackHeader: (value: boolean) => void }) {
  return (
    <div className="flex h-[56px] items-center overflow-hidden border-b-2 border-[#2f3b4e] bg-white">
      {!useFallbackHeader ? (
        <img
          src="/question-book-header.png"
          alt="Question book header"
          className="h-full w-full object-cover"
          onError={() => setUseFallbackHeader(true)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-[#f3f7ff]">
          <img src="/Victory.PNG" alt="Victory" className="h-10 w-auto object-contain" />
        </div>
      )}
    </div>
  );
}

function NumberBadge({ index, difficulty }: { index: number; difficulty?: string | null }) {
  const fill = difficultyFillCount(difficulty);
  return (
    <div className="mb-4 flex items-center justify-between rounded-full border-[3px] border-[#2c5fff] bg-[#eef4ff] px-4 py-2 text-[#2c5fff]">
      <span style={{ ...timesBoldStyle, fontSize: "18pt" }}>{index}</span>
      <div className="flex items-center gap-1.5">
        {Array.from({ length: 3 }).map((_, idx) => (
          <span
            key={idx}
            className={`h-4 w-4 border-2 border-[#2c5fff] ${idx < fill ? "bg-[#2c5fff]" : "bg-white"}`}
          />
        ))}
      </div>
    </div>
  );
}

function VerbalRow({
  question,
  index,
  dataQuestionId,
  showTopBorder = true,
}: {
  question: Question;
  index: number;
  dataQuestionId?: string;
  showTopBorder?: boolean;
}) {
  const imageUrl = resolveAssetUrl(question.image_url);
  return (
    <section
      data-question-id={dataQuestionId}
      className={`question-row grid grid-cols-[1fr_1fr] gap-0 ${showTopBorder ? "border-t-2 border-dotted border-[#2c5fff]" : ""}`}
    >
      <div className="border-r-[3px] border-[#2c5fff] py-6 pr-6">
        <NumberBadge index={index} difficulty={question.difficulty} />
        {imageUrl ? (
          <div className="mb-4 overflow-hidden rounded-[16px] border border-[#d9e4ff] bg-white p-2">
            <img src={imageUrl} alt="Question" className="max-h-[118px] w-full object-contain" />
          </div>
        ) : null}
        <HtmlBlock html={question.passage || ""} style={timesTextStyle} className="text-slate-950" />
      </div>
      <div className="py-6 pl-6">
        <HtmlBlock html={question.stem} style={timesBoldStyle} className="text-slate-950" />
        {question.is_open_ended ? null : (
          <ol className="mt-4 space-y-1 text-slate-950" style={timesTextStyle}>
            {question.choices.map((choice) => {
              const choiceImageUrl = resolveAssetUrl(choice.image_url);
              return (
                <li key={`${question.id}-${choice.label}`} className="list-none">
                  <div className="flex gap-3">
                    <div className="w-8 shrink-0" style={timesTextStyle}>{choice.label})</div>
                    <div className="min-w-0 flex-1">
                      <HtmlBlock html={choice.content} style={timesTextStyle} className="text-slate-950" />
                      {choiceImageUrl ? (
                        <div className="mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white p-2">
                          <img src={choiceImageUrl} alt={`Choice ${choice.label}`} className="max-h-[96px] w-full object-contain" />
                        </div>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}

function MathCard({
  question,
  index,
  dataQuestionId,
}: {
  question: Question;
  index: number;
  dataQuestionId?: string;
}) {
  const imageUrl = resolveAssetUrl(question.image_url);
  return (
    <section data-question-id={dataQuestionId} className="break-inside-avoid rounded-[8px] pb-4">
      <NumberBadge index={index} difficulty={question.difficulty} />
      {imageUrl ? (
        <div className="mb-3 overflow-hidden rounded-[16px] border border-[#d9e4ff] bg-white p-2">
          <img src={imageUrl} alt="Question" className="max-h-[126px] w-full object-contain" />
        </div>
      ) : null}
      {question.passage ? <HtmlBlock html={question.passage} style={timesTextStyle} className="mb-3 text-slate-950" /> : null}
      <HtmlBlock html={question.stem} style={timesBoldStyle} className="text-slate-950" />
      {question.is_open_ended ? null : (
        <ol className="mt-3 space-y-1 text-slate-950" style={timesTextStyle}>
          {question.choices.map((choice) => {
            const choiceImageUrl = resolveAssetUrl(choice.image_url);
            return (
              <li key={`${question.id}-${choice.label}`} className="list-none">
                <div className="flex gap-3">
                  <div className="w-8 shrink-0" style={timesTextStyle}>{choice.label})</div>
                  <div className="min-w-0 flex-1">
                    <HtmlBlock html={choice.content} style={timesTextStyle} className="text-slate-950" />
                    {choiceImageUrl ? (
                      <div className="mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white p-2">
                        <img src={choiceImageUrl} alt={`Choice ${choice.label}`} className="max-h-[96px] w-full object-contain" />
                      </div>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function QuestionBookContent() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [useFallbackHeader, setUseFallbackHeader] = useState(false);
  const [layoutReady, setLayoutReady] = useState(false);
  const [verbalPages, setVerbalPages] = useState<Question[][]>([]);
  const [mathPages, setMathPages] = useState<{ left: Question[]; right: Question[] }[]>([]);
  const verbalMeasureRef = useRef<HTMLDivElement | null>(null);
  const mathMeasureRef = useRef<HTMLDivElement | null>(null);

  const subject = (searchParams.get("subject") || "").toLowerCase();
  const topic = searchParams.get("topic") || "";
  const subtopic = searchParams.get("subtopic") || "";
  const q = searchParams.get("q") || "";
  const idsParam = searchParams.get("ids") || "";
  const ids = useMemo(
    () => idsParam.split(",").map((value) => value.trim()).filter(Boolean),
    [idsParam]
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);

      const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
      if (!token) {
        if (!cancelled) {
          setError("Not logged in.");
          setLoading(false);
        }
        return;
      }

      try {
        const me = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/api/auth/me/`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const meJson = await me.json().catch(() => null);
        const role = (meJson?.role || "").toLowerCase();
        const isStaff = !!meJson?.is_admin || role === "admin" || role === "teacher";
        if (!me.ok || !isStaff) throw new Error("Only admin or teacher can export question books.");

        const params = new URLSearchParams();
        if (subject) params.set("subject", subject);
        if (topic) params.set("topic", topic);
        if (subtopic) params.set("subtopic", subtopic);
        if (q) params.set("q", q);
        if (ids.length) params.set("ids", ids.join(","));

        const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/api/questions/?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) throw new Error(json?.error || "Failed to load questions for export.");

        let nextQuestions: Question[] = json?.questions ?? [];
        if (ids.length) {
          const order = new Map(ids.map((id, index) => [id, index]));
          nextQuestions = nextQuestions
            .slice()
            .sort((a, b) => (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.id) ?? Number.MAX_SAFE_INTEGER));
        }

        if (!cancelled) setQuestions(nextQuestions);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Failed to build question book.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ids, q, subject, subtopic, topic]);

  const summary = useMemo(() => {
    const parts = [];
    if (subject) parts.push(subject === "math" ? "Math" : "Verbal");
    if (topic) parts.push(topic);
    if (subtopic) parts.push(subtopic);
    if (q) parts.push(`Search: ${q}`);
    if (ids.length) parts.push(`${ids.length} selected question${ids.length === 1 ? "" : "s"}`);
    return parts.join(" • ");
  }, [ids.length, q, subject, subtopic, topic]);

  const verbalQuestions = useMemo(() => questions.filter((question) => question.subject !== "math"), [questions]);
  const mathQuestions = useMemo(() => questions.filter((question) => question.subject === "math"), [questions]);
  const verbalIndexById = useMemo(
    () => new Map(verbalQuestions.map((question, index) => [question.id, index + 1])),
    [verbalQuestions]
  );
  const mathIndexById = useMemo(
    () => new Map(mathQuestions.map((question, index) => [question.id, index + 1])),
    [mathQuestions]
  );

  useEffect(() => {
    if (!questions.length) {
      setVerbalPages([]);
      setMathPages([]);
      setLayoutReady(true);
      return;
    }

    let cancelled = false;

    const waitForImages = async (root: HTMLElement | null) => {
      const images = Array.from(root?.querySelectorAll("img") || []);
      await Promise.all(
        images.map(
          (image) =>
            new Promise<void>((resolve) => {
              if (image.complete) {
                resolve();
                return;
              }
              image.addEventListener("load", () => resolve(), { once: true });
              image.addEventListener("error", () => resolve(), { once: true });
            })
        )
      );
    };

    const measure = async () => {
      setLayoutReady(false);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      await Promise.all([waitForImages(verbalMeasureRef.current), waitForImages(mathMeasureRef.current)]);
      await new Promise((resolve) => setTimeout(resolve, 60));
      if (cancelled) return;

      const verbalHeights = new Map<string, number>();
      verbalMeasureRef.current
        ?.querySelectorAll<HTMLElement>("[data-question-id]")
        .forEach((element) => verbalHeights.set(element.dataset.questionId || "", element.getBoundingClientRect().height));

      const mathHeights = new Map<string, number>();
      mathMeasureRef.current
        ?.querySelectorAll<HTMLElement>("[data-question-id]")
        .forEach((element) => mathHeights.set(element.dataset.questionId || "", element.getBoundingClientRect().height));

      if (cancelled) return;

      setVerbalPages(packVerbalPages(verbalQuestions, verbalHeights));
      setMathPages(packMathPages(mathQuestions, mathHeights));
      setLayoutReady(true);
    };

    void measure();

    return () => {
      cancelled = true;
    };
  }, [mathQuestions, questions.length, verbalQuestions]);

  return (
    <>
      <style jsx global>{`
        @page {
          size: A4 portrait;
          margin: 0;
        }

        html,
        body {
          background: white;
        }

        @media print {
          html,
          body {
            background: white !important;
          }

          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .no-print {
            display: none !important;
          }

          .print-page {
            box-shadow: none !important;
            margin: 0 !important;
            width: 210mm !important;
            height: 297mm !important;
            min-height: 297mm !important;
            max-width: none !important;
            border: 0 !important;
            background: white !important;
            overflow: hidden !important;
            page-break-after: always;
          }

          .print-page:last-child {
            page-break-after: auto;
          }
        }
      `}</style>

      <div className="min-h-screen bg-white px-4 py-6 text-slate-900">
        <div className="no-print mx-auto mb-4 flex max-w-[1080px] flex-wrap items-center justify-between gap-3 rounded-[24px] border border-slate-200 bg-white px-5 py-4 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <div>
            <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Question Bank</div>
            <h1 className="mt-1 text-2xl font-bold">PDF Book Export</h1>
            <div className="mt-1 text-sm text-slate-500">{summary || "All matching questions"}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/practice/questions/manage"
              className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Back
            </Link>
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-full bg-[#1f4fbf] px-4 py-2 text-sm font-semibold text-white hover:bg-[#173d96]"
            >
              Print / Save as PDF
            </button>
          </div>
        </div>

        {questions.length ? (
          <div className="fixed left-[-10000px] top-0 z-[-1] opacity-0 pointer-events-none" aria-hidden="true">
            <div ref={verbalMeasureRef} className="w-[182mm] bg-white px-[14mm] py-[12mm]">
              {verbalQuestions.map((question, idx) => (
                <VerbalRow
                  key={`measure-verbal-${question.id}`}
                  question={question}
                  index={idx + 1}
                  dataQuestionId={question.id}
                  showTopBorder={idx > 0}
                />
              ))}
            </div>
            <div ref={mathMeasureRef} className="w-[84mm] bg-white px-0 py-0">
              {mathQuestions.map((question, idx) => (
                <MathCard
                  key={`measure-math-${question.id}`}
                  question={question}
                  index={idx + 1}
                  dataQuestionId={question.id}
                />
              ))}
            </div>
          </div>
        ) : null}

        {loading ? (
          <div className="mx-auto max-w-[1080px] rounded-[24px] border border-slate-200 bg-white px-5 py-12 text-center text-sm text-slate-500 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
            Preparing question book...
          </div>
        ) : error ? (
          <div className="mx-auto max-w-[1080px] rounded-[24px] border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
            {error}
          </div>
        ) : questions.length === 0 ? (
          <div className="mx-auto max-w-[1080px] rounded-[24px] border border-dashed border-slate-200 bg-white px-5 py-12 text-center text-sm text-slate-500 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
            No questions matched the current export filters.
          </div>
        ) : !layoutReady ? (
          <div className="mx-auto max-w-[1080px] rounded-[24px] border border-slate-200 bg-white px-5 py-12 text-center text-sm text-slate-500 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
            Laying out printable pages...
          </div>
        ) : (
          <div className="space-y-6">
            {verbalPages.map((page, pageIndex) => (
              <div
                key={`verbal-page-${pageIndex}`}
                className="print-page mx-auto flex w-[210mm] min-h-[297mm] flex-col overflow-hidden border-[2px] border-slate-900 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.10)]"
              >
                <HeaderStrip useFallbackHeader={useFallbackHeader} setUseFallbackHeader={setUseFallbackHeader} />
                <div className="flex-1 bg-white px-[14mm] py-[12mm]">
                  {page.map((question, idx) => (
                    <VerbalRow
                      key={question.id}
                      question={question}
                      index={verbalIndexById.get(question.id) || idx + 1}
                      showTopBorder={idx > 0}
                    />
                  ))}
                </div>
              </div>
            ))}

            {mathPages.map((page, pageIndex) => (
              <div
                key={`math-page-${pageIndex}`}
                className="print-page mx-auto flex w-[210mm] min-h-[297mm] flex-col overflow-hidden border-[2px] border-slate-900 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.10)]"
              >
                <HeaderStrip useFallbackHeader={useFallbackHeader} setUseFallbackHeader={setUseFallbackHeader} />
                <div className="flex flex-1 gap-x-8 bg-white px-[14mm] py-[12mm]">
                  <div className="flex-1 space-y-4">
                    {page.left.map((question) => (
                      <MathCard
                        key={question.id}
                        question={question}
                        index={mathIndexById.get(question.id) || 1}
                      />
                    ))}
                  </div>
                  <div className="flex-1 space-y-4">
                    {page.right.map((question) => (
                      <MathCard
                        key={question.id}
                        question={question}
                        index={mathIndexById.get(question.id) || 1}
                      />
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

export default function QuestionBookPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-white px-4 py-6 text-slate-900">
          <div className="mx-auto max-w-[1080px] rounded-[24px] border border-slate-200 bg-white px-5 py-12 text-center text-sm text-slate-500 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
            Preparing question book...
          </div>
        </div>
      }
    >
      <QuestionBookContent />
    </Suspense>
  );
}
