"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { subjects } from "@/lib/questionBank/topics";
import { typesetMath } from "@/lib/mathjax";

type Choice = { label: string; content: string; is_correct: boolean };

function isStaff(role?: string | null, is_admin?: boolean | null) {
  const r = (role ?? "").toLowerCase();
  return !!is_admin || r === "admin" || r === "teacher";
}

export default function NewMockExamQuestionPage() {
  const params = useParams<{ subject: string; mockId: string }>();
  const subject = (params.subject || "").toLowerCase() as "verbal" | "math";
  const mockId = params.mockId;
  const router = useRouter();
  const search = useSearchParams();
  const presetTopic = search.get("topic") ?? "";

  const [topics, setTopics] = useState<string[]>([]);
  const [topic, setTopic] = useState(presetTopic);
  const [subtopic, setSubtopic] = useState("");
  const [stem, setStem] = useState("");
  const [passage, setPassage] = useState("");
  const [explanation, setExplanation] = useState("");
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard" | "">("");
  const [isOpenEnded, setIsOpenEnded] = useState(false);
  const [correctAnswer, setCorrectAnswer] = useState("");
  const stemRef = useRef<HTMLTextAreaElement | null>(null);
  const passageRef = useRef<HTMLTextAreaElement | null>(null);
  const passagePreviewRef = useRef<HTMLDivElement | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [choices, setChoices] = useState<Choice[]>([
    { label: "A", content: "", is_correct: true },
    { label: "B", content: "", is_correct: false },
    { label: "C", content: "", is_correct: false },
    { label: "D", content: "", is_correct: false },
  ]);
  const [loading, setLoading] = useState(true);
  const [isStaffUser, setIsStaffUser] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stemPreviewRef = useRef<HTMLDivElement | null>(null);
  const [mathPadOpen, setMathPadOpen] = useState(false);
  const [mathLatex, setMathLatex] = useState("");

  useEffect(() => {
    if (!imageFile) {
      setImagePreview(null);
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  useEffect(() => {
    if (!subjects[subject]) {
      setError("Unknown subject");
      setLoading(false);
      return;
    }
    setTopics(subjects[subject].map((t) => t.title));
  }, [subject]);

  useEffect(() => {
    (async () => {
      const access = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
      if (!access) {
        router.push("/login");
        return;
      }

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/api/auth/me/`, {
        headers: { Authorization: `Bearer ${access}` },
      }).catch(() => null);

      if (!res || !res.ok) {
        router.push("/login");
        return;
      }

      const prof = await res.json().catch(() => null);
      setIsStaffUser(isStaff(prof?.role, prof?.is_admin));
      setLoading(false);
    })();
  }, [router]);

  const topicOptions = useMemo(() => topics, [topics]);
  const subtopicOptions = useMemo(() => {
    const group = subjects[subject]?.find((t) => t.title == topic);
    return group?.subtopics?.map((s) => s.title) ?? [];
  }, [subject, topic]);

  useEffect(() => {
    setSubtopic("");
  }, [topic]);

  useEffect(() => {
    typesetMath(stemPreviewRef.current);
    typesetMath();
  }, [stem, choices]);

  useEffect(() => {
    if (subject != "math") typesetMath(passagePreviewRef.current);
  }, [passage, subject]);

  async function handleSubmit() {
    setError(null);
    if (!isStaffUser) {
      setError("Only admin/teacher can add questions");
      return;
    }
    if (!mockId) return setError("Missing mock exam id");
    if (!stem.trim()) return setError("Stem is required");
    if (!topic.trim()) return setError("Topic is required");
    if (!isOpenEnded) {
      const filledChoices = choices.filter((c) => c.content.trim() != "");
      if (filledChoices.length < 2) return setError("At least two answer choices needed");
      if (!filledChoices.some((c) => c.is_correct)) return setError("Select a correct choice");
    }

    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    if (!token) return setError("Missing session");

    let imageUrl: string | null = null;
    if (imageFile) {
      setUploading(true);
      const fd = new FormData();
      fd.append("file", imageFile);
      const uploadRes = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/api/questions/upload/`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      }).catch(() => null);
      setUploading(false);
      if (!uploadRes) {
        setError("Could not upload image");
        return;
      }
      const uploadJson = await uploadRes.json();
      if (!uploadRes.ok) {
        setError(uploadJson?.error || "Image upload failed");
        return;
      }
      imageUrl = uploadJson.url || uploadJson.path;
    }

    const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/api/questions/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        subject,
        topic: topic.trim(),
        subtopic: subtopic.trim() || null,
        stem,
        passage: passage || null,
        explanation: explanation || null,
        difficulty: difficulty || null,
        image_url: imageUrl,
        is_open_ended: isOpenEnded,
        correct_answer: isOpenEnded ? correctAnswer.trim() || null : null,
        choices: isOpenEnded
          ? []
          : choices.map((c) => ({ label: c.label, content: c.content, is_correct: c.is_correct })),
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json?.error || "Failed to save");
      return;
    }
    const questionId = json?.question?.id;
    if (!questionId) {
      setError("Saved question but missing ID.");
      return;
    }
    const attachRes = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/api/mock-exams/questions/add/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ mock_exam_id: mockId, question_id: questionId }),
    });
    const attachJson = await attachRes.json();
    if (!attachRes.ok) {
      setError(attachJson?.error || "Failed to attach question to mock exam");
      return;
    }
    router.push(`/practice/mock-exams?manage=${mockId}`);
  }

  function formatText(target: "stem" | "passage", kind: "bold" | "italic" | "underline" | "highlight") {
    const el = target == "stem" ? stemRef.current : passageRef.current;
    if (!el) return;
    const text = target == "stem" ? stem : passage;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const before = text.slice(0, start);
    const sel = text.slice(start, end);
    const after = text.slice(end);
    const wrap =
      kind == "bold"
        ? ["<b>", "</b>"]
        : kind == "italic"
        ? ["<i>", "</i>"]
        : kind == "underline"
        ? ["<u>", "</u>"]
        : ["<mark>", "</mark>"];
    const next = `${before}${wrap[0]}${sel}${wrap[1]}${after}`;
    if (target == "stem") setStem(next);
    else setPassage(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = before.length + wrap[0].length + sel.length + wrap[1].length;
      el.setSelectionRange(pos, pos);
    });
  }

  function FormatButton({ label, onClick }: { label: string; onClick: () => void }) {
    return (
      <button
        type="button"
        className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm"
        onClick={onClick}
      >
        {label}
      </button>
    );
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

  if (loading) return null;

  return (
    <div className="relative min-h-screen bg-[#f6f8fb]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.12),_transparent_55%),radial-gradient(circle_at_20%_20%,_rgba(14,165,233,0.14),_transparent_40%)]" />
      <div className="relative mx-auto w-full max-w-6xl px-6 pb-16 pt-8">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.25em] text-white">
              Mock exam - {subject}
            </div>
            <h1 className="text-3xl font-semibold text-slate-900">
              {subject == "verbal" ? "Add verbal question" : "Add math question"}
            </h1>
            <p className="text-sm text-slate-600">Build the stem, add choices, and include passages or diagrams.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:border-slate-300"
              onClick={() => router.back()}
            >
              Back
            </button>
            <button
              onClick={handleSubmit}
              className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white shadow hover:bg-slate-800"
            >
              Save question
            </button>
          </div>
        </header>

        {error ? (
          <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-6">
            {subject == "verbal" ? (
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">Passage</div>
                    <div className="text-xs text-slate-500">Optional reading text for this question.</div>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <FormatButton label="B" onClick={() => formatText("passage", "bold")} />
                    <FormatButton label="I" onClick={() => formatText("passage", "italic")} />
                    <FormatButton label="U" onClick={() => formatText("passage", "underline")} />
                    <FormatButton label="HL" onClick={() => formatText("passage", "highlight")} />
                  </div>
                </div>
                <textarea
                  ref={passageRef}
                  value={passage}
                  onChange={(e) => setPassage(e.target.value)}
                  className="mt-3 min-h-[180px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm shadow-inner"
                  placeholder="Paste or write the passage..."
                />
                <div className="mt-3 text-xs font-semibold text-slate-600">Preview</div>
                <div
                  ref={passagePreviewRef}
                  className="mt-1 min-h-[80px] rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm"
                  dangerouslySetInnerHTML={{
                    __html: passage.replace(/\n/g, "<br/>") || "<span class='text-slate-400'>Nothing yet</span>",
                  }}
                />
              </section>
            ) : null}

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-slate-900">Question stem</div>
                  <div className="text-xs text-slate-500">Required. Use formatting or math keypad.</div>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <FormatButton label="B" onClick={() => formatText("stem", "bold")} />
                  <FormatButton label="I" onClick={() => formatText("stem", "italic")} />
                  <FormatButton label="U" onClick={() => formatText("stem", "underline")} />
                  <FormatButton label="HL" onClick={() => formatText("stem", "highlight")} />
                  {subject == "math" ? (
                    <button
                      type="button"
                      className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm"
                      onClick={() => setMathPadOpen((v) => !v)}
                    >
                      Math keypad
                    </button>
                  ) : null}
                </div>
              </div>
              <textarea
                ref={stemRef}
                value={stem}
                onChange={(e) => setStem(e.target.value)}
                className="mt-3 min-h-[160px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm shadow-inner"
                placeholder="Write the question stem..."
              />
              <div className="mt-3 text-xs font-semibold text-slate-600">Preview</div>
              <div
                ref={stemPreviewRef}
                className="mt-1 min-h-[80px] rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm"
                dangerouslySetInnerHTML={{
                  __html: stem.replace(/\n/g, "<br/>") || "<span class='text-slate-400'>Nothing yet</span>",
                }}
              />
            </section>

            {subject == "math" && mathPadOpen ? (
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="text-sm font-semibold text-slate-900">Math keypad</div>
                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="grid grid-cols-5 gap-2 text-sm">
                    {[
                      { label: "+", val: "+" },
                      { label: "-", val: "-" },
                      { label: "x", val: "\\times" },
                      { label: "/", val: "\\div" },
                      { label: "a/b", val: "\\frac{}{}" },
                      { label: "x^n", val: "x^{}" },
                      { label: "sqrt", val: "\\sqrt{}" },
                      { label: "<=", val: "\\le" },
                      { label: ">=", val: "\\ge" },
                      { label: "theta", val: "\\theta" },
                      { label: "deg", val: "^{\\circ}" },
                      { label: "parallel", val: "\\parallel" },
                      { label: "perp", val: "\\perp" },
                      { label: "log", val: "\\log" },
                      { label: "ln", val: "\\ln" },
                    ].map((btn) => (
                      <button
                        key={btn.label}
                        type="button"
                        className="h-9 rounded-md border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50"
                        onClick={() => setMathLatex((prev) => `${prev}${btn.val}`)}
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>
                </div>
                <textarea
                  value={mathLatex}
                  onChange={(e) => setMathLatex(e.target.value)}
                  placeholder="Type LaTeX here..."
                  className="mt-3 min-h-[90px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-mono shadow-inner"
                />
                <div className="mt-3 text-xs font-semibold text-slate-600">Live preview</div>
                <div
                  className="mt-1 min-h-[60px] rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm"
                  dangerouslySetInnerHTML={{
                    __html:
                      mathLatex.trim().length > 0
                        ? wrapLatexIfNeeded(mathLatex).replace(/\n/g, "<br/>")
                        : "<span class='text-slate-400'>Nothing yet</span>",
                  }}
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                    onClick={() => {
                      if (!mathLatex.trim()) return;
                      setStem((prev) => prev + " " + wrapLatexIfNeeded(mathLatex));
                      setMathLatex("");
                      typesetMath();
                      typesetMath(stemPreviewRef.current);
                    }}
                  >
                    Insert into stem
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm"
                    onClick={() => setMathLatex("")}
                  >
                    Clear
                  </button>
                </div>
              </section>
            ) : null}

            {!isOpenEnded ? (
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">Answer choices</div>
                    <div className="text-xs text-slate-500">Mark exactly one as correct.</div>
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  {choices.map((c, idx) => (
                    <div
                      key={c.label}
                      className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-sm font-semibold text-slate-700">
                        {c.label}
                      </div>
                      <input
                        value={c.content}
                        onChange={(e) =>
                          setChoices((prev) => {
                            const next = [...prev];
                            next[idx] = { ...next[idx], content: e.target.value };
                            return next;
                          })
                        }
                        className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                        placeholder={`Choice ${c.label}`}
                      />
                      <label className="flex items-center gap-1 text-xs font-semibold text-slate-600">
                        <input
                          type="radio"
                          name="correct"
                          checked={c.is_correct}
                          onChange={() =>
                            setChoices((prev) => prev.map((choice, i) => ({ ...choice, is_correct: i == idx })))
                          }
                        />
                        Correct
                      </label>
                    </div>
                  ))}
                </div>
              </section>
            ) : (
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="text-sm font-semibold text-slate-900">Open-ended answer</div>
                <div className="text-xs text-slate-500 mt-1">Students will type their own response.</div>
                <label className="mt-4 block text-xs font-semibold text-slate-600">Correct answer</label>
                <input
                  value={correctAnswer}
                  onChange={(e) => setCorrectAnswer(e.target.value)}
                  className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                  placeholder="Type the expected answer (optional)"
                />
              </section>
            )}
          </div>

          <aside className="space-y-6">
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Question setup</div>
              <div className="mt-3 grid gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600">Topic</label>
                  <select
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  >
                    <option value="">Select topic</option>
                    {topicOptions.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600">Subtopic</label>
                  <select
                    value={subtopic}
                    onChange={(e) => setSubtopic(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  >
                    <option value="">Select subtopic</option>
                    {subtopicOptions.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600">Difficulty</label>
                  <select
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value as any)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  >
                    <option value="">Select difficulty</option>
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </div>
                {subject === "math" ? (
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={isOpenEnded}
                      onChange={(e) => setIsOpenEnded(e.target.checked)}
                    />
                    Open-ended (no choices)
                  </label>
                ) : null}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-sm font-semibold text-slate-900">Image (optional)</div>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
                className="mt-2 text-sm"
              />
              {imagePreview ? (
                <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                  <img src={imagePreview} alt="Preview" className="h-40 w-full object-contain" />
                </div>
              ) : null}
              {uploading && <div className="mt-2 text-xs text-amber-600">Uploading...</div>}
              <p className="mt-2 text-xs text-slate-500">Use for diagrams or graphs.</p>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-sm font-semibold text-slate-900">Explanation (optional)</div>
              <textarea
                value={explanation}
                onChange={(e) => setExplanation(e.target.value)}
                className="mt-2 min-h-[140px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm shadow-inner"
              />
            </section>
          </aside>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={handleSubmit}
            className="rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-white shadow hover:bg-slate-800"
          >
            Save question
          </button>
        </div>
      </div>
    </div>
  );
}
