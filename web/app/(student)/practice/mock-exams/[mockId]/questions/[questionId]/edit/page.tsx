"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { subjects } from "@/lib/questionBank/topics";
import { typesetMath } from "@/lib/mathjax";

type Choice = { label: string; content: string; is_correct: boolean };

export default function EditMockExamQuestionPage() {
  const params = useParams<{ questionId: string; mockId: string }>();
  const questionId = params.questionId;
  const mockId = params.mockId;
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [subject, setSubject] = useState<"verbal" | "math">("verbal");
  const [topic, setTopic] = useState("");
  const [subtopic, setSubtopic] = useState("");
  const [stem, setStem] = useState("");
  const [passage, setPassage] = useState("");
  const [explanation, setExplanation] = useState("");
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard" | "">("");
  const [isOpenEnded, setIsOpenEnded] = useState(false);
  const [correctAnswer, setCorrectAnswer] = useState("");
  const [choices, setChoices] = useState<Choice[]>([]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const stemRef = useRef<HTMLTextAreaElement | null>(null);
  const passageRef = useRef<HTMLTextAreaElement | null>(null);
  const stemPreviewRef = useRef<HTMLDivElement | null>(null);
  const passagePreviewRef = useRef<HTMLDivElement | null>(null);
  const [mathPadOpen, setMathPadOpen] = useState(false);
  const [mathLatex, setMathLatex] = useState("");

  const topicOptions = useMemo(() => {
    const list = subjects[subject]?.map((t) => t.title) ?? [];
    if (topic && !list.includes(topic)) return [topic, ...list];
    return list;
  }, [subject, topic]);
  const subtopicOptions = useMemo(() => {
    const group = subjects[subject]?.find((t) => t.title === topic);
    const list = group?.subtopics?.map((s) => s.title) ?? [];
    if (subtopic && !list.includes(subtopic)) return [subtopic, ...list];
    return list;
  }, [subject, topic, subtopic]);

  useEffect(() => {
    if (!imageFile) {
      setImagePreview(imageUrl);
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile, imageUrl]);

  useEffect(() => {
    typesetMath(stemPreviewRef.current);
    typesetMath();
  }, [stem, choices]);

  useEffect(() => {
    if (subject !== "math") typesetMath(passagePreviewRef.current);
  }, [passage, subject]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      const access = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
      if (!access) {
        setError("Not logged in");
        setLoading(false);
        return;
      }
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/api/mock-exams/questions/detail/`, {
          method: "POST",
          headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
          body: JSON.stringify({ mock_exam_id: mockId, question_id: questionId }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "Failed to load");
        const q = json.question;
        setSubject(q.subject);
        setTopic(q.topic ?? "");
        setSubtopic(q.subtopic ?? "");
        setStem(q.stem ?? "");
        setPassage(q.passage ?? "");
        setExplanation(q.explanation ?? "");
        setDifficulty(q.difficulty ?? "");
        setImageUrl(q.image_url ?? null);
        setIsOpenEnded(!!q.is_open_ended);
        setCorrectAnswer(q.correct_answer ?? "");
        setChoices(
          (q.choices as Choice[]) ?? [
            { label: "A", content: "", is_correct: true },
            { label: "B", content: "", is_correct: false },
          ]
        );
      } catch (e: any) {
        setError(e?.message ?? "Failed to load");
      } finally {
        setLoading(false);
      }
    })();
  }, [questionId, mockId]);

  function formatText(target: "stem" | "passage", kind: "bold" | "italic" | "underline" | "highlight") {
    const el = target === "stem" ? stemRef.current : passageRef.current;
    if (!el) return;
    const text = target === "stem" ? stem : passage;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const before = text.slice(0, start);
    const sel = text.slice(start, end);
    const after = text.slice(end);
    const wrap =
      kind === "bold"
        ? ["<b>", "</b>"]
        : kind === "italic"
        ? ["<i>", "</i>"]
        : kind === "underline"
        ? ["<u>", "</u>"]
        : ["<mark>", "</mark>"];
    const next = `${before}${wrap[0]}${sel}${wrap[1]}${after}`;
    if (target === "stem") setStem(next);
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

  async function uploadImage(access: string) {
    if (!imageFile) return imageUrl;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", imageFile);
    const uploadRes = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/api/questions/upload/`, {
      method: "POST",
      headers: { Authorization: `Bearer ${access}` },
      body: fd,
    }).catch(() => null);
    setUploading(false);
    if (!uploadRes) throw new Error("Could not upload image");
    const uploadJson = await uploadRes.json();
    if (!uploadRes.ok) throw new Error(uploadJson?.error || "Image upload failed");
    return uploadJson.url || uploadJson.path;
  }

  async function save() {
    setSaving(true);
    setError(null);
    const access = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    if (!access) {
      setError("Not logged in");
      setSaving(false);
      return;
    }
    try {
      const uploadedUrl = await uploadImage(access);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/api/mock-exams/questions/override/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${access}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mock_exam_id: mockId,
          question_id: questionId,
          override: {
            topic: topic.trim(),
            subtopic: subtopic.trim() || null,
            stem,
            passage: passage || null,
            explanation: explanation || null,
            difficulty: difficulty || null,
            image_url: uploadedUrl || null,
            is_open_ended: isOpenEnded,
            correct_answer: isOpenEnded ? correctAnswer.trim() || null : null,
            choices: isOpenEnded ? [] : choices,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Save failed");
      router.push(`/practice/mock-exams?manage=${mockId}`);
    } catch (e: any) {
      setError(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function resetOverride() {
    const access = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    if (!access) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/api/mock-exams/questions/override/`, {
        method: "POST",
        headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
        body: JSON.stringify({ mock_exam_id: mockId, question_id: questionId, clear: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Reset failed");
      router.push(`/practice/mock-exams?manage=${mockId}`);
    } catch (e: any) {
      setError(e?.message ?? "Reset failed");
    } finally {
      setSaving(false);
    }
  }

  function updateChoice(idx: number, data: Partial<Choice>) {
    setChoices((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...data };
      return next;
    });
  }

  function addChoice() {
    const label = String.fromCharCode(65 + choices.length);
    setChoices((prev) => [...prev, { label, content: "", is_correct: false }]);
  }

  if (loading) return <div className="p-6 text-sm text-neutral-600">Loading...</div>;
  if (error) return <div className="p-6 text-sm text-red-600">Error: {error}</div>;

  return (
    <div className="relative min-h-screen bg-[#f6f8fb]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.12),_transparent_55%),radial-gradient(circle_at_20%_20%,_rgba(14,165,233,0.14),_transparent_40%)]" />
      <div className="relative mx-auto w-full max-w-6xl px-6 pb-16 pt-8">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.25em] text-white">
              Mock exam - {subject}
            </div>
            <h1 className="text-3xl font-semibold text-slate-900">Edit mock question (override)</h1>
            <p className="text-sm text-slate-600">Changes apply only to this mock exam.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:border-slate-300"
              onClick={() => router.back()}
            >
              Back
            </button>
            <button
              className="rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 shadow-sm"
              onClick={resetOverride}
              disabled={saving}
            >
              Reset to bank
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white shadow hover:bg-slate-800 disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save changes"}
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
            {subject === "verbal" ? (
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
                {imagePreview ? (
                  <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                    <img src={imagePreview} alt="Question image" className="h-48 w-full object-contain" />
                  </div>
                ) : null}
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
                  {subject === "math" ? (
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

            {subject === "math" && mathPadOpen ? (
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
                  <button
                    type="button"
                    className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
                    onClick={addChoice}
                  >
                    Add choice
                  </button>
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
                        onChange={(e) => updateChoice(idx, { content: e.target.value })}
                        className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                        placeholder={`Choice ${c.label}`}
                      />
                      <label className="flex items-center gap-1 text-xs font-semibold text-slate-600">
                        <input
                          type="radio"
                          name="correct"
                          checked={c.is_correct}
                          onChange={() =>
                            setChoices((prev) => prev.map((choice, i) => ({ ...choice, is_correct: i === idx })))
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
            onClick={save}
            disabled={saving}
            className="rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-white shadow hover:bg-slate-800 disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
