"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { subjects } from "@/lib/questionBank/topics";

type Choice = { label: string; content: string; is_correct: boolean };

export default function EditQuestionPage() {
  const { id } = useParams<{ id: string }>();
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
  const [published, setPublished] = useState(true);
  const stemRef = useRef<HTMLTextAreaElement | null>(null);
  const passageRef = useRef<HTMLTextAreaElement | null>(null);
  const [choices, setChoices] = useState<Choice[]>([]);

  const topicOptions = useMemo(() => subjects[subject]?.map((t) => t.title) ?? [], [subject]);
  const subtopicOptions = useMemo(() => {
    const group = subjects[subject]?.find((t) => t.title === topic);
    return group?.subtopics?.map((s) => s.title) ?? [];
  }, [subject, topic]);

  useEffect(() => {
    setSubtopic("");
  }, [topic]);

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
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/api/questions/${id}/`, {
          headers: { Authorization: `Bearer ${access}` },
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "Failed to load");
        const q = json.question;
        setSubject(q.subject);
        setTopic(q.topic);
        setSubtopic(q.subtopic ?? "");
        setStem(q.stem ?? "");
        setPassage(q.passage ?? "");
        setExplanation(q.explanation ?? "");
        setDifficulty(q.difficulty ?? "");
        setPublished(!!q.published);
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
  }, [id]);

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
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/api/questions/${id}/`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${access}`,
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
          published,
          choices,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Save failed");
      router.push("/practice/questions/manage");
    } catch (e: any) {
      setError(e?.message ?? "Save failed");
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

  if (loading) return <div className="p-6 text-sm text-neutral-600">Loading…</div>;
  if (error) return <div className="p-6 text-sm text-red-600">Error: {error}</div>;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm uppercase tracking-wide text-neutral-500">{subject}</div>
          <h1 className="text-2xl font-bold">Edit question</h1>
        </div>
        <button className="text-sm text-neutral-600 hover:underline" onClick={() => router.back()}>
          Back
        </button>
      </div>

      <div className="bg-white border rounded-xl shadow-sm p-4 space-y-3">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label className="text-sm text-neutral-700">Subject</label>
            <select
              value={subject}
              onChange={(e) => setSubject(e.target.value as "verbal" | "math")}
              className="border rounded px-3 py-2 text-sm"
            >
              <option value="verbal">Verbal</option>
              <option value="math">Math</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-neutral-700">Topic</label>
            <select
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="border rounded px-3 py-2 text-sm"
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
            <label className="text-sm text-neutral-700">Subtopic (optional)</label>
            <select
              value={subtopic}
              onChange={(e) => setSubtopic(e.target.value)}
              className="border rounded px-3 py-2 text-sm"
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
            <label className="text-sm text-neutral-700">Difficulty</label>
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as any)}
              className="border rounded px-3 py-2 text-sm"
            >
              <option value="">Select difficulty</option>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <label className="text-sm text-neutral-700">Stem</label>
            <div className="flex gap-2 text-xs">
              <FormatButton label="B" onClick={() => formatText("stem", "bold")} />
              <FormatButton label="I" onClick={() => formatText("stem", "italic")} />
              <FormatButton label="U" onClick={() => formatText("stem", "underline")} />
              <FormatButton label="HL" onClick={() => formatText("stem", "highlight")} />
            </div>
          </div>
          <textarea
            ref={stemRef}
            value={stem}
            onChange={(e) => setStem(e.target.value)}
            className="border rounded px-3 py-2 text-sm min-h-[120px]"
          />
        </div>

        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <label className="text-sm text-neutral-700">Passage (optional)</label>
            <div className="flex gap-2 text-xs">
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
            className="border rounded px-3 py-2 text-sm min-h-[100px]"
            placeholder="Optional passage text"
          />
        </div>

        <div className="space-y-2">
          <div className="text-sm font-semibold text-neutral-800">Choices</div>
          {choices.map((c, idx) => (
            <div key={c.label} className="flex items-center gap-3">
              <label className="w-8 text-sm font-semibold">{c.label}</label>
              <input
                value={c.content}
                onChange={(e) => updateChoice(idx, { content: e.target.value })}
                className="flex-1 border rounded px-3 py-2 text-sm"
                placeholder={`Choice ${c.label}`}
              />
              <label className="flex items-center gap-1 text-xs text-neutral-700">
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
          <button
            type="button"
            onClick={addChoice}
            className="text-xs text-indigo-600 hover:text-indigo-700 font-semibold"
          >
            + Add choice
          </button>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm text-neutral-700">Explanation (optional)</label>
          <textarea
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
            className="border rounded px-3 py-2 text-sm min-h-[80px]"
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-neutral-800">
          <input
            type="checkbox"
            checked={published}
            onChange={(e) => setPublished(e.target.checked)}
          />
          Publish immediately
        </label>

        {error && <div className="text-sm text-red-600">{error}</div>}

        <div className="flex justify-end">
          <button
            onClick={save}
            className="px-4 py-2 rounded bg-neutral-900 text-white text-sm font-semibold hover:bg-neutral-800 disabled:opacity-60"
            disabled={saving}
          >
            {saving ? "Saving..." : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
