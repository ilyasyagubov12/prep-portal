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
  fontSize: "12pt",
  lineHeight: "1.45",
};

const timesBoldStyle: CSSProperties = {
  ...timesTextStyle,
  fontWeight: 700,
  lineHeight: "1.25",
};

const mathTextStyle: CSSProperties = {
  fontFamily: '"Times New Roman", Times, serif',
  fontSize: "18pt",
  lineHeight: "1.4",
};

const mathBoldStyle: CSSProperties = {
  ...mathTextStyle,
  fontWeight: 700,
  lineHeight: "1.2",
};

function getCorrectAnswer(question: Question) {
  if (question.is_open_ended) {
    return stripHtml(question.correct_answer) || "—";
  }

  const markedChoice = question.choices.find((choice) => choice.is_correct);
  if (markedChoice?.label) return markedChoice.label;

  const normalized = (question.correct_answer || "").trim();
  if (!normalized) return "—";

  const matchingLabel = question.choices.find(
    (choice) => choice.label.trim().toUpperCase() === normalized.toUpperCase()
  );
  if (matchingLabel?.label) return matchingLabel.label;

  return stripHtml(normalized) || "—";
}

function resolveAssetUrl(url?: string | null) {
  if (!url) return null;
  if (/^(https?:)?\/\//i.test(url) || url.startsWith("data:")) return url;
  const normalized = url.startsWith("/") ? url : `/${url}`;
  return `${process.env.NEXT_PUBLIC_API_BASE}${normalized}`;
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
    stemLines * 34 +
    passageLines * 30 +
    (question.image_url ? 180 : 0) +
    (question.is_open_ended ? 96 : estimateChoiceBlockHeight(question.choices, true) + question.choices.length * 14) +
    24
  );
}

