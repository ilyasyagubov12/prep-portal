"use client";

import { useEffect, useMemo, useState } from "react";
import { useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { subjects } from "@/lib/questionBank/topics";
import { typesetMath } from "@/lib/mathjax";

type Choice = { label: string; content: string; is_correct: boolean };

function isStaff(role?: string | null, is_admin?: boolean | null) {
  const r = (role ?? "").toLowerCase();
  return !!is_admin || r === "admin" || r === "teacher";
}

export default function NewQuestionPage() {
  const params = useParams<{ subject: string }>();
  const subject = (params.subject || "").toLowerCase() as "verbal" | "math";
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
  const [published, setPublished] = useState(true);
  const stemRef = useRef<HTMLTextAreaElement | null>(null);
  const passageRef = useRef<HTMLTextAreaElement | null>(null);
  const passagePreviewRef = useRef<HTMLDivElement | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
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
    const group = subjects[subject]?.find((t) => t.title === topic);
    return group?.subtopics?.map((s) => s.title) ?? [];
  }, [subject, topic]);

  useEffect(() => {
    setSubtopic("");
  }, [topic]);

  useEffect(() => {
    typesetMath(stemPreviewRef.current);
    typesetMath(); // re-run globally for choices
  }, [stem, choices]);

  useEffect(() => {
    if (subject !== "math") typesetMath(passagePreviewRef.current);
  }, [passage, subject]);

  async function handleSubmit() {
    setError(null);
    if (!isStaffUser) {
      setError("Only admin/teacher can add questions");
      return;
    }
    if (!stem.trim()) return setError("Stem is required");
    if (!topic.trim()) return setError("Topic is required");
    const filledChoices = choices.filter((c) => c.content.trim() !== "");
    if (filledChoices.length < 2) return setError("At least two answer choices needed");
    if (!filledChoices.some((c) => c.is_correct)) return setError("Select a correct choice");

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
        topic,
        subtopic: subtopic || null,
        stem,
        passage: passage || null,
        explanation: explanation || null,
        difficulty: difficulty || null,
        image_url: imageUrl,
        published,
        choices: choices.map((c) => ({ label: c.label, content: c.content, is_correct: c.is_correct })),
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json?.error || "Failed to save");
      return;
    }
    router.push(`/practice/questions/${subject}/${encodeURIComponent(topic)}`);
  }

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
        onClick={onClick}
        className="rounded border border-slate-200 bg-white px-2 py-1 font-semibold text-neutral-700 shadow-sm hover:bg-slate-50"
      >
        {label}
      </button>
    );
  }

  function insertAtTextarea(target: "stem", text: string) {
    const el = stemRef.current;
    if (!el) return;
    const value = stem;
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = value.slice(0, start) + text + value.slice(end);
    setStem(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + text.length;
      el.setSelectionRange(pos, pos);
    });
  }

  const mathSymbols = ["√", "π", "±", "≤", "≥", "∞", "θ", "×", "÷", "∠", "°", "∥", "⟂", "^", "₁", "₂"];

  function wrapLatexIfNeeded(latex: string) {
    const trimmed = latex.trim();
    const starts = trimmed.startsWith("\\(") || trimmed.startsWith("\\[") || trimmed.startsWith("$");
    const ends = trimmed.endsWith("\\)") || trimmed.endsWith("\\]") || trimmed.endsWith("$");
    if (starts && ends) return trimmed;
    return `\\(${trimmed}\\)`;
  }

  if (loading) return <div className="p-6 text-sm text-neutral-600">Loading…</div>;
  if (error) return <div className="p-6 text-sm text-red-600">Error: {error}</div>;

  if (loading) return <div className="p-6 text-sm text-neutral-600">Loading…</div>;
  if (error) return <div className="p-6 text-sm text-red-600">Error: {error}</div>;

  return (
    <div className="relative min-h-screen pb-10">
      <div className="absolute inset-0 bg-gradient-to-b from-slate-50 via-white to-slate-100" />
      <div className="relative p-6 max-w-5xl mx-auto space-y-5">
        <header className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 text-white text-xs tracking-[0.18em]">
              PRACTICE · {subject.toUpperCase()}
            </div>
            <h1 className="text-3xl font-bold text-slate-900">Add math question</h1>
            <p className="text-sm text-slate-600">Compose the stem, add choices, and insert math with the keypad.</p>
          </div>
          <button
            className="text-sm text-slate-600 hover:underline"
            onClick={() => router.back()}
          >
            Back
          </button>
        </header>

        {/* Top meta card */}
        <div className="grid gap-4 md:grid-cols-3">
          <div className="bg-white/90 border rounded-2xl shadow-sm p-4 space-y-2 col-span-2">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-600">Topic</label>
                <select
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  className="border rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">Select topic</option>
                  {topicOptions.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-600">Subtopic (optional)</label>
                <select
                  value={subtopic}
                  onChange={(e) => setSubtopic(e.target.value)}
                  className="border rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">Select subtopic</option>
                  {subtopicOptions.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-600">Difficulty</label>
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as any)}
                  className="border rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">Select difficulty</option>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </div>
            </div>
          </div>
          <div className="bg-white/90 border rounded-2xl shadow-sm p-4 flex flex-col gap-2">
            <label className="text-xs font-semibold text-slate-600">Image (optional)</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
              className="text-sm"
            />
            {uploading && <div className="text-xs text-amber-600">Uploading…</div>}
            <p className="text-xs text-neutral-500">Use for diagrams or graphs; keep under 2MB.</p>
          </div>
        </div>

        {/* Stem and keypad */}
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2 bg-white/90 border rounded-2xl shadow-sm p-5 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <label className="text-sm font-semibold text-slate-800">Stem</label>
                <span className="text-xs text-neutral-500">(required)</span>
              </div>
              <div className="flex gap-2 text-xs items-center flex-wrap">
                <FormatButton label="B" onClick={() => formatText("stem", "bold")} />
                <FormatButton label="I" onClick={() => formatText("stem", "italic")} />
                <FormatButton label="U" onClick={() => formatText("stem", "underline")} />
                <FormatButton label="HL" onClick={() => formatText("stem", "highlight")} />
                <button
                  type="button"
                  className="rounded-full border border-slate-300 px-3 py-1 bg-white text-xs font-semibold hover:bg-slate-50 shadow-sm"
                  onClick={() => setMathPadOpen((v) => !v)}
                >
                  Math keypad
                </button>
              </div>
            </div>
            <textarea
              ref={stemRef}
              value={stem}
              onChange={(e) => setStem(e.target.value)}
              className="border rounded-xl px-3 py-3 text-sm min-h-[140px] shadow-inner bg-white"
            />
            <div className="mt-1 text-xs font-semibold text-neutral-600">Preview</div>
            <div
              ref={stemPreviewRef}
              className="border rounded-xl px-3 py-3 bg-slate-50 min-h-[70px] text-sm"
              dangerouslySetInnerHTML={{ __html: stem.replace(/\n/g, "<br/>") || "<span class='text-neutral-400'>Nothing yet</span>" }}
            />
          </div>

          {subject === "math" && mathPadOpen ? (
            <div className="bg-slate-50 border rounded-2xl shadow-inner p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-neutral-800">Math keypad</div>
              </div>

              <div className="rounded-lg border border-slate-200 p-3 bg-white">
                <div className="grid grid-cols-5 gap-2 text-sm">
                  {[
                    { label: "+", val: "+" },
                    { label: "−", val: "-" },
                    { label: "×", val: "\\times" },
                    { label: "÷", val: "\\div" },
                    { label: "a/b", val: "\\frac{}{}" },
                    { label: "x^n", val: "x^{}" },
                    { label: "ⁿ√", val: "\\sqrt[ ]{}" },
                    { label: "≤", val: "\\le" },
                    { label: "≥", val: "\\ge" },
                    { label: "<", val: "<" },
                    { label: ">", val: ">" },
                    { label: "=", val: "=" },
                    { label: "∠", val: "\\angle" },
                    { label: "°", val: "^{\\circ}" },
                    { label: "∥", val: "\\parallel" },
                    { label: "⟂", val: "\\perp" },
                    { label: "log", val: "\\log" },
                    { label: "ln", val: "\\ln" },
                    { label: "e^x", val: "e^{}" },
                  ].map((btn) => (
                    <button
                      key={btn.label}
                      type="button"
                      className="h-9 rounded-md border border-slate-200 bg-slate-50 hover:bg-slate-100 text-center text-sm font-semibold"
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
                placeholder="Type LaTeX here, e.g. \\frac{48x+144}{8} - \\frac{c}{15} = d(x-2)"
                className="w-full border rounded-xl px-3 py-3 text-sm min-h-[90px] font-mono bg-white shadow-inner"
              />

              <div className="text-xs font-semibold text-neutral-600">Live preview</div>
              <div
              className="border rounded-xl px-3 py-3 bg-white min-h-[50px] shadow-inner"
                dangerouslySetInnerHTML={{
                  __html:
                    mathLatex.trim().length > 0
                      ? wrapLatexIfNeeded(mathLatex).replace(/\n/g, "<br/>")
                      : "<span class='text-neutral-400'>Nothing yet</span>",
                }}
              />

              <div className="flex gap-2 flex-wrap">
                <button
                  type="button"
                  className="px-4 py-2 text-sm font-semibold rounded-lg bg-slate-900 text-white shadow hover:bg-slate-800"
                  onClick={() => {
                    if (!mathLatex.trim()) return;
                    setStem((prev) => prev + " " + wrapLatexIfNeeded(mathLatex));
                    setChoices((prev) =>
                      prev.map((c) => ({ ...c, content: c.content }))
                    );
                    setMathLatex("");
                    typesetMath();
                    typesetMath(stemPreviewRef.current);
                  }}
                >
                  Insert into stem
                </button>
                <button
                  type="button"
                  className="px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white hover:bg-slate-100"
                  onClick={() => setMathLatex("")}
                >
                  Clear
                </button>
              </div>
            </div>
          ) : null}
        </div>

        {/* Choices and explanation */}
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2 bg-white/90 border rounded-2xl shadow-sm p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-neutral-800">Choices</div>
              <div className="text-xs text-neutral-500">Select one correct option</div>
            </div>
            <div className="space-y-2">
              {choices.map((c, idx) => (
                <div
                  key={c.label}
                  className="flex items-center gap-3 border rounded-xl px-3 py-2 bg-white/60 shadow-sm hover:shadow transition"
                >
                  <label className="w-8 text-sm font-semibold">{c.label}</label>
                  <input
                    value={c.content}
                    onChange={(e) =>
                      setChoices((prev) => {
                        const next = [...prev];
                        next[idx] = { ...next[idx], content: e.target.value };
                        return next;
                      })
                    }
                    className="flex-1 border rounded-lg px-3 py-2 text-sm bg-white"
                    placeholder={`Choice ${c.label}`}
                  />
                  <label className="flex items-center gap-1 text-xs text-neutral-700 whitespace-nowrap">
                    <input
                      type="radio"
                      name="correct"
                      checked={c.is_correct}
                      onChange={() =>
                        setChoices((prev) =>
                          prev.map((choice, i) => ({ ...choice, is_correct: i === idx }))
                        )
                      }
                    />
                    Correct
                  </label>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white/90 border rounded-2xl shadow-sm p-5 space-y-3">
            <label className="text-sm font-semibold text-neutral-800">Explanation (optional)</label>
            <textarea
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              className="border rounded-xl px-3 py-3 text-sm min-h-[140px] bg-white/60 shadow-inner"
            />
            <label className="flex items-center gap-2 text-sm text-neutral-800">
              <input
                type="checkbox"
                checked={published}
                onChange={(e) => setPublished(e.target.checked)}
              />
              Publish immediately
            </label>
            {error && <div className="text-sm text-red-600">{error}</div>}
          </div>
        </div>

        <div className="flex justify-end">
          <button
            onClick={handleSubmit}
            className="px-4 py-3 rounded-xl bg-slate-900 text-white text-sm font-semibold shadow-md hover:bg-slate-800"
          >
            Save question
          </button>
        </div>
      </div>
    </div>
  );
}