function packVerbalPages(items: Question[], heights?: Map<string, number>, maxHeight = 900) {
  const pages: Question[][] = [];
  let current: Question[] = [];
  let used = 0;

  for (const item of items) {
    const itemHeight = heights?.get(item.id) ?? estimateVerbalRowHeight(item);
    const nextHeight = itemHeight + (current.length ? 4 : 0);
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

function packMathPages(items: Question[], heights?: Map<string, number>, columnHeight = 900) {
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
          className="h-full max-w-none object-cover object-left"
          style={{ width: "calc(100% + 10px)", marginLeft: "-5px" }}
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

function FooterStrip({ className = "" }: { className?: string }) {
  return (
    <div className={`flex h-[12.7mm] items-center justify-start gap-2 border-t-2 border-[#2c5fff] bg-white px-4 text-[10pt] text-slate-700 ${className}`}>
      <img src="/Victory.PNG" alt="Victory" className="h-5 w-auto object-contain" />
      <span style={{ ...timesTextStyle, fontSize: "10pt", lineHeight: "1.2" }}>© All right reserved by Victory College - Ilyas Yagubov</span>
    </div>
  );
}

function NumberBadge({ index }: { index: number }) {
  return (
    <div className="mb-3 flex items-center rounded-full border-[3px] border-[#2c5fff] bg-[#eef4ff] px-4 py-2 text-[#2c5fff]">
      <span style={{ ...timesBoldStyle, fontSize: "18pt" }}>{index}</span>
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
        <div className="border-r-[3px] border-[#2c5fff] py-4 pr-5">
          <NumberBadge index={index} />
          {imageUrl ? (
            <div className="mb-3">
              <img src={imageUrl} alt="Question" className="max-h-[220px] w-full object-contain object-left" />
            </div>
          ) : null}
        <HtmlBlock html={question.passage || ""} style={timesTextStyle} className="text-slate-950" />
      </div>
      <div className="py-4 pl-5">
        <HtmlBlock html={question.stem} style={timesBoldStyle} className="text-slate-950" />
        {question.is_open_ended ? null : (
          <ol className="mt-2 space-y-1 text-slate-950" style={timesTextStyle}>
            {question.choices.map((choice) => {
              const choiceImageUrl = resolveAssetUrl(choice.image_url);
              return (
                <li key={`${question.id}-${choice.label}`} className="list-none">
                  <div className="flex gap-3">
                    <div className="w-8 shrink-0" style={timesTextStyle}>{choice.label})</div>
                    <div className="min-w-0 flex-1">
                        <HtmlBlock html={choice.content} style={timesTextStyle} className="text-slate-950" />
                        {choiceImageUrl ? (
                          <div className="mt-2">
                            <img src={choiceImageUrl} alt={`Choice ${choice.label}`} className="max-h-[70px] w-auto max-w-full object-contain object-left" />
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
      <section data-question-id={dataQuestionId} className="break-inside-avoid rounded-[8px] pb-2">
        <NumberBadge index={index} />
        {imageUrl ? (
          <div className="mb-2">
            <img src={imageUrl} alt="Question" className="max-h-[240px] w-full object-contain object-left" />
          </div>
        ) : null}
      {question.passage ? <HtmlBlock html={question.passage} style={mathTextStyle} className="mb-2 text-slate-950" /> : null}
      <HtmlBlock html={question.stem} style={mathBoldStyle} className="text-slate-950" />
      {question.is_open_ended ? null : (
        <ol className="mt-2 space-y-1 text-slate-950" style={mathTextStyle}>
          {question.choices.map((choice) => {
            const choiceImageUrl = resolveAssetUrl(choice.image_url);
            return (
              <li key={`${question.id}-${choice.label}`} className="list-none">
                <div className="flex gap-3">
                  <div className="w-8 shrink-0" style={mathTextStyle}>{choice.label})</div>
                  <div className="min-w-0 flex-1">
                      <HtmlBlock html={choice.content} style={mathTextStyle} className="text-slate-950" />
                      {choiceImageUrl ? (
                        <div className="mt-2">
                          <img src={choiceImageUrl} alt={`Choice ${choice.label}`} className="max-h-[70px] w-auto max-w-full object-contain object-left" />
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
  const exportToken = searchParams.get("export_token") || "";
  const idsParam = searchParams.get("ids") || "";
  const queryIds = useMemo(
    () => idsParam.split(",").map((value) => value.trim()).filter(Boolean),
    [idsParam]
  );
  const [selectedCount, setSelectedCount] = useState(0);

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

        let exportIds = queryIds;
        if (exportToken) {
          const stored = localStorage.getItem(exportToken);
          if (!stored) throw new Error("Selected export set was not found. Please reopen export from Question Bank.");
          let parsed: { ids?: string[] } | null = null;
          try {
            parsed = JSON.parse(stored);
          } catch {
            throw new Error("Selected export set is invalid. Please reopen export from Question Bank.");
          }
          exportIds = Array.isArray(parsed?.ids)
            ? parsed!.ids.map((value) => String(value).trim()).filter(Boolean)
            : [];
        }

        if (!cancelled) setSelectedCount(exportIds.length);

        const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/api/questions/export/`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            subject,
            topic,
            subtopic,
            q,
            ids: exportIds,
          }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) throw new Error(json?.error || "Failed to load questions for export.");

        let nextQuestions: Question[] = json?.questions ?? [];
        if (exportIds.length) {
          const order = new Map(exportIds.map((id, index) => [id, index]));
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
  }, [exportToken, q, queryIds, subject, subtopic, topic]);

  const summary = useMemo(() => {
    const parts = [];
    if (subject) parts.push(subject === "math" ? "Math" : "Verbal");
    if (topic) parts.push(topic);
    if (subtopic) parts.push(subtopic);
    if (q) parts.push(`Search: ${q}`);
    if (selectedCount) parts.push(`${selectedCount} selected question${selectedCount === 1 ? "" : "s"}`);
    return parts.join(" | ");
  }, [q, selectedCount, subject, subtopic, topic]);

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
  const verbalAnswers = useMemo(
    () =>
      verbalQuestions.map((question, index) => ({
        number: verbalIndexById.get(question.id) || index + 1,
        answer: getCorrectAnswer(question),
      })),
    [verbalIndexById, verbalQuestions]
  );
  const mathAnswers = useMemo(
    () =>
      mathQuestions.map((question, index) => ({
        number: mathIndexById.get(question.id) || index + 1,
        answer: getCorrectAnswer(question),
      })),
    [mathIndexById, mathQuestions]
  );

  const flowLayout = true;

  useEffect(() => {
    if (flowLayout) {
      setLayoutReady(true);
      return;
    }
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
  }, [flowLayout, mathQuestions, questions.length, verbalQuestions]);

  return (
    <>
      <style jsx global>{`
        @page {
          size: A4 portrait;
          margin: 0 0 12.7mm;
        }

        html,
        body {
          background: white;
          margin: 0;
          padding: 0;
        }

        .book-shell {
          width: 210mm;
          min-height: 297mm;
          border: 2px solid #0f172a;
          background: white;
          box-shadow: 0 24px 80px rgba(15, 23, 42, 0.1);
          overflow: hidden;
        }

        .page-guides {
          background-image: linear-gradient(
            to bottom,
            transparent calc(297mm - 1px),
            rgba(15, 23, 42, 0.16) calc(297mm - 1px),
            rgba(15, 23, 42, 0.16) 297mm
          );
          background-size: 100% 297mm;
        }

        .book-content {
          padding: 8mm 14mm 12.7mm;
        }

        .math-flow-grid {
          column-count: 1;
          column-gap: 0;
          column-fill: auto;
        }

        .math-flow-item {
          display: inline-block;
          width: 100%;
          margin: 0 0 12px;
          vertical-align: top;
          break-inside: avoid;
          page-break-inside: avoid;
          -webkit-column-break-inside: avoid;
        }

        .book-print-table {
          width: 100%;
          border-collapse: collapse;
        }

        .book-print-head {
          display: table-header-group;
        }

        .book-print-foot {
          display: table-footer-group;
        }

        .question-row {
          break-inside: avoid;
          page-break-inside: avoid;
        }

        @media print {
          html,
          body {
            background: white !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .no-print {
            display: none !important;
          }

          .book-shell {
            width: auto !important;
            min-height: auto !important;
            margin: 0 !important;
            border: 0 !important;
            box-shadow: none !important;
            overflow: visible !important;
          }

          .page-guides {
            background: none !important;
          }

          .book-content {
            padding: 8mm 14mm 12.7mm !important;
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

        {questions.length && !flowLayout ? (
          <div className="fixed left-[-10000px] top-0 z-[-1] opacity-0 pointer-events-none" aria-hidden="true">
            <div ref={verbalMeasureRef} className="w-[182mm] bg-white px-[14mm] py-[8mm]">
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
          <div className="mx-auto book-shell">
            <table className="book-print-table">
              <thead className="book-print-head">
                <tr>
                  <td className="p-0">
                    <HeaderStrip useFallbackHeader={useFallbackHeader} setUseFallbackHeader={setUseFallbackHeader} />
                  </td>
                </tr>
              </thead>
              <tfoot className="book-print-foot">
                <tr>
                  <td className="p-0">
                    <FooterStrip />
                  </td>
                </tr>
              </tfoot>
              <tbody>
                <tr>
                  <td className="align-top p-0">
                    <div className="book-content page-guides">
                      {verbalQuestions.length ? (
                        <div>
                          {verbalQuestions.map((question, idx) => (
                            <VerbalRow
                              key={question.id}
                              question={question}
                              index={verbalIndexById.get(question.id) || idx + 1}
                              showTopBorder={idx > 0}
                            />
                          ))}
                        </div>
                      ) : null}

                      {mathQuestions.length ? (
                        <div className={`${verbalQuestions.length ? "mt-8" : ""} math-flow-grid`}>
                          {mathQuestions.map((question, idx) => (
                            <div key={question.id} className="math-flow-item">
                              <MathCard
                                question={question}
                                index={mathIndexById.get(question.id) || idx + 1}
                              />
                            </div>
                          ))}
                        </div>
                      ) : null}

                      {verbalAnswers.length ? (
                        <AnswersTable
                          title={subject === "verbal" && topic ? topic : "Verbal"}
                          entries={verbalAnswers}
                        />
                      ) : null}

                      {mathAnswers.length ? (
                        <AnswersTable
                          title={subject === "math" && topic ? topic : "Math"}
                          entries={mathAnswers}
                        />
                      ) : null}
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function AnswersTable({
  title,
  entries,
}: {
  title: string;
  entries: Array<{ number: number; answer: string }>;
}) {
  const rows = [];
  for (let i = 0; i < entries.length; i += 2) {
    rows.push([entries[i], entries[i + 1] ?? null]);
  }

  return (
    <section className="mt-8 break-before-page">
      <h2
        className="mb-5 text-center text-[22pt] font-semibold text-[#1f4fbf]"
        style={{ fontFamily: '"Times New Roman", Times, serif' }}
      >
        Answers: {title}
      </h2>
      <table className="w-full border-collapse text-center text-slate-900" style={timesTextStyle}>
        <thead>
          <tr className="bg-[#eef4ff] text-[#1f4fbf]">
            <th className="border-[2px] border-[#1f4fbf] px-3 py-2">Number</th>
            <th className="border-[2px] border-[#1f4fbf] px-3 py-2">Answer</th>
            <th className="border-[2px] border-[#1f4fbf] px-3 py-2">Number</th>
            <th className="border-[2px] border-[#1f4fbf] px-3 py-2">Answer</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([left, right], rowIndex) => (
            <tr key={`${title}-${rowIndex}`}>
              <td className="border-[2px] border-[#1f4fbf] px-3 py-2">{left.number}</td>
              <td className="border-[2px] border-[#1f4fbf] px-3 py-2">{left.answer}</td>
              <td className="border-[2px] border-[#1f4fbf] px-3 py-2">{right?.number ?? ""}</td>
              <td className="border-[2px] border-[#1f4fbf] px-3 py-2">{right?.answer ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
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
